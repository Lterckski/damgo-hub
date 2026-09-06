export interface HubResult {
  id: string;
  title: string;
  body: string | null;
  entityType: string;
  status: string;
  url: string;
}
export async function hubPost(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch("/api/hub", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || data.error)
    throw new Error(data.error ?? "Something went wrong");
  window.dispatchEvent(new Event("hub:refresh"));
  return data;
}
export async function hubGet<T>(
  params: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/hub?${params}`, {
    signal,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok || data.error)
    throw new Error(data.error ?? "Unable to load");
  return data as T;
}
