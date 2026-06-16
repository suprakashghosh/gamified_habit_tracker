"use client";

import { useMemo, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import type { DraftTask } from "@/actions/llm";
import type { Tier } from "@prisma/client";

interface TaskTableProps {
  tasks: DraftTask[];
  onUpdateTask: (id: string, updates: Partial<DraftTask>) => void;
  onUpdateTaskBlur?: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onAddTask: () => void;
  onAddChild: (parentId: string) => void;
  onAllocateChildCounters: (
    parentId: string,
    allocations: { childId: string; maxCount: number }[]
  ) => void;
}

const TIER_OPTIONS: Tier[] = ["daily", "weekly", "monthly", "longterm"];

interface FlatRow {
  task: DraftTask;
  depth: number;
}

function flattenTasks(tasks: DraftTask[], depth = 0): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const task of tasks) {
    rows.push({ task, depth });
    if (task.children.length > 0) {
      rows.push(...flattenTasks(task.children, depth + 1));
    }
  }
  return rows;
}

function buildTaskMap(tasks: DraftTask[]): Map<string, DraftTask> {
  const map = new Map<string, DraftTask>();
  function walk(list: DraftTask[]) {
    for (const t of list) {
      map.set(t.id, t);
      walk(t.children);
    }
  }
  walk(tasks);
  return map;
}

export function TaskTable({
  tasks,
  onUpdateTask,
  onUpdateTaskBlur,
  onDeleteTask,
  onAddTask,
  onAddChild,
  onAllocateChildCounters,
}: TaskTableProps) {
  const rows = useMemo(() => flattenTasks(tasks), [tasks]);
  const taskMap = useMemo(() => buildTaskMap(tasks), [tasks]);
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  function handleNumberChange(
    id: string,
    field: "max_count" | "xp_per_unit",
    value: string
  ) {
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      onUpdateTask(id, { [field]: parsed });
    }
  }

  return (
    <div className="flex flex-col gap-[--spacing-md]">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xs tracking-wider text-game-text-main uppercase">
          Draft quests
        </h2>
        <button
          type="button"
          onClick={onAddTask}
          className="inline-flex items-center gap-[--spacing-xs] bg-game-bg-panel border border-game-border px-[--spacing-md] py-[--spacing-xs] font-display text-[10px] uppercase tracking-wider text-game-text-main transition-colors hover:border-game-border-highlight rounded-sm focus-ring"
        >
          <Plus className="h-4 w-4" />
          Add task
        </button>
      </div>

      <div className="overflow-x-auto bg-game-bg-panel border border-game-border rounded-sm">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-game-border bg-game-bg-header">
              <th className="px-[--spacing-md] py-[--spacing-sm] text-left font-display text-[10px] tracking-wider text-game-text-dim uppercase">Title</th>
              <th className="px-[--spacing-md] py-[--spacing-sm] text-left font-display text-[10px] tracking-wider text-game-text-dim uppercase">Description</th>
              <th className="px-[--spacing-md] py-[--spacing-sm] text-left font-display text-[10px] tracking-wider text-game-text-dim uppercase">Unit</th>
              <th className="px-[--spacing-md] py-[--spacing-sm] text-left font-display text-[10px] tracking-wider text-game-text-dim uppercase">Tier</th>
              <th className="px-[--spacing-md] py-[--spacing-sm] text-left font-display text-[10px] tracking-wider text-game-text-dim uppercase">Max</th>
              <th className="px-[--spacing-md] py-[--spacing-sm] text-left font-display text-[10px] tracking-wider text-game-text-dim uppercase">XP/Unit</th>
              <th className="px-[--spacing-md] py-[--spacing-sm] text-left font-display text-[10px] tracking-wider text-game-text-dim uppercase">Recurring</th>
              <th className="px-[--spacing-md] py-[--spacing-sm] text-left font-display text-[10px] tracking-wider text-game-text-dim uppercase">Allocation</th>
              <th className="px-[--spacing-md] py-[--spacing-sm] text-left font-display text-[10px] tracking-wider text-game-text-dim uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ task, depth }) => {
              const hasChildren = task.children.length > 0;
              const childMaxValues = task.children.map((c) => allocations[c.id] ?? c.max_count);
              const childSum = childMaxValues.reduce((s, v) => s + v, 0);
              const allocated = hasChildren ? childSum === task.max_count : true;
              const parentTitle = task.parent_id ? taskMap.get(task.parent_id)?.title ?? "Unknown" : null;

              return (
                <tr
                  key={task.id}
                  className="border-b border-game-border last:border-b-0 hover:bg-game-bg-header/50"
                >
                  <td className="px-[--spacing-md] py-[--spacing-sm]">
                    <div
                      className="flex items-center gap-[--spacing-xs]"
                      style={{ paddingLeft: `${depth * 16}px` }}
                    >
                      <input
                        type="text"
                        value={task.title}
                        onChange={(e) => onUpdateTask(task.id, { title: e.target.value })}
                        onBlur={() => onUpdateTaskBlur?.(task.id)}
                        className="w-full min-w-[140px] bg-game-bg-main border border-game-border px-[--spacing-sm] py-[--spacing-xs] font-mono text-xs text-game-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-lunar focus-visible:ring-offset-2 focus:border-game-lunar rounded-sm"
                      />
                    </div>
                  </td>
                  <td className="px-[--spacing-md] py-[--spacing-sm]">
                    <input
                      type="text"
                      value={task.description ?? ""}
                      onChange={(e) => onUpdateTask(task.id, { description: e.target.value })}
                      onBlur={() => onUpdateTaskBlur?.(task.id)}
                      className="w-full min-w-[160px] bg-game-bg-main border border-game-border px-[--spacing-sm] py-[--spacing-xs] font-mono text-xs text-game-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-lunar focus-visible:ring-offset-2 focus:border-game-lunar rounded-sm"
                    />
                  </td>
                  <td className="px-[--spacing-md] py-[--spacing-sm]">
                    <input
                      type="text"
                      value={task.unit}
                      onChange={(e) => onUpdateTask(task.id, { unit: e.target.value })}
                      onBlur={() => onUpdateTaskBlur?.(task.id)}
                      className="w-20 bg-game-bg-main border border-game-border px-[--spacing-sm] py-[--spacing-xs] font-mono text-xs text-game-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-lunar focus-visible:ring-offset-2 focus:border-game-lunar rounded-sm"
                    />
                  </td>
                  <td className="px-[--spacing-md] py-[--spacing-sm]">
                    <select
                      value={task.tier}
                      onChange={(e) => onUpdateTask(task.id, { tier: e.target.value as Tier })}
                      className="bg-game-bg-main border border-game-border px-[--spacing-sm] py-[--spacing-xs] font-mono text-xs text-game-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-lunar focus-visible:ring-offset-2 focus:border-game-lunar rounded-sm"
                    >
                      {TIER_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-[--spacing-md] py-[--spacing-sm]">
                    <input
                      type="number"
                      min={0}
                      value={task.max_count}
                      onChange={(e) => handleNumberChange(task.id, "max_count", e.target.value)}
                      onBlur={() => onUpdateTaskBlur?.(task.id)}
                      className="w-20 bg-game-bg-main border border-game-border px-[--spacing-sm] py-[--spacing-xs] font-mono text-xs text-game-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-lunar focus-visible:ring-offset-2 focus:border-game-lunar rounded-sm"
                    />
                  </td>
                  <td className="px-[--spacing-md] py-[--spacing-sm]">
                    <input
                      type="number"
                      min={1}
                      value={task.xp_per_unit}
                      onChange={(e) => handleNumberChange(task.id, "xp_per_unit", e.target.value)}
                      onBlur={() => onUpdateTaskBlur?.(task.id)}
                      className="w-20 bg-game-bg-main border border-game-border px-[--spacing-sm] py-[--spacing-xs] font-mono text-xs text-game-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-lunar focus-visible:ring-offset-2 focus:border-game-lunar rounded-sm"
                    />
                  </td>
                  <td className="px-[--spacing-md] py-[--spacing-sm]">
                    <input
                      type="checkbox"
                      checked={task.is_recurring}
                      disabled={hasChildren || !!task.parent_id}
                      onChange={(e) => onUpdateTask(task.id, { is_recurring: e.target.checked })}
                      className="h-4 w-4 accent-game-lunar disabled:opacity-40"
                    />
                  </td>
                  <td className="px-[--spacing-md] py-[--spacing-sm]">
                    {hasChildren ? (
                      <div className="flex flex-col gap-[--spacing-xs] min-w-[180px]">
                        <div className="flex items-center justify-between gap-[--spacing-xs]">
                          <span className="font-mono text-[10px] text-game-text-muted">
                            Counter Allocation: {childSum} / {task.max_count}
                          </span>
                          <span
                            className={`font-mono text-[10px] ${
                              allocated ? "text-game-uncommon" : "text-game-legendary"
                            }`}
                          >
                            {allocated ? "✓ Balanced" : "✗ Unbalanced"}
                          </span>
                        </div>
                        {task.children.map((child) => (
                          <div key={child.id} className="flex items-center gap-[--spacing-xs]">
                            <span className="flex-1 font-mono text-[10px] text-game-text-muted truncate">
                              {child.title}
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={allocations[child.id] ?? child.max_count}
                              onChange={(e) =>
                                setAllocations((prev) => ({
                                  ...prev,
                                  [child.id]: Math.max(0, parseInt(e.target.value, 10) || 0),
                                }))
                              }
                              className="w-16 bg-game-bg-main border border-game-border px-[--spacing-sm] py-[--spacing-xs] text-center font-mono text-[10px] text-game-text-main outline-none focus:border-game-lunar rounded-sm"
                            />
                            <span className="font-mono text-[10px] text-game-text-muted">
                              {child.unit}
                            </span>
                          </div>
                        ))}
                        <button
                          type="button"
                          disabled={!allocated}
                          onClick={() =>
                            onAllocateChildCounters(
                              task.id,
                              task.children.map((c) => ({
                                childId: c.id,
                                maxCount: allocations[c.id] ?? c.max_count,
                              }))
                            )
                          }
                          className="self-start bg-game-bg-panel border border-game-border px-[--spacing-sm] py-[--spacing-xs] font-mono text-[10px] text-game-text-main transition-colors hover:border-game-border-highlight disabled:opacity-50 disabled:cursor-not-allowed rounded-sm focus-ring"
                        >
                          Allocate
                        </button>
                      </div>
                    ) : parentTitle ? (
                      <span className="font-mono text-[10px] text-game-text-muted">
                        Child of {parentTitle}
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-game-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-[--spacing-md] py-[--spacing-sm]">
                    <div className="flex items-center gap-[--spacing-xs]">
                      <button
                        type="button"
                        onClick={() => onAddChild(task.id)}
                        title="Add child"
                        className="inline-flex h-8 w-8 items-center justify-center bg-game-bg-panel border border-game-border text-game-text-main transition-colors hover:border-game-border-highlight rounded-sm focus-ring"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTask(task.id)}
                        title="Delete"
                        className="inline-flex h-8 w-8 items-center justify-center border border-game-legendary/30 bg-game-legendary/10 text-game-legendary transition-colors hover:bg-game-legendary hover:text-game-bg-main rounded-sm focus-ring"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
