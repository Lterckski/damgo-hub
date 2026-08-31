/**
 * Mock data for `/dashboard` (06-dashboard-home.md). Deliberately static —
 * this gets replaced with real queries in 22-dashboard-data-wiring.md once
 * every feature unit it draws from (tasks, calendar, finance, ideas,
 * members) exists. Shaped like the eventual API responses so swapping the
 * source later is a drop-in replacement, not a rewrite.
 */

export interface MockTask {
  id: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  dueDate: string | null;
  assigneeName: string;
}

export interface MockEvent {
  id: string;
  title: string;
  startsAt: string;
}

export interface MockIdea {
  id: string;
  title: string;
  authorName: string;
  createdAt: string;
}

export interface MockRoleCoverage {
  role: string;
  members: string[];
}

const TEAM = ["Dira", "Din", "Caipang", "Castro", "Restauro"];

const ALL_TASKS: MockTask[] = [
  { id: "t1", title: "Draft pitch deck outline", status: "IN_PROGRESS", dueDate: "2026-09-03", assigneeName: "Dira" },
  { id: "t2", title: "Collect teammate IDs for registration", status: "TODO", dueDate: "2026-09-02", assigneeName: "Din" },
  { id: "t3", title: "Source a hackathon to enter", status: "DONE", dueDate: "2026-08-28", assigneeName: "Caipang" },
  { id: "t4", title: "Set up shared documents folder", status: "DONE", dueDate: "2026-08-27", assigneeName: "Castro" },
  { id: "t5", title: "Build the demo prototype", status: "TODO", dueDate: "2026-09-06", assigneeName: "Restauro" },
  { id: "t6", title: "Review submission requirements", status: "IN_PROGRESS", dueDate: "2026-09-01", assigneeName: "Din" },
];

export function getMockMyTasks(memberName: string): MockTask[] {
  const mine = ALL_TASKS.filter((t) => t.assigneeName === memberName);
  return mine.length > 0 ? mine : ALL_TASKS.slice(0, 2);
}

export function getMockUpcoming(): MockEvent[] {
  return [
    { id: "e1", title: "Team sync", startsAt: "2026-09-01T18:00:00+08:00" },
    { id: "e2", title: "Pitch rehearsal", startsAt: "2026-09-04T19:00:00+08:00" },
  ];
}

export function getMockFinancialSnapshot() {
  return {
    balanceCentavos: 842500,
    monthIncomeCentavos: 250000,
    monthExpenseCentavos: 118000,
  };
}

export function getMockRecentIdeas(): MockIdea[] {
  return [
    { id: "i1", title: "Volunteer-matching feature angle", authorName: "Caipang", createdAt: "2026-08-29" },
    { id: "i2", title: "Offline-first mode for field use", authorName: "Restauro", createdAt: "2026-08-27" },
  ];
}

export function getMockTasksByMember(): { member: string; tasks: MockTask[] }[] {
  return TEAM.map((member) => ({
    member,
    tasks: ALL_TASKS.filter((t) => t.assigneeName === member),
  }));
}

export function getMockTeamTaskSummary(): { status: MockTask["status"]; label: string; count: number }[] {
  const counts: Record<MockTask["status"], number> = { TODO: 0, IN_PROGRESS: 0, DONE: 0 };
  for (const task of ALL_TASKS) counts[task.status] += 1;
  return [
    { status: "TODO", label: "Not Started", count: counts.TODO },
    { status: "IN_PROGRESS", label: "In Progress", count: counts.IN_PROGRESS },
    { status: "DONE", label: "Done", count: counts.DONE },
  ];
}

export function getMockTeamUpcoming(): MockEvent[] {
  return [
    ...getMockUpcoming(),
    { id: "e3", title: "Submission deadline", startsAt: "2026-09-07T23:59:00+08:00" },
  ];
}

export function getMockRoleCoverage(): MockRoleCoverage[] {
  return [
    { role: "Pitching", members: ["Dira", "Caipang"] },
    { role: "Documents", members: TEAM },
    { role: "Creatives", members: ["Din", "Caipang"] },
    { role: "Production", members: [] },
    { role: "Quality Assurance", members: ["Din"] },
    { role: "Marketing", members: ["Caipang"] },
    { role: "Model", members: ["Restauro"] },
  ];
}
