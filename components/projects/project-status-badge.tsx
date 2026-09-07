import { Badge } from "@/components/ui/badge";
import { projectStatusLabel } from "@/lib/projects";

const STATUS_VARIANT: Record<string, "outline" | "secondary" | "default" | "destructive"> = {
  PROPOSED: "outline",
  ACTIVE: "default",
  COMPLETED: "secondary",
  ARCHIVED: "destructive",
  REJECTED: "destructive",
};

/** Shared status badge for projects — same pattern as TaskStatusBadge. */
export function ProjectStatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{projectStatusLabel(status)}</Badge>;
}
