"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { tierXP, levelFromXP } from "@/lib/xp";
import { getXPConfig } from "@/lib/config";
import { Prisma, Tier } from "@prisma/client";

// ── Constants ──────────────────────────────────

const TIER_ORDER: Record<Tier, number> = { daily: 0, weekly: 1, monthly: 2, longterm: 3 };

// ── Period helpers ────────────────────────────

function periodStartForTier(tier: Tier, now = new Date()): Date | null {
  switch (tier) {
    case "daily": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "weekly": {
      const d = new Date(now);
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day; // back to Monday
      d.setDate(d.getDate() + diff);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "monthly":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "longterm":
      return null;
  }
}

function periodEndForTier(tier: Tier, start: Date | null): Date | null {
  if (!start) return null;
  switch (tier) {
    case "daily": {
      const d = new Date(start);
      d.setHours(23, 59, 59, 999);
      return d;
    }
    case "weekly": {
      const d = new Date(start);
      d.setDate(d.getDate() + 6);
      d.setHours(23, 59, 59, 999);
      return d;
    }
    case "monthly":
      return new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
    case "longterm":
      return null;
  }
}

function recurrenceGroupId(taskId?: string): string {
  return taskId || crypto.randomUUID();
}

// ── Helpers ────────────────────────────────────

/** Walk up parent chain from leaf, recalculating and auto-growing parents.
 *  Creates parent_completion XPTransactions for first-time completions.
 *  Must be called inside a prisma.$transaction. */
async function recalculateParentChain(tx: Prisma.TransactionClient, leafId: string): Promise<{
  totalBonusXP: number;
  completions: Array<{ taskId: string; title: string }>;
}> {
  const xpConfig = getXPConfig();
  let totalBonusXP = 0;
  const completions: Array<{ taskId: string; title: string }> = [];

  const leaf = await tx.task.findUnique({ where: { id: leafId }, select: { parent_id: true } });
  let parentId = leaf?.parent_id ?? null;

  while (parentId) {
    const parent = await tx.task.findUnique({ where: { id: parentId } });
    if (!parent) break;

    // Sum children's current_counts
    const children = await tx.task.findMany({ where: { parent_id: parentId } });
    const sumCurrent = children.reduce((sum: number, c: { current_count: number }) => sum + c.current_count, 0);

    // Track if parent was already completed before this update
    const wasCompleted = parent.status === "completed";

    // Auto-grow max_count if children over-delivered
    const newMaxCount = Math.max(parent.max_count, sumCurrent);
    const nowAtOrAboveMax = sumCurrent >= parent.max_count;

    // Update parent using updateMany with status guard to avoid duplicate bonuses
    const updateData: Record<string, unknown> = {
      current_count: sumCurrent,
      max_count: newMaxCount,
    };

    if (nowAtOrAboveMax && !wasCompleted) {
      updateData.status = "completed";
      updateData.completed_at = new Date();
    }

    const updateResult = await tx.task.updateMany({
      where: {
        id: parentId,
        ...(nowAtOrAboveMax && !wasCompleted ? { status: { not: "completed" } } : {}),
      },
      data: updateData,
    });

    // Award parent completion bonus only if THIS update transitioned status
    // Use newMaxCount (post-auto-grow) for correct XP calculation
    if (updateResult.count > 0 && nowAtOrAboveMax && !wasCompleted) {
      const bonusXP = tierXP(parent.tier, parent.xp_per_unit, xpConfig.tier_multipliers) * newMaxCount;
      await tx.xPTransaction.create({
        data: {
          amount: bonusXP,
          source_task_id: parentId,
          reason: "parent_completion",
        },
      });
      totalBonusXP += bonusXP;
      completions.push({ taskId: parentId, title: parent.title });
    } else {
      // Still need to update if status guard filtered us out (just current/max update)
      if (updateResult.count === 0) {
        await tx.task.update({
          where: { id: parentId },
          data: { current_count: sumCurrent, max_count: newMaxCount },
        });
      }
    }

    parentId = parent.parent_id;
  }

  return { totalBonusXP, completions };
}

// ── Task CRUD ───────────────────────────────────

export async function createTask(data: {
  title: string;
  description?: string;
  unit: string;
  tier: Tier;
  parent_id?: string;
  max_count: number;
  xp_per_unit: number;
  is_recurring?: boolean;
  sort_order?: number;
  period_start?: Date;
  period_end?: Date;
  expires_at?: Date;
  recurrence_group_id?: string;
}): Promise<{ id: string; period_start: string | null; period_end: string | null; expires_at: string | null }> {
  // Validation: recurring tasks cannot have a parent
  if (data.is_recurring && data.parent_id) {
    throw new Error("Recurring tasks cannot have a parent");
  }

  // Derive period fields for all tasks when caller didn't provide them
  if (!data.period_start) {
    const start = periodStartForTier(data.tier);
    if (start) data.period_start = start;
  }
  if (!data.period_end) {
    const end = periodEndForTier(data.tier, data.period_start ?? null);
    if (end) data.period_end = end;
  }
  if (!data.expires_at) {
    data.expires_at = data.period_end;
  }

  // Recurring-specific: derive group id
  if (data.is_recurring) {
    data.recurrence_group_id = data.recurrence_group_id || recurrenceGroupId();
  }

  const task = await prisma.task.create({
    data: {
      title: data.title,
      description: data.description,
      unit: data.unit,
      tier: data.tier,
      parent_id: data.parent_id,
      max_count: data.max_count,
      current_count: 0,
      xp_per_unit: data.xp_per_unit,
      is_recurring: data.is_recurring ?? false,
      is_published: false,
      status: "draft",
      sort_order: data.sort_order ?? 0,
      period_start: data.period_start,
      period_end: data.period_end,
      expires_at: data.expires_at,
      recurrence_group_id: data.recurrence_group_id,
    },
  });

  return {
    id: task.id,
    period_start: task.period_start?.toISOString() ?? null,
    period_end: task.period_end?.toISOString() ?? null,
    expires_at: task.expires_at?.toISOString() ?? null,
  };
}

export async function updateTask(
  id: string,
  data: Partial<{
    title: string;
    description: string;
    unit: string;
    tier: Tier;
    max_count: number;
    xp_per_unit: number;
    is_recurring: boolean;
    sort_order: number;
    period_start: Date;
    period_end: Date;
    expires_at: Date;
    recurrence_group_id: string;
  }>
): Promise<void> {
  // If is_recurring is being set to true, check no parent_id and no children
  if (data.is_recurring === true) {
    const existing = await prisma.task.findUnique({
      where: { id },
      include: { children: { take: 1 } },
    });
    if (existing?.parent_id) {
      throw new Error("Cannot make a task with a parent recurring");
    }
    if (existing?.children && existing.children.length > 0) {
      throw new Error("Cannot make a task with children recurring");
    }

    // Derive any missing period fields (do not overwrite existing non-null values)
    const fullExisting = await prisma.task.findUnique({ where: { id } });
    if (!fullExisting) throw new Error("Task not found");

    const effectiveTier: Tier = data.tier ?? fullExisting.tier as Tier;

    if (!data.period_start && !fullExisting.period_start) {
      const start = periodStartForTier(effectiveTier);
      if (start) data.period_start = start;
    }
    if (!data.period_end && !fullExisting.period_end) {
      const start = data.period_start ?? fullExisting.period_start;
      const end = periodEndForTier(effectiveTier, start);
      if (end) data.period_end = end;
    }
    if (!data.expires_at && !fullExisting.expires_at) {
      const end = data.period_end ?? fullExisting.period_end;
      if (end) data.expires_at = end;
    }
    if (!data.recurrence_group_id && !fullExisting.recurrence_group_id) {
      data.recurrence_group_id = recurrenceGroupId();
    }
  }

  await prisma.task.update({
    where: { id },
    data,
  });

  revalidatePath("/");
  revalidatePath("/admin");
}

export async function deleteTask(id: string): Promise<void> {
  await prisma.task.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/admin");
}

// ── Progress ───────────────────────────────────

export async function incrementProgress(
  taskId: string
): Promise<{
  locked?: boolean;
  newCount?: number;
  maxCount?: number;
  overflow?: number;
  isComplete?: boolean;
  xpAwarded?: number;
  parentCompletions?: Array<{ taskId: string; title: string }>;
  newLevel?: number;
  leveledUp?: boolean;
  undoToken?: string;
}> {
  const xpConfig = getXPConfig();

  // 1. TRANSACTION
  return await prisma.$transaction(async (tx) => {
    // a. Re-read leaf and root inside transaction to avoid stale reads
    const leaf = await tx.task.findUnique({ where: { id: taskId } });
    if (!leaf) throw new Error("Task not found");

    // Walk parent chain to find root (inside transaction)
    let rootTask = leaf;
    let hops = 0;
    while (rootTask.parent_id && hops < 4) {
      const parent = await tx.task.findUnique({ where: { id: rootTask.parent_id } });
      if (!parent) break;
      rootTask = parent;
      hops++;
    }

    // Lock the root row to serialize concurrent increments under the same root
    await tx.$queryRaw`SELECT id FROM "Task" WHERE id = ${rootTask.id} FOR UPDATE`;
    // Re-read after lock to get the committed value
    const lockedRoot = await tx.task.findUnique({ where: { id: rootTask.id } });
    if (!lockedRoot) throw new Error("Root task not found after lock");
    
    if (lockedRoot.current_count >= lockedRoot.max_count) {
      return { locked: true };
    }

    // b. Atomically increment leaf.current_count by 1
    const updatedLeaf = await tx.task.update({
      where: { id: taskId },
      data: { current_count: { increment: 1 } },
    });

    // c. Award leaf XP
    const leafXP = tierXP(leaf.tier, leaf.xp_per_unit, xpConfig.tier_multipliers);
    let totalAwarded = leafXP;

    const leafTxn = await tx.xPTransaction.create({
      data: {
        amount: leafXP,
        source_task_id: taskId,
        reason: "leaf_increment",
      },
    });

    // d. Check if leaf completed
    let leafCompleted = false;
    if (updatedLeaf.current_count === leaf.max_count && leaf.status !== "completed") {
      await tx.task.update({
        where: { id: taskId },
        data: { status: "completed", completed_at: new Date() },
      });
      leafCompleted = true;
    }

    // e. Walk up parent chain — recalculateParents
    const parentResults = await recalculateParentChain(tx, taskId);

    // f. Update AppState total_xp
    totalAwarded += parentResults.totalBonusXP;
    const appState = await tx.appState.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", total_xp: totalAwarded, current_level: 1 },
      update: { total_xp: { increment: totalAwarded } },
    });

    // g. Check level-up
    const newLevel = levelFromXP(appState.total_xp);
    const oldLevel = appState.current_level;
    const leveledUp = newLevel > oldLevel;

    if (leveledUp) {
      await tx.appState.update({
        where: { id: "singleton" },
        data: { current_level: newLevel },
      });
    }

    // h. Generate undo token (bound to leaf_increment XPTransaction)
    const undoToken = Buffer.from(
      JSON.stringify({
        taskId,
        transactionId: leafTxn.id,
        timestamp: Date.now(),
        nonce: Math.random().toString(36).slice(2),
      })
    ).toString("base64");

    revalidatePath("/");

    return {
      newCount: updatedLeaf.current_count,
      maxCount: leaf.max_count,
      overflow: Math.max(0, updatedLeaf.current_count - leaf.max_count),
      isComplete: leafCompleted,
      xpAwarded: totalAwarded,
      parentCompletions: parentResults.completions,
      newLevel,
      leveledUp,
      undoToken,
    };
  });
}

export async function decrementProgress(
  taskId: string,
  undoToken?: string
): Promise<{
  success: boolean;
  newCount: number;
  xpRefunded: number;
  error?: string;
}> {
  // 1. Validate undo token (if provided)
  let transactionId: string | undefined;
  if (undoToken) {
    let tokenData: { taskId: string; timestamp: number; transactionId?: string };
    try {
      const decoded = Buffer.from(undoToken, "base64").toString("utf-8");
      tokenData = JSON.parse(decoded);
    } catch {
      return { success: false, newCount: 0, xpRefunded: 0, error: "Invalid undo token" };
    }

    if (tokenData.taskId !== taskId) {
      return { success: false, newCount: 0, xpRefunded: 0, error: "Undo token does not match task" };
    }

    const elapsed = Date.now() - tokenData.timestamp;
    if (elapsed > 3 * 60 * 1000) {
      return { success: false, newCount: 0, xpRefunded: 0, error: "Undo window expired (3 minutes)" };
    }

    transactionId = tokenData.transactionId;
  }

      // 2. Transaction
  try {
    return await prisma.$transaction(async (tx) => {
      // a. Reject if already at 0
      const current = await tx.task.findUnique({ where: { id: taskId }, select: { current_count: true, status: true } });
      if (!current || current.current_count <= 0) {
        return { success: false, newCount: 0, xpRefunded: 0, error: "Cannot decrement: counter already at 0" };
      }

      // b. Decrement leaf.current_count by 1
      const updatedLeaf = await tx.task.update({
        where: { id: taskId },
        data: {
          current_count: { decrement: 1 },
          completed_at: current?.status === "completed" ? null : undefined,
        },
      });

      // c. Find the leaf_increment XPTransaction
      const originalTxn = transactionId
        ? await tx.xPTransaction.findUnique({ where: { id: transactionId } })
        : await tx.xPTransaction.findFirst({
            where: { source_task_id: taskId, reason: "leaf_increment" },
            orderBy: { created_at: "desc" },
          });

      let xpRefunded = 0;
      if (originalTxn) {
        const alreadyUndone = await tx.xPTransaction.findFirst({
          where: { linked_transaction_id: originalTxn.id },
        });
        if (!alreadyUndone) {
          await tx.xPTransaction.create({
            data: {
              amount: -(originalTxn.amount),
              source_task_id: taskId,
              reason: "undo",
              linked_transaction_id: originalTxn.id,
            },
          });
          xpRefunded = originalTxn.amount;
        }
      }

      // d. Un-complete leaf if it was completed and now below max
      if (updatedLeaf.status === "completed" && updatedLeaf.current_count < updatedLeaf.max_count) {
        await tx.task.update({
          where: { id: taskId, status: "completed" },
          data: { status: "active", completed_at: null },
        });
      }

      // e. Walk up parent chain — recalculate and possibly un-complete parents
      let walkParentId: string | null = updatedLeaf.parent_id;
      while (walkParentId) {
        const parent = await tx.task.findUnique({ where: { id: walkParentId } });
        if (!parent) break;

        const children = await tx.task.findMany({ where: { parent_id: walkParentId } });
        const sumCurrent = children.reduce(
          (sum: number, c: { current_count: number }) => sum + c.current_count,
          0
        );

        if (sumCurrent < parent.max_count && parent.status === "completed") {
          await tx.task.update({
            where: { id: walkParentId },
            data: {
              current_count: sumCurrent,
              status: "active",
              completed_at: null,
            },
          });

          const bonusTxn = await tx.xPTransaction.findFirst({
            where: { source_task_id: walkParentId, reason: "parent_completion" },
            orderBy: { created_at: "desc" },
          });
          if (bonusTxn) {
            const alreadyReversed = await tx.xPTransaction.findFirst({
              where: { linked_transaction_id: bonusTxn.id },
            });
            if (!alreadyReversed) {
              await tx.xPTransaction.create({
                data: {
                  amount: -(bonusTxn.amount),
                  source_task_id: walkParentId,
                  reason: "undo",
                  linked_transaction_id: bonusTxn.id,
                },
              });
              xpRefunded += bonusTxn.amount;
            }
          }
        } else {
          await tx.task.update({
            where: { id: walkParentId },
            data: { current_count: sumCurrent },
          });
        }

        walkParentId = parent.parent_id;
      }

      // f. Update AppState total_xp
      if (xpRefunded > 0) {
        await tx.appState.upsert({
          where: { id: "singleton" },
          create: { id: "singleton", total_xp: 0, current_level: 1 },
          update: { total_xp: { decrement: xpRefunded } },
        });
      }

      revalidatePath("/");

      return {
        success: true,
        newCount: updatedLeaf.current_count,
        xpRefunded,
      };
    });
  } catch (error) {
    return {
      success: false,
      newCount: 0,
      xpRefunded: 0,
      error: error instanceof Error ? error.message : "Failed to decrement progress",
    };
  }
}

// ── Reordering ─────────────────────────────────

export async function reorderTasks(orderedIds: string[]): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.task.update({ where: { id }, data: { sort_order: index } })
    )
  );
  revalidatePath("/");
}

// ── Publishing ─────────────────────────────────

export async function publishTasks(
  taskIds: string[]
): Promise<
  { success: true } | { success: false; errors: Array<{ taskId: string; message: string }> }
> {
  const errors: Array<{ taskId: string; message: string }> = [];

  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    include: {
      children: {
        include: {
          children: {
            include: {
              children: true,
            },
          },
        },
      },
    },
  });

  interface TaskTreeNode {
    id: string;
    title: string;
    tier: Tier;
    unit: string;
    max_count: number;
    children: TaskTreeNode[];
  }

  function validateTree(
    task: TaskTreeNode,
    parentTier?: Tier,
  ): void {
    if (parentTier) {
      const childOrder = TIER_ORDER[task.tier];
      const parentOrder = TIER_ORDER[parentTier];
      if (childOrder !== parentOrder - 1) {
        errors.push({
          taskId: task.id,
          message: `Task "${task.title}" has tier "${task.tier}" but parent expects tier one step below "${parentTier}"`,
        });
      }
    }

    if (task.children.length > 0) {
      const childSum = task.children.reduce((s, c) => s + c.max_count, 0);
      if (childSum !== task.max_count) {
        errors.push({
          taskId: task.id,
          message: `Children sum (${childSum}) does not equal parent max_count (${task.max_count})`,
        });
      }
      for (const child of task.children) {
        if (child.unit !== task.unit) {
          errors.push({
            taskId: task.id,
            message: `Child "${child.title}" has unit "${child.unit}" but parent expects "${task.unit}"`,
          });
        }
        validateTree(child, task.tier);
      }
    }
  }

  for (const task of tasks) {
    validateTree(task as TaskTreeNode);
  }

  if (errors.length > 0) return { success: false, errors };

  // All valid — publish
  await prisma.task.updateMany({
    where: { id: { in: taskIds } },
    data: { is_published: true, status: "active" },
  });

  revalidatePath("/");
  revalidatePath("/admin");

  return { success: true };
}

// ── Allocation ─────────────────────────────────

export async function allocateChildCounters(
  parentId: string,
  allocations: Array<{ childId: string; maxCount: number }>
): Promise<{ success: true } | { success: false; error: string }> {
  const parent = await prisma.task.findUnique({ where: { id: parentId } });
  if (!parent) return { success: false, error: "Parent not found" };

  // Validate all children belong to this parent
  const children = await prisma.task.findMany({
    where: { parent_id: parentId },
    select: { id: true },
  });
  const childIds = new Set(children.map(c => c.id));

  for (const alloc of allocations) {
    if (!childIds.has(alloc.childId)) {
      return {
        success: false,
        error: `Task ${alloc.childId} is not a child of ${parentId}`,
      };
    }
  }

  const sum = allocations.reduce((s, a) => s + a.maxCount, 0);
  if (sum !== parent.max_count) {
    return {
      success: false,
      error: `Allocated sum (${sum}) must equal parent max_count (${parent.max_count})`,
    };
  }

  await prisma.$transaction(
    allocations.map((a) =>
      prisma.task.update({
        where: { id: a.childId },
        data: { max_count: a.maxCount },
      })
    )
  );

  revalidatePath("/admin");
  return { success: true };
}

// ── Lifecycle ──────────────────────────────────

export async function processTaskLifecycle(): Promise<{ expired: number; regenerated: number }> {
  const now = new Date();
  let expired = 0;
  let regenerated = 0;

  // Find expired tasks:
  // - Non-recurring active tasks with expires_at < now
  // - Recurring active or completed tasks with expires_at < now
  const expiredTasks = await prisma.task.findMany({
    where: {
      expires_at: { lt: now },
      OR: [
        { is_recurring: false, status: "active" },
        { is_recurring: true, status: { in: ["active", "completed"] } },
      ],
    },
  });

  for (const task of expiredTasks) {
    await prisma.$transaction(async (tx) => {
      // ── Non-recurring: mark missed, no clone ──
      if (!task.is_recurring) {
        if (task.status === "active") {
          await tx.task.update({
            where: { id: task.id },
            data: { status: "missed" },
          });
          expired++;
        }
        return;
      }

      // ── Recurring task ─────────────────────────
      const isComplete = task.current_count >= task.max_count;

      // Compute next period using helpers
      const nextStart = periodStartForTier(task.tier as Tier, now);
      const nextEnd = nextStart ? periodEndForTier(task.tier as Tier, nextStart) : null;

      // Clone to next period (skip longterm where period is null)
      if (nextStart && nextEnd) {
        const groupId = task.recurrence_group_id || task.id;

        await tx.task.upsert({
          where: {
            recurrence_group_id_period_start: {
              recurrence_group_id: groupId,
              period_start: nextStart,
            },
          },
          create: {
            title: task.title,
            description: task.description,
            unit: task.unit,
            tier: task.tier,
            max_count: task.max_count,
            current_count: 0,
            xp_per_unit: task.xp_per_unit,
            is_recurring: true,
            is_published: task.is_published,
            status: "active",
            sort_order: task.sort_order,
            parent_id: null,
            recurrence_group_id: groupId,
            period_start: nextStart,
            period_end: nextEnd,
            expires_at: nextEnd,
          },
          update: {},
        });

        regenerated++;
      }

      // Update original task status and expires_at
      if (task.status === "active") {
        if (isComplete) {
          // Active complete → mark completed, clear expires_at
          await tx.task.update({
            where: { id: task.id },
            data: { status: "completed", completed_at: now, expires_at: null },
          });
        } else {
          // Active incomplete → mark missed, keep expires_at for 24h UI
          await tx.task.update({
            where: { id: task.id },
            data: { status: "missed" },
          });
        }
      } else {
        // Already completed → clear expires_at to prevent reprocessing
        await tx.task.update({
          where: { id: task.id },
          data: { expires_at: null },
        });
      }

      expired++;
    });
  }

  return { expired, regenerated };
}
