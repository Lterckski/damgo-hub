import { Badge } from "@/components/ui/badge";

export type TaskStatusValue = "TODO" | "IN_PROGRESS" | "DONE";

const STATUS_LABEL: Record<TaskStatusValue, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};

const STATUS_VARIANT: Record<TaskStatusValue, "outline" | "secondary" | "default"> = {
  TODO: "outline",
  IN_PROGRESS: "secondary",
  DONE: "default",
};

/** Shared status badge for tasks — used by the real task board (08) and the mock dashboard widgets (06). */
export function TaskStatusBadge({ status }: { status: TaskStatusValue }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
