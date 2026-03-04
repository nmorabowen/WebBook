import path from "path";

const configuredContentRoot = process.env.CONTENT_ROOT ?? "content";

export const env = {
  contentRoot: configuredContentRoot,
  authDisabled: process.env.AUTH_DISABLED === "true",
  sessionSecret:
    process.env.SESSION_SECRET ?? "webbook-dev-session-secret-change-me",
  cookieSecure: process.env.COOKIE_SECURE === "true",
  adminUsername: process.env.ADMIN_USERNAME ?? "admin",
  adminPassword: process.env.ADMIN_PASSWORD ?? "webbook-admin",
  adminPasswordHash:
    process.env.ADMIN_PASSWORD_HASH ??
    "$2b$10$G9d2Xx6W.1iQDdORJ5kJ8.h0P.eKgRxuLuxWV0QgGkViCJ75HqsBK",
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
