# Team Roster

Reference data for seeding and implementing the RBAC and Member Tracker features (`context/architecture-context.md`'s Auth and Roles Model, `04-core-schema.md`, `05-member-directory.md`). This is the current real membership of the organization, not example data — implement against it.

Most members hold more than one role tag at once. See `architecture-context.md` for how each concept below maps to Clerk vs. Prisma.

## Leadership (Clerk `org:admin`)

| Seat | Member | Notes |
| ----- | ------ | ----- |
| Leader | Dira | `Member.isLeader = true`. Fixed — not reassignable through the app UI. |
| Assistant Leader | Din | Appointed by the Leader via the "Assign Assistant Leader" action. Holds `org:admin` the same as the Leader, but cannot reassign the seat itself. |

Everyone not listed above holds the default `org:member` Clerk role.

## Member Roles (functional tags — `MemberFunctionalRole`)

| Role | Members |
| ----- | ------- |
| Pitching | Dira, Caipang |
| Documents | All members |
| Creatives | Din, Caipang |
| Production | *(optional — no one currently assigned)* |
| Quality Assurance | Din |
| Marketing | Caipang |
| Model | Restauro |

## Work Distribution (`MemberWorkDistributionRole`)

Only **Hackathon Hunter** and **Project Scavengers / Creators** are freely assignable tags here — see below for why Leader/Assistant Leader aren't duplicated as tags.

| Role | Members |
| ----- | ------- |
| Hackathon Hunter | Caipang |
| Leader / Secretariat / Finance | Dira |
| Assistant Leader | Din |
| Project Scavengers / Creators | Caipang *(optional)*, Din, Castro, Restauro |

"Leader / Secretariat / Finance" and "Assistant Leader" are **not** stored as `MemberWorkDistributionRole` rows — they're display labels derived from the Leadership table above (`Member.isLeader` and the Clerk `org:admin` seat), so there's exactly one place that fact lives. The Member Tracker UI should render them as read-only labels next to whoever holds those seats, not as tags an admin can add or remove independently.

## Full Roster By Person

- **Dira** — Leader (`org:admin`, `isLeader`); Pitching, Documents; Leader/Secretariat/Finance (derived)
- **Din** — Assistant Leader (`org:admin`); Creatives, Documents, Quality Assurance; Assistant Leader (derived), Project Scavengers/Creators
- **Caipang** — Documents, Pitching, Creatives, Marketing; Hackathon Hunter, Project Scavengers/Creators (optional)
- **Castro** — Documents; Project Scavengers/Creators
- **Restauro** — Documents, Model; Project Scavengers/Creators

## Onboarding Note

Clerk Organizations setup (`03-auth.md`) hasn't been implemented yet, so none of this is live in Clerk or the database. When it is: create the single org, invite these five people, grant `org:admin` to Dira and Din (Dira also gets `isLeader = true` set directly in the database — not through any UI), and apply the functional/work-distribution tags above once each person's `Member` record exists.
