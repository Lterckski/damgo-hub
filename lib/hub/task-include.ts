import { TASK_INCLUDE } from "@/lib/tasks";
import { entityVisibilityWhere } from "./context";
/** A visible task must not disclose a restricted linked document/project. */
export async function taskInclude() {
  const [projects, docs] = await Promise.all([
    entityVisibilityWhere("project"),
    entityVisibilityWhere("document"),
  ]);
  return {
    ...TASK_INCLUDE,
    project: { ...TASK_INCLUDE.project, where: projects },
    relatedDocuments: {
      ...TASK_INCLUDE.relatedDocuments,
      where: { doc: docs },
    },
  };
}
