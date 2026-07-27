'use client';

/** Client error boundary that contains rendering failures without changing server-side error policy. */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  fallbackTitle?: string;
  fallbackAction?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Recovers a failed subtree with a supplied or minimal accessible fallback. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    console.error('ui_boundary_error', error.name);
  }

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="cq-section-card" role="alert">
          <h2>{this.props.fallbackTitle ?? 'Something went wrong'}</h2>
          <button type="button" onClick={() => this.setState({ error: null })}>
            {this.props.fallbackAction ?? 'Try again'}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
