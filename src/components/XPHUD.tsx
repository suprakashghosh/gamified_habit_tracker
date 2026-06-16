"use client";

import { xpForLevel } from "@/lib/xp";
import { XPBar } from "./XPBar";

interface XPHUDProps {
  totalXP: number;
  level: number;
}

export function XPHUD({ totalXP, level }: XPHUDProps) {
  const xpForCurrent = xpForLevel(level);
  const xpForNext = xpForLevel(level + 1);
  const progress =
    xpForNext > xpForCurrent
      ? ((totalXP - xpForCurrent) / (xpForNext - xpForCurrent)) * 100
      : 100;

  return (
    <div className="bg-game-bg-panel border border-game-border rounded-sm p-3 flex flex-col gap-2">
      {/* Level display */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-sm bg-game-bg-main border border-game-border">
          <span className="font-display text-sm text-game-text-main">{level}</span>
        </div>
        <div className="flex flex-col">
          <span className="font-display text-[9px] tracking-wider text-game-text-dim">
            LEVEL
          </span>
          <span className="font-mono text-xs text-game-text-main tabular-nums">
            {totalXP.toLocaleString()} XP
          </span>
        </div>
      </div>

      {/* XP progress */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between">
          <span className="font-mono text-[9px] text-game-text-dim tabular-nums">
            {totalXP.toLocaleString()} / {xpForNext.toLocaleString()}
          </span>
          <span className="font-mono text-[9px] text-game-text-dim tabular-nums">
            +{(xpForNext - totalXP).toLocaleString()} to next
          </span>
        </div>
        <XPBar progress={progress} />
      </div>
    </div>
  );
}
