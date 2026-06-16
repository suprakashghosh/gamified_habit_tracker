import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 uses a single URL. For Supabase PgBouncer setups, set
// DATABASE_URL_MIGRATIONS to a session-mode (port 5432) URL for migrations.
// Falls back to DATABASE_URL if not set.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL_MIGRATIONS || env("DATABASE_URL"),
  },
});
