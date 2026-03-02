import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";

const COOKIE_NAME = "webbook_session";

type SessionPayload = {
  username: string;
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
  return { username: env.adminUsername };
}

export async function requireSession() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export async function verifyCredentials(username: string, password: string) {
  if (username !== env.adminUsername) {
    return false;
  }

  if (password === env.adminPassword) {
    return true;
  }

  return bcrypt.compare(password, env.adminPasswordHash);
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
