import { defineConfig } from "drizzle-kit";
import path from "path";

// `pnpm --filter @workspace/db run push` runs with this package's directory
// as cwd, not artifacts/api-server (where .env actually lives) — so unlike
// the server's own start script (which uses --env-file-if-exists=.env),
// DATABASE_URL isn't already in process.env here unless the shell set it
// manually. Load it directly from the same .env file instead, so `push`
// works standalone without any manual $env: step.
try {
  process.loadEnvFile(path.join(__dirname, "../../artifacts/api-server/.env"));
} catch {
  // no .env file there — fine, DATABASE_URL may already be set another way
  // (e.g. Replit Secrets in a deployed environment)
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// drizzle-kit matches this against its internal file glob, which treats
// backslashes as escape characters rather than path separators — so on
// Windows, path.join()'s native "C:\...\index.ts" silently matches nothing.
// Forward slashes work on both platforms and avoid that entirely.
const schemaPath = path.join(__dirname, "./src/schema/index.ts").split(path.sep).join("/");

export default defineConfig({
  schema: schemaPath,
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
