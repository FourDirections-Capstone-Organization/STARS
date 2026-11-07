-- ==============================================================================
-- STARS Task Priority Audit & Data Remediation Script
-- Purpose:
--   1. Audit historical task updates in AuditLogs to identify any tasks whose
--      priority was inadvertently overwritten to Medium (PriorityLevel = 1)
--      when a coordinator reopened and saved the Edit Task / Assignment modal.
--   2. Provide an optional, idempotent UPDATE statement to restore the original
--      priority (Low = 0, High = 2, Urgent = 3) recorded in OldValues.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- STEP 1: READ-ONLY AUDIT QUERY
-- Inspect all tasks affected by the legacy Edit Modal priority overwrite.
-- ------------------------------------------------------------------------------
SELECT 
    t."Id" AS task_id,
    t."Title" AS task_title,
    t."PriorityLevel" AS current_db_priority,
    al."CreatedAt" AS modified_at,
    al."OldValues" AS old_values_json,
    al."NewValues" AS new_values_json,
    al."UserId" AS modified_by_user_id
FROM "Tasks" t
JOIN "AuditLogs" al 
    ON al."EntityId" = t."Id"::text 
   AND al."EntityName" = 'Task'
WHERE al."Action" = 'Update'
  AND al."NewValues" ILIKE '%"Priority":"Medium"%'
  AND al."OldValues" ILIKE '%"Priority":%'
  AND NOT al."OldValues" ILIKE '%"Priority":"Medium"%'
ORDER BY al."CreatedAt" DESC;

-- ------------------------------------------------------------------------------
-- STEP 2: SUMMARY COUNT
-- Total count of tasks whose stored priority was changed to Medium from another priority.
-- ------------------------------------------------------------------------------
SELECT 
    COUNT(DISTINCT t."Id") AS affected_task_count
FROM "Tasks" t
JOIN "AuditLogs" al 
    ON al."EntityId" = t."Id"::text 
   AND al."EntityName" = 'Task'
WHERE al."Action" = 'Update'
  AND al."NewValues" ILIKE '%"Priority":"Medium"%'
  AND al."OldValues" ILIKE '%"Priority":%'
  AND NOT al."OldValues" ILIKE '%"Priority":"Medium"%';

-- ------------------------------------------------------------------------------
-- STEP 3: OPTIONAL REMEDIATION SCRIPT
-- UNCOMMENT ONLY AFTER REVIEWING STEP 1 AUDIT RESULTS AND CONFIRMING RESTORATION.
-- ------------------------------------------------------------------------------
/*
BEGIN;

UPDATE "Tasks" t
SET "PriorityLevel" = CASE 
    WHEN al."OldValues" ILIKE '%"Priority":"Low"%' THEN 0
    WHEN al."OldValues" ILIKE '%"Priority":"High"%' THEN 2
    WHEN al."OldValues" ILIKE '%"Priority":"Urgent"%' THEN 3
    ELSE t."PriorityLevel"
END
FROM "AuditLogs" al
WHERE al."EntityId" = t."Id"::text 
  AND al."EntityName" = 'Task'
  AND al."Action" = 'Update'
  AND al."NewValues" ILIKE '%"Priority":"Medium"%'
  AND NOT al."OldValues" ILIKE '%"Priority":"Medium"%';

COMMIT;
*/
