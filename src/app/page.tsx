import { prisma } from "@/lib/prisma";
import { getXPState } from "@/actions/xp";
import { processTaskLifecycle } from "@/actions/tasks";
import { QuestBoard } from "@/components/QuestBoard";
import type { TaskCardTask } from "@/components/TaskCard";

export const dynamic = "force-dynamic";

type Tier = "daily" | "weekly" | "monthly" | "longterm";

/** Serializable task shape with string dates (Prisma Date objects serialized for client). */
type SerializableTask = Omit<
  TaskCardTask,
  "created_at" | "completed_at" | "period_start" | "period_end" | "expires_at"
> & {
  description: string | null;
  recurrence_group_id: string | null;
  period_start: string | null;
  period_end: string | null;
  is_recurring: boolean;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  completed_at: string | null;
  expires_at: string | null;
  children: SerializableTask[];
};

function toSerializable(task: {
  id: string;
  title: string;
  unit: string;
  tier: string;
  max_count: number;
  current_count: number;
  xp_per_unit: number;
  status: string;
  parent_id: string | null;
  description: string | null;
  recurrence_group_id: string | null;
  period_start: Date | null;
  period_end: Date | null;
  is_recurring: boolean;
  is_published: boolean;
  sort_order: number;
  created_at: Date;
  completed_at: Date | null;
  expires_at: Date | null;
  children: { id: string; created_at: Date; title: string; unit: string; tier: string; max_count: number; current_count: number; xp_per_unit: number; status: string; parent_id: string | null; description: string | null; recurrence_group_id: string | null; period_start: Date | null; period_end: Date | null; is_recurring: boolean; is_published: boolean; sort_order: number; completed_at: Date | null; expires_at: Date | null }[];
}): SerializableTask {
  return {
    ...task,
    created_at: task.created_at instanceof Date ? task.created_at.toISOString() : task.created_at,
    completed_at: task.completed_at instanceof Date ? task.completed_at.toISOString() : (task.completed_at ?? null),
    period_start: task.period_start instanceof Date ? task.period_start.toISOString() : (task.period_start ?? null),
    period_end: task.period_end instanceof Date ? task.period_end.toISOString() : (task.period_end ?? null),
    expires_at: task.expires_at instanceof Date ? task.expires_at.toISOString() : (task.expires_at ?? null),
    children: task.children.map((child) => ({
      ...child,
      created_at: child.created_at instanceof Date ? child.created_at.toISOString() : child.created_at,
      completed_at: child.completed_at instanceof Date ? child.completed_at.toISOString() : (child.completed_at ?? null),
      period_start: child.period_start instanceof Date ? child.period_start.toISOString() : (child.period_start ?? null),
      period_end: child.period_end instanceof Date ? child.period_end.toISOString() : (child.period_end ?? null),
      expires_at: child.expires_at instanceof Date ? child.expires_at.toISOString() : (child.expires_at ?? null),
    })),
  } as SerializableTask;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Process lifecycle (mark expired, regenerate recurring) concurrently with XP fetch
  const [, xpState] = await Promise.all([
    processTaskLifecycle(),
    getXPState(),
  ]);

  // Fetch tasks after lifecycle so new clones appear in result
  const tasks = await prisma.task.findMany({
    where: { is_published: true },
    include: { children: { orderBy: { sort_order: "asc" } } },
    orderBy: [{ status: "asc" }, { sort_order: "asc" }],
  });

  const serializedTasks = tasks.map(toSerializable);

  const { tab } = await searchParams;

  const validTabs: Tier[] = ["daily", "weekly", "monthly", "longterm"];
  const activeTab: Tier =
    tab && validTabs.includes(tab as Tier) ? (tab as Tier) : "daily";

  return (
    <QuestBoard
      tasks={serializedTasks}
      initialXPState={{ totalXP: xpState.totalXP, level: xpState.level }}
      activeTab={activeTab}
    />
  );
}
