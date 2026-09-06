/** Shared authorization contract. Roles never bypass a personal grant. */
export interface Viewer {
  orgId: string;
  memberId: string;
  role: string;
  projectIds: string[];
}
export interface Grant {
  visibilityScope: string;
  recipientId: string;
}
export function audienceGrants(viewer: Viewer): Grant[] {
  return [
    { visibilityScope: "org", recipientId: "" },
    { visibilityScope: "user", recipientId: viewer.memberId },
    { visibilityScope: "role", recipientId: viewer.role },
    ...viewer.projectIds.map((recipientId) => ({
      visibilityScope: "project",
      recipientId,
    })),
  ];
}
export function canSee(
  viewer: Viewer,
  orgId: string,
  grants: Grant[],
): boolean {
  return (
    orgId === viewer.orgId &&
    grants.some((grant) =>
      audienceGrants(viewer).some(
        (allowed) =>
          allowed.visibilityScope === grant.visibilityScope &&
          allowed.recipientId === grant.recipientId,
      ),
    )
  );
}
export function recordWhere(viewer: Viewer) {
  return {
    orgId: viewer.orgId,
    grants: { some: { OR: audienceGrants(viewer) } },
  };
}
export const NOTIFICATION_TYPES = [
  "task",
  "penalty",
  "transaction",
  "meeting",
  "mention",
  "comment",
  "announcement",
  "project",
  "broadcast",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export const ENTITY_TYPES = [
  "task",
  "penalty",
  "transaction",
  "project",
  "meeting",
  "document",
  "idea",
  "member",
  "announcement",
] as const;
export function recordUrl(id: string) {
  return `/records/${encodeURIComponent(id)}`;
}
