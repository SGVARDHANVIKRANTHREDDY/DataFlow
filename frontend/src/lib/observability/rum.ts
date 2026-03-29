/**
 * Real User Monitoring (RUM) v12
 *
 * Captures Core Web Vitals automatically:
 * - LCP (Largest Contentful Paint)
 * - FID (First Input Delay)
 * - CLS (Cumulative Layout Shift)
 * - TTFB (Time to First Byte)
 * - FCP (First Contentful Paint)
 *
 * Sends to Sentry performance monitoring.
 * Use web-vitals library: npm install web-vitals
 */

type Metric = {
  name: string;
  value: number;
  id: string;
  rating: "good" | "needs-improvement" | "poor";
};

function sendToSentry(metric: Metric) {
  import("@sentry/nextjs").then(Sentry => {
    Sentry.withScope(scope => {
      scope.setTag("metric.name",   metric.name);
      scope.setTag("metric.rating", metric.rating);
      scope.setExtra("metric.id",   metric.id);
      scope.setExtra("metric.value", metric.value);

      // Alert on poor metrics
      if (metric.rating === "poor") {
        scope.setLevel("warning");
        Sentry.captureMessage(`Poor ${metric.name}: ${Math.round(metric.value)}ms`);
      }
    });
  }).catch(() => {});
}

export async function initRUM(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const { onLCP, onFID, onCLS, onTTFB, onFCP } = await import("web-vitals");

    onLCP(sendToSentry);
    onFID(sendToSentry);
    onCLS(sendToSentry);
    onTTFB(sendToSentry);
    onFCP(sendToSentry);
  } catch {
    // web-vitals not installed — degraded gracefully
    console.info("[RUM] web-vitals not available, skipping Core Web Vitals tracking");
  }
}

/**
 * Custom performance mark.
 * Use: const end = startMark("pipeline-execute"); ... end();
 */
export function startMark(name: string): () => void {
  const start = performance.now();
  return () => {
    const duration = performance.now() - start;
    if (typeof window !== "undefined") {
      performance.measure(name, { start, duration } as PerformanceMeasureOptions);
    }
    import("@sentry/nextjs").then(Sentry => {
      Sentry.addBreadcrumb({
        category: "performance",
        message: name,
        data: { duration_ms: Math.round(duration) },
        level: "info",
      });
    }).catch(() => {});
  };
}
