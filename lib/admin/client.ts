/**
 * Browser-side calls into the admin API. One module so every console
 * action has the same error contract: the server's `error` string is what
 * the toast shows, never a generic "something went wrong" that hides which
 * guard actually refused.
 */

export interface AdminApiResult {
  ok: boolean;
  message: string;
  /** Populated by the bulk and multi-select endpoints. */
  succeeded?: number;
  failed?: { id?: string; entityId?: string; error: string | null }[];
}

async function send(input: RequestInfo, init: RequestInit): Promise<AdminApiResult> {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    return { ok: false, message: "Couldn't reach the server. Check your connection." };
  }

  const payload: unknown = await response.json().catch(() => null);
  const data = (typeof payload === "object" && payload !== null ? payload : {}) as Record<string, unknown>;

  if (!response.ok) {
    return {
      ok: false,
      message: typeof data.error === "string" ? data.error : `Request failed (${response.status})`,
    };
  }

  return {
    ok: data.ok !== false,
    message: typeof data.message === "string" ? data.message : "Done",
    succeeded: typeof data.succeeded === "number" ? data.succeeded : undefined,
    failed: Array.isArray(data.failed) ? (data.failed as AdminApiResult["failed"]) : undefined,
  };
}

export function runQueueAction(actionId: string, entityIds: string[], reason?: string) {
  return send("/api/admin/queue", {
    method: "POST",
    body: JSON.stringify({ actionId, entityIds, reason }),
  });
}

export function runInlineEdit(
  kind: string,
  recordId: string,
  field: string,
  value: unknown,
  reason?: string,
) {
  return send("/api/admin/inline", {
    method: "PATCH",
    body: JSON.stringify({ kind, recordId, field, value, reason }),
  });
}

export function runBulkAction(action: string, ids: string[], value?: unknown, reason?: string) {
  return send("/api/admin/bulk", {
    method: "POST",
    body: JSON.stringify({ action, ids, value, reason }),
  });
}

export function syncWithClerk() {
  return send("/api/admin/sync", { method: "POST" });
}

export function sendBroadcastRequest(payload: Record<string, unknown>) {
  return send("/api/admin/broadcasts", { method: "POST", body: JSON.stringify(payload) });
}

export function saveOrgSettings(payload: Record<string, unknown>) {
  return send("/api/admin/settings", { method: "PATCH", body: JSON.stringify(payload) });
}

export function mergeMemberRequest(payload: Record<string, unknown>) {
  return send("/api/admin/merge", { method: "POST", body: JSON.stringify(payload) });
}

export function runDangerAction(payload: Record<string, unknown>) {
  return send("/api/admin/danger", { method: "POST", body: JSON.stringify(payload) });
}

export function reassignTaskRequest(taskId: string, memberIds: string[], reason: string) {
  return send("/api/admin/reassign", {
    method: "POST",
    body: JSON.stringify({ taskId, memberIds, reason }),
  });
}

/**
 * CSV for the current selection. Built in the browser from rows already on
 * screen — exporting what you filtered to is the point, and a server
 * round-trip would export something subtly different.
 */
export async function downloadCsv(
  filename: string,
  headers: string[],
  rows: Iterable<(string | number | null)[]>,
): Promise<void> {
  const escape = (value: string | number | null) => {
    const text = value === null ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const yieldToBrowser = () =>
    new Promise<void>((resolve) => setTimeout(resolve, 0));
  // Return control before projecting/escaping rows so the click can paint.
  await yieldToBrowser();
  const parts: string[] = [headers.map(escape).join(",")];
  let chunk: string[] = [];
  let sliceStart = performance.now();
  for (const row of rows) {
    chunk.push("\n" + row.map(escape).join(","));
    if (chunk.length >= 256 || performance.now() - sliceStart >= 8) {
      parts.push(chunk.join(""));
      chunk = [];
      await yieldToBrowser();
      sliceStart = performance.now();
    }
  }
  if (chunk.length) parts.push(chunk.join(""));
  const url = URL.createObjectURL(
    new Blob(parts, { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  try {
    link.click();
  } finally {
    // Let the browser consume the object URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
