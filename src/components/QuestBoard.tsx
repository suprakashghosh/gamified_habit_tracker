"use client";

import { useState, useCallback, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Reorder, AnimatePresence, motion } from "framer-motion";
import { incrementProgress, decrementProgress, reorderTasks } from "@/actions/tasks";
import { XPHUD } from "@/components/XPHUD";
import { TaskCard, type TaskCardTask } from "@/components/TaskCard";
import { MobileTabBar } from "@/components/MobileTabBar";
import { EmptyState } from "@/components/EmptyState";
import { Sun, CalendarDays, CalendarRange, Star } from "lucide-react";
import { toast } from "sonner";
import { XPNotificationProvider } from "./XPNotificationContext";
import { XPNotification } from "./XPNotification";
import { LevelUpOverlay } from "./LevelUpOverlay";
import { useXPNotification } from "./XPNotificationContext";

type Tier = "daily" | "weekly" | "monthly" | "longterm";

/** Hide missed tasks older than 24h after their expires_at. */
function isVisibleMissed(task: { status: string; expires_at?: string | null }): boolean {
  return (
    task.status !== "missed" ||
    !task.expires_at ||
    Date.now() - new Date(task.expires_at).getTime() <= 24 * 60 * 60 * 1000
  );
}

/** Hide completed recurring instances older than 24h or whose period has ended. */
function isVisibleCompletedRecurring(task: {
  status: string;
  is_recurring?: boolean;
  completed_at?: string | null;
  expires_at?: string | null;
}): boolean {
  if (task.status !== "completed") return true;
  if (!task.is_recurring) return true;
  if (task.completed_at && Date.now() - new Date(task.completed_at).getTime() > 24 * 60 * 60 * 1000) return false;
  if (!task.expires_at) return false;
  if (new Date(task.expires_at).getTime() <= Date.now()) return false;
  return true;
}

interface TaskData extends TaskCardTask {
  children?: TaskData[];
}

interface XPState {
  totalXP: number;
  level: number;
}

interface QuestBoardProps {
  tasks: TaskData[];
  initialXPState: XPState;
  activeTab: Tier;
}

const TABS: { key: Tier; label: string; Icon: typeof Sun }[] = [
  { key: "daily", label: "Daily", Icon: Sun },
  { key: "weekly", label: "Weekly", Icon: CalendarDays },
  { key: "monthly", label: "Monthly", Icon: CalendarRange },
  { key: "longterm", label: "Long Term", Icon: Star },
];

function QuestBoardContent({
  tasks: initialTasks,
  initialXPState,
  activeTab: initialTab,
}: QuestBoardProps) {
  const { triggerLevelUp } = useXPNotification();
  const searchParams = useSearchParams();
  const router = useRouter();

  const tabFromUrl = searchParams.get("tab") as Tier | null;
  const activeTab: Tier =
    tabFromUrl === "daily" ||
    tabFromUrl === "weekly" ||
    tabFromUrl === "monthly" ||
    tabFromUrl === "longterm"
      ? tabFromUrl
      : initialTab;

  const [tasks, setTasks] = useState(initialTasks);
  const [xpState, setXPState] = useState<XPState>(initialXPState);
  const [isPending, startTransition] = useTransition();

  const handleTabChange = useCallback(
    (tab: Tier) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const handleIncrement = useCallback(
    async (taskId: string) => {
      const result = await incrementProgress(taskId);

      startTransition(() => {
        if (!result.locked) {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    current_count: result.newCount ?? t.current_count,
                    status:
                      result.isComplete && !t.parent_id
                        ? ("completed" as const)
                        : t.status,
                  }
                : t
            )
          );

          if (result.xpAwarded) {
            setXPState((prev) => ({
              totalXP: prev.totalXP + (result.xpAwarded ?? 0),
              level: result.newLevel ?? prev.level,
            }));
          }
        }
      });

      if (result.leveledUp && result.newLevel) {
        triggerLevelUp(result.newLevel, xpState.totalXP + (result.xpAwarded ?? 0));
      }

      return result;
    },
    [triggerLevelUp, xpState.totalXP]
  );

  const handleDecrement = useCallback(
    async (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task || task.status === "missed" || task.current_count <= 0) {
        return { success: false, error: "Cannot decrement" };
      }

      const previousTasks = [...tasks];
      const newCount = task.current_count - 1;

      startTransition(() => {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  current_count: newCount,
                  status:
                    t.status === "completed" && newCount < t.max_count
                      ? ("active" as const)
                      : t.status,
                  completed_at:
                    t.status === "completed" && newCount < t.max_count
                      ? null
                      : t.completed_at,
                }
              : t
          )
        );
      });

      try {
        const result = await decrementProgress(taskId);
        if (!result.success) {
          startTransition(() => setTasks(previousTasks));
          toast.error(result.error || "Failed to decrement");
          return result;
        }

        if (result.xpRefunded > 0) {
          setXPState((prev) => ({
            totalXP: Math.max(0, prev.totalXP - result.xpRefunded),
            level: prev.level,
          }));
          toast("Progress undone");
        }
        return result;
      } catch {
        startTransition(() => setTasks(previousTasks));
        toast.error("Failed to decrement");
        return { success: false, error: "Failed to decrement" };
      }
    },
    [tasks]
  );

  const tabTasks = tasks.filter(
    (t) => t.tier === activeTab && isVisibleMissed(t) && isVisibleCompletedRecurring(t)
  );
  const activeTasks = tabTasks.filter(
    (t) => t.status !== "completed" && t.status !== "missed"
  );
  const missedTasks = tabTasks.filter((t) => t.status === "missed");
  const completedTasks = tabTasks.filter((t) => t.status === "completed");

  const handleReorder = useCallback(
    (reordered: TaskData[]) => {
      const reorderedIds = reordered.map((t) => t.id);
      const previousTasks = [...tasks];
      setTasks((prev) => {
        const otherTasks = prev.filter(
          (t) => t.tier !== activeTab || t.status === "completed" || t.status === "missed"
        );
        const reindexed = reordered.map((t, i) => ({ ...t, sort_order: i }));
        return [...otherTasks, ...reindexed];
      });
      reorderTasks(reorderedIds).catch(() => {
        setTasks(previousTasks);
        toast.error("Failed to save order");
      });
    },
    [activeTab, tasks]
  );

  return (
    <div className="dark-game min-h-dvh flex flex-col md:flex-row bg-game-bg-main text-game-text-main relative">
      {/* ── Ambient glow orbs ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-game-lunar/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-game-equipment/10 rounded-full blur-[120px]" />
      </div>

      {/* ── Subtle grid background ── */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* ── Desktop Sidebar ── */}
      <aside className="relative z-10 hidden md:flex md:w-64 md:flex-col md:border-r md:border-game-border md:p-6 md:gap-6 md:shrink-0 md:h-dvh md:sticky md:top-0 overflow-y-auto bg-game-bg-header">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-sm bg-game-lunar/20 border border-game-lunar/40 flex items-center justify-center">
            <span className="font-display text-sm text-game-lunar">Q</span>
          </div>
          <h1 className="font-display text-xs tracking-wider text-game-text-main">
            QuestBoard
          </h1>
        </div>

        {/* XP HUD */}
        <XPHUD totalXP={xpState.totalXP} level={xpState.level} />

        {/* Separator */}
        <div className="border-t border-game-border" />

        {/* Section heading */}
        <span className="font-display text-[10px] tracking-wider text-game-text-dim">
          Categories
        </span>

        {/* Category nav — vertical pills */}
        <nav className="flex flex-col gap-1" aria-label="Quest categories">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={[
                "flex items-center gap-3 px-3 h-9 rounded-sm text-[11px] uppercase tracking-wider transition-all duration-150 text-left focus-ring",
                activeTab === key
                  ? "bg-game-text-muted/15 text-game-text-main border border-game-text-muted/20"
                  : "text-game-text-dim hover:text-game-text-muted hover:bg-game-bg-panel border border-transparent",
              ].join(" ")}
              aria-label={`Filter by ${label}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="font-display text-[10px]">{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Main Content ── */}
      <div className="relative z-10 flex-1 min-w-0 flex flex-col">
        {/* Sticky top filter bar (desktop) */}
        <header className="hidden md:flex items-center gap-1 px-4 py-3 border-b border-game-border bg-game-bg-main/95 backdrop-blur-md shadow-lg sticky top-0 z-20">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => handleTabChange(key)}
              className={[
                "px-3 py-1.5 rounded-sm text-[10px] uppercase tracking-wider transition-all duration-150 focus-ring",
                activeTab === key
                  ? "bg-game-text-muted text-game-bg-main font-bold border border-game-text-muted"
                  : "bg-transparent text-game-text-muted border border-transparent hover:border-game-text-dim hover:bg-game-bg-panel",
              ].join(" ")}
              aria-label={`Show ${label} quests`}
            >
              {label.toUpperCase()}
            </button>
          ))}
        </header>

        {/* Task grid */}
        <main className="flex-1 p-4 pb-[120px] md:pb-6" role="tabpanel">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {tabTasks.length === 0 ? (
                <EmptyState
                  title="No quests for today"
                  description="Generate some quests in the admin panel to start tracking your habits."
                  actionLabel="Admin Panel"
                  actionHref="/admin"
                />
              ) : (
                <div className="flex flex-col gap-4">
                  {/* Active tasks — reorderable grid */}
                  {activeTasks.length > 0 && (
                    <Reorder.Group
                      axis="y"
                      values={activeTasks}
                      onReorder={handleReorder}
                      as="div"
                      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3"
                    >
                      {activeTasks.map((task) => (
                        <Reorder.Item key={task.id} value={task} as="div">
                          <TaskCard
                            task={task}
                            onIncrement={handleIncrement}
                            onDecrement={handleDecrement}
                            isPending={isPending}
                          />
                        </Reorder.Item>
                      ))}
                    </Reorder.Group>
                  )}

                  {/* Missed tasks */}
                  {missedTasks.length > 0 && (
                    <div>
                      <h3 className="font-display text-[10px] tracking-wider text-game-text-dim mb-2 px-1">
                        Missed
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                        {missedTasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            onIncrement={handleIncrement}
                            onDecrement={handleDecrement}
                            isPending={isPending}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Completed tasks */}
                  {completedTasks.length > 0 && (
                    <div>
                      <h3 className="font-display text-[10px] tracking-wider text-game-text-dim mb-2 px-1">
                        Completed
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                        {completedTasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            onIncrement={handleIncrement}
                            onDecrement={handleDecrement}
                            isPending={isPending}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile tab bar */}
      <MobileTabBar activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}

export function QuestBoard(props: QuestBoardProps) {
  return (
    <XPNotificationProvider>
      <XPNotification />
      <LevelUpOverlay />
      <QuestBoardContent {...props} />
    </XPNotificationProvider>
  );
}
