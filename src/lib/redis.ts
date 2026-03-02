import Redis from "ioredis";
import { env } from "@/lib/env";

let redisClient: Redis | null = null;

export function getRedis() {
  if (!env.redisUrl) {
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis(env.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  return redisClient;
}
