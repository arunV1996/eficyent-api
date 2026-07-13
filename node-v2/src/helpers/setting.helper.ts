import Setting from "../models/setting.model";

/**
 * Replacement for Akaunting Setting::get() (mirror of the legacy /node
 * settingsService). Reads from the `settings` table and caches values
 * in process memory with a short TTL.
 *
 * The cache is not LRU — it grows unbounded if callers pass dynamic
 * keys. The settings table is small and its keys are static, so this
 * is fine in practice.
 */

interface CachedSetting {
    value: string;
    expiresAt: number;
}

const settingCache = new Map<string, CachedSetting>();
const CACHE_TTL_MS = 60_000;

/**
 * Returns the value for a settings key, or the fallback when the key
 * does not exist. Values are cached for 60 seconds.
 */
export const settingGet = async <T = string>(
    key: string,
    fallback?: T,
): Promise<T> => {
    const cachedEntry = settingCache.get(key);
    if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
        return cachedEntry.value as unknown as T;
    }

    const settingRow = await Setting.findOne({ where: { key } });
    if (!settingRow) {
        if (fallback !== undefined) {
            return fallback;
        }
        return undefined as unknown as T;
    }

    settingCache.set(key, {
        value: settingRow.value,
        expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return settingRow.value as unknown as T;
};

/**
 * Drops one key (or the whole cache) so the next settingGet re-reads
 * from the database. Call after updating a settings row.
 */
export const invalidateSettingCache = (key?: string): void => {
    if (key) {
        settingCache.delete(key);
    } else {
        settingCache.clear();
    }
};
