import { Badge } from "@/components/ui/badge";

export type TaskPriorityValue = "LOW" | "MEDIUM" | "HIGH";

const PRIORITY_LABEL: Record<TaskPriorityValue, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

const PRIORITY_VARIANT: Record<TaskPriorityValue, "outline" | "secondary" | "destructive"> = {
  LOW: "outline",
  MEDIUM: "secondary",
  HIGH: "destructive",
};

/** Shared priority badge for tasks — mirrors task-status-badge.tsx. */
export function TaskPriorityBadge({ priority }: { priority: TaskPriorityValue }) {
  return <Badge variant={PRIORITY_VARIANT[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
}
