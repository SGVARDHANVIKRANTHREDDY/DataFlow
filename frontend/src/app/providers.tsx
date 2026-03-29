"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState, useEffect } from "react";
import { ToastProvider } from "@/components/ui/toast-provider";
import { ErrorBoundary } from "@/components/error/error-boundary";
import { initSentry } from "@/lib/observability/sentry";
import { initRUM } from "@/lib/observability/rum";
import { ThemeProvider } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,        // 30s — reduces redundant fetches
            gcTime: 5 * 60_000,       // 5min — keeps cache warm
            retry: 1,
            refetchOnWindowFocus: false,
            // Structured error handling
            throwOnError: false,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );

  // Initialize observability once on mount
  useEffect(() => {
    initSentry();
    initRUM();
  }, []);

  return (
    <ErrorBoundary level="page">
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <QueryClientProvider client={queryClient}>
          {children}
          <ToastProvider />
          {process.env.NODE_ENV === "development" && (
            <ReactQueryDevtools initialIsOpen={false} />
          )}
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
