import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Log error
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Could send to error tracking service here
    // e.g., Sentry.captureException(error, { contexts: { react: errorInfo } });
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={styles.container}>
          <div style={styles.content}>
            <h2 style={styles.title}>Произошла ошибка</h2>
            <p style={styles.message}>
              Что-то пошло не так. Попробуйте перезагрузить страницу.
            </p>

            <details style={styles.details}>
              <summary style={styles.summary}>Подробности ошибки</summary>
              <pre style={styles.errorText}>
                {this.state.error?.toString()}
              </pre>
              {this.state.errorInfo && (
                <pre style={styles.stackTrace}>
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </details>

            <div style={styles.actions}>
              <button
                style={styles.button}
                onClick={this.handleReset}
              >
                Попробовать снова
              </button>
              <button
                style={styles.buttonSecondary}
                onClick={() => window.location.reload()}
              >
                Перезагрузить страницу
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    minHeight: '200px',
    backgroundColor: '#1a1a2e',
    borderRadius: '8px',
    margin: '10px'
  },
  content: {
    textAlign: 'center',
    maxWidth: '500px'
  },
  title: {
    color: '#ff6b6b',
    margin: '0 0 10px 0',
    fontSize: '1.5em'
  },
  message: {
    color: '#e0e0e0',
    margin: '0 0 20px 0'
  },
  details: {
    textAlign: 'left',
    backgroundColor: '#0f0f1a',
    padding: '10px',
    borderRadius: '4px',
    marginBottom: '20px'
  },
  summary: {
    cursor: 'pointer',
    color: '#888',
    marginBottom: '10px'
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: '12px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: '10px 0'
  },
  stackTrace: {
    color: '#888',
    fontSize: '11px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '200px',
    overflow: 'auto'
  },
  actions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'center'
  },
  button: {
    padding: '10px 20px',
    backgroundColor: '#4a90d9',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  buttonSecondary: {
    padding: '10px 20px',
    backgroundColor: 'transparent',
    color: '#888',
    border: '1px solid #888',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px'
  }
};

export default ErrorBoundary;
