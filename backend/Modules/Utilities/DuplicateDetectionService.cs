using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Models.DTOs;
using Backend.Models.Enums;

namespace Backend.Modules.Utilities;

public class DuplicateDetectionService : IDuplicateDetectionService
{
    private readonly AppDbContext _db;
    private const double SimilarityThreshold = 0.60;
    private const double TitleWeight = 0.60;
    private const double DescriptionWeight = 0.40;

    private static readonly HashSet<string> StopWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
        "of", "with", "by", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "can", "shall", "it", "its", "this", "that",
        "these", "those", "i", "you", "he", "she", "we", "they", "me", "him",
        "her", "us", "them", "my", "your", "his", "our", "their"
    };

    public DuplicateDetectionService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<ApiResponseDTO<DuplicateCheckResultDTO>> CheckForDuplicatesAsync(
        string title, string? description, Guid? excludeTaskId = null)
    {
        var excludedStatuses = new[] { Models.Enums.TaskStatus.Cancelled };

        var query = _db.Tasks
            .Where(t => !excludedStatuses.Contains(t.Status));

        if (excludeTaskId.HasValue)
            query = query.Where(t => t.Id != excludeTaskId.Value);

        var existingTasks = await query.ToListAsync();

        var inputTitleWords = TokenizeText(title);
        var inputDescWords = TokenizeText(description ?? string.Empty);

        var matches = new List<DuplicateMatchDTO>();

        foreach (var task in existingTasks)
        {
            var existingTitleWords = TokenizeText(task.Title);
            var existingDescWords = TokenizeText(task.Description);

            var titleSimilarity = CalculateJaccardSimilarity(inputTitleWords, existingTitleWords);
            var descSimilarity = CalculateJaccardSimilarity(inputDescWords, existingDescWords);

            var combinedSimilarity = (titleSimilarity * TitleWeight) + (descSimilarity * DescriptionWeight);

            if (combinedSimilarity >= SimilarityThreshold)
            {
                matches.Add(new DuplicateMatchDTO
                {
                    TaskId = task.Id,
                    Title = task.Title,
                    Status = MapStatusDisplay(task.Status),
                    SimilarityPercentage = Math.Round(combinedSimilarity * 100, 1),
                    CreatedAt = task.CreatedAt
                });
            }
        }

        matches = matches.OrderByDescending(m => m.SimilarityPercentage).ToList();

        var result = new DuplicateCheckResultDTO
        {
            HasDuplicates = matches.Count > 0,
            MatchCount = matches.Count,
            Matches = matches
        };

        return ApiResponseDTO<DuplicateCheckResultDTO>.Success(result);
    }

    private string MapStatusDisplay(Models.Enums.TaskStatus status)
    {
        return status switch
        {
            Models.Enums.TaskStatus.NotStarted => "Not Started",
            Models.Enums.TaskStatus.InProgress => "In Progress",
            Models.Enums.TaskStatus.DonePendingReview => "Done/Pending Review",
            Models.Enums.TaskStatus.OnHold => "On Hold",
            Models.Enums.TaskStatus.Cancelled => "Cancelled",
            _ => status.ToString()
        };
    }

    private HashSet<string> TokenizeText(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var words = text
            .ToLowerInvariant()
            .Split(new[] { ' ', '\t', '\n', '\r', '.', ',', ';', ':', '!', '?', '(', ')', '[', ']', '{', '}', '"', '\'' },
                StringSplitOptions.RemoveEmptyEntries)
            .Where(w => w.Length > 1 && !StopWords.Contains(w))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        return words;
    }

    private double CalculateJaccardSimilarity(HashSet<string> setA, HashSet<string> setB)
    {
        if (setA.Count == 0 && setB.Count == 0)
            return 0;

        var intersection = setA.Intersect(setB, StringComparer.OrdinalIgnoreCase).Count();
        var union = setA.Union(setB, StringComparer.OrdinalIgnoreCase).Count();

        if (union == 0)
            return 0;

        return (double)intersection / union;
    }
}
