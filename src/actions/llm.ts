"use server";

import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLLMConfig, getXPConfig } from "@/lib/config";
import type { Tier } from "@prisma/client";

// ── Zod Schemas ─────────────────────────────────

const TaskDraftSchema: z.ZodType<TaskDraft> = z.object({
  title: z.string().describe("Short, gamified task title"),
  description: z.string().describe("One-sentence flavorful description of what this task involves"),
  unit: z.string().describe("Measurement unit (e.g., 'pages', 'glasses', 'km', 'chapters')"),
  tier: z.enum(["daily", "weekly", "monthly", "longterm"]),
  max_count: z.number().int().nonnegative().describe("Total count target. 0 for children that need allocation"),
  xp_per_unit: z.number().int().positive().describe("XP awarded per unit completed"),
  is_recurring: z.boolean().describe("true only for standalone tasks without hierarchy"),
  children: z.lazy(() => z.array(TaskDraftSchema)).optional().describe("Child subtasks if this is a hierarchical parent"),
});

type TaskDraft = {
  title: string;
  description: string;
  unit: string;
  tier: Tier;
  max_count: number;
  xp_per_unit: number;
  is_recurring: boolean;
  children?: TaskDraft[];
};

const ClarificationSchema = z.object({
  originalTodo: z.string(),
  questions: z.array(z.string()),
  suggestedUnit: z.string().optional(),
  suggestedTotal: z.number().optional(),
});

const GenerationResponseSchema = z.object({
  tasks: z.array(TaskDraftSchema),
  clarifications: z.array(ClarificationSchema),
});

export type ClarificationFromLLM = z.infer<typeof ClarificationSchema>;

// ── Serialized task shape returned to the client ─

export type DraftTask = {
  id: string;
  title: string;
  description: string | null;
  unit: string;
  tier: Tier;
  parent_id: string | null;
  max_count: number;
  current_count: number;
  xp_per_unit: number;
  is_recurring: boolean;
  is_published: boolean;
  status: string;
  sort_order: number;
  recurrence_group_id: string | null;
  period_start: string | null;
  period_end: string | null;
  expires_at: string | null;
  created_at: string;
  completed_at: string | null;
  children: DraftTask[];
};

// ── OpenRouter provider with project env key ────

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ── Prompt builder ──────────────────────────────

function buildSystemPrompt(): string {
  const xp = getXPConfig();
  const tierDefaults = {
    daily: xp.base_xp_per_unit * xp.tier_multipliers.daily,
    weekly: xp.base_xp_per_unit * xp.tier_multipliers.weekly,
    monthly: xp.base_xp_per_unit * xp.tier_multipliers.monthly,
    longterm: xp.base_xp_per_unit * xp.tier_multipliers.longterm,
  };

  return [
    "You are a task decomposition assistant for a gamified habit tracker called QuestBoard.",
    "",
    "Rules:",
    "- Convert the user's raw todos into quantified, gamified tasks with clear units and totals.",
    "- The root task in each hierarchy must define the unit and the total max_count.",
    "- Child tasks get max_count=0 when their share is unknown; the user will allocate counters later.",
    "- Tier assignment: daily for habits done every day, weekly for weekly goals, monthly for monthly targets, longterm for long-term projects.",
    "- Hierarchy direction is: longterm → monthly → weekly → daily. Each tier can only be the parent of the tier directly below it.",
    "- Multiple todos may be independent standalone tasks or form a single hierarchy.",
    "- Recurring (is_recurring=true) is only allowed for standalone leaf tasks without children and without a parent.",
    "",
    "Default XP per unit by tier (base * multiplier):",
    `- daily: ${tierDefaults.daily}`,
    `- weekly: ${tierDefaults.weekly}`,
    `- monthly: ${tierDefaults.monthly}`,
    `- longterm: ${tierDefaults.longterm}`,
    "",
    "If a todo is ambiguous (e.g. 'exercise more' — what kind? how much?), include it in the clarifications array with focused questions.",
    "",
    "Examples:",
    "",
    `Input: "Read The Pragmatic Programmer — 24 chapters"`,
    "Output:",
    `{`,
    `  "tasks": [{`,
    `    "title": "Read The Pragmatic Programmer",`,
    `    "description": "Read the full book cover-to-cover in two monthly chunks",`,
    `    "unit": "chapters",`,
    `    "tier": "longterm",`,
    `    "max_count": 24,`,
    `    "xp_per_unit": 300,`,
    `    "is_recurring": false,`,
    `    "children": [`,
    `      {"title": "Read 12 chapters (first half)", "description": "Complete the first half of the book", "unit": "chapters", "tier": "monthly", "max_count": 12, "xp_per_unit": 100, "is_recurring": false},`,
    `      {"title": "Read 12 chapters (second half)", "description": "Complete the second half of the book", "unit": "chapters", "tier": "monthly", "max_count": 12, "xp_per_unit": 100, "is_recurring": false}`,
    `    ]`,
    `  }],`,
    `  "clarifications": []`,
    `}`,
    "",
    `Input: "Drink 8 glasses of water every day"`,
    "Output:",
    `{`,
    `  "tasks": [{`,
    `    "title": "Drink 8 glasses of water",`,
    `    "description": "Stay hydrated by drinking enough water daily",`,
    `    "unit": "glasses",`,
    `    "tier": "daily",`,
    `    "max_count": 8,`,
    `    "xp_per_unit": 5,`,
    `    "is_recurring": true,`,
    `    "children": []`,
    `  }],`,
    `  "clarifications": []`,
    `}`,
    "",
    `Input: "Get fit this summer"`,
    "Output:",
    `{`,
    `  "tasks": [],`,
    `  "clarifications": [{`,
    `    "originalTodo": "Get fit this summer",`,
    `    "questions": ["How do you want to measure 'fit'? (e.g., run 5km, gym 3x/week, lose 5kg?)", "What unit would you use to track this?"],`,
    `    "suggestedUnit": "workouts",`,
    `    "suggestedTotal": 48`,
    `  }]`,
    `}`,
  ].join("\n");
}

function buildUserPrompt(rawTodos: string, answers?: Record<string, string>): string {
  const lines = ["Raw todos:", rawTodos];
  if (answers && Object.keys(answers).length > 0) {
    lines.push("", "Previous clarifications answered by the user:");
    for (const [key, value] of Object.entries(answers)) {
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.join("\n");
}

// ── Database helpers ────────────────────────────

async function clearDrafts(): Promise<void> {
  await prisma.task.deleteMany({ where: { is_published: false } });
}

async function insertDraftTasks(
  drafts: TaskDraft[],
  parentId: string | null = null,
  sortOffset = 0
): Promise<void> {
  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i];
    const created = await prisma.task.create({
      data: {
        title: draft.title,
        description: draft.description,
        unit: draft.unit,
        tier: draft.tier,
        parent_id: parentId,
        max_count: draft.max_count,
        current_count: 0,
        xp_per_unit: draft.xp_per_unit,
        is_recurring: draft.is_recurring,
        is_published: false,
        status: "draft",
        sort_order: sortOffset + i,
      },
    });

    if (draft.children && draft.children.length > 0) {
      await insertDraftTasks(draft.children, created.id, 0);
    }
  }
}

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
  tier: Tier;
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
    created_at: task.created_at.toISOString(),
    completed_at: task.completed_at?.toISOString() ?? null,
    period_start: task.period_start?.toISOString() ?? null,
    period_end: task.period_end?.toISOString() ?? null,
    expires_at: task.expires_at?.toISOString() ?? null,
    children: task.children?.map(serializeTask) ?? [],
  };
}

async function fetchSerializedDrafts(): Promise<DraftTask[]> {
  const drafts = await prisma.task.findMany({
    where: { is_published: false },
    include: taskInclude,
    orderBy: [{ sort_order: "asc" }, { created_at: "desc" }],
  });
  return drafts.map(serializeTask);
}

// ── Core generation runner ──────────────────────

async function runGeneration(
  rawTodos: string,
  answers?: Record<string, string>
): Promise<{ tasks: DraftTask[]; clarifications: ClarificationFromLLM[] } | { error: string }> {
  try {
    const llmConfig = getLLMConfig();
    const result = await generateObject({
      model: openrouter(llmConfig.model),
      schema: GenerationResponseSchema,
      system: buildSystemPrompt(),
      prompt: buildUserPrompt(rawTodos, answers),
    });

    const { tasks: drafts, clarifications } = result.object;

    if (drafts.length === 0 && clarifications.length === 0) {
      return { error: "The LLM did not return any tasks or clarifications." };
    }

    await clearDrafts();
    await insertDraftTasks(drafts);

    const serializedTasks = await fetchSerializedDrafts();
    return { tasks: serializedTasks, clarifications };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Server actions ──────────────────────────────

export async function generateTasks(
  rawTodos: string
): Promise<{ tasks: DraftTask[]; clarifications: ClarificationFromLLM[] } | { error: string }> {
  return runGeneration(rawTodos);
}

export async function resolveClarifications(
  rawTodos: string,
  answers: Record<string, string>
): Promise<{ tasks: DraftTask[]; clarifications: ClarificationFromLLM[] } | { error: string }> {
  return runGeneration(rawTodos, answers);
}
