using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;
using Microsoft.Extensions.Options;

namespace Backend.Modules.Email;

public class SmtpSettings
{
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string FromEmail { get; set; } = string.Empty;
    public string FromName { get; set; } = string.Empty;
}

public class EmailService : IEmailService
{
    private readonly SmtpSettings _smtpSettings;
    private readonly ILogger<EmailService> _logger;
    private readonly string _frontendUrl;

    public EmailService(IOptions<SmtpSettings> smtpSettings, ILogger<EmailService> logger, IConfiguration configuration)
    {
        _smtpSettings = smtpSettings.Value;
        _logger = logger;
        _frontendUrl = configuration["AppSettings:FrontendUrl"] ?? "https://stars-two-chi.vercel.app";
    }

    public async Task SendWelcomeEmailAsync(string toEmail, string toName, string employeeNumber, string tempPassword)
    {
        var subject = "Welcome to STARS | Your Login Credentials";
        var body = $@"
            <html>
            <body style='font-family: Arial, sans-serif; line-height: 1.6; color: #333;'>
                <div style='max-width: 600px; margin: 0 auto; padding: 20px;'>
                    <h2 style='color: #1B254B;'>Welcome to STARS!</h2>
                    <p>Dear {toName},</p>
                    <p>Your account has been created in the Speedex Task Allocation & Review System (STARS).</p>
                    
                    <div style='background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;'>
                        <h3 style='margin-top: 0; color: #1B254B;'>Your Login Credentials:</h3>
                        <p><strong>Employee ID:</strong> {employeeNumber}</p>
                        <p><strong>Temporary Password:</strong> {tempPassword}</p>
                    </div>
                    
                    <p><strong>Important:</strong> Please change your password after your first login for security purposes.</p>
                    
                    <p>You can login at: <a href='{_frontendUrl}' style='color: #00A99D;'>{_frontendUrl}</a></p>
                    
                    <p>If you have any questions, please contact your manager or IT support.</p>
                    
                    <p>Best regards,<br/>STARS System Administrator</p>
                    
                    <hr style='border: none; border-top: 1px solid #eee; margin: 20px 0;'/>
                    <p style='font-size: 12px; color: #999;'>This is an automated message. Please do not reply to this email.</p>
                </div>
            </body>
            </html>
        ";

        await SendEmailAsync(toEmail, subject, body);
    }

    public async Task SendPasswordResetEmailAsync(string toEmail, string toName, string resetToken, string resetUrl)
    {
        var subject = "Password Reset Request - STARS";
        var resetLink = $"{resetUrl}?token={resetToken}";
        var body = $@"
            <html>
            <body style='font-family: Arial, sans-serif; line-height: 1.6; color: #333;'>
                <div style='max-width: 600px; margin: 0 auto; padding: 20px;'>
                    <h2 style='color: #1B254B;'>Password Reset Request</h2>
                    <p>Dear {toName},</p>
                    <p>We received a request to reset your password for your STARS account.</p>
                    
                    <p>Click the button below to reset your password:</p>
                    
                    <div style='text-align: center; margin: 30px 0;'>
                        <a href='{resetLink}' style='background-color: #00A99D; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;'>Reset Password</a>
                    </div>
                    
                    <p>Or copy and paste this link into your browser:</p>
                    <p style='word-break: break-all; color: #00A99D;'>{resetLink}</p>
                    
                    <p><strong>Note:</strong> This link will expire in 1 hour for security purposes.</p>
                    
                    <p>If you did not request a password reset, please ignore this email or contact IT support if you have concerns.</p>
                    
                    <p>Best regards,<br/>STARS System Administrator</p>
                    
                    <hr style='border: none; border-top: 1px solid #eee; margin: 20px 0;'/>
                    <p style='font-size: 12px; color: #999;'>This is an automated message. Please do not reply to this email.</p>
                </div>
            </body>
            </html>
        ";

        await SendEmailAsync(toEmail, subject, body);
    }

    public async Task SendEmailVerificationAsync(string toEmail, string toName, string verificationToken, string verificationUrl)
    {
        var subject = "Verify Your Email - STARS";
        var verificationLink = $"{verificationUrl}?token={verificationToken}";
        var body = $@"
            <html>
            <body style='font-family: Arial, sans-serif; line-height: 1.6; color: #333;'>
                <div style='max-width: 600px; margin: 0 auto; padding: 20px;'>
                    <h2 style='color: #1B254B;'>Verify Your Email Address</h2>
                    <p>Dear {toName},</p>
                    <p>Thank you for registering with STARS. Please verify your email address to complete your account setup.</p>
                    
                    <p>Click the button below to verify your email:</p>
                    
                    <div style='text-align: center; margin: 30px 0;'>
                        <a href='{verificationLink}' style='background-color: #00A99D; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;'>Verify Email</a>
                    </div>
                    
                    <p>Or copy and paste this link into your browser:</p>
                    <p style='word-break: break-all; color: #00A99D;'>{verificationLink}</p>
                    
                    <p><strong>Note:</strong> This link will expire in 24 hours.</p>
                    
                    <p>If you did not create an account, please ignore this email.</p>
                    
                    <p>Best regards,<br/>STARS System Administrator</p>
                    
                    <hr style='border: none; border-top: 1px solid #eee; margin: 20px 0;'/>
                    <p style='font-size: 12px; color: #999;'>This is an automated message. Please do not reply to this email.</p>
                </div>
            </body>
            </html>
        ";

        await SendEmailAsync(toEmail, subject, body);
    }

    public async Task SendTaskNotificationEmailAsync(string toEmail, string toName, string title, string message)
    {
        var subject = $"STARS Notification: {title}";
        var body = $@"
            <html>
            <body style='font-family: Arial, sans-serif; line-height: 1.6; color: #333;'>
                <div style='max-width: 600px; margin: 0 auto; padding: 20px;'>
                    <h2 style='color: #1B254B;'>{title}</h2>
                    <p>Dear {toName},</p>
                    <p>{message}</p>
                    <div style='text-align: center; margin: 30px 0;'>
                        <a href='http://localhost:5173' style='background-color: #00A99D; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;'>View in STARS</a>
                    </div>
                    <p>Best regards,<br/>STARS System</p>
                    <hr style='border: none; border-top: 1px solid #eee; margin: 20px 0;'/>
                    <p style='font-size: 12px; color: #999;'>This is an automated message. Please do not reply to this email.</p>
                </div>
            </body>
            </html>
        ";

        await SendEmailAsync(toEmail, subject, body);
    }

    public async Task SendOverdueEscalationEmailAsync(string toEmail, string toName, string taskTitle, DateTime deadline)
    {
        var subject = $"STARS ALERT: Task Overdue - {taskTitle}";
        var body = $@"
            <html>
            <body style='font-family: Arial, sans-serif; line-height: 1.6; color: #333;'>
                <div style='max-width: 600px; margin: 0 auto; padding: 20px;'>
                    <h2 style='color: #e74c3c;'>Task Overdue Alert</h2>
                    <p>Dear {toName},</p>
                    <div style='background-color: #fde8e8; padding: 15px; border-radius: 5px; border-left: 4px solid #e74c3c; margin: 20px 0;'>
                        <p style='margin: 0;'><strong>Task:</strong> {taskTitle}</p>
                        <p style='margin: 5px 0 0;'><strong>Deadline was:</strong> {deadline:MMM dd, yyyy h:mm tt}</p>
                    </div>
                    <p>This task has passed its deadline and requires immediate attention.</p>
                    <div style='text-align: center; margin: 30px 0;'>
                        <a href='{_frontendUrl}' style='background-color: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;'>View Task</a>
                    </div>
                    <p>Best regards,<br/>STARS System</p>
                    <hr style='border: none; border-top: 1px solid #eee; margin: 20px 0;'/>
                    <p style='font-size: 12px; color: #999;'>This is an automated escalation alert.</p>
                </div>
            </body>
            </html>
        ";

        await SendEmailAsync(toEmail, subject, body);
    }


    private async Task SendEmailAsync(string toEmail, string subject, string htmlBody)
    {
        if (string.IsNullOrWhiteSpace(_smtpSettings.Host) ||
            string.IsNullOrWhiteSpace(_smtpSettings.Username) ||
            string.IsNullOrWhiteSpace(_smtpSettings.Password) ||
            _smtpSettings.Password.Contains("YOUR_SMTP_APP_PASSWORD"))
        {
            _logger.LogWarning("SMTP credentials are not configured or are placeholder. Skipped sending email to {Email}.", toEmail);
            return;
        }

        try
        {
            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(_smtpSettings.FromName, _smtpSettings.FromEmail));
            message.To.Add(new MailboxAddress("", toEmail));
            message.Subject = subject;

            var bodyBuilder = new BodyBuilder
            {
                HtmlBody = htmlBody
            };
            message.Body = bodyBuilder.ToMessageBody();

            using var client = new SmtpClient();
            client.ServerCertificateValidationCallback = (s, c, h, e) => true;

            // Steps to send the email.
                // 1. Connect to the mail server using Start TLS - Plain text to encrypted.
                // 2. Authenticate with the username and password like logging in
                // 3. Send the email message
                // 4. Disconnect gracefully
            await client.ConnectAsync(_smtpSettings.Host, _smtpSettings.Port, SecureSocketOptions.StartTls);
            await client.AuthenticateAsync(_smtpSettings.Username, _smtpSettings.Password);
            await client.SendAsync(message);
            await client.DisconnectAsync(true);

            _logger.LogInformation("Email sent successfully to {Email}", toEmail);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email to {Email}", toEmail);
        }
    }
}
