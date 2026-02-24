import React, { Component, ReactNode, ErrorInfo } from 'react';
import { LocaleContext } from '../hooks/useLocale';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      // LocaleContext may not be available if ErrorBoundary wraps LocaleProvider
      const fallback = (t?: (key: string) => string) => {
        const tr = t || ((key: string) => {
          const defaults: Record<string, string> = {
            'error.title': 'Something went wrong',
            'error.message': 'The application encountered an error. Please refresh the page to try again.',
            'error.details': 'Error details',
          };
          return defaults[key] || key;
        });
        return (
          <div style={{ padding: '20px', color: '#ff6b6b', backgroundColor: '#1a1a1a', minHeight: '100vh' }}>
            <h1 style={{ fontSize: '24px', marginBottom: '10px' }}>{tr('error.title')}</h1>
            <p style={{ marginBottom: '10px', color: '#8b949e' }}>
              {tr('error.message')}
            </p>
            {this.state.error && (
              <details style={{ marginTop: '20px', color: '#8b949e' }}>
                <summary style={{ cursor: 'pointer', marginBottom: '10px' }}>{tr('error.details')}</summary>
                <pre style={{
                  backgroundColor: '#0d1117',
                  padding: '10px',
                  borderRadius: '6px',
                  overflow: 'auto'
                }}>
                  {this.state.error.toString()}
                  {this.state.errorInfo && '\n\n' + this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        );
      };

      return (
        <LocaleContext.Consumer>
          {(ctx) => fallback(ctx?.t)}
        </LocaleContext.Consumer>
      );
    }

    return this.props.children;
  }
}
