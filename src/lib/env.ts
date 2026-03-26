import path from "path";
import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";

const DEV_SESSION_SECRET = "webbook-dev-session-secret-change-me";
const DEV_ADMIN_PASSWORD_HASH =
  "$2b$10$G9d2Xx6W.1iQDdORJ5kJ8.h0P.eKgRxuLuxWV0QgGkViCJ75HqsBK";

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  CONTENT_ROOT: z.string().optional(),
  SITE_URL: z.string().url().optional(),
  DOMAIN: z.string().optional(),
  AUTH_DISABLED: z.enum(["true", "false"]).optional(),
  SESSION_SECRET: z.string().optional(),
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  PYTHON_RUNNER_URL: z.string().url().optional(),
  REDIS_URL: z.string().optional(),
  EXECUTION_PER_MINUTE_LIMIT: z
    .string()
    .regex(/^\d+$/, "EXECUTION_PER_MINUTE_LIMIT must be a positive integer")
    .optional(),
  EXECUTION_PER_HOUR_LIMIT: z
    .string()
    .regex(/^\d+$/, "EXECUTION_PER_HOUR_LIMIT must be a positive integer")
    .optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const messages = parsed.error.issues.map((i) => `  ${i.path[0]}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${messages}`);
}

if (isProd) {
  const secret = process.env.SESSION_SECRET ?? DEV_SESSION_SECRET;
  if (secret === DEV_SESSION_SECRET) {
    throw new Error(
      "SESSION_SECRET must be set to a strong random value in production. " +
        "The default development secret cannot be used.",
    );
  }

  const hash = process.env.ADMIN_PASSWORD_HASH ?? DEV_ADMIN_PASSWORD_HASH;
  if (hash === DEV_ADMIN_PASSWORD_HASH) {
    throw new Error(
      "ADMIN_PASSWORD_HASH must be set in production. " +
        "The default development hash cannot be used.",
    );
  }
}

const configuredContentRoot = process.env.CONTENT_ROOT ?? "content";
const configuredSiteUrl =
  process.env.SITE_URL ??
  (process.env.DOMAIN ? `https://${process.env.DOMAIN}` : "http://localhost:3000");

function normalizeSiteUrl(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export const env = {
  contentRoot: configuredContentRoot,
  siteUrl: normalizeSiteUrl(configuredSiteUrl),
  authDisabled: process.env.AUTH_DISABLED === "true",
  sessionSecret: process.env.SESSION_SECRET ?? DEV_SESSION_SECRET,
  cookieSecure: process.env.COOKIE_SECURE === "true",
  adminUsername: process.env.ADMIN_USERNAME ?? "admin",
  adminPassword: process.env.ADMIN_PASSWORD ?? "webbook-admin",
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH ?? DEV_ADMIN_PASSWORD_HASH,
  pythonRunnerUrl:
    process.env.PYTHON_RUNNER_URL ?? "http://python-runner:8001/execute",
  redisUrl: process.env.REDIS_URL ?? "",
  executionWindowMinute:
    Number(process.env.EXECUTION_PER_MINUTE_LIMIT ?? "5") || 5,
  executionWindowHour:
    Number(process.env.EXECUTION_PER_HOUR_LIMIT ?? "20") || 20,
};

export function resolveContentRoot() {
  return path.resolve(process.cwd(), env.contentRoot);
}

export function getWorkspaceStorageLayout() {
  const root = resolveContentRoot();
  const systemRoot = path.join(root, ".webbook");
  return {
    configuredContentRoot: env.contentRoot,
    root,
    books: path.join(root, "books"),
    notes: path.join(root, "notes"),
    systemRoot,
    uploads: path.join(systemRoot, "uploads"),
    revisions: path.join(systemRoot, "revisions"),
    settings: path.join(systemRoot, "settings.json"),
    users: path.join(systemRoot, "users.json"),
  };
}
