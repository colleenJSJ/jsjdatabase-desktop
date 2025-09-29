/**
 * Centralized API Client
 * Provides standardized API calls with consistent error handling,
 * request deduplication, response patterns, and CSRF protection
 */

// Use client-safe CSRF helper (no next/headers)
import { addCSRFToHeaders } from '@/lib/security/csrf-client';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };
}

interface RequestOptions extends RequestInit {
  params?: Record<string, any>;
  timeout?: number;
  dedupe?: boolean;
  retries?: number;
  retryDelay?: number;
}

// Request deduplication cache
const pendingRequests = new Map<string, Promise<Response>>();

// Create a unique cache key for deduplication
function getCacheKey(url: string, options?: RequestOptions): string {
  const params = options?.params ? JSON.stringify(options.params) : '';
  const method = options?.method || 'GET';
  return `${method}:${url}:${params}`;
}

// Add query parameters to URL
function buildUrl(baseUrl: string, params?: Record<string, any>): string {
  if (!params) return baseUrl;
  
  const url = new URL(baseUrl, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  });
  return url.toString();
}

// Sleep function for retry delay
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main fetch wrapper with deduplication and retries
async function fetchWithRetry(
  url: string,
  options: RequestOptions = {},
  retryCount = 0
): Promise<Response> {
  const { 
    params, 
    timeout = 30000, 
    dedupe = true, 
    retries = 3,
    retryDelay = 1000,
    ...fetchOptions 
  } = options;
  
  const fullUrl = buildUrl(url, params);
  const cacheKey = getCacheKey(fullUrl, options);
  
  // Check for pending request (deduplication)
  if (dedupe && pendingRequests.has(cacheKey)) {
    console.log(`[API] Deduplicating request: ${cacheKey}`);
    return pendingRequests.get(cacheKey)!;
  }
  
  // Add CSRF token to headers for mutations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(fetchOptions.method || 'GET')) {
    fetchOptions.headers = addCSRFToHeaders(fetchOptions.headers);
  }
  
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  // Create the fetch promise
  const fetchPromise = fetch(fullUrl, {
    ...fetchOptions,
    signal: controller.signal,
  }).then(response => {
    clearTimeout(timeoutId);
    return response;
  }).catch(async (error) => {
    clearTimeout(timeoutId);
    
    // Retry logic
    if (retryCount < retries - 1) {
      const delay = retryDelay * Math.pow(2, retryCount); // Exponential backoff
      console.log(`[API] Retry ${retryCount + 1}/${retries} after ${delay}ms: ${url}`);
      await sleep(delay);
      return fetchWithRetry(url, options, retryCount + 1);
    }
    
    throw error;
  }).finally(() => {
    // Remove from pending requests
    if (dedupe) {
      pendingRequests.delete(cacheKey);
    }
  });
  
  // Store in pending requests for deduplication
  if (dedupe) {
    pendingRequests.set(cacheKey, fetchPromise);
  }
  
  return fetchPromise;
}

// Generic API request handler
async function apiRequest<T = any>(
  url: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  try {
    const response = await fetchWithRetry(url, options);
    
    // Handle non-2xx responses
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      return {
        success: false,
        error: errorData.error || `Request failed with status ${response.status}`,
      };
    }
    
    // Parse response
    const data = await response.json();
    
    // Standardize response format
    // Handle various response patterns from existing APIs
    if (data.error) {
      return {
        success: false,
        error: data.error,
      };
    }
    
    // Extract metadata if available
    const metadata: any = {};
    if (data.page !== undefined) metadata.page = data.page;
    if (data.limit !== undefined) metadata.limit = data.limit;
    if (data.total !== undefined) metadata.total = data.total;
    if (data.hasMore !== undefined) metadata.hasMore = data.hasMore;
    
    return {
      success: true,
      data: data.data || data,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  } catch (error) {
    console.error('[API] Request failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Request failed',
    };
  }
}

// API Client class with typed methods
export class ApiClient {
  // GET request
  static async get<T = any>(
    url: string, 
    params?: Record<string, any>, 
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    return apiRequest<T>(url, {
      ...options,
      method: 'GET',
      params,
    });
  }
  
  // POST request
  static async post<T = any>(
    url: string, 
    data?: any, 
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    return apiRequest<T>(url, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  }
  
  // PUT request
  static async put<T = any>(
    url: string, 
    data?: any, 
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    return apiRequest<T>(url, {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  }
  
  // DELETE request
  static async delete<T = any>(
    url: string, 
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    return apiRequest<T>(url, {
      ...options,
      method: 'DELETE',
    });
  }
  
  // PATCH request
  static async patch<T = any>(
    url: string, 
    data?: any, 
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    return apiRequest<T>(url, {
      ...options,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  }
}

// Export for use in components
export default ApiClient;
