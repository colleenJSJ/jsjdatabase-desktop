/**
 * Redis caching utility for GET request optimization
 * Transparent caching layer that doesn't affect frontend
 */

import { Redis } from '@upstash/redis';

// Cache configuration
const CACHE_CONFIG = {
  // Default TTL in seconds
  defaultTTL: 300, // 5 minutes
  
  // Specific TTLs for different data types
  ttls: {
    users: 3600,        // 1 hour - users don't change often
    tasks: 60,          // 1 minute - tasks change frequently
    documents: 600,     // 10 minutes
    calendar: 30,       // 30 seconds - real-time updates important
    passwords: 0,       // Never cache passwords
    trips: 300,         // 5 minutes
    contacts: 1800,     // 30 minutes
    activity: 10,       // 10 seconds - very dynamic
  },
  
  // Endpoints to never cache
  neverCache: [
    '/api/auth',
    '/api/login',
    '/api/passwords',
    '/api/medical-portals',
  ],
} as const;

class CacheManager {
  private redis: Redis | null = null;
  private localCache: Map<string, { data: any; expiry: number }> = new Map();
  private isEnabled: boolean = true;

  constructor() {
    // Initialize Redis if credentials are available
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      this.redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
    }

    // Cleanup expired local cache entries every minute
    if (typeof window === 'undefined') {
      setInterval(() => this.cleanupLocalCache(), 60000);
    }
  }

  /**
   * Generate cache key from request details
   */
  private generateKey(url: string, params?: Record<string, any>): string {
    const baseKey = url.replace(/^\/api\//, '').replace(/\//g, ':');
    if (params && Object.keys(params).length > 0) {
      const paramString = Object.entries(params)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
      return `api:${baseKey}:${paramString}`;
    }
    return `api:${baseKey}`;
  }

  /**
   * Get TTL for specific endpoint
   */
  private getTTL(endpoint: string): number {
    // Never cache certain endpoints
    if (CACHE_CONFIG.neverCache.some(pattern => endpoint.includes(pattern))) {
      return 0;
    }

    // Find matching TTL config
    for (const [key, ttl] of Object.entries(CACHE_CONFIG.ttls)) {
      if (endpoint.includes(key)) {
        return ttl;
      }
    }

    return CACHE_CONFIG.defaultTTL;
  }

  /**
   * Get cached data
   */
  async get(url: string, params?: Record<string, any>): Promise<any | null> {
    if (!this.isEnabled) return null;

    const ttl = this.getTTL(url);
    if (ttl === 0) return null;

    const key = this.generateKey(url, params);

    try {
      // Try Redis first
      if (this.redis) {
        const cached = await this.redis.get(key);
        if (cached) {
          console.log(`[Cache] HIT: ${key}`);
          return cached;
        }
      } else {
        // Fallback to local cache
        const local = this.localCache.get(key);
        if (local && local.expiry > Date.now()) {
          console.log(`[Cache] LOCAL HIT: ${key}`);
          return local.data;
        }
      }
    } catch (error) {
      console.error('[Cache] Error getting cache:', error);
    }

    console.log(`[Cache] MISS: ${key}`);
    return null;
  }

  /**
   * Set cached data
   */
  async set(url: string, data: any, params?: Record<string, any>): Promise<void> {
    if (!this.isEnabled) return;

    const ttl = this.getTTL(url);
    if (ttl === 0) return;

    const key = this.generateKey(url, params);

    try {
      if (this.redis) {
        await this.redis.set(key, data, { ex: ttl });
        console.log(`[Cache] SET: ${key} (TTL: ${ttl}s)`);
      } else {
        // Fallback to local cache
        this.localCache.set(key, {
          data,
          expiry: Date.now() + (ttl * 1000),
        });
        console.log(`[Cache] LOCAL SET: ${key} (TTL: ${ttl}s)`);
      }
    } catch (error) {
      console.error('[Cache] Error setting cache:', error);
    }
  }

  /**
   * Invalidate cache for specific patterns
   */
  async invalidate(pattern: string): Promise<void> {
    try {
      if (this.redis) {
        // Get all keys matching pattern
        const keys = await this.redis.keys(`api:${pattern}*`);
        if (keys.length > 0) {
          await Promise.all(keys.map(key => this.redis!.del(key)));
          console.log(`[Cache] Invalidated ${keys.length} keys matching: ${pattern}`);
        }
      } else {
        // Local cache invalidation
        const keysToDelete: string[] = [];
        for (const key of this.localCache.keys()) {
          if (key.includes(pattern)) {
            keysToDelete.push(key);
          }
        }
        keysToDelete.forEach(key => this.localCache.delete(key));
        if (keysToDelete.length > 0) {
          console.log(`[Cache] Local invalidated ${keysToDelete.length} keys`);
        }
      }
    } catch (error) {
      console.error('[Cache] Error invalidating cache:', error);
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    try {
      if (this.redis) {
        const keys = await this.redis.keys('api:*');
        if (keys.length > 0) {
          await Promise.all(keys.map(key => this.redis!.del(key)));
          console.log(`[Cache] Cleared ${keys.length} cached items`);
        }
      }
      this.localCache.clear();
    } catch (error) {
      console.error('[Cache] Error clearing cache:', error);
    }
  }

  /**
   * Clean up expired local cache entries
   */
  private cleanupLocalCache(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.localCache.entries()) {
      if (value.expiry < now) {
        this.localCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[Cache] Cleaned up ${cleaned} expired local cache entries`);
    }
  }

  /**
   * Disable caching (useful for testing)
   */
  disable(): void {
    this.isEnabled = false;
    console.log('[Cache] Caching disabled');
  }

  /**
   * Enable caching
   */
  enable(): void {
    this.isEnabled = true;
    console.log('[Cache] Caching enabled');
  }
}

// Export singleton instance
export const cache = new CacheManager();

/**
 * Cache middleware for GET requests
 * Use this wrapper to add transparent caching to any GET endpoint
 */
export async function withCache<T>(
  url: string,
  fetcher: () => Promise<T>,
  params?: Record<string, any>
): Promise<T> {
  // Try to get from cache
  const cached = await cache.get(url, params);
  if (cached) {
    return cached as T;
  }

  // Fetch fresh data
  const data = await fetcher();

  // Store in cache
  await cache.set(url, data, params);

  return data;
}

/**
 * Invalidation helper for write operations
 * Call this after any CREATE, UPDATE, or DELETE operation
 */
export async function invalidateRelatedCache(entityType: string, operation: 'create' | 'update' | 'delete'): Promise<void> {
  // Invalidate specific entity cache
  await cache.invalidate(entityType);

  // Invalidate related caches based on entity type
  switch (entityType) {
    case 'tasks':
      await cache.invalidate('activity');
      await cache.invalidate('dashboard');
      break;
    
    case 'calendar-events':
      await cache.invalidate('calendar');
      await cache.invalidate('dashboard');
      break;
    
    case 'trips':
      await cache.invalidate('travel');
      await cache.invalidate('calendar');
      break;
    
    case 'documents':
      await cache.invalidate('activity');
      break;
    
    case 'users':
      // User changes might affect many things
      await cache.clear();
      break;
  }

  console.log(`[Cache] Invalidated caches for ${entityType} ${operation}`);
}