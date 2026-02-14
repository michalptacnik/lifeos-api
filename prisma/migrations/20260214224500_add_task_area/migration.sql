-- Add explicit task area with backward-compatible data migration from legacy project encoding.
CREATE TYPE "TaskArea" AS ENUM ('HOME', 'BUDGET', 'WORK');

ALTER TABLE "Task"
ADD COLUMN "area" "TaskArea" NOT NULL DEFAULT 'WORK';

UPDATE "Task"
SET
  "area" = CASE
    WHEN "project" LIKE 'HOME::%' THEN 'HOME'::"TaskArea"
    WHEN "project" LIKE 'BUDGET::%' THEN 'BUDGET'::"TaskArea"
    WHEN "project" LIKE 'WORK::%' THEN 'WORK'::"TaskArea"
    ELSE "area"
  END,
  "project" = CASE
    WHEN "project" LIKE 'HOME::%' THEN NULLIF(SUBSTRING("project" FROM 7), '')
    WHEN "project" LIKE 'BUDGET::%' THEN NULLIF(SUBSTRING("project" FROM 9), '')
    WHEN "project" LIKE 'WORK::%' THEN NULLIF(SUBSTRING("project" FROM 7), '')
    ELSE "project"
  END;
