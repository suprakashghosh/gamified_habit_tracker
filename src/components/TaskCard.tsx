"use client";

import { useOptimistic, useCallback, useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { decrementProgress } from "@/actions/tasks";
import { Check, Lock, Clock } from "lucide-react";
import { useXPNotification } from "./XPNotificationContext";

export interface TaskCardTask {
  id: string;
  title: string;
  unit: string;
  tier: "daily" | "weekly" | "monthly" | "longterm";
  max_count: number;
  current_count: number;
  xp_per_unit: number;
  status: "draft" | "active" | "completed" | "missed";
  parent_id: string | null;
  description?: string | null;
  is_recurring?: boolean;
  expires_at?: string | null;
  completed_at?: string | null;
}

interface TaskCardProps {
  task: TaskCardTask;
  onIncrement: (taskId: string) => Promise<{
    locked?: boolean;
    newCount?: number;
    overflow?: number;
    isComplete?: boolean;
    xpAwarded?: number;
    undoToken?: string;
  }>;
  onDecrement?: (taskId: string) => Promise<{
    success: boolean;
    newCount?: number;
    xpRefunded?: number;
    error?: string;
  }>;
  isPending: boolean;
}

const TIER_COLORS: Record<string, string> = {
  daily: "#8da6e8",
  weekly: "#b17bd9",
  monthly: "#e5c966",
  longterm: "#ff9600",
};

const TIER_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  longterm: "Long Term",
};

export function TaskCard({ task, onIncrement, onDecrement, isPending }: TaskCardProps) {
  const { addNotification } = useXPNotification();
  const [showLocked, setShowLocked] = useState(false);
  const lockedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [optimisticTask, addOptimistic] = useOptimistic(
    task,
    (prev, newCount: number) => ({ ...prev, current_count: newCount })
  );

  const isCompleted = optimisticTask.status === "completed";
  const isMissed = optimisticTask.status === "missed";
  const isInactive = isCompleted || isMissed;
  const isOverMax = optimisticTask.current_count > optimisticTask.max_count;

  const progressPercent =
    optimisticTask.max_count > 0
      ? (optimisticTask.current_count / optimisticTask.max_count) * 100
      : 0;

  const tierColor = TIER_COLORS[optimisticTask.tier] ?? "#6c7b95";
  const tierLabel = TIER_LABELS[optimisticTask.tier] ?? optimisticTask.tier;

  const handleTap = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isPending || isInactive) return;

      const prevCount = optimisticTask.current_count;
      addOptimistic(prevCount + 1);

      const result = await onIncrement(task.id);

      if (result.locked) {
        addOptimistic(prevCount);
        setShowLocked(true);
        if (lockedTimeoutRef.current) clearTimeout(lockedTimeoutRef.current);
        lockedTimeoutRef.current = setTimeout(() => {
          lockedTimeoutRef.current = null;
          setShowLocked(false);
        }, 2000);
        return;
      }

      if (result.xpAwarded) {
        addNotification(result.xpAwarded, e.clientX, e.clientY);
      }

      if (result.undoToken) {
        toast(`+${result.xpAwarded ?? 0} XP — ${task.title}`, {
          duration: 3000,
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                const res = await decrementProgress(task.id, result.undoToken!);
                if (res.success) {
                  toast("Undone");
                } else {
                  toast(res.error || "Undo failed");
                }
              } catch {
                toast("Undo failed");
              }
            },
          },
        });
      }
    },
    [task.id, task.title, isPending, isInactive, optimisticTask.current_count, addOptimistic, onIncrement, addNotification]
  );

  const handleContextMenu = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!onDecrement || isMissed || optimisticTask.current_count <= 0) return;

      const result = await onDecrement(task.id);
      if (!result.success) {
        toast.error(result.error || "Failed to decrement");
      }
    },
    [task.id, isMissed, optimisticTask.current_count, onDecrement]
  );

  useEffect(() => {
    return () => {
      if (lockedTimeoutRef.current) {
        clearTimeout(lockedTimeoutRef.current);
      }
    };
  }, []);

  const descriptionText =
    optimisticTask.description ||
    `${tierLabel} · +${optimisticTask.xp_per_unit} XP/${optimisticTask.unit}`;
  const counterText = isOverMax
    ? `${optimisticTask.current_count} / ${optimisticTask.max_count} (+${optimisticTask.current_count - optimisticTask.max_count})`
    : `${optimisticTask.current_count} / ${optimisticTask.max_count}`;

  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleTap}
      onContextMenu={handleContextMenu}
      disabled={isPending || isInactive}
      className={[
        "relative overflow-hidden rounded-sm bg-game-bg-panel border border-game-border",
        "text-left w-full cursor-pointer transition-colors duration-200",
        "hover:border-game-border-highlight",
        isPending && "pointer-events-none",
        isInactive && "opacity-70",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`Increment ${optimisticTask.title} counter`}
    >
      {/* Top colored stripe */}
      <div className="h-1 w-full" style={{ backgroundColor: tierColor }} />

      {/* Main content row */}
      <div className="flex gap-3 p-3">
        {/* Left icon square */}
        <div
          className={[
            "w-16 h-16 shrink-0 bg-black border border-game-border",
            "flex items-center justify-center rounded-sm",
            isMissed || showLocked ? "grayscale opacity-50" : "",
          ].join(" ")}
        >
          {isMissed || showLocked ? (
            <Lock className="w-6 h-6 text-game-text-dim" />
          ) : (
            <span
              className="font-display text-lg select-none"
              style={{ color: tierColor }}
            >
              {optimisticTask.title[0]}
            </span>
          )}
        </div>

        {/* Right content area */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          {/* Title row + status indicator */}
          <div className="flex items-start justify-between gap-2">
            <span
              className={[
                "font-display text-xs uppercase tracking-wide leading-tight",
                isInactive ? "text-game-text-dim" : "text-game-text-main",
              ].join(" ")}
            >
              {optimisticTask.title}
            </span>

            {/* Top-right indicator */}
            <div className="shrink-0 mt-0.5">
              {isCompleted ? (
                <div className="w-4 h-4 bg-game-uncommon flex items-center justify-center rounded-sm">
                  <Check className="w-3 h-3 text-white stroke-[3]" />
                </div>
              ) : isMissed ? (
                <Lock className="w-4 h-4 text-game-text-dim" />
              ) : (
                <div className="w-4 h-4 border border-game-border rounded-sm" />
              )}
            </div>
          </div>

          {/* Description / fallback */}
          <p className="text-game-text-muted text-[10px] leading-relaxed line-clamp-2 mt-1">
            {descriptionText}
          </p>

          {/* Bottom tag row + counter */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex gap-1.5">
              <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-game-border text-game-text-dim leading-none rounded-sm">
                {tierLabel}
              </span>
              <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-game-border text-game-text-dim leading-none rounded-sm">
                +{optimisticTask.xp_per_unit} XP/{optimisticTask.unit}
              </span>
            </div>
            {!isCompleted && (
              <span className="font-mono text-[9px] text-game-text-dim tabular-nums">
                {counterText}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom progress bar (only when not completed) */}
      {!isCompleted && (
        <div className="h-1 w-full bg-game-bg-main">
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${Math.min(100, progressPercent)}%`,
              backgroundColor: isMissed ? "#5a6370" : tierColor,
            }}
          />
        </div>
      )}

      {/* Recurring expiry info */}
      {optimisticTask.is_recurring && optimisticTask.expires_at && (
        <div
          className="flex items-center gap-1 px-3 pb-2 font-mono text-[9px] text-game-text-muted"
          title={
            optimisticTask.tier === "daily"
              ? "Resets at midnight"
              : optimisticTask.tier === "weekly"
                ? "Resets Sunday at midnight"
                : `Resets on ${new Date(optimisticTask.expires_at).toLocaleDateString()}`
          }
        >
          <Clock className="w-3 h-3" />
          <span>
            Resets{" "}
            {optimisticTask.tier === "daily"
              ? "today"
              : new Date(optimisticTask.expires_at).toLocaleDateString()}
          </span>
        </div>
      )}
    </motion.button>
  );
}
