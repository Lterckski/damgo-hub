export type CreateKind =
  | "task"
  | "expense"
  | "idea"
  | "meeting"
  | "doc"
  | "announcement";

export const createLabels: Record<CreateKind, string> = {
  task: "New task",
  expense: "Log expense",
  idea: "New idea",
  meeting: "New meeting",
  doc: "New doc",
  announcement: "Post announcement",
};
