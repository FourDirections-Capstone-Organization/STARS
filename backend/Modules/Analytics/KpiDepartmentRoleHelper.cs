using Backend.Models;
using Backend.Models.Enums;

namespace Backend.Modules.Analytics;

public static class KpiDepartmentRoleHelper
{
    public static IReadOnlyList<string> GetApplicableRoles(Department department)
    {
        if (department == null)
        {
            return Array.Empty<string>();
        }

        var roles = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void AddRole(string? role)
        {
            if (string.IsNullOrWhiteSpace(role)) return;
            var trimmed = role.Trim();
            if (seen.Add(trimmed))
            {
                roles.Add(trimmed);
            }
        }

        foreach (var r in GetRolesFromDepartmentName(department.Name))
        {
            AddRole(r);
        }

        if (department.JobPositions != null)
        {
            foreach (var pos in department.JobPositions.Where(jp => jp.IsActive))
            {
                foreach (var r in GetRolesFromPositionName(pos.Name))
                {
                    AddRole(r);
                }
            }
        }

        if (department.Users != null)
        {
            foreach (var user in department.Users.Where(u => u.IsActive && !u.IsDeactivated))
            {
                AddRole(user.Role.ToString());
            }
        }

        if (roles.Count == 0)
        {
            AddRole(nameof(UserRole.Coordinator));
            AddRole(nameof(UserRole.Dispatcher));
            AddRole(nameof(UserRole.Encoder));
            AddRole(nameof(UserRole.Courier));
        }

        return roles;
    }

    public static string GetDisplayName(string role)
    {
        if (string.Equals(role, nameof(UserRole.Courier), StringComparison.OrdinalIgnoreCase))
        {
            return "Courier / Driver";
        }

        return role;
    }

    private static IEnumerable<string> GetRolesFromDepartmentName(string? departmentName)
    {
        if (string.IsNullOrWhiteSpace(departmentName)) yield break;

        var name = departmentName.Trim().ToLowerInvariant();

        if (name.Contains("dispatch"))
        {
            yield return nameof(UserRole.Dispatcher);
            yield return nameof(UserRole.Coordinator);
            yield break;
        }

        if (name.Contains("forwarding"))
        {
            yield return nameof(UserRole.Courier);
            yield return nameof(UserRole.Encoder);
            yield break;
        }

        if (name.Contains("delivery") || name.Contains("logistics") || name.Contains("fleet") || name.Contains("transport"))
        {
            yield return nameof(UserRole.Courier);
            yield return nameof(UserRole.Dispatcher);
            yield return nameof(UserRole.Encoder);
            yield break;
        }

        if (name.Contains("sorting") || name.Contains("hub") || name.Contains("warehouse"))
        {
            yield return nameof(UserRole.Encoder);
            yield return nameof(UserRole.Dispatcher);
            yield return nameof(UserRole.Courier);
            yield break;
        }

        if (name.Contains("coordinator") || name.Contains("customer service") || name.Contains("support"))
        {
            yield return nameof(UserRole.Coordinator);
            yield return nameof(UserRole.Manager);
            yield break;
        }

        if (name.Contains("finance") || name.Contains("accounting") || name.Contains("billing"))
        {
            yield return nameof(UserRole.Accountant);
            yield return nameof(UserRole.Manager);
            yield break;
        }

        if (name.Contains("management") || name.Contains("executive") || name.Contains("admin"))
        {
            yield return nameof(UserRole.Manager);
            yield return nameof(UserRole.Coordinator);
        }
    }

    private static IEnumerable<string> GetRolesFromPositionName(string? positionName)
    {
        if (string.IsNullOrWhiteSpace(positionName)) yield break;

        var pos = positionName.Trim().ToLowerInvariant();

        if (pos.Contains("courier") || pos.Contains("driver") || pos.Contains("rider"))
            yield return nameof(UserRole.Courier);

        if (pos.Contains("encoder") || pos.Contains("clerk"))
            yield return nameof(UserRole.Encoder);

        if (pos.Contains("dispatcher"))
            yield return nameof(UserRole.Dispatcher);

        if (pos.Contains("coordinator") || pos.Contains("customer service"))
            yield return nameof(UserRole.Coordinator);

        if (pos.Contains("manager"))
            yield return nameof(UserRole.Manager);

        if (pos.Contains("account") || pos.Contains("finance") || pos.Contains("billing"))
            yield return nameof(UserRole.Accountant);
    }
}

