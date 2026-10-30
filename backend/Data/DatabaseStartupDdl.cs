using Microsoft.EntityFrameworkCore;

namespace Backend.Data;

/// <summary>
/// Provides idempotent DDL scripts and helpers executed during startup to ensure
/// all required tables, columns, indexes, and migration history entries exist.
/// </summary>
public static class DatabaseStartupDdl
{
    public const string StartupDdlSql = @"
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Tasks' AND column_name='TaskNumber') THEN
                ALTER TABLE ""Tasks"" ADD COLUMN ""TaskNumber"" character varying(32);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='TaskDeliveryDetails' AND column_name='SenderAddress') THEN
                ALTER TABLE ""TaskDeliveryDetails"" ADD COLUMN ""SenderAddress"" character varying(500);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='TaskDeliveryDetails' AND column_name='SpecialInstructions') THEN
                ALTER TABLE ""TaskDeliveryDetails"" ADD COLUMN ""SpecialInstructions"" character varying(1000);
            END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS ""FomsClientFinancialStatuses"" (
            ""Id"" uuid NOT NULL PRIMARY KEY,
            ""ClientAccountId"" character varying(100) NOT NULL,
            ""ClientName"" character varying(200) NOT NULL,
            ""InvoiceNumber"" character varying(100) NOT NULL,
            ""CurrentStatus"" character varying(50) NOT NULL,
            ""TotalAmount"" numeric(18,2) NOT NULL,
            ""AmountPaid"" numeric(18,2) NOT NULL,
            ""OutstandingBalance"" numeric(18,2) NOT NULL,
            ""NextDueDate"" timestamp with time zone NULL,
            ""LastPaymentDate"" timestamp with time zone NULL,
            ""LastUpdatedFromFoms"" timestamp with time zone NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ""IX_FomsClientFinancialStatuses_InvoiceNumber"" ON ""FomsClientFinancialStatuses"" (""InvoiceNumber"");
        CREATE INDEX IF NOT EXISTS ""IX_FomsClientFinancialStatuses_ClientAccountId"" ON ""FomsClientFinancialStatuses"" (""ClientAccountId"");

        CREATE TABLE IF NOT EXISTS ""TaskFomsInvoiceDetails"" (
            ""Id"" uuid NOT NULL PRIMARY KEY,
            ""TaskId"" uuid NOT NULL REFERENCES ""Tasks"" (""Id"") ON DELETE CASCADE,
            ""InvoiceNumber"" character varying(100) NOT NULL,
            ""ClientName"" character varying(200) NOT NULL,
            ""ClientAddress"" character varying(500) NULL,
            ""ClientContactPerson"" character varying(150) NULL,
            ""ClientContactNumber"" character varying(50) NULL,
            ""ClientEmail"" character varying(150) NULL,
            ""InvoiceAmount"" numeric(18,2) NOT NULL,
            ""BillingDate"" timestamp with time zone NULL,
            ""DueDate"" timestamp with time zone NULL,
            ""InvoiceDocumentUrl"" character varying(1000) NULL,
            ""SignedReceivingCopyUrl"" character varying(1000) NULL,
            ""ActualReceivedDate"" timestamp with time zone NULL,
            ""DeliveryRemarks"" character varying(1000) NULL,
            ""EndorsementStatus"" character varying(50) NOT NULL,
            ""FomsSyncStatus"" character varying(50) NOT NULL,
            ""LastSyncedAt"" timestamp with time zone NULL,
            ""LastSyncError"" character varying(500) NULL,
            ""CreatedAt"" timestamp with time zone NOT NULL,
            ""UpdatedAt"" timestamp with time zone NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ""IX_TaskFomsInvoiceDetails_TaskId"" ON ""TaskFomsInvoiceDetails"" (""TaskId"");
        CREATE INDEX IF NOT EXISTS ""IX_TaskFomsInvoiceDetails_InvoiceNumber"" ON ""TaskFomsInvoiceDetails"" (""InvoiceNumber"");

        CREATE TABLE IF NOT EXISTS ""TaskFomsCollectionDetails"" (
            ""Id"" uuid NOT NULL PRIMARY KEY,
            ""TaskId"" uuid NOT NULL REFERENCES ""Tasks"" (""Id"") ON DELETE CASCADE,
            ""InvoiceNumber"" character varying(100) NOT NULL,
            ""ClientAccountId"" character varying(100) NOT NULL,
            ""ClientName"" character varying(200) NOT NULL,
            ""AmountDue"" numeric(18,2) NOT NULL,
            ""DaysOverdue"" integer NOT NULL,
            ""AgingStatus"" character varying(50) NOT NULL,
            ""DueDate"" timestamp with time zone NULL,
            ""ClientContactPerson"" character varying(150) NULL,
            ""ClientContactNumber"" character varying(50) NULL,
            ""ClientAddress"" character varying(500) NULL,
            ""RoutedAt"" timestamp with time zone NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ""IX_TaskFomsCollectionDetails_TaskId"" ON ""TaskFomsCollectionDetails"" (""TaskId"");
        CREATE INDEX IF NOT EXISTS ""IX_TaskFomsCollectionDetails_InvoiceNumber"" ON ""TaskFomsCollectionDetails"" (""InvoiceNumber"");
        CREATE INDEX IF NOT EXISTS ""IX_TaskFomsCollectionDetails_ClientAccountId"" ON ""TaskFomsCollectionDetails"" (""ClientAccountId"");

        CREATE TABLE IF NOT EXISTS ""__EFMigrationsHistory"" (
            ""MigrationId"" character varying(150) NOT NULL PRIMARY KEY,
            ""ProductVersion"" character varying(32) NOT NULL
        );

        INSERT INTO ""__EFMigrationsHistory"" (""MigrationId"", ""ProductVersion"")
        VALUES ('20261016061728_AddTaskFomsIntegrationModels', '9.0.0')
        ON CONFLICT (""MigrationId"") DO NOTHING;

        ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""AllowedSystems"" character varying(100) NOT NULL DEFAULT 'STARS';
        ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""DmsRole"" character varying(50) NULL;
        ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""DmsAreas"" character varying(250) NULL;
        ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""FomsRole"" character varying(50) NULL;
        ALTER TABLE ""Teams"" ADD COLUMN IF NOT EXISTS ""TeamLeaderId"" uuid NULL;

        CREATE TABLE IF NOT EXISTS ""KpiConfigurations"" (
            ""Id"" uuid NOT NULL PRIMARY KEY,
            ""Title"" character varying(150) NOT NULL,
            ""Description"" character varying(500) NULL,
            ""TargetRole"" character varying(50) NULL,
            ""DepartmentId"" uuid NULL REFERENCES ""Departments"" (""Id"") ON DELETE SET NULL,
            ""EffectiveStartDate"" timestamp with time zone NOT NULL,
            ""EffectiveEndDate"" timestamp with time zone NULL,
            ""IsActive"" boolean NOT NULL DEFAULT true,
            ""OverallGreenThreshold"" double precision NOT NULL DEFAULT 85.0,
            ""OverallAmberThreshold"" double precision NOT NULL DEFAULT 70.0,
            ""OverallRedThreshold"" double precision NOT NULL DEFAULT 60.0,
            ""CreatedById"" uuid NULL REFERENCES ""Users"" (""Id"") ON DELETE SET NULL,
            ""CreatedAt"" timestamp with time zone NOT NULL,
            ""UpdatedAt"" timestamp with time zone NOT NULL
        );

        ALTER TABLE ""KpiConfigurations"" ADD COLUMN IF NOT EXISTS ""OverallGreenThreshold"" double precision NOT NULL DEFAULT 85.0;
        ALTER TABLE ""KpiConfigurations"" ADD COLUMN IF NOT EXISTS ""OverallAmberThreshold"" double precision NOT NULL DEFAULT 70.0;
        ALTER TABLE ""KpiConfigurations"" ADD COLUMN IF NOT EXISTS ""OverallRedThreshold"" double precision NOT NULL DEFAULT 60.0;

        CREATE INDEX IF NOT EXISTS ""IX_KpiConfigurations_IsActive_EffectiveStartDate_EffectiveEndDate"" ON ""KpiConfigurations"" (""IsActive"", ""EffectiveStartDate"", ""EffectiveEndDate"");
        CREATE INDEX IF NOT EXISTS ""IX_KpiConfigurations_DepartmentId"" ON ""KpiConfigurations"" (""DepartmentId"");
        CREATE INDEX IF NOT EXISTS ""IX_KpiConfigurations_TargetRole"" ON ""KpiConfigurations"" (""TargetRole"");

        CREATE TABLE IF NOT EXISTS ""KpiItems"" (
            ""Id"" uuid NOT NULL PRIMARY KEY,
            ""KpiConfigurationId"" uuid NOT NULL REFERENCES ""KpiConfigurations"" (""Id"") ON DELETE CASCADE,
            ""Name"" character varying(100) NOT NULL,
            ""MetricCode"" character varying(50) NOT NULL,
            ""Description"" character varying(500) NULL,
            ""Weight"" double precision NOT NULL,
            ""Unit"" character varying(20) NOT NULL,
            ""TargetValue"" double precision NOT NULL,
            ""GreenThreshold"" double precision NOT NULL,
            ""AmberThreshold"" double precision NOT NULL,
            ""RedThreshold"" double precision NOT NULL,
            ""IsLowerBetter"" boolean NOT NULL DEFAULT false,
            ""IsCustomFormula"" boolean NOT NULL DEFAULT false,
            ""CustomFormula"" character varying(1000) NULL,
            ""Order"" integer NOT NULL DEFAULT 1,
            ""CreatedAt"" timestamp with time zone NOT NULL,
            ""UpdatedAt"" timestamp with time zone NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ""IX_KpiItems_KpiConfigurationId"" ON ""KpiItems"" (""KpiConfigurationId"");
        CREATE INDEX IF NOT EXISTS ""IX_KpiItems_MetricCode"" ON ""KpiItems"" (""MetricCode"");

        CREATE INDEX IF NOT EXISTS ""IX_AuditLogs_TargetEntity_TargetEntityId_ActionType_Timestamp"" ON ""AuditLogs"" (""TargetEntity"", ""TargetEntityId"", ""ActionType"", ""Timestamp"");
        CREATE TABLE IF NOT EXISTS ""EvaluationTemplates"" (
            ""Id"" uuid NOT NULL PRIMARY KEY,
            ""Title"" character varying(150) NOT NULL,
            ""Description"" character varying(500) NULL,
            ""TargetRole"" character varying(50) NULL,
            ""DepartmentId"" uuid NULL REFERENCES ""Departments"" (""Id"") ON DELETE SET NULL,
            ""IsActive"" boolean NOT NULL DEFAULT true,
            ""IsAiEnabled"" boolean NOT NULL DEFAULT true,
            ""CreatedById"" uuid NULL REFERENCES ""Users"" (""Id"") ON DELETE SET NULL,
            ""CreatedAt"" timestamp with time zone NOT NULL,
            ""UpdatedAt"" timestamp with time zone NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ""IX_EvaluationTemplates_DepartmentId"" ON ""EvaluationTemplates"" (""DepartmentId"");
        CREATE INDEX IF NOT EXISTS ""IX_EvaluationTemplates_CreatedById"" ON ""EvaluationTemplates"" (""CreatedById"");
        CREATE INDEX IF NOT EXISTS ""IX_EvaluationTemplates_IsActive"" ON ""EvaluationTemplates"" (""IsActive"");
        CREATE INDEX IF NOT EXISTS ""IX_EvaluationTemplates_TargetRole"" ON ""EvaluationTemplates"" (""TargetRole"");

        CREATE TABLE IF NOT EXISTS ""EvaluationSections"" (
            ""Id"" uuid NOT NULL PRIMARY KEY,
            ""TemplateId"" uuid NOT NULL REFERENCES ""EvaluationTemplates"" (""Id"") ON DELETE CASCADE,
            ""Title"" character varying(150) NOT NULL,
            ""Description"" character varying(500) NULL,
            ""Weight"" double precision NOT NULL,
            ""Order"" integer NOT NULL DEFAULT 1,
            ""IsKpiSection"" boolean NOT NULL DEFAULT false
        );
        CREATE INDEX IF NOT EXISTS ""IX_EvaluationSections_TemplateId"" ON ""EvaluationSections"" (""TemplateId"");

        CREATE TABLE IF NOT EXISTS ""RatingBands"" (
            ""Id"" uuid NOT NULL PRIMARY KEY,
            ""TemplateId"" uuid NOT NULL REFERENCES ""EvaluationTemplates"" (""Id"") ON DELETE CASCADE,
            ""Label"" character varying(100) NOT NULL,
            ""MinScore"" double precision NOT NULL,
            ""MaxScore"" double precision NOT NULL,
            ""Color"" character varying(30) NULL,
            ""Description"" character varying(500) NULL,
            ""Order"" integer NOT NULL DEFAULT 1
        );
        CREATE INDEX IF NOT EXISTS ""IX_RatingBands_TemplateId"" ON ""RatingBands"" (""TemplateId"");

        CREATE TABLE IF NOT EXISTS ""EvaluationCriteria"" (
            ""Id"" uuid NOT NULL PRIMARY KEY,
            ""SectionId"" uuid NOT NULL REFERENCES ""EvaluationSections"" (""Id"") ON DELETE CASCADE,
            ""Title"" character varying(150) NOT NULL,
            ""Description"" character varying(500) NULL,
            ""Weight"" double precision NOT NULL,
            ""CriterionType"" integer NOT NULL DEFAULT 0,
            ""MetricCode"" character varying(50) NULL,
            ""Order"" integer NOT NULL DEFAULT 1
        );
        CREATE INDEX IF NOT EXISTS ""IX_EvaluationCriteria_SectionId"" ON ""EvaluationCriteria"" (""SectionId"");
        CREATE INDEX IF NOT EXISTS ""IX_EvaluationCriteria_MetricCode"" ON ""EvaluationCriteria"" (""MetricCode"");

        CREATE TABLE IF NOT EXISTS ""PerformanceReviews"" (
            ""Id"" uuid NOT NULL PRIMARY KEY,
            ""TemplateId"" uuid NOT NULL REFERENCES ""EvaluationTemplates"" (""Id"") ON DELETE RESTRICT,
            ""Title"" character varying(150) NOT NULL,
            ""Description"" character varying(500) NULL,
            ""Scope"" integer NOT NULL DEFAULT 0,
            ""Status"" integer NOT NULL DEFAULT 0,
            ""PeriodStart"" timestamp with time zone NOT NULL,
            ""PeriodEnd"" timestamp with time zone NOT NULL,
            ""DepartmentId"" uuid NULL REFERENCES ""Departments"" (""Id"") ON DELETE SET NULL,
            ""TeamId"" uuid NULL REFERENCES ""Teams"" (""Id"") ON DELETE SET NULL,
            ""EmployeeId"" uuid NULL REFERENCES ""Users"" (""Id"") ON DELETE SET NULL,
            ""ReviewerId"" uuid NULL REFERENCES ""Users"" (""Id"") ON DELETE SET NULL,
            ""CreatedById"" uuid NULL REFERENCES ""Users"" (""Id"") ON DELETE SET NULL,
            ""FinalizedById"" uuid NULL REFERENCES ""Users"" (""Id"") ON DELETE SET NULL,
            ""FinalizedAt"" timestamp with time zone NULL,
            ""FrozenScoresJson"" text NULL,
            ""CreatedAt"" timestamp with time zone NOT NULL,
            ""UpdatedAt"" timestamp with time zone NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ""IX_PerformanceReviews_TemplateId"" ON ""PerformanceReviews"" (""TemplateId"");
        CREATE INDEX IF NOT EXISTS ""IX_PerformanceReviews_DepartmentId"" ON ""PerformanceReviews"" (""DepartmentId"");
        CREATE INDEX IF NOT EXISTS ""IX_PerformanceReviews_TeamId"" ON ""PerformanceReviews"" (""TeamId"");
        CREATE INDEX IF NOT EXISTS ""IX_PerformanceReviews_EmployeeId"" ON ""PerformanceReviews"" (""EmployeeId"");
        CREATE INDEX IF NOT EXISTS ""IX_PerformanceReviews_ReviewerId"" ON ""PerformanceReviews"" (""ReviewerId"");
        CREATE INDEX IF NOT EXISTS ""IX_PerformanceReviews_CreatedById"" ON ""PerformanceReviews"" (""CreatedById"");
        CREATE INDEX IF NOT EXISTS ""IX_PerformanceReviews_FinalizedById"" ON ""PerformanceReviews"" (""FinalizedById"");
        CREATE INDEX IF NOT EXISTS ""IX_PerformanceReviews_Status"" ON ""PerformanceReviews"" (""Status"");
        CREATE INDEX IF NOT EXISTS ""IX_PerformanceReviews_PeriodStart_PeriodEnd"" ON ""PerformanceReviews"" (""PeriodStart"", ""PeriodEnd"");

        CREATE TABLE IF NOT EXISTS ""CriterionRatings"" (
            ""Id"" uuid NOT NULL PRIMARY KEY,
            ""ReviewId"" uuid NOT NULL REFERENCES ""PerformanceReviews"" (""Id"") ON DELETE CASCADE,
            ""EmployeeId"" uuid NOT NULL REFERENCES ""Users"" (""Id"") ON DELETE RESTRICT,
            ""CriterionId"" uuid NOT NULL REFERENCES ""EvaluationCriteria"" (""Id"") ON DELETE CASCADE,
            ""SelfScore"" double precision NULL,
            ""ManagerScore"" double precision NULL,
            ""SelfComment"" character varying(1000) NULL,
            ""ManagerComment"" character varying(1000) NULL,
            ""CreatedAt"" timestamp with time zone NOT NULL,
            ""UpdatedAt"" timestamp with time zone NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ""IX_CriterionRatings_ReviewId_EmployeeId_CriterionId"" ON ""CriterionRatings"" (""ReviewId"", ""EmployeeId"", ""CriterionId"");
        CREATE INDEX IF NOT EXISTS ""IX_CriterionRatings_EmployeeId"" ON ""CriterionRatings"" (""EmployeeId"");
        CREATE INDEX IF NOT EXISTS ""IX_CriterionRatings_CriterionId"" ON ""CriterionRatings"" (""CriterionId"");

        CREATE TABLE IF NOT EXISTS ""AiRecommendations"" (
            ""Id"" uuid NOT NULL PRIMARY KEY,
            ""ReviewId"" uuid NOT NULL REFERENCES ""PerformanceReviews"" (""Id"") ON DELETE CASCADE,
            ""EmployeeId"" uuid NOT NULL REFERENCES ""Users"" (""Id"") ON DELETE RESTRICT,
            ""Status"" integer NOT NULL DEFAULT 0,
            ""Summary"" text NULL,
            ""StrengthsJson"" text NULL,
            ""ImprovementAreasJson"" text NULL,
            ""ActionItemsJson"" text NULL,
            ""TrainingTopicsJson"" text NULL,
            ""RawResponseJson"" text NULL,
            ""ManualNotes"" character varying(2000) NULL,
            ""ReviewedById"" uuid NULL REFERENCES ""Users"" (""Id"") ON DELETE SET NULL,
            ""ReviewedAt"" timestamp with time zone NULL,
            ""CreatedAt"" timestamp with time zone NOT NULL,
            ""UpdatedAt"" timestamp with time zone NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ""IX_AiRecommendations_ReviewId_EmployeeId"" ON ""AiRecommendations"" (""ReviewId"", ""EmployeeId"");
        CREATE INDEX IF NOT EXISTS ""IX_AiRecommendations_EmployeeId"" ON ""AiRecommendations"" (""EmployeeId"");
        CREATE INDEX IF NOT EXISTS ""IX_AiRecommendations_ReviewedById"" ON ""AiRecommendations"" (""ReviewedById"");
        CREATE INDEX IF NOT EXISTS ""IX_AiRecommendations_Status"" ON ""AiRecommendations"" (""Status"");

        CREATE TABLE IF NOT EXISTS ""DevelopmentPlanItems"" (
            ""Id"" uuid NOT NULL PRIMARY KEY,
            ""ReviewId"" uuid NOT NULL REFERENCES ""PerformanceReviews"" (""Id"") ON DELETE CASCADE,
            ""EmployeeId"" uuid NOT NULL REFERENCES ""Users"" (""Id"") ON DELETE RESTRICT,
            ""Description"" character varying(500) NOT NULL,
            ""SuccessMeasure"" character varying(500) NULL,
            ""Timeframe"" character varying(100) NULL,
            ""TargetCompletionDate"" timestamp with time zone NULL,
            ""IsCompleted"" boolean NOT NULL DEFAULT false,
            ""CompletedAt"" timestamp with time zone NULL,
            ""CompletedById"" uuid NULL REFERENCES ""Users"" (""Id"") ON DELETE SET NULL,
            ""CreatedById"" uuid NULL REFERENCES ""Users"" (""Id"") ON DELETE SET NULL,
            ""ManagerNotes"" character varying(1000) NULL,
            ""EmployeeNotes"" character varying(1000) NULL,
            ""CreatedAt"" timestamp with time zone NOT NULL,
            ""UpdatedAt"" timestamp with time zone NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ""IX_DevelopmentPlanItems_ReviewId"" ON ""DevelopmentPlanItems"" (""ReviewId"");
        CREATE INDEX IF NOT EXISTS ""IX_DevelopmentPlanItems_EmployeeId"" ON ""DevelopmentPlanItems"" (""EmployeeId"");
        CREATE INDEX IF NOT EXISTS ""IX_DevelopmentPlanItems_CompletedById"" ON ""DevelopmentPlanItems"" (""CompletedById"");
        CREATE INDEX IF NOT EXISTS ""IX_DevelopmentPlanItems_CreatedById"" ON ""DevelopmentPlanItems"" (""CreatedById"");
        CREATE INDEX IF NOT EXISTS ""IX_DevelopmentPlanItems_IsCompleted"" ON ""DevelopmentPlanItems"" (""IsCompleted"");


        INSERT INTO ""__EFMigrationsHistory"" (""MigrationId"", ""ProductVersion"")
        VALUES 
            ('20261029101146_AddKpiConfigurationAndItems', '9.0.0'),
            ('20261029111153_AddOverallThresholdsToKpiConfiguration', '9.0.0'),
            ('20261030052606_AddPerformanceEvaluation', '9.0.0')
        ON CONFLICT (""MigrationId"") DO NOTHING;
    ";

    public static async Task ApplyStartupDdlAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync(StartupDdlSql);
    }

    /// <summary>
    /// Validates that a DDL script contains all required threshold columns in both
    /// CREATE TABLE and ALTER TABLE statements, as well as migration history registrations.
    /// Returns a list of validation failure descriptions, or an empty list if valid.
    /// </summary>
    public static List<string> ValidateKpiDdl(string ddlSql)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(ddlSql))
        {
            errors.Add("DDL script is empty.");
            return errors;
        }

        // Check CREATE TABLE columns
        if (!ddlSql.Contains("\"OverallGreenThreshold\" double precision NOT NULL DEFAULT 85.0", StringComparison.OrdinalIgnoreCase) &&
            !ddlSql.Contains("\"OverallGreenThreshold\"", StringComparison.OrdinalIgnoreCase))
        {
            errors.Add("Missing OverallGreenThreshold column in KpiConfigurations table definition.");
        }

        if (!ddlSql.Contains("\"OverallAmberThreshold\" double precision NOT NULL DEFAULT 70.0", StringComparison.OrdinalIgnoreCase) &&
            !ddlSql.Contains("\"OverallAmberThreshold\"", StringComparison.OrdinalIgnoreCase))
        {
            errors.Add("Missing OverallAmberThreshold column in KpiConfigurations table definition.");
        }

        if (!ddlSql.Contains("\"OverallRedThreshold\" double precision NOT NULL DEFAULT 60.0", StringComparison.OrdinalIgnoreCase) &&
            !ddlSql.Contains("\"OverallRedThreshold\"", StringComparison.OrdinalIgnoreCase))
        {
            errors.Add("Missing OverallRedThreshold column in KpiConfigurations table definition.");
        }

        // Check ALTER TABLE statements (for backwards-compatibility on existing databases)
        if (!ddlSql.Contains("ALTER TABLE \"KpiConfigurations\" ADD COLUMN IF NOT EXISTS \"OverallGreenThreshold\"", StringComparison.OrdinalIgnoreCase))
        {
            errors.Add("Missing ALTER TABLE idempotent addition for OverallGreenThreshold.");
        }

        if (!ddlSql.Contains("ALTER TABLE \"KpiConfigurations\" ADD COLUMN IF NOT EXISTS \"OverallAmberThreshold\"", StringComparison.OrdinalIgnoreCase))
        {
            errors.Add("Missing ALTER TABLE idempotent addition for OverallAmberThreshold.");
        }

        if (!ddlSql.Contains("ALTER TABLE \"KpiConfigurations\" ADD COLUMN IF NOT EXISTS \"OverallRedThreshold\"", StringComparison.OrdinalIgnoreCase))
        {
            errors.Add("Missing ALTER TABLE idempotent addition for OverallRedThreshold.");
        }

        // Check migration history entries
        if (!ddlSql.Contains("20261029101146_AddKpiConfigurationAndItems", StringComparison.OrdinalIgnoreCase))
        {
            errors.Add("Missing migration history entry for 20261029101146_AddKpiConfigurationAndItems.");
        }

        if (!ddlSql.Contains("20261029111153_AddOverallThresholdsToKpiConfiguration", StringComparison.OrdinalIgnoreCase))
        {
            errors.Add("Missing migration history entry for 20261029111153_AddOverallThresholdsToKpiConfiguration.");
        }

        return errors;
    }
}
