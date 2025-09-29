/**
 * Error recovery utilities for handling Promise.allSettled and other failures
 */

import { z } from 'zod';

export interface SettledResult<T> {
  status: 'fulfilled' | 'rejected';
  value?: T;
  reason?: any;
}

export interface RecoveryOptions {
  maxRetries?: number;
  retryDelay?: number;
  fallbackValue?: any;
  logError?: boolean;
  onError?: (error: any) => void;
}

/**
 * Process Promise.allSettled results with error recovery
 */
export function processSettledResults<T extends any[]>(
  results: PromiseSettledResult<T[number]>[],
  labels: string[] = []
): {
  successful: T;
  failed: Array<{ label: string; error: any }>;
  successRate: number;
} {
  const successful: any[] = [];
  const failed: Array<{ label: string; error: any }> = [];

  results.forEach((result, index) => {
    const label = labels[index] || `Operation ${index + 1}`;
    
    if (result.status === 'fulfilled') {
      successful.push(result.value);
    } else {
      failed.push({
        label,
        error: result.reason,
      });
      
      console.error(`[Error Recovery] ${label} failed:`, result.reason);
    }
  });

  const successRate = successful.length / results.length;

  return {
    successful: successful as T,
    failed,
    successRate,
  };
}

/**
 * Retry a failed operation with exponential backoff
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: RecoveryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    fallbackValue,
    logError = true,
    onError,
  } = options;

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (logError) {
        console.error(`[Retry] Attempt ${attempt + 1}/${maxRetries + 1} failed:`, error);
      }
      
      if (onError) {
        onError(error);
      }
      
      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
  if (fallbackValue !== undefined) {
    console.warn('[Retry] Using fallback value after all retries failed');
    return fallbackValue;
  }

  throw lastError;
}

/**
 * Execute operations with automatic recovery
 */
export async function executeWithRecovery<T>(
  operations: Array<{
    name: string;
    operation: () => Promise<T>;
    critical?: boolean;
    fallback?: T;
  }>
): Promise<{
  results: Map<string, T | undefined>;
  errors: Map<string, any>;
  allSuccessful: boolean;
}> {
  const results = new Map<string, T | undefined>();
  const errors = new Map<string, any>();

  const promises = operations.map(async ({ name, operation, critical, fallback }) => {
    try {
      const result = await retryOperation(operation, {
        maxRetries: critical ? 3 : 1,
        fallbackValue: fallback,
        logError: critical,
      });
      results.set(name, result);
      return { name, success: true, result };
    } catch (error) {
      errors.set(name, error);
      if (fallback !== undefined) {
        results.set(name, fallback);
      }
      if (critical) {
        throw new Error(`Critical operation '${name}' failed: ${error}`);
      }
      return { name, success: false, error };
    }
  });

  const outcomes = await Promise.allSettled(promises);
  const allSuccessful = outcomes.every(outcome => 
    outcome.status === 'fulfilled' && outcome.value.success
  );

  return {
    results,
    errors,
    allSuccessful,
  };
}

/**
 * Validate and recover data with Zod schema
 */
export function validateWithRecovery<T>(
  data: unknown,
  schema: z.ZodSchema<T>,
  options: {
    partial?: boolean;
    stripUnknown?: boolean;
    fallback?: T;
    onError?: (error: z.ZodError) => void;
  } = {}
): { data: T | null; errors: z.ZodError | null; recovered: boolean } {
  const { partial = false, stripUnknown = true, fallback, onError } = options;

  try {
    // Attempt validation
    const validationSchema = partial 
      ? (schema as any).partial() 
      : schema;
    
    const result = stripUnknown
      ? validationSchema.safeParse(data)
      : validationSchema.strict().safeParse(data);

    if (result.success) {
      return { data: result.data, errors: null, recovered: false };
    }

    // Validation failed
    if (onError) {
      onError(result.error);
    }

    // Try to recover with partial data if allowed
    if (partial && !result.success) {
      const partialResult = (schema as any).partial().safeParse(data);
      if (partialResult.success) {
        console.warn('[Validation] Recovered with partial data');
        return { 
          data: partialResult.data, 
          errors: result.error, 
          recovered: true 
        };
      }
    }

    // Use fallback if provided
    if (fallback !== undefined) {
      console.warn('[Validation] Using fallback value');
      return { data: fallback, errors: result.error, recovered: true };
    }

    return { data: null, errors: result.error, recovered: false };
  } catch (error) {
    console.error('[Validation] Unexpected error:', error);
    return { 
      data: fallback || null, 
      errors: error as z.ZodError, 
      recovered: !!fallback 
    };
  }
}

/**
 * Create a resilient data fetcher with validation
 */
export function createResilientFetcher<T>(
  fetcher: () => Promise<unknown>,
  schema: z.ZodSchema<T>,
  options: RecoveryOptions & { validationFallback?: T } = {}
) {
  return async (): Promise<{ data: T | null; error: any | null }> => {
    try {
      // Fetch with retry
      const rawData = await retryOperation(fetcher, options);
      
      // Validate with recovery
      const { data, errors, recovered } = validateWithRecovery(
        rawData,
        schema,
        {
          partial: true,
          fallback: options.validationFallback,
        }
      );
      
      if (data) {
        if (recovered) {
          console.warn('[Resilient Fetcher] Data recovered with fallback or partial validation');
        }
        return { data, error: errors };
      }
      
      return { data: null, error: errors || new Error('Validation failed') };
    } catch (error) {
      console.error('[Resilient Fetcher] Failed to fetch data:', error);
      return { 
        data: options.validationFallback || null, 
        error 
      };
    }
  };
}

/**
 * Batch operations with partial failure handling
 */
export async function batchOperationsWithRecovery<T>(
  items: T[],
  operation: (item: T, index: number) => Promise<any>,
  options: {
    concurrency?: number;
    continueOnError?: boolean;
    onItemError?: (item: T, error: any, index: number) => void;
  } = {}
): Promise<{
  successful: any[];
  failed: Array<{ item: T; error: any; index: number }>;
  successRate: number;
}> {
  const {
    concurrency = 5,
    continueOnError = true,
    onItemError,
  } = options;

  const successful: any[] = [];
  const failed: Array<{ item: T; error: any; index: number }> = [];

  // Process in batches
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, Math.min(i + concurrency, items.length));
    const batchPromises = batch.map(async (item, batchIndex) => {
      const index = i + batchIndex;
      try {
        const result = await operation(item, index);
        successful.push(result);
        return { success: true, result };
      } catch (error) {
        failed.push({ item, error, index });
        if (onItemError) {
          onItemError(item, error, index);
        }
        if (!continueOnError) {
          throw error;
        }
        return { success: false, error };
      }
    });

    await Promise.allSettled(batchPromises);
  }

  const successRate = successful.length / items.length;

  return {
    successful,
    failed,
    successRate,
  };
}