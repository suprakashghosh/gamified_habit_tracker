import { prisma } from "@/lib/prisma";
import { AdminClient } from "@/components/admin/AdminClient";
import type { DraftTask } from "@/actions/llm";
import type { Tier } from "@prisma/client";

export const dynamic = "force-dynamic";

const taskInclude = {
  children: {
    include: {
      children: {
        include: {
          children: true,
        },
      },
    },
  },
} as const;

interface PrismaTaskNode {
  id: string;
  title: string;
  description: string | null;
  unit: string;
  tier: string;
  parent_id: string | null;
  max_count: number;
  current_count: number;
  xp_per_unit: number;
  is_recurring: boolean;
  is_published: boolean;
  status: string;
  sort_order: number;
  recurrence_group_id: string | null;
  period_start: Date | null;
  period_end: Date | null;
  expires_at: Date | null;
  created_at: Date;
  completed_at: Date | null;
  children: PrismaTaskNode[];
}

function serializeTask(task: PrismaTaskNode): DraftTask {
  return {
    ...task,
    tier: task.tier as Tier,
    created_at: task.created_at.toISOString(),
    completed_at: task.completed_at?.toISOString() ?? null,
    period_start: task.period_start?.toISOString() ?? null,
    period_end: task.period_end?.toISOString() ?? null,
    expires_at: task.expires_at?.toISOString() ?? null,
    children: task.children?.map(serializeTask) ?? [],
  };
}

export default async function AdminPage() {
  const draftTasks = await prisma.task.findMany({
    where: { is_published: false },
    include: taskInclude,
    orderBy: [{ sort_order: "asc" }, { created_at: "desc" }],
  });

  const serializedTasks = draftTasks.map(serializeTask);

  return <AdminClient draftTasks={serializedTasks} />;
}
