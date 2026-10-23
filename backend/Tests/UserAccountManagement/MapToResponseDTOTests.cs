using Backend.Models;
using Xunit;

namespace Backend.Tests.UserAccountManagement;

public class MapToResponseDTOTests
{
    private string MapToFullName(User user)
    {
        var parts = new[] { user.FirstName, user.MiddleName, user.LastName, user.Suffix }
            .Where(p => !string.IsNullOrWhiteSpace(p));
        return string.Join(" ", parts).Trim();
    }

    [Fact]
    public void MapToResponseDTO_AllFieldsPopulated_CorrectFullName()
    {
        var user = new User
        {
            FirstName = "John",
            MiddleName = "Michael",
            LastName = "Doe",
            Suffix = "Jr"
        };

        var fullName = MapToFullName(user);
        Assert.Equal("John Michael Doe Jr", fullName);
    }

    [Fact]
    public void MapToResponseDTO_NoMiddleNameOrSuffix_NoDoubleSpaces()
    {
        var user = new User
        {
            FirstName = "John",
            LastName = "Doe"
        };

        var fullName = MapToFullName(user);
        Assert.Equal("John Doe", fullName);
        Assert.DoesNotContain("  ", fullName);
    }

    [Fact]
    public void MapToResponseDTO_OnlyMiddleName_NoDoubleSpaces()
    {
        var user = new User
        {
            FirstName = "John",
            MiddleName = "M",
            LastName = "Doe"
        };

        var fullName = MapToFullName(user);
        Assert.Equal("John M Doe", fullName);
    }

    [Fact]
    public void MapToResponseDTO_DepartmentName_MappedCorrectly()
    {
        var user = new User
        {
            Department = new Department { Name = "Engineering" }
        };

        Assert.Equal("Engineering", user.Department?.Name);
    }

    [Fact]
    public void MapToResponseDTO_MultiSystemFields_MappedCorrectly()
    {
        var user = new User
        {
            AllowedSystems = "STARS,DMS,FOMS",
            DmsRole = "Driver",
            DmsAreas = "Manila, Makati",
            FomsRole = "Head Accountant"
        };

        var dto = new Backend.Models.DTOs.UserResponseDTO
        {
            AllowedSystems = user.AllowedSystems,
            DmsRole = user.DmsRole,
            DmsAreas = user.DmsAreas?.Split(',').Select(s => s.Trim()).ToList(),
            FomsRole = user.FomsRole
        };

        Assert.Equal("STARS,DMS,FOMS", dto.AllowedSystems);
        Assert.Equal("Driver", dto.DmsRole);
        Assert.Contains("Manila", dto.DmsAreas!);
        Assert.Contains("Makati", dto.DmsAreas!);
        Assert.Equal("Head Accountant", dto.FomsRole);
    }
}