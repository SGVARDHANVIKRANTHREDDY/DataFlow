"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureError } from "@/lib/observability/sentry";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  level?: "page" | "section" | "component";
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
}

/**
 * ErrorBoundary v12
 *
 * Catches React render errors that would otherwise produce blank screens.
 * Reports to Sentry automatically.
 *
 * Usage:
 *   <ErrorBoundary level="page">     — wraps entire pages
 *   <ErrorBoundary level="section">  — wraps critical sections (chart, table)
 *   <ErrorBoundary level="component">— wraps isolated widgets
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorId: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorId: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Report to Sentry
    const errorId = captureError(error, {
      componentStack: info.componentStack,
      level: this.props.level || "component",
    });
    this.setState({ errorId });

    this.props.onError?.(error, info);

    console.error(
      `[ErrorBoundary:${this.props.level}]`,
      error.message,
      info.componentStack
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorId: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const { level = "component" } = this.props;

    if (level === "page") return <PageErrorFallback error={this.state.error} errorId={this.state.errorId} onRetry={this.handleRetry} />;
    if (level === "section") return <SectionErrorFallback onRetry={this.handleRetry} />;
    return <ComponentErrorFallback onRetry={this.handleRetry} />;
  }
}

/* ── Page-level fallback — full screen ──────────────────────────────────── */
function PageErrorFallback({
  error,
  errorId,
  onRetry,
}: {
  error: Error | null;
  errorId: string | null;
  onRetry: () => void;
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-8"
      style={{ background: "#F8FAFC" }}
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-md w-full text-center">
        <div
          className="w-14 h-14 mx-auto mb-5 rounded-2xl flex items-center justify-center"
          style={{ background: "#FEF2F2", border: "1px solid #FEE2E2" }}
          aria-hidden="true"
        >
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
            <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: "0.875rem", color: "#64748B", marginBottom: 20, lineHeight: 1.6 }}>
          An unexpected error occurred. This has been automatically reported
          and our team will investigate.
        </p>

        {error?.message && (
          <details
            style={{
              background: "#FEF2F2", border: "1px solid #FEE2E2",
              borderRadius: 8, padding: "10px 14px",
              marginBottom: 16, textAlign: "left",
            }}
          >
            <summary style={{ fontSize: "0.75rem", color: "#DC2626", cursor: "pointer", fontWeight: 600 }}>
              Error details
            </summary>
            <code style={{ fontSize: "0.6875rem", color: "#7F1D1D", display: "block", marginTop: 8, wordBreak: "break-all" }}>
              {error.message}
            </code>
            {errorId && (
              <code style={{ fontSize: "0.6875rem", color: "#94A3B8", display: "block", marginTop: 4 }}>
                Error ID: {errorId}
              </code>
            )}
          </details>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button
            onClick={onRetry}
            style={{
              height: 36, padding: "0 20px", background: "#6366F1", color: "white",
              border: "none", borderRadius: 10, fontSize: "0.875rem", fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <button
            onClick={() => { window.location.href = "/dashboard"; }}
            style={{
              height: 36, padding: "0 20px", background: "white", color: "#64748B",
              border: "1px solid #E2E8F0", borderRadius: 10, fontSize: "0.875rem",
              fontWeight: 600, cursor: "pointer",
            }}
          >
            Go to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Section-level fallback — inline ────────────────────────────────────── */
function SectionErrorFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      style={{
        padding: "24px", background: "#FEF2F2", border: "1px solid #FEE2E2",
        borderRadius: 12, textAlign: "center",
      }}
    >
      <p style={{ fontSize: "0.875rem", color: "#DC2626", fontWeight: 600, marginBottom: 8 }}>
        This section failed to load
      </p>
      <button
        onClick={onRetry}
        style={{
          fontSize: "0.75rem", color: "#DC2626", background: "white",
          border: "1px solid #FEE2E2", borderRadius: 8, padding: "4px 12px", cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );
}

/* ── Component-level fallback — minimal ─────────────────────────────────── */
function ComponentErrorFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#FEF2F2", borderRadius: 8, fontSize: "0.75rem", color: "#DC2626" }}>
      <span>Failed to render</span>
      <button onClick={onRetry} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontWeight: 600, fontSize: "0.75rem" }}>
        Retry
      </button>
    </div>
  );
}

/* ── HOC helper for functional components ─────────────────────────────────── */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  level: Props["level"] = "section"
) {
  return function WrappedWithBoundary(props: P) {
    return (
      <ErrorBoundary level={level}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
