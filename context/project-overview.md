# Damgo Hub

## Overview

Damgo Hub is a collaborative platform for a hackathon group / organization. It brings project proposals, task assignment, organizational finances, documentation, meetings, penalties, and member management into one shared workspace, with real-time collaborative boards for project roadmaps, meeting agendas, and open idea sharing.

## Goals

1. Let members sign in and manage their identity and role within the organization.
2. Let members track organizational finances — income, expenses, and reimbursements — through a financial tracker.
3. Let members create and assign tasks, and track their status.
4. Let members author and browse shared organizational documentation.
5. Let members submit project proposals, assign collaborators, and plan milestones on a shared roadmap.
6. Let members view a shared calendar of events, meetings, and deadlines.
7. Let members schedule meetings, propose agenda items ahead of time, collaborate live on the agenda and notes, and capture notable quotes.
8. Let admins track penalties issued to members.
9. Let admins manage the member roster and roles.
10. Provide an admin-only area for oversight of members, finances, penalties, and project proposals.
11. Let any member post and browse ideas on an open, shared board.

## Core User Flow

1. Member signs in.
2. Member lands on a dashboard summarizing their tasks, upcoming calendar events, and recent activity.
3. Member submits a project proposal, or browses existing ones.
4. The project owner assigns collaborators and lays out milestones on the project's collaborative roadmap.
5. Tasks are created and assigned to members, optionally linked to a project milestone.
6. Members log financial transactions (dues, expenses, reimbursements) for the organization.
7. Members check the shared calendar for upcoming meetings, milestones, and deadlines.
8. Ahead of a meeting, members submit agenda proposals; the meeting organizer curates them into the final agenda.
9. During the meeting, participants collaborate live on the agenda and notes, and log notable quotes.
10. Admins track penalties issued to members and monitor resolution.
11. Admins manage the member roster, roles, and organization-wide oversight from the Admin Side.
12. Any member can post or browse ideas on the open Ideas board at any time.

## Features

### Financial Tracker

- Expense logging (amount, category, date, receipt upload)
- Budget allocation per project/event
- Income/contribution tracking (dues, sponsorships, prize money)
- Balance summary dashboard
- Expense approval workflow
- Exportable financial report (CSV/PDF)
- Category-based expense breakdown

### Task Assignment

- Task creation (title, description, deadline, priority)
- Assignee selection (single/multiple)
- Status tracking (To Do / In Progress / Review / Done)
- Subtasks/checklist
- Due date reminders
- Task comments/discussion thread
- Task dependencies
- Kanban board / list view toggle
- Triggers a notification to the assigned member on assignment (see Notifications / Announcements Hub)

### Documentation

- File upload/storage
- Version history
- Folder/category organization
- Shared editable docs
- Search functionality
- Access permissions (view/edit)
- Tagging system

### Project Tab / Proposal

- Project overview (title, description, objectives, timeline)
- Proposal submission with status (Pending/Approved/Rejected)
- **Member Assignment for Projects**
  - Role assignment (Lead, Developer, Designer, Documentation, etc.)
  - Workload view per member
- **Milestone**
  - Milestone creation with target dates
  - Progress percentage
  - Milestone-linked tasks
  - Completion notifications

### Calendar

- Event creation (deadlines, meetings, milestones)
- Day/week/month views
- Sync with tasks and meetings
- Color-coded by category/project
- Reminders/notifications
- Shared vs. personal calendar

### Meetings

- Meeting scheduler (date, time, location/link)
- Agenda attachment
- Attendance tracker
- Meeting minutes/notes
- **Quote**
  - Random/curated quote per meeting
  - Member-submitted quotes
- Recording/link attachment

### Penalty Tracker

- Penalty rules/criteria setup
- Point/monetary penalty logging
- Penalty history log
- Dispute/appeal option
- Auto-flagging (attendance/lateness)
- Summary report per member

### Member Tracker

- Member profile (role, contact, skills)
- Attendance history
- Task completion rate
- Contribution score/activity log
- Active/inactive status

### Admin Side

- User management (add/remove/edit, assign roles)
- Permission/access control settings
- Approval center (proposals, expenses, penalties)
- System-wide announcements
- Activity logs/audit trail
- Data backup/export

### Agenda Proposal

- Agenda item submission form
- Voting/upvoting on items
- Status tracking (Proposed/Approved/Discussed)
- Link agenda items to meetings

### Ideas (Open to All)

- Idea submission board
- Upvote/comment on ideas
- Tagging by category/project
- Status tracking (New/Under Review/Implemented/Rejected)
- Convert idea into Project Proposal or Task

### Notifications / Announcements Hub

- Real-time notification when a task is assigned to a member
- Notification triggers for: task status change, upcoming deadlines, meeting reminders, milestone completion, proposal/expense approval or rejection
- Centralized notification center/inbox (read/unread state)
- System-wide announcements from Admin
- Optional: email or push notification integration

### Dashboard / Home Overview

- Snapshot of tasks due (assigned to current user + team-wide)
- Upcoming meetings and calendar events
- Budget/financial status summary
- Recent activity feed preview
- Quick links to pending approvals (for admins)
- Project/milestone progress overview

### Role-Based Access Control (RBAC)

- Implemented via Clerk B2B (Organizations) — no custom-built permission system
- Two org-level roles: `org:admin` (Leader + Assistant Leader only) and `org:member` (everyone else); see `context/team-roster.md` for who currently holds each
- Only the Leader can appoint or replace the Assistant Leader — no one can self-select Admin, and the Assistant Leader cannot grant Admin to a third person
- Feature-level access control based on role — only Admin (Leader/Assistant Leader) can approve expenses or proposals, or assign functional/work-distribution role tags to members
- Per-project role assignment (owner/collaborator) tied to Clerk org membership
- Invite/remove members via Clerk B2B organization invitations

### Analytics / Reports

- Meetings conducted (count, attendance rate over time)
- Tasks finished vs. pending (per member, per project, team-wide)
- Financial trends (spending over time, budget vs actual)
- Penalty trends per member
- Member contribution/activity comparison
- Exportable reports (CSV/PDF)
- Filterable by date range/project

### Global Search

- Single search bar accessible from anywhere in the app
- Searches across: tasks, documentation, members, meetings, projects, ideas, agenda items
- Filter results by category/type
- Quick-jump to result

### Activity Feed

- Chronological, team-wide log of actions (task created/completed, proposal submitted, expense logged, member joined, etc.)
- Filterable by project, member, or activity type
- Real-time or near-real-time updates
- Links directly to the relevant item (task, doc, proposal, etc.)

## Scope

### In Scope

- Authentication, roles, and route protection
- Member roster and role management (Member Tracker)
- Financial tracking: transactions, receipts, budget summaries
- Task creation, assignment, and status tracking
- Shared documentation with file attachments
- Project proposals, collaborator assignment, and milestone roadmaps
- Shared organization calendar
- Meeting scheduling, agenda proposals, live agenda/notes collaboration, and quote capture
- Penalty tracking and resolution status
- Admin-only oversight area
- Open, organization-wide ideas board

### Out of Scope

- Billing and subscription systems
- Multi-organization / multi-tenant support (single organization only)
- Mobile-native applications
- AI-generated content of any kind
- Versioned history for documentation or board content

## Success Criteria

1. A signed-in member can submit a project proposal, assign collaborators, and plan milestones on a shared roadmap.
2. Tasks can be created, assigned, and tracked to completion.
3. Financial transactions can be logged, attached with receipts, and reviewed by an admin.
4. The shared calendar reflects meetings, milestones, and task deadlines.
5. Members can propose agenda items and collaborate live on a meeting's agenda and notes, with quotes captured.
6. Admins can track penalties issued to members and manage the member roster from the Admin Side.
7. Any member can post and browse ideas on the open, real-time Ideas board.
