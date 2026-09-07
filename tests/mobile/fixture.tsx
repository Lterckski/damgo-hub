"use client";
import { useState } from "react";
import { NotificationPreferences } from "@/components/chrome/notification-preferences";
import { FinanceTransactionsTable } from "@/components/finance/finance-transactions-table";
import { MemberDirectoryTable } from "@/components/members/member-directory-table";
import { PenaltiesView } from "@/components/penalties/penalties-view";
import { AppShell } from "@/components/chrome/app-shell";
import { AppHeader } from "@/components/chrome/app-header";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";
import { MeetingFormDialog } from "@/components/meetings/meeting-form-dialog";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { CalendarView } from "@/components/calendar/calendar-view";
import { RoadmapConnections } from "@/components/roadmap/roadmap-connections";
import { IdeaNode } from "@/components/ideas/idea-node";
import { MilestoneNode } from "@/components/roadmap/milestone-node";
import { MilestoneEditDialog } from "@/components/roadmap/milestone-edit-dialog";
import { RoadmapActionsProvider } from "@/components/roadmap/roadmap-actions-context";
import { IdeaActionsProvider } from "@/components/ideas/idea-actions-context";
import { BoardMembersProvider } from "@/components/board/board-member-context";
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
} from "@xyflow/react";
import {
  type MilestoneNode as MilestoneNodeType,
  createMilestoneNode,
  createIdeaNode,
} from "@/types/roadmap";
import { Button } from "@/components/ui/button";
import "@xyflow/react/dist/style.css";
const members = [
  { id: "a", displayName: "Alex with a long display name", avatarUrl: null },
  { id: "b", displayName: "Bea", avatarUrl: null },
];
const nodesInitial = [
  {
    ...createMilestoneNode("first", { x: 0, y: 0 }),
    data: {
      title: "Design prototype",
      status: "NOT_STARTED" as const,
      dueDate: null,
      assigneeIds: [],
    },
  },
  {
    ...createMilestoneNode("second", { x: 280, y: 0 }),
    data: {
      title: "Build prototype",
      status: "NOT_STARTED" as const,
      dueDate: null,
      assigneeIds: [],
    },
  },
];
const nodeTypes = { milestoneNode: MilestoneNode, ideaNode: IdeaNode };
export function MobileLayoutFixture() {
  const [preferences, setPreferences] = useState(false);
  const [section, setSection] = useState("forms");
  const [nodes, onNodes, onNodesChange] =
    useNodesState<MilestoneNodeType>(nodesInitial);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [idea, setIdea] = useState({
    ...createIdeaNode("idea", { x: 0, y: 0 }, "a", 1),
    data: { text: "A collaborative idea", authorId: "a", colorIndex: 1 },
  });
  return (
    <AppShell
      isAdmin
      header={
        <AppHeader
          isAdmin
          isRealAdmin
          isViewingAsMember={false}
          memberName="Alex"
        />
      }
    >
      <div className="space-y-5 p-3 sm:p-6">
        <h1 className="font-display text-3xl">Mobile layout check</h1>
        <div className="flex flex-wrap gap-2">
          {["forms", "calendar", "board", "tables"].map((s) => (
            <Button key={s} onClick={() => setSection(s)}>
              {s}
            </Button>
          ))}
        </div>
        {preferences && (
          <NotificationPreferences onClose={() => setPreferences(false)} />
        )}
        {section === "forms" && (
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setPreferences(true)}>
              Preferences check
            </Button>
            <NewTaskDialog
              members={members}
              projects={[
                {
                  id: "project",
                  name: "A project with a long descriptive name",
                },
              ]}
              docs={[]}
              currentMemberId="a"
              isAdmin
            />
            <MeetingFormDialog members={members} currentMemberId="a" />
            <NewProjectDialog members={members} currentMemberId="a" />
          </div>
        )}
        {section === "tables" && (
          <div className="space-y-6">
            <FinanceTransactionsTable
              isAdmin
              transactions={[
                {
                  id: "transaction",
                  memberName: members[0].displayName,
                  type: "EXPENSE",
                  category: "Reimbursement",
                  amountCentavos: 123450,
                  description:
                    "A long reimbursement description that must stay readable",
                  status: "PENDING",
                  hasReceipt: true,
                  createdAt: "2026-09-06T00:00:00Z",
                },
              ]}
            />
            <MemberDirectoryTable
              members={members.map((member) => ({
                ...member,
                email: "fixture@example.test",
                status: "ACTIVE",
                isLeader: false,
                orgRole: "org:member",
                functionalRoles: ["QUALITY_ASSURANCE"],
                workDistributionRoles: [],
                createdAt: "2026-09-06T00:00:00Z",
              }))}
              isAdmin
              isLeader
              currentMemberId="a"
            />
            <PenaltiesView
              isAdmin
              members={members}
              penaltyRules={[
                { label: "Late to a meeting", amountCents: 5000 },
                { label: "Missed a deadline", amountCents: 10000 },
              ]}
              penalties={[
                {
                  id: "penalty",
                  memberId: "b",
                  memberName: "Bea",
                  issuedById: "a",
                  issuedByName: "Alex",
                  reason: "Example penalty with a detailed reason",
                  amountCentavos: 50000,
                  status: "OPEN",
                  resolvedAt: null,
                  transactionId: null,
                  createdAt: "2026-09-06T00:00:00Z",
                },
              ]}
            />
          </div>
        )}
        {section === "calendar" && (
          <CalendarView
            items={[]}
            events={[]}
            tasks={[]}
            members={members}
            projects={[]}
            docs={[]}
            currentMemberId="a"
            isAdmin
          />
        )}
        {section === "board" && (
          <BoardMembersProvider members={members}>
            <RoadmapActionsProvider value={setEditing}>
              <RoadmapConnections
                nodes={nodes}
                edges={edges}
                onConnect={(c) => setEdges((es) => addEdge(c, es))}
                onRemove={(id) => onEdgesChange([{ type: "remove", id }])}
              />
              <ReactFlowProvider>
                <div className="board-canvas mt-3">
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    nodeTypes={nodeTypes}
                    fitView
                  />
                </div>
                <MilestoneEditDialog
                  node={nodes.find((n) => n.id === editing) ?? null}
                  onOpenChange={(open) => !open && setEditing(null)}
                  collaborators={members}
                  onNodesChange={onNodesChange}
                  onDelete={({ nodes: removed }) =>
                    onNodes((ns) =>
                      ns.filter((n) => !removed.some((r) => r.id === n.id)),
                    )
                  }
                />
              </ReactFlowProvider>
            </RoadmapActionsProvider>
            <IdeaActionsProvider
              commitText={(_id, text) =>
                setIdea((n) => ({ ...n, data: { ...n.data, text } }))
              }
              deleteIdea={() => {}}
              autoEditNodeId={null}
              clearAutoEdit={() => {}}
            >
              <ReactFlowProvider>
                <div className="h-64">
                  <ReactFlow nodes={[idea]} nodeTypes={nodeTypes} fitView />
                </div>
              </ReactFlowProvider>
            </IdeaActionsProvider>
          </BoardMembersProvider>
        )}
      </div>
    </AppShell>
  );
}
