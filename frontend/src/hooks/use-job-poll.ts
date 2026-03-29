"use client";

import { useEffect, useRef, useCallback } from "react";
import { jobsApi } from "@/lib/api/client";
import type { Job } from "@/types";

interface PollOptions {
  jobId: number | null;
  onProgress?: (job: Job) => void;
  onComplete: (job: Job) => void;
  onError: (error: string) => void;
  intervalMs?: number;
  maxWaitMs?: number;
  enabled?: boolean;
}

export function useJobPoll({
  jobId,
  onProgress,
  onComplete,
  onError,
  intervalMs = 1500,
  maxWaitMs = 300000,
  enabled = true,
}: PollOptions) {
  const startRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onProgressRef = useRef(onProgress);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  onProgressRef.current = onProgress;
  onCompleteRef.current = onComplete;
  onErrorRef.current = onError;

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!jobId || !enabled) { stop(); return; }

    startRef.current = Date.now();

    const check = async () => {
      try {
        const job: Job = await jobsApi.get(jobId);
        onProgressRef.current?.(job);

        if (job.status === "completed") {
          stop();
          onCompleteRef.current(job);
          return;
        }
        if (job.status === "failed" || job.status === "revoked") {
          stop();
          onErrorRef.current(job.error || "Job failed");
          return;
        }
        if (Date.now() - startRef.current > maxWaitMs) {
          stop();
          onErrorRef.current("Job timed out");
        }
      } catch (e: unknown) {
        stop();
        onErrorRef.current(e instanceof Error ? e.message : "Unknown error");
      }
    };

    check();
    timerRef.current = setInterval(check, intervalMs);

    return stop;
  }, [jobId, enabled, intervalMs, maxWaitMs, stop]);

  return { stop };
}
