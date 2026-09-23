using Backend.Data;
using Backend.Models;
using Backend.Modules.Email;
using Backend.Models.DTOs;
using Backend.Models.Enums;
using Backend.Modules.AuthenticationAndCredentials;
using Backend.Modules.TaskManagement;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;

namespace Backend.Modules.UserAccountManagement;

public class UserService : IUserService
{
    private readonly AppDbContext _db;
    private readonly IEmailService _emailService;
    private readonly IEmailVerificationService _emailVerificationService;
    private readonly IAuditLogService _auditLogService;
    private readonly string _frontendUrl;
    private readonly ILogger<UserService> _logger;

    public UserService(
        AppDbContext db,
        IEmailService emailService,
        IEmailVerificationService emailVerificationService,
        IAuditLogService auditLogService,
        IConfiguration configuration,
        ILogger<UserService> logger)
    {
        _db = db;
        _emailService = emailService;
        _emailVerificationService = emailVerificationService;
        _auditLogService = auditLogService;
        _frontendUrl = configuration["AppSettings:FrontendUrl"] ?? "http://localhost:5173";
        _logger = logger;
    }

    public async Task<ApiResponseDTO<UserResponseDTO>> RegisterAsync(RegisterUserDTO dto)
    {
        // Check if employee number already exists
        var empNumExists = await _db.Users
            .AnyAsync(u => u.EmployeeNumber == dto.EmployeeNumber);

        if (empNumExists)
            return ApiResponseDTO<UserResponseDTO>.Failure("Employee number already exists");

        // Check if email already exists
        var emailExists = await _db.Users
            .AnyAsync(u => u.Email.ToLower() == dto.Email.ToLower());

        if (emailExists)
            return ApiResponseDTO<UserResponseDTO>.Failure("Email already exists");

        // Validate department if provided
        if (dto.DepartmentId.HasValue)
        {
            var deptExists = await _db.Departments
                .AnyAsync(d => d.Id == dto.DepartmentId.Value && d.IsActive);

            if (!deptExists)
                return ApiResponseDTO<UserResponseDTO>.Failure("Department not found or is inactive");
        }

        // Validate job position if provided
        if (dto.JobPositionId.HasValue)
        {
            var posExists = await _db.JobPositions
                .AnyAsync(jp => jp.Id == dto.JobPositionId.Value && jp.IsActive);

            if (!posExists)
                return ApiResponseDTO<UserResponseDTO>.Failure("Job position not found or is inactive");
        }

        // Create user object first
        var user = new User
        {
            EmployeeNumber = dto.EmployeeNumber,
            Email = dto.Email,
            FirstName = dto.FirstName,
            MiddleName = dto.MiddleName,
            LastName = dto.LastName,
            Suffix = dto.Suffix,
            ContactNumber = dto.ContactNumber,
            Role = dto.Role,
            DepartmentId = dto.DepartmentId,
            JobPositionId = dto.JobPositionId,
            HireDate = dto.HireDate,
            EmploymentStatus = dto.EmploymentStatus ?? "Regular",
            IsActive = false,
            IsDeactivated = false,
            IsEmailVerified = false,
            IsPasswordChanged = false,
            CreatedAt = DateTime.UtcNow
        };

        // Generate temporary password (OWASP compliant: 15+ chars, upper, lower, number, special)
        var tempPassword = GenerateTempPassword();
        var passwordHasher = new PasswordHasher<User>();
        user.PasswordHash = passwordHasher.HashPassword(user, tempPassword);

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        // Load related data for response
        await _db.Entry(user).Reference(u => u.Department).LoadAsync();
        await _db.Entry(user).Reference(u => u.JobPosition).LoadAsync();

        var verificationUrl = $"{_frontendUrl}/verify-email";
        await _emailVerificationService.SendVerificationEmailForUserAsync(user.Id, verificationUrl);

        // Send welcome email with login credentials
        var fullName = $"{user.FirstName} {user.MiddleName} {user.LastName} {user.Suffix}".Replace("  ", " ").Trim();
        await _emailService.SendWelcomeEmailAsync(user.Email, fullName, user.EmployeeNumber, tempPassword);

        _logger.LogInformation("New user registered: {EmployeeNumber} - {Email}", user.EmployeeNumber, user.Email);

        await _auditLogService.LogAsync(
            null,
            AuditActionType.Create,
            "User",
            user.Id,
            null,
            $"User {fullName} ({user.EmployeeNumber}) registered",
            "UserManagement");

        var response = MapToResponseDTO(user);
        return ApiResponseDTO<UserResponseDTO>.Success(response, "User registered successfully. Verification email sent.");
    }

    public async Task<ApiResponseDTO<PaginatedResponseDTO<UserResponseDTO>>> GetAllAsync(int pageNumber = 1, int pageSize = 10, string? search = null, string? role = null, Guid? departmentId = null)
    {
        pageNumber = Math.Max(1, pageNumber);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.Users
            .Include(u => u.Department)
            .Include(u => u.JobPosition)
            .AsQueryable();

        // Apply filters
        if (!string.IsNullOrWhiteSpace(search))
        {
            var searchLower = search.ToLower();
            query = query.Where(u =>
                u.FirstName.ToLower().Contains(searchLower) ||
                u.LastName.ToLower().Contains(searchLower) ||
                u.Email.ToLower().Contains(searchLower) ||
                u.EmployeeNumber.ToLower().Contains(searchLower));
        }

        if (!string.IsNullOrWhiteSpace(role) && Enum.TryParse<UserRole>(role, true, out var roleEnum))
        {
            query = query.Where(u => u.Role == roleEnum);
        }

        if (departmentId.HasValue)
        {
            query = query.Where(u => u.DepartmentId == departmentId.Value);
        }

        var totalCount = await query.CountAsync();

        var users = await query
            .OrderBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var response = users.Select(MapToResponseDTO).ToList();

        var paginatedResult = new PaginatedResponseDTO<UserResponseDTO>
        {
            Items = response,
            TotalCount = totalCount,
            PageNumber = pageNumber,
            PageSize = pageSize
        };

        return ApiResponseDTO<PaginatedResponseDTO<UserResponseDTO>>.Success(paginatedResult);
    }

    public async Task<ApiResponseDTO<UserResponseDTO>> GetByIdAsync(Guid id)
    {
        var user = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.JobPosition)
            .FirstOrDefaultAsync(u => u.Id == id);

        if (user is null)
            return ApiResponseDTO<UserResponseDTO>.Failure("User not found");

        var response = MapToResponseDTO(user);
        return ApiResponseDTO<UserResponseDTO>.Success(response);
    }

    public async Task<ApiResponseDTO<UserResponseDTO>> GetByEmployeeNumberAsync(string employeeNumber)
    {
        var user = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.JobPosition)
            .FirstOrDefaultAsync(u => u.EmployeeNumber == employeeNumber);

        if (user is null)
            return ApiResponseDTO<UserResponseDTO>.Failure("User not found");

        var response = MapToResponseDTO(user);
        return ApiResponseDTO<UserResponseDTO>.Success(response);
    }

    public async Task<ApiResponseDTO<UserResponseDTO>> UpdateAsync(Guid id, UpdateUserDTO dto, Guid? requestUserId = null)
    {
        var user = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.JobPosition)
            .FirstOrDefaultAsync(u => u.Id == id);

        if (user is null)
            return ApiResponseDTO<UserResponseDTO>.Failure("User not found");

        // Check if user is deactivated
        if (user.IsDeactivated)
            return ApiResponseDTO<UserResponseDTO>.Failure("Cannot update a deactivated user");

        // Check permissions: only Manager or the user themselves can update
        if (!requestUserId.HasValue)
            return ApiResponseDTO<UserResponseDTO>.Failure("Authentication required");
        
        if (requestUserId != id)
        {
            var requestUser = await _db.Users.FindAsync(requestUserId.Value);
            if (requestUser is null || requestUser.Role != UserRole.Manager)
                return ApiResponseDTO<UserResponseDTO>.Failure("You don't have permission to update this user");
        }

        // Check email uniqueness if changing
        // Capture old values before mutation (AL-002 step 7)
        var oldFirstName = user.FirstName;
        var oldMiddleName = user.MiddleName ?? string.Empty;
        var oldLastName = user.LastName;
        var oldSuffix = user.Suffix ?? string.Empty;
        var oldContact = user.ContactNumber ?? string.Empty;
        var oldEmail = user.Email;

        if (!string.IsNullOrWhiteSpace(dto.Email) && dto.Email.ToLower() != user.Email.ToLower())
        {
            var emailExists = await _db.Users
                .AnyAsync(u => u.Id != id && u.Email.ToLower() == dto.Email.ToLower());

            if (emailExists)
                return ApiResponseDTO<UserResponseDTO>.Failure("Email already exists");

            user.Email = dto.Email;
            user.IsEmailVerified = false; // Reset verification if email changed
        }

        // Update fields
        if (!string.IsNullOrWhiteSpace(dto.FirstName))
            user.FirstName = dto.FirstName;

        if (dto.MiddleName != null)
            user.MiddleName = dto.MiddleName;

        if (!string.IsNullOrWhiteSpace(dto.LastName))
            user.LastName = dto.LastName;

        if (dto.Suffix != null)
            user.Suffix = dto.Suffix;

        if (dto.ContactNumber != null)
            user.ContactNumber = dto.ContactNumber;

        if (dto.HireDate.HasValue)
            user.HireDate = dto.HireDate;

        if (dto.EmploymentStatus != null)
            user.EmploymentStatus = dto.EmploymentStatus;

        user.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        var fullName = $"{user.FirstName} {user.MiddleName} {user.LastName} {user.Suffix}".Replace("  ", " ").Trim();

        // AL-002 step 7: capture Old Value and New Value for the changed fields
        var oldParts = new List<string>();
        var newParts = new List<string>();
        void Track(string field, string oldVal, string newVal)
        {
            if (oldVal != newVal)
            {
                oldParts.Add($"\"{field}\":\"{oldVal}\"");
                newParts.Add($"\"{field}\":\"{newVal}\"");
            }
        }
        Track("FirstName", oldFirstName, user.FirstName);
        Track("MiddleName", oldMiddleName, user.MiddleName ?? string.Empty);
        Track("LastName", oldLastName, user.LastName);
        Track("Suffix", oldSuffix, user.Suffix ?? string.Empty);
        Track("ContactNumber", oldContact, user.ContactNumber ?? string.Empty);
        Track("Email", oldEmail, user.Email);

        await _auditLogService.LogAsync(
            requestUserId,
            AuditActionType.Update,
            "User",
            user.Id,
            null,
            $"User {fullName} ({user.EmployeeNumber}) profile updated",
            "UserManagement",
            oldValue: oldParts.Count > 0 ? "{" + string.Join(",", oldParts) + "}" : null,
            newValue: newParts.Count > 0 ? "{" + string.Join(",", newParts) + "}" : null);

        var response = MapToResponseDTO(user);
        return ApiResponseDTO<UserResponseDTO>.Success(response, "User updated successfully");
    }

    public async Task<ApiResponseDTO<bool>> DeactivateAsync(Guid id, Guid? requestUserId = null)
    {
        var user = await _db.Users.FindAsync(id);

        if (user is null)
            return ApiResponseDTO<bool>.Failure("User not found");

        if (user.IsDeactivated)
            return ApiResponseDTO<bool>.Failure("User is already deactivated");

        if (requestUserId.HasValue && requestUserId.Value == id)
            return ApiResponseDTO<bool>.Failure("You cannot deactivate your own account");

        // Soft deactivate
        user.IsDeactivated = true;
        user.IsActive = false;
        user.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        var fullName = $"{user.FirstName} {user.MiddleName} {user.LastName} {user.Suffix}".Replace("  ", " ").Trim();

        _logger.LogInformation("User deactivated: {EmployeeNumber}", user.EmployeeNumber);

        await _auditLogService.LogAsync(
            requestUserId,
            AuditActionType.Update,
            "User",
            user.Id,
            null,
            $"User {fullName} ({user.EmployeeNumber}) deactivated",
            "UserManagement",
            oldValue: "{\"IsDeactivated\":\"false\",\"IsActive\":\"true\"}",
            newValue: "{\"IsDeactivated\":\"true\",\"IsActive\":\"false\"}");

        return ApiResponseDTO<bool>.Success(true, "User deactivated successfully. Historical data preserved.");
    }

    public async Task<ApiResponseDTO<bool>> ActivateAsync(Guid id, Guid? requestUserId = null)
    {
        
        var user = await _db.Users.FindAsync(id);

        if (user is null)
            return ApiResponseDTO<bool>.Failure("User not found");
        
        if (!user.IsDeactivated)
            return ApiResponseDTO<bool>.Failure("User is already active");

        if (requestUserId.HasValue && requestUserId.Value == id)
            return ApiResponseDTO<bool>.Failure("You cannot activate your own account");

        // Reactivate
        user.IsDeactivated = false;
        user.IsActive = true;
        user.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        var fullName = $"{user.FirstName} {user.MiddleName} {user.LastName} {user.Suffix}".Replace("  ", " ").Trim();

        _logger.LogInformation("User activated: {EmployeeNumber}", user.EmployeeNumber);

        await _auditLogService.LogAsync(
            requestUserId,
            AuditActionType.Update,
            "User",
            user.Id,
            null,
            $"User {fullName} ({user.EmployeeNumber}) activated",
            "UserManagement",
            oldValue: "{\"IsDeactivated\":\"true\",\"IsActive\":\"false\"}",
            newValue: "{\"IsDeactivated\":\"false\",\"IsActive\":\"true\"}");

        return ApiResponseDTO<bool>.Success(true, "User activated successfully");

    }

    public async Task<ApiResponseDTO<string>> GenerateEmployeeNumberAsync()
    {
        // Get all employee numbers and find the next available
        var allUsers = await _db.Users
            .Select(u => u.EmployeeNumber)
            .ToListAsync();

        var usedNumbers = new HashSet<int>();

        foreach (var empNum in allUsers)
        {
            if (int.TryParse(empNum, out var num))
            {
                usedNumbers.Add(num);
            }
        }

        // Find next available number
        var nextNumber = 1;
        while (usedNumbers.Contains(nextNumber))
        {
            nextNumber++;
        }

        // Format with leading zeros (e.g., "0001")
        var formattedNumber = nextNumber.ToString("D4");

        return ApiResponseDTO<string>.Success(formattedNumber);
    }

    private string GenerateTempPassword()
    {
        // Generate OWASP-compliant temporary password (15+ chars, upper, lower, number, special)
        const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const string lower = "abcdefghjkmnpqrstuvwxyz";
        const string digits = "23456789";
        const string special = "!@#$%^&*";

        var random = new Random();
        var password = new char[16]; // 16 characters to exceed OWASP minimum of 15.

        // Ensure that at least one of each required type (OWASP Compliance)
        password[0] = upper[random.Next(upper.Length)];
        password[1] = lower[random.Next(lower.Length)];
        password[2] = digits[random.Next(digits.Length)];
        password[3] = special[random.Next(special.Length)];

        // Fill the rest randomly from all character types
        const string allChars = upper + lower + digits + special;
        for (int i = 4; i < 16; i++)
        {
            password[i] = allChars[random.Next(allChars.Length)];
        }

        // Shuffle the password to randomize positions
        var shuffledPassword = password.OrderBy(_ => random.Next()).ToArray(); // Temporary
        
        return new string(shuffledPassword); 
    }

    private UserResponseDTO MapToResponseDTO(User user)
    {
        return new UserResponseDTO
        {
            Id = user.Id,
            EmployeeNumber = user.EmployeeNumber,
            Username = user.Username,
            Email = user.Email,
            FirstName = user.FirstName,
            MiddleName = user.MiddleName,
            LastName = user.LastName,
            Suffix = user.Suffix,
            ContactNumber = user.ContactNumber,
            Role = user.Role,
            DepartmentId = user.DepartmentId,
            DepartmentName = user.Department?.Name,
            JobPositionId = user.JobPositionId,
            JobPositionName = user.JobPosition?.Name,
            IsActive = user.IsActive,
            IsDeactivated = user.IsDeactivated,
            IsEmailVerified = user.IsEmailVerified,
            IsPasswordChanged = user.IsPasswordChanged,
            HireDate = user.HireDate,
            EmploymentStatus = user.EmploymentStatus,
            CreatedAt = user.CreatedAt,
            FullName = $"{user.FirstName} {user.MiddleName} {user.LastName} {user.Suffix}"
                .Replace("  ", " ").Trim(),
            // Online while the user has an active session (LastActivityAt kept fresh
            // by requests/heartbeat); Offline after logout or session timeout.
            PresenceStatus = user.LastActivityAt.HasValue
                && (DateTime.UtcNow - user.LastActivityAt.Value).TotalMinutes <= 15
                ? "Online"
                : "Offline"
        };
    }

    public async System.Threading.Tasks.Task SeedDefaultManagerAsync()
    {
        var managerEmail = "manager@stars.com";
        var managerExists = await _db.Users.AnyAsync(u => u.Email.ToLower() == managerEmail.ToLower());

        if (managerExists)
        {
            _logger.LogInformation("Default manager already exists");
            return;
        }

        var passwordHasher = new PasswordHasher<User>();
        var tempPassword = "Manager@2024!Temp";

        var manager = new User
        {
            EmployeeNumber = "MGR001",
            Email = managerEmail,
            FirstName = "System",
            LastName = "Manager",
            Role = UserRole.Manager,
            IsActive = true,
            IsDeactivated = false,
            IsEmailVerified = true,
            IsPasswordChanged = false,
            CreatedAt = DateTime.UtcNow
        };

        manager.PasswordHash = passwordHasher.HashPassword(manager, tempPassword);

        _db.Users.Add(manager);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Default manager created: {Email} with temporary password: {Password}", managerEmail, tempPassword);
    }

    public async System.Threading.Tasks.Task SeedTestAccountsAsync()
    {
        // ============================================================================
        // FOR TESTING ONLY - REMOVE FOR PRODUCTION
        // These accounts are for development and testing purposes only.
        // They should be removed or disabled before deploying to production.
        // ============================================================================

        var departments = await _db.Departments.ToListAsync();
        var coordinatorDept = departments.FirstOrDefault(d => d.Name == "Coordinator and Customer Service Team");
        var dispatchDept = departments.FirstOrDefault(d => d.Name == "Dispatch Team");
        var forwardingDept = departments.FirstOrDefault(d => d.Name == "Forwarding and Delivery Team");

        var testAccounts = new[]
        {
            new { EmployeeNumber = "CRD001", Email = "coordinator1@stars.com", FirstName = "Test", LastName = "Coordinator1", Role = UserRole.Coordinator, DepartmentId = coordinatorDept?.Id },
            new { EmployeeNumber = "CRD002", Email = "coordinator2@stars.com", FirstName = "Test", LastName = "Coordinator2", Role = UserRole.Coordinator, DepartmentId = dispatchDept?.Id },
            new { EmployeeNumber = "DSP001", Email = "dispatcher1@stars.com", FirstName = "Test", LastName = "Dispatcher1", Role = UserRole.Dispatcher, DepartmentId = dispatchDept?.Id },
            new { EmployeeNumber = "DSP002", Email = "dispatcher2@stars.com", FirstName = "Test", LastName = "Dispatcher2", Role = UserRole.Dispatcher, DepartmentId = dispatchDept?.Id },
            new { EmployeeNumber = "ENC001", Email = "encoder1@stars.com", FirstName = "Test", LastName = "Encoder1", Role = UserRole.Encoder, DepartmentId = forwardingDept?.Id },
            new { EmployeeNumber = "ENC002", Email = "encoder2@stars.com", FirstName = "Test", LastName = "Encoder2", Role = UserRole.Encoder, DepartmentId = forwardingDept?.Id },
            new { EmployeeNumber = "CRS001", Email = "courier1@stars.com", FirstName = "Test", LastName = "Courier1", Role = UserRole.Courier, DepartmentId = dispatchDept?.Id },
            new { EmployeeNumber = "CRS002", Email = "courier2@stars.com", FirstName = "Test", LastName = "Courier2", Role = UserRole.Courier, DepartmentId = forwardingDept?.Id }
        };

        var passwordHasher = new PasswordHasher<User>();
        var tempPassword = "Test@2024!Pass";

        foreach (var account in testAccounts)
        {
            var exists = await _db.Users.AnyAsync(u => u.Email.ToLower() == account.Email.ToLower());
            if (exists)
            {
                _logger.LogInformation("Test account already exists: {Email}", account.Email);
                continue;
            }

            var user = new User
            {
                EmployeeNumber = account.EmployeeNumber,
                Email = account.Email,
                FirstName = account.FirstName,
                LastName = account.LastName,
                Role = account.Role,
                DepartmentId = account.DepartmentId,
                IsActive = true,
                IsDeactivated = false,
                IsEmailVerified = true,
                IsPasswordChanged = false,
                CreatedAt = DateTime.UtcNow
            };

            user.PasswordHash = passwordHasher.HashPassword(user, tempPassword);
            _db.Users.Add(user);

            _logger.LogInformation("Test account created: {Email} ({Role}) with password: {Password}", account.Email, account.Role, tempPassword);
        }

        await _db.SaveChangesAsync();
        _logger.LogInformation("Test accounts seeding completed");
    }
}
