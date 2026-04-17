import React, { ReactNode, ErrorInfo } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { db } from '../../lib/db';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    };
  }

  static getDerivedStateFromError(_error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    
    this.setState(prevState => ({
      error,
      errorInfo,
      errorCount: prevState.errorCount + 1
    }));
    
    // Log to database for debugging
    this.logErrorToDatabase(error, errorInfo);
  }

  private logErrorToDatabase = async (error: Error, errorInfo: ErrorInfo) => {
    try {
      await db.audit_logs.add({
        action: 'CREATE', // Use CREATE as a generic action for error logging
        tableName: 'error_boundary',
        recordId: `err_${Math.random().toString(36).substr(2, 9)}`,
        details: `${error.toString()} - ${errorInfo.componentStack?.substring(0, 200) || 'Unknown'}`,
        pseudokey: 'system',
        timestamp: new Date()
      });
    } catch (dbErr) {
      console.error('[ErrorBoundary] Failed to log error to database:', dbErr);
    }
  };

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center w-screen h-screen bg-gray-950 text-gray-100 p-8">
          <div className="max-w-md text-center">
            <div className="flex justify-center mb-6">
              <AlertTriangle size={64} className="text-red-500" />
            </div>
            
            <h1 className="text-3xl font-bold mb-2 text-red-400">
              Oops! Something went wrong
            </h1>
            
            <p className="text-gray-400 mb-6">
              The application encountered an unexpected error. Your data is safe and has been logged for debugging.
            </p>
            
            {this.state.error && (
              <div className="bg-gray-900 border border-red-900/50 rounded-lg p-4 mb-6 text-left overflow-auto max-h-40">
                <p className="text-xs font-mono text-red-400 whitespace-pre-wrap break-words">
                  {this.state.error.toString()}
                </p>
              </div>
            )}
            
            <p className="text-xs text-gray-500 mb-6">
              Error #{this.state.errorCount}
            </p>
            
            <div className="flex gap-4 justify-center">
              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                <RotateCcw size={18} />
                Try Again
              </button>
              
              <button
                onClick={this.handleReload}
                className="flex items-center gap-2 px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
              >
                <RotateCcw size={18} />
                Reload Page
              </button>
            </div>
            
            <p className="text-xs text-gray-500 mt-8">
              If the problem persists, please clear your browser cache or contact support.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
