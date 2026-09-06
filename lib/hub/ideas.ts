import { mutateFlow } from "@liveblocks/react-flow/node";
import { liveblocksClient } from "@/lib/liveblocks";
import { prisma } from "@/lib/prisma";
import { createIdeaNode, type IdeaNode } from "@/types/roadmap";
import type { Viewer } from "./visibility";

/** Read the current collaborative state, not an untrusted or stale client
 * snapshot. The same read transaction captures quick-created notes. */
export async function syncIdeas(
  viewer: Pick<Viewer, "orgId">,
  create?: { id: string; text: string; memberId: string },
) {
  // Serialize projections so an older snapshot cannot overwrite a newer one.
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('hub:ideas',0))`;
      let nodes: readonly IdeaNode[] = [];
      await mutateFlow<IdeaNode>(
        { client: liveblocksClient, roomId: "ideas" },
        (flow) => {
          if (create && !flow.getNode(create.id)) {
            const node = createIdeaNode(
              create.id,
              {
                x: (flow.nodes.length % 4) * 260,
                y: Math.floor(flow.nodes.length / 4) * 220,
              },
              create.memberId,
              flow.nodes.length % 8,
            );
            node.data.text = create.text;
            flow.addNode(node);
          }
          nodes = flow.nodes;
        },
      );
      const ids: string[] = [];
      for (const node of nodes) {
        if (
          node.type !== "ideaNode" ||
          typeof node.data.text !== "string" ||
          !node.data.text.trim()
        )
          continue;
        const id = `idea:${node.id}`;
        ids.push(id);
        const title = node.data.text.trim().slice(0, 100);
        const old = await tx.hubRecord.findUnique({ where: { id } });
        if (old?.body === node.data.text) continue;
        await tx.hubRecord.upsert({
          where: { id },
          create: {
            id,
            orgId: viewer.orgId,
            entityId: node.id,
            entityType: "idea",
            title,
            body: node.data.text,
            ownerId: node.data.authorId,
            status: "Idea",
            sourceCreatedAt: create?.id === node.id ? new Date() : null,
            grants: {
              create: {
                id: `${id}:org`,
                visibilityScope: "org",
                recipientId: "",
              },
            },
          },
          update: { title, body: node.data.text, updatedAt: new Date() },
        });
      }
      await tx.hubRecord.deleteMany({
        where: { orgId: viewer.orgId, entityType: "idea", id: { notIn: ids } },
      });
    },
    { timeout: 20000 },
  );
}
