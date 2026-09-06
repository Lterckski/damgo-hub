import { TASK_INCLUDE } from "@/lib/tasks";
import { entityVisibilityWheres } from "./context";

type EntityWhere = { id: { in: string[] } };

export function taskIncludeWithVisibility(
  projects: EntityWhere,
  docs: EntityWhere,
) {
  return {
    ...TASK_INCLUDE,
    project: { ...TASK_INCLUDE.project, where: projects },
    relatedDocuments: {
      ...TASK_INCLUDE.relatedDocuments,
      where: { doc: docs },
    },
  };
}

/** A visible task must not disclose a restricted linked document/project. */
export async function taskInclude() {
  const visibility = await entityVisibilityWheres(["project", "document"]);
  return taskIncludeWithVisibility(visibility.project, visibility.document);
}
