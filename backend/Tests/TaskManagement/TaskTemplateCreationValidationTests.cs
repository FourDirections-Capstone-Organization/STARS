using Backend.Models.Enums;

namespace Backend.Tests.TaskManagement;

public class TaskTemplateCreationValidationTests
{
    private (bool IsValid, string? ErrorMessage) ValidateCreator(UserRole role)
    {
        if (role != UserRole.Coordinator && role != UserRole.Manager)
            return (false, "Only Coordinators and Managers can create task templates");

        return (true, null);
    }

    private (bool IsValid, string? ErrorMessage) ValidateAssignee(Guid? assigneeId, Dictionary<Guid, (bool IsActive, bool IsDeactivated)> users)
    {
        if (!assigneeId.HasValue)
            return (true, null);

        if (!users.ContainsKey(assigneeId.Value))
            return (false, "Default assignee is inactive or does not exist");

        var user = users[assigneeId.Value];
        if (!user.IsActive || user.IsDeactivated)
            return (false, "Default assignee is inactive or does not exist");

        return (true, null);
    }

    private (bool IsValid, string? ErrorMessage) ValidateDepartment(Guid? deptId, Dictionary<Guid, bool> departments)
    {
        if (!deptId.HasValue)
            return (true, null);

        if (!departments.ContainsKey(deptId.Value) || !departments[deptId.Value])
            return (false, "Default department is inactive or does not exist");

        return (true, null);
    }

    [Fact]
    public void Coordinator_CanCreateTemplate()
    {
        var (isValid, _) = ValidateCreator(UserRole.Coordinator);
        Assert.True(isValid);
    }

    [Fact]
    public void Manager_CanCreateTemplate()
    {
        var (isValid, _) = ValidateCreator(UserRole.Manager);
        Assert.True(isValid);
    }

    [Fact]
    public void Encoder_CannotCreateTemplate()
    {
        var (isValid, error) = ValidateCreator(UserRole.Encoder);
        Assert.False(isValid);
        Assert.Contains("Only Coordinators", error);
    }

    [Fact]
    public void Dispatcher_CannotCreateTemplate()
    {
        var (isValid, error) = ValidateCreator(UserRole.Dispatcher);
        Assert.False(isValid);
        Assert.Contains("Only Coordinators", error);
    }

    [Fact]
    public void Courier_CannotCreateTemplate()
    {
        var (isValid, error) = ValidateCreator(UserRole.Courier);
        Assert.False(isValid);
        Assert.Contains("Only Coordinators", error);
    }

    [Fact]
    public void NoAssignee_IsValid()
    {
        var (isValid, _) = ValidateAssignee(null, new Dictionary<Guid, (bool, bool)>());
        Assert.True(isValid);
    }

    [Fact]
    public void ActiveAssignee_IsValid()
    {
        var userId = Guid.NewGuid();
        var users = new Dictionary<Guid, (bool, bool)> { { userId, (true, false) } };
        var (isValid, _) = ValidateAssignee(userId, users);
        Assert.True(isValid);
    }

    [Fact]
    public void DeactivatedAssignee_IsInvalid()
    {
        var userId = Guid.NewGuid();
        var users = new Dictionary<Guid, (bool, bool)> { { userId, (false, true) } };
        var (isValid, error) = ValidateAssignee(userId, users);
        Assert.False(isValid);
        Assert.Contains("inactive or does not exist", error);
    }

    [Fact]
    public void NonExistentAssignee_IsInvalid()
    {
        var (isValid, error) = ValidateAssignee(Guid.NewGuid(), new Dictionary<Guid, (bool, bool)>());
        Assert.False(isValid);
        Assert.Contains("inactive or does not exist", error);
    }

    private (bool IsValid, string? ErrorMessage) ValidateDepartmentAndAssignee(
        Guid? deptId, Guid? assigneeId,
        Dictionary<Guid, bool> departments,
        Dictionary<Guid, (bool IsActive, bool IsDeactivated, Guid? DepartmentId)> users)
    {
        if (assigneeId.HasValue)
        {
            if (!users.ContainsKey(assigneeId.Value) || !users[assigneeId.Value].IsActive || users[assigneeId.Value].IsDeactivated)
                return (false, "Default assignee is inactive or does not exist");
        }

        if (deptId.HasValue)
        {
            if (!departments.ContainsKey(deptId.Value) || !departments[deptId.Value])
                return (false, "Default department is inactive or does not exist");

            if (assigneeId.HasValue && users.ContainsKey(assigneeId.Value))
            {
                var userDept = users[assigneeId.Value].DepartmentId;
                if (userDept != deptId.Value)
                    return (false, "Default assignee does not belong to the selected department");
            }
        }

        return (true, null);
    }

    [Fact]
    public void DepartmentWithMatchingAssignee_IsValid()
    {
        var deptId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var depts = new Dictionary<Guid, bool> { { deptId, true } };
        var users = new Dictionary<Guid, (bool, bool, Guid?)> { { userId, (true, false, deptId) } };

        var (isValid, _) = ValidateDepartmentAndAssignee(deptId, userId, depts, users);
        Assert.True(isValid);
    }

    [Fact]
    public void DepartmentWithMismatchedAssignee_IsInvalid()
    {
        var financeDeptId = Guid.NewGuid();
        var operationsDeptId = Guid.NewGuid();
        var opsUserId = Guid.NewGuid();
        var depts = new Dictionary<Guid, bool> { { financeDeptId, true }, { operationsDeptId, true } };
        var users = new Dictionary<Guid, (bool, bool, Guid?)> { { opsUserId, (true, false, operationsDeptId) } };

        var (isValid, error) = ValidateDepartmentAndAssignee(financeDeptId, opsUserId, depts, users);
        Assert.False(isValid);
        Assert.Contains("does not belong to the selected department", error);
    }

    [Fact]
    public void TemplateWithoutDepartment_AnyActiveAssignee_IsValid()
    {
        var deptId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var depts = new Dictionary<Guid, bool>();
        var users = new Dictionary<Guid, (bool, bool, Guid?)> { { userId, (true, false, deptId) } };

        var (isValid, _) = ValidateDepartmentAndAssignee(null, userId, depts, users);
        Assert.True(isValid);
    }
}
