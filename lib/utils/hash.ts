import crypto from 'crypto';

/**
 * Generate SHA-256 hash of content for caching
 */
export function generateContentHash(content: Buffer | string): string {
  const hash = crypto.createHash('sha256');
  
  if (typeof content === 'string') {
    hash.update(content, 'utf8');
  } else {
    hash.update(content);
  }
  
  return hash.digest('hex');
}

/**
 * Generate a cache key combining content hash, user ID, and schema version
 */
export function generateCacheKey(
  contentHash: string, 
  userId: string, 
  schemaVersion: string
): string {
  return `${contentHash}_${userId}_${schemaVersion}`;
}