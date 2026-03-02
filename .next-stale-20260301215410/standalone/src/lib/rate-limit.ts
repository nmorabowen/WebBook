import { createHash } from "crypto";
import { env } from "@/lib/env";
import { getRedis } from "@/lib/redis";

type WindowRule = {
  limit: number;
  seconds: number;
};

const memoryStore = new Map<string, { count: number; resetAt: number }>();

async function incrementCounter(key: string, rule: WindowRule) {
  const redis = getRedis();
  if (redis) {
    await redis.connect().catch(() => null);
    const total = await redis.incr(key);
    if (total === 1) {
      await redis.expire(key, rule.seconds);
    }
    const ttl = await redis.ttl(key);
    return {
      count: total,
      resetAt: Date.now() + Math.max(ttl, 0) * 1000,
    };
  }

  const existing = memoryStore.get(key);
  const now = Date.now();
  if (!existing || existing.resetAt <= now) {
    const next = { count: 1, resetAt: now + rule.seconds * 1000 };
    memoryStore.set(key, next);
    return next;
  }
  existing.count += 1;
  memoryStore.set(key, existing);
  return existing;
}

export async function enforcePublicExecutionLimit(ip: string) {
  const rules: WindowRule[] = [
    { limit: env.executionWindowMinute, seconds: 60 },
    { limit: env.executionWindowHour, seconds: 3600 },
  ];

  for (const rule of rules) {
    const hash = createHash("sha1")
      .update(`${ip}:${rule.seconds}:${new Date().toISOString().slice(0, 13)}`)
      .digest("hex");
    const key = `exec:${rule.seconds}:${hash}`;
    const counter = await incrementCounter(key, rule);
    if (counter.count > rule.limit) {
      return {
        ok: false,
        retryAfter: Math.max(1, Math.ceil((counter.resetAt - Date.now()) / 1000)),
      };
    }
  }

  return { ok: true as const };
}

const executionCache = new Map<string, { payload: string; expiresAt: number }>();

export async function getExecutionCache<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (redis) {
    await redis.connect().catch(() => null);
    const payload = await redis.get(`exec-cache:${key}`);
    return payload ? (JSON.parse(payload) as T) : null;
  }

  const entry = executionCache.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    executionCache.delete(key);
    return null;
  }
  return JSON.parse(entry.payload) as T;
}

export async function setExecutionCache(key: string, payload: unknown, ttlSeconds = 300) {
  const redis = getRedis();
  if (redis) {
    await redis.connect().catch(() => null);
    await redis.set(`exec-cache:${key}`, JSON.stringify(payload), "EX", ttlSeconds);
    return;
  }

  executionCache.set(key, {
    payload: JSON.stringify(payload),
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}
