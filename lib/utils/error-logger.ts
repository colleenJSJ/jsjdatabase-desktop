/**
 * Centralized error logging utility
 * Logs errors for debugging while maintaining existing response formats
 */

import { NextResponse } from 'next/server';

export interface ErrorLogContext {
  endpoint: string;
  method: string;
  userId?: string;
  requestBody?: any;
  queryParams?: any;
  additionalContext?: Record<string, any>;
}

export interface ErrorDetails {
  message: string;
  stack?: string;
  code?: string;
  name?: string;
  cause?: any;
}

/**
 * Log levels for different error severities
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}

/**
 * Error logger class for centralized error tracking
 */
class ErrorLogger {
  private isDevelopment = process.env.NODE_ENV !== 'production';

  /**
   * Log an error with context
   */
  logError(
    error: Error | any,
    context: ErrorLogContext,
    level: LogLevel = LogLevel.ERROR
  ): void {
    const timestamp = new Date().toISOString();
    const errorDetails = this.extractErrorDetails(error);

    const logEntry = {
      timestamp,
      level,
      endpoint: context.endpoint,
      method: context.method,
      userId: context.userId,
      error: {
        message: errorDetails.message,
        name: errorDetails.name,
        code: errorDetails.code,
        ...(this.isDevelopment && { stack: errorDetails.stack }),
      },
      ...(this.isDevelopment && {
        requestBody: context.requestBody,
        queryParams: context.queryParams,
        additionalContext: context.additionalContext,
      }),
    };

    // Log to console with appropriate method
    switch (level) {
      case LogLevel.DEBUG:
        console.debug('[API Error]', JSON.stringify(logEntry, null, 2));
        break;
      case LogLevel.INFO:
        console.info('[API Error]', JSON.stringify(logEntry, null, 2));
        break;
      case LogLevel.WARN:
        console.warn('[API Error]', JSON.stringify(logEntry, null, 2));
        break;
      case LogLevel.FATAL:
      case LogLevel.ERROR:
        console.error('[API Error]', JSON.stringify(logEntry, null, 2));
        break;
    }

    // In production, you could send to external service like Sentry
    if (!this.isDevelopment && level >= LogLevel.ERROR) {
      // TODO: Send to external error tracking service
      // Example: Sentry.captureException(error, { extra: context });
    }
  }

  /**
   * Extract error details from various error types
   */
  private extractErrorDetails(error: any): ErrorDetails {
    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack,
        name: error.name,
        cause: error.cause,
      };
    }

    if (typeof error === 'string') {
      return { message: error };
    }

    if (error && typeof error === 'object') {
      return {
        message: error.message || error.error || JSON.stringify(error),
        code: error.code,
        name: error.name,
        stack: error.stack,
      };
    }

    return { message: String(error) };
  }

  /**
   * Check if error is a database error
   */
  isDatabaseError(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';
    return (
      errorMessage.includes('supabase') ||
      errorMessage.includes('database') ||
      errorMessage.includes('postgres') ||
      error?.code?.startsWith('P') || // PostgreSQL error codes
      error?.code === 'ECONNREFUSED'
    );
  }

  /**
   * Check if error is an authentication error
   */
  isAuthError(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';
    return (
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('jwt') ||
      error?.code === 'AUTH_ERROR'
    );
  }

  /**
   * Check if error is a validation error
   */
  isValidationError(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';
    return (
      errorMessage.includes('validation') ||
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      error?.code === 'VALIDATION_ERROR'
    );
  }

  /**
   * Get appropriate log level based on error type
   */
  getLogLevel(error: any): LogLevel {
    if (this.isValidationError(error)) {
      return LogLevel.WARN;
    }
    if (this.isAuthError(error)) {
      return LogLevel.WARN;
    }
    if (this.isDatabaseError(error)) {
      return LogLevel.ERROR;
    }
    return LogLevel.ERROR;
  }
}

// Export singleton instance
export const errorLogger = new ErrorLogger();

/**
 * Wrapper function to log errors while maintaining existing response format
 * This preserves the current API response structure
 */
export function logErrorAndReturn(
  error: any,
  context: ErrorLogContext,
  defaultMessage: string = 'Internal server error'
): NextResponse {
  // Log the error with appropriate level
  const level = errorLogger.getLogLevel(error);
  errorLogger.logError(error, context, level);

  // Determine status code based on error type
  let status = 500;
  if (errorLogger.isValidationError(error)) {
    status = 400;
  } else if (errorLogger.isAuthError(error)) {
    status = 401;
  } else if (errorLogger.isDatabaseError(error)) {
    status = 503;
  }

  // Return response in existing format to maintain compatibility
  // Different endpoints use different formats, so we check context
  if (context.endpoint.includes('/tasks') || context.endpoint.includes('/documents')) {
    // These endpoints use detailed error format
    return NextResponse.json(
      {
        error: defaultMessage,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        type: error.name || 'Error',
      },
      { status }
    );
  }

  // Most endpoints use simple error format
  return NextResponse.json(
    { error: defaultMessage },
    { status }
  );
}

/**
 * Utility to extract user ID from request for logging
 */
export async function extractUserId(request: Request): Promise<string | undefined> {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader) {
      // Extract from Bearer token - customize based on your auth
      const token = authHeader.replace('Bearer ', '');
      // Simple extraction - in real app, decode JWT
      if (token.length === 36) { // UUID length
        return token;
      }
    }
  } catch {
    // Ignore extraction errors
  }
  return undefined;
}