"use server";

import { prisma } from "@/lib/prisma";
import { levelFromXP, xpToNextLevel, xpForLevel } from "@/lib/xp";

// Returns current XP state for the HUD
export async function getXPState(): Promise<{
  totalXP: number;
  level: number;
  xpToNextLevel: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
}> {
  const appState = await prisma.appState.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", total_xp: 0, current_level: 1 },
    update: {},
  });

  const level = levelFromXP(appState.total_xp);
  const currentLevelXP = xpForLevel(level);
  const nextLevelXP = xpForLevel(level + 1);
  const remainingXP = xpToNextLevel(appState.total_xp);

  return {
    totalXP: appState.total_xp,
    level,
    xpToNextLevel: remainingXP,
    xpForCurrentLevel: currentLevelXP,
    xpForNextLevel: nextLevelXP,
  };
}

// Awards XP for a task increment. Creates XPTransaction, updates AppState total_xp.
// Checks for level-up. Returns new state.
export async function awardXP(
  amount: number,
  taskId: string,
  reason: "leaf_increment" | "parent_completion"
): Promise<{
  newTotalXP: number;
  newLevel: number;
  leveledUp: boolean;
  xpTransactionId: string;
}> {
  return await prisma.$transaction(async (tx) => {
    // 1. Create XPTransaction
    const xpTxn = await tx.xPTransaction.create({
      data: {
        amount,
        source_task_id: taskId,
        reason,
      },
    });

    // 2. Update AppState: increment total_xp
    const appState = await tx.appState.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", total_xp: amount, current_level: 1 },
      update: { total_xp: { increment: amount } },
    });

    // 3. Compute new level
    const newLevel = levelFromXP(appState.total_xp);
    const leveledUp = newLevel > appState.current_level;

    // 4. If leveled up, update AppState.current_level
    if (leveledUp) {
      await tx.appState.update({
        where: { id: "singleton" },
        data: { current_level: newLevel },
      });
    }

    return {
      newTotalXP: appState.total_xp,
      newLevel,
      leveledUp,
      xpTransactionId: xpTxn.id,
    };
  });
}
