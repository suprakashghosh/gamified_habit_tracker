"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { generateTasks, resolveClarifications, type DraftTask, type ClarificationFromLLM } from "@/actions/llm";
import { createTask, updateTask, deleteTask, allocateChildCounters, publishTasks } from "@/actions/tasks";
import { TodoInput } from "./TodoInput";
import { ClarificationPanel } from "./ClarificationPanel";
import { TaskTable } from "./TaskTable";
import { PublishButton } from "./PublishButton";
import type { Tier } from "@prisma/client";

type Phase = "idle" | "generating" | "clarifying" | "editing";

interface AdminClientProps {
  draftTasks: DraftTask[];
}

function updateTaskInTree(
  tasks: DraftTask[],
  id: string,
  updates: Partial<DraftTask>
): DraftTask[] {
  return tasks.map((t) => {
    if (t.id === id) {
      return { ...t, ...updates };
    }
    if (t.children.length > 0) {
      return { ...t, children: updateTaskInTree(t.children, id, updates) };
    }
    return t;
  });
}

function removeTaskFromTree(tasks: DraftTask[], id: string): DraftTask[] {
  return tasks
    .filter((t) => t.id !== id)
    .map((t) => (t.children.length > 0 ? { ...t, children: removeTaskFromTree(t.children, id) } : t));
}

function flattenIds(tasks: DraftTask[]): string[] {
  return tasks.flatMap((t) => [t.id, ...flattenIds(t.children)]);
}

export function AdminClient({ draftTasks }: AdminClientProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(draftTasks.length > 0 ? "editing" : "idle");
  const [tasks, setTasks] = useState<DraftTask[]>(draftTasks);
  const [clarifications, setClarifications] = useState<ClarificationFromLLM[]>([]);
  const [pendingTodos, setPendingTodos] = useState<string>("");
  const [isPublishing, setIsPublishing] = useState(false);

  const allTaskIds = useMemo(() => flattenIds(tasks), [tasks]);

  const updateTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingUpdates = useRef<Map<string, Partial<DraftTask>>>(new Map());

  const flushUpdateTask = useCallback(async (id: string) => {
    const updates = pendingUpdates.current.get(id);
    if (!updates) return;
    pendingUpdates.current.delete(id);
    const timerKey = `update-${id}`;
    const timer = updateTimers.current.get(timerKey);
    if (timer) {
      clearTimeout(timer);
      updateTimers.current.delete(timerKey);
    }
    try {
      await updateTask(id, updates as Parameters<typeof updateTask>[1]);
    } catch {
      toast.error("Failed to save changes. Please try again.");
    }
  }, []);

  const handleUpdateTask = useCallback(
    (id: string, updates: Partial<DraftTask>) => {
      setTasks((prev) => updateTaskInTree(prev, id, updates));
      const existing = pendingUpdates.current.get(id);
      pendingUpdates.current.set(id, { ...existing, ...updates });
      const timerKey = `update-${id}`;
      const existingTimer = updateTimers.current.get(timerKey);
      if (existingTimer) clearTimeout(existingTimer);
      updateTimers.current.set(
        timerKey,
        setTimeout(() => {
          flushUpdateTask(id);
        }, 400)
      );
    },
    [flushUpdateTask]
  );

  const handleGenerate = useCallback(async (rawTodos: string) => {
    setPhase("generating");
    setPendingTodos(rawTodos);

    const result = await generateTasks(rawTodos);

    if ("error" in result) {
      toast.error("Generation failed. Please try again.");
      setPhase("idle");
      return;
    }

    setTasks(result.tasks);
    setClarifications(result.clarifications);

    if (result.clarifications.length > 0) {
      setPhase("clarifying");
    } else {
      setPhase("editing");
      toast.success(`Generated ${result.tasks.length} draft quests.`);
    }
  }, []);

  const handleResolve = useCallback(
    async (answers: Record<string, string>) => {
      setPhase("generating");

      const result = await resolveClarifications(pendingTodos, answers);

      if ("error" in result) {
        toast.error("Generation failed. Please try again.");
        setPhase("clarifying");
        return;
      }

      setTasks(result.tasks);
      setClarifications(result.clarifications);

      if (result.clarifications.length > 0) {
        setPhase("clarifying");
      } else {
        setPhase("editing");
        toast.success(`Generated ${result.tasks.length} draft quests.`);
      }
    },
    [pendingTodos]
  );

  const handleDeleteTask = useCallback(async (id: string) => {
    try {
      await deleteTask(id);
      setTasks((prev) => removeTaskFromTree(prev, id));
      toast.success("Task deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete task");
    }
  }, []);

  const handleAddTask = useCallback(async () => {
    try {
      const { id, period_start, period_end, expires_at } = await createTask({
        title: "New quest",
        description: "",
        unit: "units",
        tier: "daily" as Tier,
        max_count: 1,
        xp_per_unit: 5,
      });
      const newTask: DraftTask = {
        id,
        title: "New quest",
        description: null,
        unit: "units",
        tier: "daily",
        parent_id: null,
        max_count: 1,
        current_count: 0,
        xp_per_unit: 5,
        is_recurring: false,
        is_published: false,
        status: "draft",
        sort_order: 0,
        recurrence_group_id: null,
        period_start,
        period_end,
        expires_at,
        created_at: new Date().toISOString(),
        completed_at: null,
        children: [],
      };
      setTasks((prev) => [newTask, ...prev]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add task");
    }
  }, []);

  const handleAddChild = useCallback(async (parentId: string) => {
    try {
      const { id, period_start, period_end, expires_at } = await createTask({
        title: "New sub-quest",
        description: "",
        unit: "units",
        tier: "daily" as Tier,
        parent_id: parentId,
        max_count: 0,
        xp_per_unit: 5,
      });
      const newTask: DraftTask = {
        id,
        title: "New sub-quest",
        description: null,
        unit: "units",
        tier: "daily",
        parent_id: parentId,
        max_count: 0,
        current_count: 0,
        xp_per_unit: 5,
        is_recurring: false,
        is_published: false,
        status: "draft",
        sort_order: 0,
        recurrence_group_id: null,
        period_start,
        period_end,
        expires_at,
        created_at: new Date().toISOString(),
        completed_at: null,
        children: [],
      };
      setTasks((prev) => appendChildToTree(prev, parentId, newTask));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add sub-task");
    }
  }, []);

  const handleAllocateChildCounters = useCallback(
    async (parentId: string, allocations: { childId: string; maxCount: number }[]) => {
      const result = await allocateChildCounters(parentId, allocations);
      if (result.success) {
        toast.success("Counters allocated.");
      } else {
        toast.error(result.error);
      }
    },
    []
  );

  const handlePublish = useCallback(async () => {
    setIsPublishing(true);
    try {
      const result = await publishTasks(allTaskIds);
      if (result.success) {
        toast.success("Quests published!");
        router.push("/");
      } else {
        toast.error(
          "Failed to publish tasks. Check that child counters sum to parent totals."
        );
      }
    } catch {
      toast.error(
        "Failed to publish tasks. Check that child counters sum to parent totals."
      );
    } finally {
      setIsPublishing(false);
    }
  }, [allTaskIds, router]);

  return (
    <main className="flex min-h-dvh w-full flex-col">
      <header className="border-b border-game-border bg-game-bg-header/80 backdrop-blur-md px-4 py-4 md:px-8 md:py-5">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-xl tracking-wider text-game-text-main md:text-2xl">
              Admin
            </h1>
            <p className="text-sm text-game-text-muted">
              Generate, edit, and publish quests.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 self-start rounded-sm border border-game-border bg-game-bg-panel px-3 py-2 text-sm font-medium text-game-text-muted transition-colors hover:border-game-border-highlight hover:text-game-text-main focus-ring sm:self-auto"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to game
          </Link>
        </div>
      </header>

      <section className="flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-7xl">
          {phase === "idle" && (
            <TodoInput onGenerate={handleGenerate} isLoading={false} />
          )}

          {phase === "generating" && (
            <div className="flex flex-col items-center justify-center gap-[--spacing-md] py-[--spacing-4xl]">
              <Loader2 className="h-10 w-10 animate-spin text-game-lunar" />
              <p className="text-base text-game-text-muted">Summoning the quest smith...</p>
            </div>
          )}

          {phase === "clarifying" && (
            <ClarificationPanel
              clarifications={clarifications}
              onResolve={handleResolve}
              isLoading={false}
            />
          )}

          {phase === "editing" && (
            <div className="flex flex-col gap-[--spacing-xl]">
              <TodoInput onGenerate={handleGenerate} isLoading={false} />
              <TaskTable
                tasks={tasks}
                onUpdateTask={handleUpdateTask}
                onUpdateTaskBlur={flushUpdateTask}
                onDeleteTask={handleDeleteTask}
                onAddTask={handleAddTask}
                onAddChild={handleAddChild}
                onAllocateChildCounters={handleAllocateChildCounters}
              />
              {tasks.length > 0 && (
                <div className="flex justify-end">
                  <PublishButton
                    onPublish={handlePublish}
                    isLoading={isPublishing}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function appendChildToTree(
  tasks: DraftTask[],
  parentId: string,
  child: DraftTask
): DraftTask[] {
  return tasks.map((t) => {
    if (t.id === parentId) {
      return { ...t, children: [...t.children, child] };
    }
    if (t.children.length > 0) {
      return { ...t, children: appendChildToTree(t.children, parentId, child) };
    }
    return t;
  });
}
