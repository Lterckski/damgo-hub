"use client";
import { useSearchParams } from "next/navigation";

import { memo, useMemo, useState } from "react";
import { format } from "date-fns";
import { FolderKanban } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TaskStatusBadge,
  type TaskStatusValue,
} from "@/components/tasks/task-status-badge";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog";
import { cn } from "@/lib/utils";
import {
  taskTypeLabel,
  type SerializedTask,
  type TaskDocOption,
  type TaskMemberOption,
  type TaskProjectOption,
} from "@/lib/tasks";

interface TaskBoardProps {
  tasks: SerializedTask[];
  members: TaskMemberOption[];
  projects: TaskProjectOption[];
  docs: TaskDocOption[];
  currentMemberId: string;
  isAdmin: boolean;
}

const COLUMNS: { status: TaskStatusValue; label: string }[] = [
  { status: "TODO", label: "To Do" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "DONE", label: "Done" },
];

function groupByStatus(tasks: SerializedTask[]) {
  const groups: Record<TaskStatusValue, SerializedTask[]> = {
    TODO: [],
    IN_PROGRESS: [],
    DONE: [],
  };
  for (const task of tasks) {
    groups[task.status as TaskStatusValue].push(task);
  }
  return groups;
}

function AssigneeStack({
  assignees,
}: {
  assignees: SerializedTask["assignees"];
}) {
  if (assignees.length === 0) {
    return <span className="text-xs text-copy-faint">Unassigned</span>;
  }
  return (
    <div className="flex -space-x-2">
      {assignees.map((assignee) => (
        <Avatar key={assignee.id} className="h-6 w-6 border-2 border-surface">
          <AvatarImage src={assignee.avatarUrl ?? undefined} />
          <AvatarFallback className="text-[10px]">
            {assignee.displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      ))}
    </div>
  );
}

interface TaskCardProps {
  task: SerializedTask;
  onOpen: () => void;
}

const STATUS_ACCENT: Record<TaskStatusValue, string> = {
  TODO: "bg-copy-faint",
  IN_PROGRESS: "bg-brand",
  DONE: "bg-success",
};

function TaskCard({ task, onOpen }: TaskCardProps) {
  const status = task.status as TaskStatusValue;
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="group/task cursor-pointer overflow-hidden border-none py-0 shadow-sm ring-1 ring-surface-border transition-all hover:shadow-md hover:ring-brand/40"
    >
      <div className="flex">
        <div className={cn("w-1 shrink-0", STATUS_ACCENT[status])} />
        <div className="flex-1">
          <CardHeader className="px-4 pt-3 pb-1">
            <CardTitle className="text-sm font-semibold text-copy-primary">
              {task.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-2 px-4 pb-3">
            <div>
              <p className="text-xs font-medium text-copy-secondary">
                Due {format(new Date(task.dueDate), "MMM d, h:mm a")}
              </p>
              <span className="mt-1 inline-block rounded-full bg-subtle px-1.5 py-0.5 text-[11px] font-semibold text-copy-secondary">
                {taskTypeLabel(task.type)}
              </span>
              {task.projectName && (
                <span className="mt-1 ml-1 inline-flex items-center gap-1 rounded-full bg-accent-dim px-1.5 py-0.5 text-[11px] font-semibold text-brand">
                  <FolderKanban className="h-2.5 w-2.5" />
                  {task.projectName}
                </span>
              )}
              <div className="mt-1">
                <AssigneeStack assignees={task.assignees} />
              </div>
            </div>
            <TaskStatusBadge status={status} />
          </CardContent>
        </div>
      </div>
    </Card>
  );
}

interface TaskColumnsProps {
  tasks: SerializedTask[];
  onOpenTask: (task: SerializedTask) => void;
}

const TaskColumns = memo(function TaskColumns({ tasks, onOpenTask }: TaskColumnsProps) {
  const groups = groupByStatus(tasks);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {COLUMNS.map((column) => (
        <div key={column.status} className="space-y-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                STATUS_ACCENT[column.status],
              )}
            />
            <p className="text-xs font-bold tracking-[0.06em] text-copy-primary uppercase">
              {column.label}
            </p>
            <span className="rounded-full bg-subtle px-1.5 py-0.5 text-xs font-semibold text-copy-secondary">
              {groups[column.status].length}
            </span>
          </div>
          <div className="space-y-3">
            {groups[column.status].length === 0 ? (
              <p className="text-xs text-copy-secondary">No tasks here.</p>
            ) : (
              groups[column.status].map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onOpen={() => onOpenTask(task)}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
});

export function TaskBoard({
  tasks,
  members,
  projects,
  docs,
  currentMemberId,
  isAdmin,
}: TaskBoardProps) {
  const params = useSearchParams();
  const [selectedTask, setSelectedTask] = useState<SerializedTask | null>(
    () => tasks.find((task) => task.id === params.get("task")) ?? null,
  );

  const myTasks = useMemo(() => tasks.filter((t) =>
    t.assignees.some((a) => a.id === currentMemberId),
  ), [tasks, currentMemberId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Tabs defaultValue="mine" className="w-full">
          <TabsList className="h-10 gap-1 rounded-xl bg-subtle p-1">
            <TabsTrigger
              value="mine"
              className="rounded-lg px-4 text-sm font-semibold text-copy-secondary data-active:bg-elevated data-active:text-brand"
            >
              My Tasks
            </TabsTrigger>
            <TabsTrigger
              value="all"
              className="rounded-lg px-4 text-sm font-semibold text-copy-secondary data-active:bg-elevated data-active:text-brand"
            >
              All Tasks
            </TabsTrigger>
          </TabsList>
          <TabsContent value="mine" className="mt-4">
            <TaskColumns tasks={myTasks} onOpenTask={setSelectedTask} />
          </TabsContent>
          <TabsContent value="all" className="mt-4">
            <TaskColumns tasks={tasks} onOpenTask={setSelectedTask} />
          </TabsContent>
        </Tabs>
      </div>

      <div className="flex justify-end">
        <NewTaskDialog
          members={members}
          projects={projects}
          docs={docs}
          currentMemberId={currentMemberId}
          isAdmin={isAdmin}
        />
      </div>

      {selectedTask && (
        <TaskDetailDialog
          task={selectedTask}
          members={members}
          projects={projects}
          docs={docs}
          currentMemberId={currentMemberId}
          isAdmin={isAdmin}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}
