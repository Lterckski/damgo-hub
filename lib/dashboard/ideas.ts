import { get } from "@vercel/blob";

import { prisma } from "@/lib/prisma";
import { isBlobConfigured } from "@/lib/dashboard/features";
import type { IdeaNode } from "@/types/roadmap";

/**
 * Top ideas by vote count, for Team Overview.
 *
 * Ideas live on a Liveblocks canvas and its autosaved Blob snapshot, not
 * in Postgres (see prisma/models/ideas-board.prisma). Votes live in
 * Postgres, because they must be durable, per-member and queryable. So a
 * ranked list needs both halves joined here — text from the snapshot,
 * counts from `IdeaVote`, matched on the canvas node id.
 *
 * A vote can outlive its note when someone deletes it from the board;
 * those are dropped on read rather than by a foreign key, since there is
 * no row to key against.
 */

const IDEAS_BOARD_ID = "ideas-board";

export interface RankedIdea {
  ideaNodeId: string;
  text: string;
  authorName: string;
  colorIndex: number;
  voteCount: number;
  /** Whether the reader has already voted — drives the toggle state. */
  votedByMe: boolean;
}

async function readSnapshotNodes(): Promise<IdeaNode[]> {
  const board = await prisma.ideasBoard.findUnique({
    where: { id: IDEAS_BOARD_ID },
    select: { snapshotPath: true },
  });
  if (!board?.snapshotPath) return [];

  try {
    const blob = await get(board.snapshotPath, { access: "private" });
    if (!blob?.stream) return [];

    const snapshot: unknown = JSON.parse(await new Response(blob.stream).text());
    return snapshot && typeof snapshot === "object" && Array.isArray((snapshot as { nodes?: unknown }).nodes)
      ? (snapshot as { nodes: IdeaNode[] }).nodes
      : [];
  } catch (error) {
    // Never take the whole panel down for a Blob failure — this sits
    // inside a Promise.all with every other Team Overview query.
    console.error("Failed to read ideas board snapshot", error);
    return [];
  }
}

export async function getRankedIdeas(memberId: string, limit = 5): Promise<RankedIdea[]> {
  if (!isBlobConfigured()) return [];

  const nodes = await readSnapshotNodes();
  const notes = nodes.filter((node) => node.data.text.trim() !== "");
  if (notes.length === 0) return [];

  const nodeIds = notes.map((note) => note.id);

  const [voteGroups, myVotes, authors] = await Promise.all([
    prisma.ideaVote.groupBy({
      by: ["ideaNodeId"],
      where: { ideaNodeId: { in: nodeIds } },
      _count: { ideaNodeId: true },
    }),
    prisma.ideaVote.findMany({
      where: { ideaNodeId: { in: nodeIds }, memberId },
      select: { ideaNodeId: true },
    }),
    prisma.member.findMany({
      where: { id: { in: [...new Set(notes.map((note) => note.data.authorId))] } },
      select: { id: true, displayName: true },
    }),
  ]);

  const countByNode = new Map(voteGroups.map((group) => [group.ideaNodeId, group._count.ideaNodeId]));
  const myVoteSet = new Set(myVotes.map((vote) => vote.ideaNodeId));
  const nameById = new Map(authors.map((author) => [author.id, author.displayName]));

  return notes
    .map((note) => ({
      ideaNodeId: note.id,
      text: note.data.text,
      authorName: nameById.get(note.data.authorId) ?? "Unknown member",
      colorIndex: note.data.colorIndex,
      voteCount: countByNode.get(note.id) ?? 0,
      votedByMe: myVoteSet.has(note.id),
    }))
    // Most-voted first; ties broken by text so the order is stable between
    // renders rather than following the snapshot's array order.
    .sort((a, b) => b.voteCount - a.voteCount || a.text.localeCompare(b.text))
    .slice(0, limit);
}
