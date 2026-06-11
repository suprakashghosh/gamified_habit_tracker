import { z } from "zod";

export const LLMConfigSchema = z.object({
  provider: z.enum(["openai"]).default("openai"),
  model: z.string().default("gpt-4o"),
});

export const XPConfigSchema = z.object({
  tier_multipliers: z.object({
    daily: z.number().positive(),
    weekly: z.number().positive(),
    monthly: z.number().positive(),
    longterm: z.number().positive(),
  }),
  base_xp_per_unit: z.number().positive(),
});

export const AppConfigSchema = z.object({
  llm: LLMConfigSchema,
  xp: XPConfigSchema,
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;
export type XPConfig = z.infer<typeof XPConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
