import bcrypt from "bcryptjs";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { env } from "@/lib/env";
import { safeJsonParse } from "@/lib/utils";

export const userRoleSchema = z.enum(["admin", "editor"]);

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i)
  .transform((value) => value.toLowerCase());

const storedUserSchema = z.object({
  username: usernameSchema,
  role: userRoleSchema,
  passwordHash: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const userStoreSchema = z.object({
  users: z.array(storedUserSchema),
});

export const createUserSchema = z.object({
  username: usernameSchema,
  role: userRoleSchema.default("editor"),
  password: z.string().min(8).max(128),
});

export const adminResetPasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

export const updateUserRoleSchema = z.object({
  role: userRoleSchema,
});

export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    nextPassword: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((input) => input.nextPassword === input.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type UserRole = z.infer<typeof userRoleSchema>;
export type StoredUser = z.infer<typeof storedUserSchema>;
export type PublicUserRecord = Omit<StoredUser, "passwordHash">;

const usersFilePath = path.join(
  process.cwd(),
  env.contentRoot,
  ".webbook",
  "users.json",
);

function sanitizeUser(user: StoredUser): PublicUserRecord {
  const { passwordHash, ...publicUser } = user;
  void passwordHash;
  return publicUser;
}

function sortUsers(users: StoredUser[]) {
  return [...users].sort((left, right) => {
    if (left.role !== right.role) {
      return left.role === "admin" ? -1 : 1;
    }
    return left.username.localeCompare(right.username);
  });
}

function countAdmins(users: StoredUser[]) {
  return users.filter((user) => user.role === "admin").length;
}

async function ensureUserDirectory() {
  await fs.mkdir(path.dirname(usersFilePath), { recursive: true });
}

async function writeUserStore(users: StoredUser[]) {
  await ensureUserDirectory();
  const tempPath = `${usersFilePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(
    tempPath,
    JSON.stringify({ users: sortUsers(users) }, null, 2),
    "utf8",
  );
  await fs.rename(tempPath, usersFilePath);
}

async function bootstrapAdminPasswordHash() {
  if (process.env.ADMIN_PASSWORD) {
    return bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
  }
  return env.adminPasswordHash;
}

async function buildBootstrapAdminUser(): Promise<StoredUser> {
  const now = new Date().toISOString();
  return {
    username: env.adminUsername.toLowerCase(),
    role: "admin",
    passwordHash: await bootstrapAdminPasswordHash(),
    createdAt: now,
    updatedAt: now,
  };
}

async function readUserStore() {
  try {
    const raw = await fs.readFile(usersFilePath, "utf8");
    const parsed = safeJsonParse<Record<string, unknown>>(raw, {});
    return userStoreSchema.parse(parsed);
  } catch {
    return null;
  }
}

async function ensureWritableUserStore() {
  const existing = await readUserStore();
  if (existing) {
    return existing;
  }

  const adminUser = await buildBootstrapAdminUser();
  const nextStore = { users: [adminUser] };
  await writeUserStore(nextStore.users);
  return nextStore;
}

export async function ensureUserStoreFile() {
  await ensureWritableUserStore();
}

export async function validateUserStoreFile(filePath: string) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    userStoreSchema.parse(JSON.parse(raw) as unknown);
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code === "ENOENT") {
      return;
    }
    throw new Error("Imported workspace users are invalid");
  }
}

export async function listUsers(): Promise<PublicUserRecord[]> {
  const store = await readUserStore();
  if (store) {
    return sortUsers(store.users).map(sanitizeUser);
  }

  return [sanitizeUser(await buildBootstrapAdminUser())];
}

export async function getUserByUsername(username: string) {
  const normalizedUsername = username.trim().toLowerCase();
  const store = await readUserStore();
  if (store) {
    return store.users.find((user) => user.username === normalizedUsername) ?? null;
  }

  if (normalizedUsername === env.adminUsername.toLowerCase()) {
    return buildBootstrapAdminUser();
  }

  return null;
}

export async function verifyUserCredentials(username: string, password: string) {
  const normalizedUsername = username.trim().toLowerCase();
  const store = await readUserStore();
  const storedUser = store?.users.find((user) => user.username === normalizedUsername);

  if (storedUser) {
    const matches = await bcrypt.compare(password, storedUser.passwordHash);
    return matches ? sanitizeUser(storedUser) : null;
  }

  if (normalizedUsername !== env.adminUsername.toLowerCase()) {
    return null;
  }

  if (password === env.adminPassword) {
    return sanitizeUser(await buildBootstrapAdminUser());
  }

  const hashMatches = await bcrypt.compare(password, env.adminPasswordHash);
  return hashMatches ? sanitizeUser(await buildBootstrapAdminUser()) : null;
}

export async function createUser(input: unknown) {
  const data = createUserSchema.parse(input);
  const store = await ensureWritableUserStore();
  if (store.users.some((user) => user.username === data.username)) {
    throw new Error("A user with that username already exists");
  }

  const now = new Date().toISOString();
  const nextUser: StoredUser = {
    username: data.username,
    role: data.role,
    passwordHash: await bcrypt.hash(data.password, 10),
    createdAt: now,
    updatedAt: now,
  };

  await writeUserStore([...store.users, nextUser]);
  return sanitizeUser(nextUser);
}

export async function updateUserPassword(username: string, password: string) {
  const normalizedUsername = username.trim().toLowerCase();
  const store = await ensureWritableUserStore();
  const targetUser = store.users.find((user) => user.username === normalizedUsername);
  if (!targetUser) {
    throw new Error("User not found");
  }

  const now = new Date().toISOString();
  const nextHash = await bcrypt.hash(password, 10);
  const nextUsers = store.users.map((user) =>
    user.username === normalizedUsername
      ? {
          ...user,
          passwordHash: nextHash,
          updatedAt: now,
        }
      : user,
  );

  await writeUserStore(nextUsers);
  return sanitizeUser(
    nextUsers.find((user) => user.username === normalizedUsername)!,
  );
}

export async function updateUserRole(username: string, role: UserRole) {
  const normalizedUsername = username.trim().toLowerCase();
  const store = await ensureWritableUserStore();
  const targetUser = store.users.find((user) => user.username === normalizedUsername);
  if (!targetUser) {
    throw new Error("User not found");
  }

  if (targetUser.role === role) {
    return sanitizeUser(targetUser);
  }

  if (
    targetUser.role === "admin" &&
    role !== "admin" &&
    countAdmins(store.users) === 1
  ) {
    throw new Error("At least one admin account must remain");
  }

  const now = new Date().toISOString();
  const nextUsers = store.users.map((user) =>
    user.username === normalizedUsername
      ? {
          ...user,
          role,
          updatedAt: now,
        }
      : user,
  );

  await writeUserStore(nextUsers);
  return sanitizeUser(nextUsers.find((user) => user.username === normalizedUsername)!);
}

export async function changeOwnPassword(
  username: string,
  currentPassword: string,
  nextPassword: string,
) {
  const currentUser = await verifyUserCredentials(username, currentPassword);
  if (!currentUser) {
    throw new Error("Current password is incorrect");
  }

  return updateUserPassword(currentUser.username, nextPassword);
}
