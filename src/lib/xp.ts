// ──────────────────────────────────────────────
// Pure XP Math Utilities
// No side effects. No database access.
// ──────────────────────────────────────────────

// Level thresholds: XP required to reach level N
// Formula: cumulative geometric series floor(100 * (1.5^(N-1) - 1) / 0.5)
// Level 1: 0 XP, Level 2: 100 XP, Level 3: 250 XP, Level 4: 475 XP, Level 5: 812 XP
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  // Cumulative geometric series: floor(100 * (1.5^(level-1) - 1) / 0.5)
  return Math.floor(100 * (Math.pow(1.5, level - 1) - 1) / 0.5);
}

// Returns current level from total XP
export function levelFromXP(totalXp: number): number {
  let level = 1;
  while (totalXp >= xpForLevel(level + 1)) {
    level++;
  }
  return level;
}

// Returns XP remaining to reach next level
export function xpToNextLevel(totalXp: number): number {
  const level = levelFromXP(totalXp);
  return xpForLevel(level + 1) - totalXp;
}

// Returns effective XP per unit for a task tier using tier multipliers from config.
export function tierXP(
  taskTier: "daily" | "weekly" | "monthly" | "longterm",
  xpPerUnit: number,
  tierMultipliers: { daily: number; weekly: number; monthly: number; longterm: number }
): number {
  return xpPerUnit * tierMultipliers[taskTier];
}
