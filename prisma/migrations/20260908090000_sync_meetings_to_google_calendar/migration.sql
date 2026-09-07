-- Meetings sync to each participant's Google Calendar (16-meeting-scheduling.md).
-- Additive: existing TASK/CALENDAR_EVENT rows are untouched.
ALTER TYPE "SyncedEventSourceType" ADD VALUE IF NOT EXISTS 'MEETING';
