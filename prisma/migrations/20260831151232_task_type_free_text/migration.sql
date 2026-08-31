-- Task.type moves from the FunctionalRole enum to free text, so a custom
-- task type is possible (not just the 7 preset values) — see task.prisma.
-- Existing values cast cleanly 1:1 since every FunctionalRole member name
-- already *is* the exact string the app used as that enum value.
ALTER TABLE "Task" ALTER COLUMN "type" TYPE TEXT USING "type"::TEXT;
