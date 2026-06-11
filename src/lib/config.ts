import fs from "fs";
import path from "path";
import { AppConfigSchema, type AppConfig } from "@/types/config";

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const configPath = path.join(process.cwd(), "gamified.config.json");
  const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const parsed = AppConfigSchema.parse(raw);
  cachedConfig = parsed;
  return parsed;
}

export function getXPConfig() {
  return getConfig().xp;
}

export function getLLMConfig() {
  return getConfig().llm;
}
