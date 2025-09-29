'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  sectionName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { 
      hasError: true, 
      error, 
      errorInfo: null 
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', {
      section: this.props.sectionName,
      error,
      errorInfo,
    });
    
    this.setState({
      error,
      errorInfo,
    });

    // Call the onError callback if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log to monitoring service (if configured)
    if (typeof window !== 'undefined' && (window as any).logError) {
      (window as any).logError({
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        section: this.props.sectionName,
      });
    }
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  public render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      // Default error UI
      return (
        <div className="min-h-[200px] flex items-center justify-center p-6">
          <div className="bg-background-secondary border border-red-500/20 rounded-lg p-6 max-w-md w-full">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-text-primary mb-2">
                  Something went wrong
                </h3>
                {this.props.sectionName && (
                  <p className="text-sm text-text-muted mb-2">
                    Error in: {this.props.sectionName}
                  </p>
                )}
                <p className="text-sm text-text-muted mb-4">
                  {this.state.error?.message || 'An unexpected error occurred'}
                </p>
                
                {/* Show details in development */}
                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <details className="mb-4">
                    <summary className="text-xs text-text-muted cursor-pointer hover:text-text-primary">
                      Show error details
                    </summary>
                    <pre className="mt-2 text-xs text-text-muted bg-background-primary p-2 rounded overflow-auto max-h-32">
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}
                
                <button
                  onClick={this.handleReset}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-text-primary rounded-md transition-colors text-sm"
                >
                  <RefreshCw className="h-4 w-4" />
                  Try again
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// HOC for easier use with functional components
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  sectionName?: string,
  fallback?: ReactNode
) {
  return function Wrapped(props: P) {
    return (
      <ErrorBoundary sectionName={sectionName} fallback={fallback}>
        <Component {...(props as any)} />
      </ErrorBoundary>
    );
  };
}

// Hook for programmatic error handling
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  const resetError = () => setError(null);
  const captureError = (error: Error) => setError(error);

  return { captureError, resetError };
}
