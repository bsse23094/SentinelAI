/**
 * Result Cache
 * In-memory SHA-256 based cache to avoid redundant API calls
 * when the same code is analyzed multiple times.
 */

import * as crypto from "crypto";
import { Issue } from "../types";

interface CacheEntry {
  issues: Issue[];
  timestamp: number;
}


const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

class ResultCache {
  private cache = new Map<string, CacheEntry>();

  /**
   * Generate a hash from the code content and analysis parameters.
   */
  private computeHash(code: string, language: string, agents: string[]): string {
    const payload = `${code}|${language}|${agents.sort().join(",")}`;
    return crypto.createHash("sha256").update(payload).digest("hex");
  }

  /**
   * Try to get cached results. Returns null on cache miss.
   */
  get(code: string, language: string, agents: string[]): Issue[] | null {
    const hash = this.computeHash(code, language, agents);
    const entry = this.cache.get(hash);

    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > CACHE_TTL) {
      this.cache.delete(hash);
      return null;
    }

    return entry.issues;
  }

  /**
   * Store analysis results in cache.
   */
  set(code: string, language: string, agents: string[], issues: Issue[]): void {
    const hash = this.computeHash(code, language, agents);
    this.cache.set(hash, { issues, timestamp: Date.now() });

    // Evict old entries if cache grows too large
    if (this.cache.size > 200) {
      this.cleanup();
    }
  }

  /**
   * Clear expired entries.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cached results.
   */
  clear(): void {
    this.cache.clear();
  }
}

// Singleton instance
export const resultCache = new ResultCache();
