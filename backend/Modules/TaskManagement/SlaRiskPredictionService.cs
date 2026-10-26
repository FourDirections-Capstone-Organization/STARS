using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;

namespace Backend.Modules.TaskManagement;

public class SlaRiskPredictionService : ISlaRiskPredictionService
{
    private readonly AppDbContext _db;
    private readonly ILogger<SlaRiskPredictionService> _logger;

    private static readonly int HighDepartmentWorkloadThreshold = 10;

    public SlaRiskPredictionService(
        AppDbContext db,
        ILogger<SlaRiskPredictionService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<SlaRiskResponseDTO> PredictRiskAsync(Guid taskId)
    {
        var task = await _db.Tasks
            .Include(t => t.Assignments)
            .Include(t => t.AssignedDepartment)
            .FirstOrDefaultAsync(t => t.Id == taskId);

        if (task == null)
            return new SlaRiskResponseDTO
            {
                TaskId = taskId,
                RiskLevel = "Low",
                ConfidenceScore = 0.0,
                KeyFactors = new List<string> { "Task not found" }
            };

        var (deptWorkload, isUrgent, employeeWorkload, hoursUntilDeadline) = await BuildFeatureFactorsAsync(task);
        return RuleBasedPrediction(task, deptWorkload, isUrgent, employeeWorkload, hoursUntilDeadline);
    }

    public async Task<SlaRiskExplanationDTO> ExplainRiskAsync(Guid taskId)
    {
        var task = await _db.Tasks
            .Include(t => t.Assignments)
            .Include(t => t.AssignedDepartment)
            .FirstOrDefaultAsync(t => t.Id == taskId);

        if (task == null)
            return new SlaRiskExplanationDTO
            {
                TaskId = taskId,
                RiskLevel = "Low",
                ConfidenceScore = 0.0,
                FeatureContributions = new List<FactorContributionDTO>
                {
                    new() { FeatureName = "error", Value = 0, Contribution = 0, Description = "Task not found" }
                }
            };

        var (deptWorkload, isUrgent, employeeWorkload, hoursUntilDeadline) = await BuildFeatureFactorsAsync(task);
        return RuleBasedExplanation(task, deptWorkload, isUrgent, employeeWorkload, hoursUntilDeadline);
    }

    private async Task<(int DeptWorkload, bool IsUrgent, int EmployeeWorkload, double HoursUntilDeadline)> BuildFeatureFactorsAsync(Models.Task task)
    {
        var deptWorkload = task.AssignedDepartmentId.HasValue
            ? await _db.Tasks.CountAsync(t =>
                t.AssignedDepartmentId == task.AssignedDepartmentId.Value &&
                t.Status != Backend.Models.Enums.TaskStatus.Completed &&
                t.Status != Backend.Models.Enums.TaskStatus.Cancelled)
            : 0;

        var isUrgent = task.PriorityLevel == PriorityLevel.Urgent;
        var hoursUntilDeadline = (task.Deadline - DateTime.UtcNow).TotalHours;

        var employeeWorkload = 0;
        if (task.Assignments.Any())
        {
            var assignedUserIds = task.Assignments.Select(a => a.AssignedUserId).ToList();
            employeeWorkload = await _db.Tasks
                .CountAsync(t => t.Assignments.Any(a => assignedUserIds.Contains(a.AssignedUserId)) &&
                    t.Id != task.Id &&
                    t.Status != Backend.Models.Enums.TaskStatus.Completed &&
                    t.Status != Backend.Models.Enums.TaskStatus.Cancelled);
        }

        return (
            deptWorkload,
            isUrgent,
            employeeWorkload,
            hoursUntilDeadline
        );
    }

    private SlaRiskResponseDTO RuleBasedPrediction(Models.Task task, int deptWorkload, bool isUrgent, int employeeWorkload, double hoursUntilDeadline)
    {
        var factors = new List<string>();
        string riskLevel;
        double confidence;

        if (isUrgent)
        {
            if (deptWorkload >= HighDepartmentWorkloadThreshold)
            {
                riskLevel = "Medium";
                confidence = 0.60;
                factors.Add($"Urgent priority with {deptWorkload} active tasks in department");
            }
            else
            {
                riskLevel = "Low";
                confidence = 0.70;
                factors.Add("Urgent priority but department workload is manageable");
            }
        }
        else
        {
            riskLevel = "Low";
            confidence = 0.80;
            factors.Add($"Non-urgent priority with {Math.Round(hoursUntilDeadline, 1)} hours until deadline");
        }

        if (employeeWorkload > 5)
            factors.Add($"Assignee has {employeeWorkload} active tasks");

        var response = new SlaRiskResponseDTO
        {
            TaskId = task.Id,
            RiskLevel = riskLevel,
            ConfidenceScore = confidence,
            KeyFactors = factors
        };

        UpdateTaskRiskLevel(task, riskLevel);

        return response;
    }

    private SlaRiskExplanationDTO RuleBasedExplanation(Models.Task task, int deptWorkload, bool isUrgent, int employeeWorkload, double hoursUntilDeadline)
    {
        var riskResponse = RuleBasedPrediction(task, deptWorkload, isUrgent, employeeWorkload, hoursUntilDeadline);

        var assignedEmployeeCount = task.Assignments.Count;
        var hasMultipleAssignments = assignedEmployeeCount > 1;

        var contributions = new List<FactorContributionDTO>
        {
            new() { FeatureName = "PriorityLevel", Value = (float)task.PriorityLevel, Contribution = isUrgent ? 0.6 : 0.2, Description = $"Priority level: {task.PriorityLevel}" },
            new() { FeatureName = "Classification", Value = (float)task.Classification, Contribution = (float)task.Classification * 0.1, Description = $"Classification: {task.Classification}" },
            new() { FeatureName = "DepartmentWorkload", Value = deptWorkload, Contribution = Math.Min(deptWorkload / 20.0, 1.0), Description = $"{deptWorkload} active tasks in department" },
            new() { FeatureName = "AssignedEmployeeCount", Value = assignedEmployeeCount, Contribution = Math.Min(assignedEmployeeCount / 5.0, 1.0), Description = $"{assignedEmployeeCount} assigned employees" },
            new() { FeatureName = "HasMultipleAssignments", Value = hasMultipleAssignments ? 1 : 0, Contribution = hasMultipleAssignments ? 0.3 : 0.0, Description = hasMultipleAssignments ? "Multiple employees assigned" : "Single employee assigned" },
            new() { FeatureName = "IsUrgent", Value = isUrgent ? 1 : 0, Contribution = isUrgent ? 0.8 : 0.0, Description = isUrgent ? "Urgent priority task" : "Non-urgent priority" },
            new() { FeatureName = "HourUntilDeadline", Value = (float)Math.Round(hoursUntilDeadline, 1), Contribution = Math.Min(1.0 - hoursUntilDeadline / 168.0, 1.0), Description = $"{Math.Round(hoursUntilDeadline, 1)} hours until deadline" }
        };

        return new SlaRiskExplanationDTO
        {
            TaskId = task.Id,
            RiskLevel = riskResponse.RiskLevel,
            ConfidenceScore = riskResponse.ConfidenceScore,
            FeatureContributions = contributions
        };
    }

    private void UpdateTaskRiskLevel(Models.Task task, string riskLevel)
    {
        var level = riskLevel switch
        {
            "High" => SlaRiskLevel.High,
            "Medium" => SlaRiskLevel.Medium,
            _ => SlaRiskLevel.Low
        };

        if (task.SlaRiskLevel != level)
        {
            task.SlaRiskLevel = level;
            _db.SaveChanges();
        }
    }
}
