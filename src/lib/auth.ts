import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getUserByUsername, verifyUserCredentials } from "@/lib/user-store";

const COOKIE_NAME = "webbook_session";

export type SessionPayload = {
  username: string;
  role: "admin" | "editor";
};

function getSecretKey() {
  return new TextEncoder().encode(env.sessionSecret);
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(getSecretKey());
}

export async function verifySessionToken(token?: string | null) {
  if (!token) {
    return null;
  }

  try {
    const result = await jwtVerify<SessionPayload>(token, getSecretKey());
    return result.payload;
  } catch {
    return null;
  }
}

export async function getSession() {
  if (env.authDisabled) {
    return {
      username: env.adminUsername.toLowerCase(),
      role: "admin" as const,
    };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = await verifySessionToken(token);
  if (!payload) {
    return null;
  }

  const user = await getUserByUsername(payload.username);
  if (!user) {
    return null;
  }

  return {
    username: user.username,
    role: user.role,
  };
}

export async function requireSession() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export async function requireAdminSession() {
  const session = await requireSession();

  if (session.role !== "admin") {
    redirect("/app");
  }

  return session;
}

export async function verifyCredentials(username: string, password: string) {
  return verifyUserCredentials(username, password);
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    path: "/",
    maxAge: 0,
  });
}
