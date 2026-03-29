/**
 * Sentry Observability v12
 *
 * What this enables:
 * - Automatic capture of unhandled JS errors
 * - Manual error capture from ErrorBoundary
 * - User context (email, id) attached to events
 * - API error capture with full context
 * - Performance tracing (optional — set NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE)
 *
 * Install: npm install @sentry/nextjs
 * Setup:   npx @sentry/wizard@latest -i nextjs
 *
 * Required env vars:
 *   NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
 *   NEXT_PUBLIC_SENTRY_ENVIRONMENT=production|staging|development
 *   NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1
 */

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const ENVIRONMENT = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV;
const TRACES_SAMPLE_RATE = parseFloat(
  process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || "0.1"
);

let sentryLoaded = false;

/**
 * Initialize Sentry. Called once in providers.tsx.
 * Safe to call multiple times — deduplicates.
 */
export async function initSentry(): Promise<void> {
  if (!SENTRY_DSN || typeof window === "undefined" || sentryLoaded) return;

  try {
    const Sentry = await import("@sentry/nextjs");

    Sentry.init({
      dsn: SENTRY_DSN,
      environment: ENVIRONMENT,
      tracesSampleRate: TRACES_SAMPLE_RATE,
      // Ignore noise
      ignoreErrors: [
        "ResizeObserver loop limit exceeded",
        "ResizeObserver loop completed with undelivered notifications",
        "Network request failed",
        "Load failed",
      ],
      // Don't send in development unless explicitly enabled
      enabled: ENVIRONMENT !== "development" || !!process.env.NEXT_PUBLIC_SENTRY_FORCE_ENABLE,
      beforeSend(event) {
        // Strip PII from request URLs
        if (event.request?.url) {
          event.request.url = event.request.url.replace(/([?&])password=[^&]*/gi, "$1password=[REDACTED]");
        }
        return event;
      },
    });

    sentryLoaded = true;
    console.info("[Sentry] Initialized for", ENVIRONMENT);
  } catch (err) {
    // Sentry failure should never crash the app
    console.warn("[Sentry] Failed to initialize:", err);
  }
}

/**
 * Set user context — call after successful login.
 */
export async function setSentryUser(user: { id: number; email: string } | null): Promise<void> {
  if (!sentryLoaded) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    if (user) {
      Sentry.setUser({ id: String(user.id), email: user.email });
    } else {
      Sentry.setUser(null);
    }
  } catch {}
}

/**
 * Capture an error with context.
 * Returns an error ID for display in fallback UI.
 */
export function captureError(
  error: Error,
  context?: Record<string, unknown>
): string {
  const errorId = Math.random().toString(36).slice(2, 10).toUpperCase();

  if (!sentryLoaded || !SENTRY_DSN) {
    console.error("[captureError]", error.message, context);
    return errorId;
  }

  import("@sentry/nextjs").then(Sentry => {
    Sentry.withScope(scope => {
      if (context) {
        Object.entries(context).forEach(([key, val]) => {
          scope.setExtra(key, val);
        });
      }
      scope.setTag("errorId", errorId);
      Sentry.captureException(error);
    });
  }).catch(() => {});

  return errorId;
}

/**
 * Capture an API error with request context.
 */
export function captureApiError(
  error: Error & { status?: number; data?: unknown },
  requestContext: { method: string; path: string; status?: number }
): void {
  if (!sentryLoaded || !SENTRY_DSN) {
    console.error("[captureApiError]", requestContext, error.message);
    return;
  }

  import("@sentry/nextjs").then(Sentry => {
    Sentry.withScope(scope => {
      scope.setTag("api.method",  requestContext.method);
      scope.setTag("api.path",    requestContext.path);
      scope.setTag("api.status",  String(requestContext.status || error.status || 0));
      scope.setLevel("error");
      Sentry.captureException(error);
    });
  }).catch(() => {});
}

/**
 * Track a custom event (user action analytics).
 */
export function trackEvent(
  name: string,
  data?: Record<string, string | number | boolean>
): void {
  if (!sentryLoaded) return;
  import("@sentry/nextjs").then(Sentry => {
    Sentry.addBreadcrumb({ category: "user.action", message: name, data, level: "info" });
  }).catch(() => {});
}
