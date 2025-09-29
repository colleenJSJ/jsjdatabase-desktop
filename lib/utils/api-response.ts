/**
 * Standardized API response wrapper
 * Ensures all endpoints return consistent format while maintaining backward compatibility
 */

import { NextResponse } from 'next/server';
import { errorLogger, ErrorLogContext, LogLevel } from './error-logger';

/**
 * Standard API response format
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  items?: T[];
  error?: string;
  message?: string;
  details?: string;
  total?: number;
  page?: number;
  limit?: number;
}

/**
 * Success response helper
 * Maintains backward compatibility with existing frontend expectations
 */
export function successResponse<T>(
  data: T | T[],
  options?: {
    message?: string;
    total?: number;
    page?: number;
    limit?: number;
  }
): NextResponse<ApiResponse<T>> {
  const response: ApiResponse<T> = {
    success: true,
  };

  // Handle array data (use 'items' for arrays as some frontends expect this)
  if (Array.isArray(data)) {
    response.items = data;
  } else {
    response.data = data;
  }

  // Add optional metadata
  if (options?.message) response.message = options.message;
  if (options?.total !== undefined) response.total = options.total;
  if (options?.page !== undefined) response.page = options.page;
  if (options?.limit !== undefined) response.limit = options.limit;

  return NextResponse.json(response);
}

/**
 * Error response helper
 * Maintains backward compatibility while standardizing error format
 */
export function errorResponse(
  error: any,
  context?: ErrorLogContext,
  defaultMessage: string = 'An error occurred'
): NextResponse<ApiResponse> {
  // Log the error if context is provided
  if (context) {
    const level = errorLogger.getLogLevel(error);
    errorLogger.logError(error, context, level);
  }

  // Determine appropriate status code
  let status = 500;
  let errorMessage = defaultMessage;
  let errorDetails: string | undefined;

  if (error instanceof Error) {
    errorMessage = error.message || defaultMessage;
    errorDetails = process.env.NODE_ENV === 'development' ? error.stack : undefined;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else if (error && typeof error === 'object') {
    errorMessage = error.message || error.error || defaultMessage;
    errorDetails = error.details || error.hint;
  }

  // Set appropriate status codes based on error type
  if (errorLogger.isValidationError(error)) {
    status = 400;
  } else if (errorLogger.isAuthError(error)) {
    status = 401;
  } else if (error?.code === 'NOT_FOUND') {
    status = 404;
  } else if (errorLogger.isDatabaseError(error)) {
    status = 503;
  }

  // Build response maintaining backward compatibility
  const response: ApiResponse = {
    success: false,
    error: errorMessage,
  };

  // Add details for development or if they exist
  if (errorDetails) {
    response.details = errorDetails;
  }

  return NextResponse.json(response, { status });
}

/**
 * Pagination helper
 * Ensures consistent pagination response format
 */
export function paginatedResponse<T>(
  items: T[],
  pagination: {
    page: number;
    limit: number;
    total: number;
  }
): NextResponse<ApiResponse<T>> {
  return successResponse(items, {
    total: pagination.total,
    page: pagination.page,
    limit: pagination.limit,
  });
}

/**
 * No content response (204)
 */
export function noContentResponse(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/**
 * Created response (201)
 */
export function createdResponse<T>(
  data: T,
  location?: string
): NextResponse<ApiResponse<T>> {
  const headers = location ? { Location: location } : undefined;
  const response = NextResponse.json(
    {
      success: true,
      data,
    },
    { status: 201, headers }
  );
  return response;
}

/**
 * Validation error response helper
 */
export function validationErrorResponse(
  errors: Record<string, string> | string,
  context?: ErrorLogContext
): NextResponse<ApiResponse> {
  if (context) {
    errorLogger.logError(
      { message: 'Validation error', errors },
      context,
      LogLevel.WARN
    );
  }

  const errorMessage = typeof errors === 'string' 
    ? errors 
    : 'Validation failed';

  const response: ApiResponse = {
    success: false,
    error: errorMessage,
  };

  if (typeof errors === 'object') {
    response.details = JSON.stringify(errors);
  }

  return NextResponse.json(response, { status: 400 });
}

/**
 * Unauthorized response helper
 */
export function unauthorizedResponse(
  message: string = 'Unauthorized',
  context?: ErrorLogContext
): NextResponse<ApiResponse> {
  if (context) {
    errorLogger.logError(
      { message },
      context,
      LogLevel.WARN
    );
  }

  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: 401 }
  );
}

/**
 * Not found response helper
 */
export function notFoundResponse(
  resource: string = 'Resource',
  context?: ErrorLogContext
): NextResponse<ApiResponse> {
  const message = `${resource} not found`;
  
  if (context) {
    errorLogger.logError(
      { message, code: 'NOT_FOUND' },
      context,
      LogLevel.WARN
    );
  }

  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: 404 }
  );
}

/**
 * Method not allowed response helper
 */
export function methodNotAllowedResponse(
  allowedMethods: string[]
): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error: 'Method not allowed',
      details: `Allowed methods: ${allowedMethods.join(', ')}`,
    },
    { 
      status: 405,
      headers: {
        'Allow': allowedMethods.join(', ')
      }
    }
  );
}

/**
 * Service unavailable response helper
 */
export function serviceUnavailableResponse(
  message: string = 'Service temporarily unavailable',
  retryAfter?: number
): NextResponse<ApiResponse> {
  const headers = retryAfter 
    ? { 'Retry-After': retryAfter.toString() }
    : undefined;

  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: 503, headers }
  );
}
