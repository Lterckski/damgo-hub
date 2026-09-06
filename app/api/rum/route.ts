import { requireWorkspaceSession, HubAccessError } from "@/lib/hub/context";
import { parseRumBatch } from "@/lib/rum/validate";
import { storeRumBatch } from "@/lib/rum/store";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (process.env.RUM_ENABLED !== "true")
    return new Response(null, { status: 204 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return new Response(null, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return new Response(null, { status: 415 });
  try {
    const { orgId } = await requireWorkspaceSession();
    // Bound streamed bytes too: Content-Length alone is not a reliable limit.
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, { status: 400 });
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 30000) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(value);
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return new Response(null, { status: 400 });
    }
    const samples = parseRumBatch(body);
    if (!samples) return new Response(null, { status: 400 });
    const release = (body as { release?: unknown }).release;
    if (typeof release !== "string" || !/^[a-zA-Z0-9._-]{1,100}$/.test(release))
      return new Response(null, { status: 400 });
    await storeRumBatch(orgId, samples, release);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof HubAccessError)
      return new Response(null, { status: error.status });
    // Never include client payloads or targets in application logs.
    console.error("RUM ingestion failed");
    return new Response(null, { status: 503 });
  }
}
