using Backend.Models.Enums;
using Xunit;

namespace Backend.Tests;

public class RolePermissionsTests
{
    private List<string> GetPermissionsForRole(UserRole role)
    {
        var permissions = new List<string>();

        permissions.Add("ViewOwnProfile");
        permissions.Add("UpdateOwnProfile");
        permissions.Add("ViewAssignedTasks");
        permissions.Add("UpdateAssignedTasks");

        switch (role)
        {
            case UserRole.Manager:
                permissions.Add("ViewAllTasks");
                permissions.Add("CreateTasks");
                permissions.Add("AssignTasks");
                permissions.Add("DeleteTasks");
                permissions.Add("ViewAllUsers");
                permissions.Add("CreateUsers");
                permissions.Add("UpdateUsers");
                permissions.Add("DeactivateUsers");
                permissions.Add("ViewAuditLogs");
                permissions.Add("ViewConfidentialTasks");
                permissions.Add("ManageDepartments");
                permissions.Add("ManageRoles");
                break;

            case UserRole.Coordinator:
                permissions.Add("ViewDepartmentTasks");
                permissions.Add("CreateTasks");
                permissions.Add("AssignTasks");
                permissions.Add("MarkTasksConfidential");
                permissions.Add("ViewConfidentialTasks");
                permissions.Add("ViewDepartmentUsers");
                break;

            case UserRole.Dispatcher:
                permissions.Add("UpdateTaskStatus");
                break;

            case UserRole.Encoder:
                permissions.Add("UpdateTaskStatus");
                break;

            case UserRole.Courier:
                permissions.Add("UpdateTaskStatus");
                permissions.Add("UpdateDeliveryStatus");
                break;
        }

        return permissions;
    }

    [Fact]
    public void Manager_HasAllAdminPermissions()
    {
        var permissions = GetPermissionsForRole(UserRole.Manager);

        Assert.Contains("ViewAllTasks", permissions);
        Assert.Contains("CreateTasks", permissions);
        Assert.Contains("AssignTasks", permissions);
        Assert.Contains("DeleteTasks", permissions);
        Assert.Contains("ViewAllUsers", permissions);
        Assert.Contains("CreateUsers", permissions);
        Assert.Contains("UpdateUsers", permissions);
        Assert.Contains("DeactivateUsers", permissions);
        Assert.Contains("ViewAuditLogs", permissions);
        Assert.Contains("ViewConfidentialTasks", permissions);
        Assert.Contains("ManageDepartments", permissions);
        Assert.Contains("ManageRoles", permissions);
    }

    [Fact]
    public void Coordinator_HasTaskManagementPermissions()
    {
        var permissions = GetPermissionsForRole(UserRole.Coordinator);

        Assert.Contains("ViewDepartmentTasks", permissions);
        Assert.Contains("CreateTasks", permissions);
        Assert.Contains("AssignTasks", permissions);
        Assert.Contains("MarkTasksConfidential", permissions);
        Assert.Contains("ViewConfidentialTasks", permissions);
        Assert.Contains("ViewDepartmentUsers", permissions);
    }

    [Fact]
    public void Coordinator_DoesNotHaveAdminPermissions()
    {
        var permissions = GetPermissionsForRole(UserRole.Coordinator);

        Assert.DoesNotContain("ViewAllUsers", permissions);
        Assert.DoesNotContain("ManageRoles", permissions);
        Assert.DoesNotContain("ViewAuditLogs", permissions);
        Assert.DoesNotContain("DeactivateUsers", permissions);
    }

    [Fact]
    public void Encoder_HasOnlyAssignedPermissions()
    {
        var permissions = GetPermissionsForRole(UserRole.Encoder);

        Assert.Contains("ViewAssignedTasks", permissions);
        Assert.Contains("UpdateTaskStatus", permissions);
        Assert.DoesNotContain("CreateTasks", permissions);
        Assert.DoesNotContain("ViewAllTasks", permissions);
    }

    [Fact]
    public void Courier_HasDeliveryPermission()
    {
        var permissions = GetPermissionsForRole(UserRole.Courier);

        Assert.Contains("UpdateDeliveryStatus", permissions);
        Assert.Contains("ViewAssignedTasks", permissions);
        Assert.DoesNotContain("CreateTasks", permissions);
    }

    [Fact]
    public void Dispatcher_HasOnlyAssignedPermissions()
    {
        var permissions = GetPermissionsForRole(UserRole.Dispatcher);

        Assert.Contains("ViewAssignedTasks", permissions);
        Assert.Contains("UpdateTaskStatus", permissions);
        Assert.DoesNotContain("CreateTasks", permissions);
    }

    [Fact]
    public void AllRoles_HaveBasePermissions()
    {
        foreach (var role in Enum.GetValues<UserRole>())
        {
            var permissions = GetPermissionsForRole(role);

            Assert.Contains("ViewOwnProfile", permissions);
            Assert.Contains("UpdateOwnProfile", permissions);
            Assert.Contains("ViewAssignedTasks", permissions);
            Assert.Contains("UpdateAssignedTasks", permissions);
        }
    }

    [Fact]
    public void Manager_HasMostPermissions()
    {
        var managerPerms = GetPermissionsForRole(UserRole.Manager).Count;

        foreach (var role in Enum.GetValues<UserRole>())
        {
            if (role == UserRole.Manager) continue;
            var rolePerms = GetPermissionsForRole(role).Count;
            Assert.True(managerPerms > rolePerms);
        }
    }

    [Fact]
    public void Encoder_DoesNotHaveConfidentialAccess()
    {
        var permissions = GetPermissionsForRole(UserRole.Encoder);
        Assert.DoesNotContain("ViewConfidentialTasks", permissions);
    }

    [Fact]
    public void Dispatcher_DoesNotHaveConfidentialAccess()
    {
        var permissions = GetPermissionsForRole(UserRole.Dispatcher);
        Assert.DoesNotContain("ViewConfidentialTasks", permissions);
    }

    [Fact]
    public void Courier_DoesNotHaveConfidentialAccess()
    {
        var permissions = GetPermissionsForRole(UserRole.Courier);
        Assert.DoesNotContain("ViewConfidentialTasks", permissions);
    }

    [Fact]
    public void Manager_AndCoordinator_HaveConfidentialAccess()
    {
        var managerPerms = GetPermissionsForRole(UserRole.Manager);
        var coordPerms = GetPermissionsForRole(UserRole.Coordinator);

        Assert.Contains("ViewConfidentialTasks", managerPerms);
        Assert.Contains("ViewConfidentialTasks", coordPerms);
    }

    [Fact]
    public void Courier_HasUniqueDeliveryPermission()
    {
        var courierPerms = GetPermissionsForRole(UserRole.Courier);
        var encoderPerms = GetPermissionsForRole(UserRole.Encoder);
        var dispatcherPerms = GetPermissionsForRole(UserRole.Dispatcher);

        Assert.Contains("UpdateDeliveryStatus", courierPerms);
        Assert.DoesNotContain("UpdateDeliveryStatus", encoderPerms);
        Assert.DoesNotContain("UpdateDeliveryStatus", dispatcherPerms);
    }

    [Fact]
    public void Encoder_AndDispatcher_HaveSamePermissions()
    {
        var encoderPerms = GetPermissionsForRole(UserRole.Encoder);
        var dispatcherPerms = GetPermissionsForRole(UserRole.Dispatcher);

        Assert.Equal(encoderPerms, dispatcherPerms);
    }

    [Fact]
    public void GetAllRoles_Returns6Roles()
    {
        var roles = Enum.GetValues<UserRole>();
        Assert.Equal(6, roles.Length);
    }
}