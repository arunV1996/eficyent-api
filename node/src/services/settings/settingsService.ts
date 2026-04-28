import { prisma } from "../../db/prisma";

/**
 * Replacement for Akaunting Setting::get(). Reads from the `settings` table,
 * caches in process memory for the request scope.
 *
 * Be careful: this is not LRU - it grows unbounded across the process
 * lifetime if callers pass dynamic keys. The settings table is small and
 * keys are static, so this is fine.
 */

const cache = new Map<string, { value: string; expiresAt: number }>();
const TTL_MS = 60_000;

export async function settingGet<T = string>(
  key: string,
  fallback?: T,
): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as unknown as T;
  }
  const row = await prisma().setting.findFirst({ where: { key } });
  if (!row) {
    if (fallback !== undefined) return fallback;
    return undefined as unknown as T;
  }
  cache.set(key, { value: row.value, expiresAt: Date.now() + TTL_MS });
  return row.value as unknown as T;
}

export function invalidateSettingCache(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}
