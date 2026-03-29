/**
 * OptimisticFeedback v11.1
 *
 * FAANG pattern: actions feel instant even when the API is slow.
 * Techniques:
 * 1. Optimistic UI: update state immediately, revert on error
 * 2. Latency masking: show intent immediately with loading indicators
 * 3. Success delight: brief shimmer/confetti moment on completion
 * 4. Progressive disclosure: skeleton → partial → complete data
 */
"use client";

import { useState, useCallback, type ReactNode, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { CheckCircle2, XCircle } from "lucide-react";

/* ── Optimistic Action Button ─────────────────────────────────────────────── */
interface OptimisticActionProps {
  children: ReactNode;
  onAction: () => Promise<void>;
  successMessage?: string;
  errorMessage?: string;
  className?: string;
  confirmText?: string;
}

export const OptimisticAction = memo(({
  children,
  onAction,
  successMessage = "Done",
  errorMessage = "Failed",
  className,
}: OptimisticActionProps) => {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleClick = useCallback(async () => {
    if (state !== "idle") return;
    setState("loading");
    try {
      await onAction();
      setState("success");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }, [state, onAction]);

  return (
    <button
      onClick={handleClick}
      disabled={state === "loading"}
      className={cn(
        "relative inline-flex items-center gap-2",
        "transition-all duration-[120ms]",
        "active:scale-[0.97]",
        className
      )}
    >
      <AnimatePresence mode="wait">
        {state === "loading" ? (
          <motion.span
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="w-4 h-4 border-2 border-current/20 border-t-current rounded-full animate-spin"
          />
        ) : state === "success" ? (
          <motion.span
            key="success"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
            className="text-success-600"
          >
            <CheckCircle2 className="w-4 h-4" />
          </motion.span>
        ) : state === "error" ? (
          <motion.span
            key="error"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
            className="text-danger-600"
          >
            <XCircle className="w-4 h-4" />
          </motion.span>
        ) : null}
      </AnimatePresence>

      <span>
        {state === "success" ? successMessage
          : state === "error" ? errorMessage
          : children}
      </span>

      {/* Success shimmer overlay */}
      {state === "success" && (
        <motion.span
          initial={{ x: "-100%", opacity: 0.5 }}
          animate={{ x: "100%", opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none"
        />
      )}
    </button>
  );
});
OptimisticAction.displayName = "OptimisticAction";

/* ── Progressive Reveal — skeleton → data without jarring jump ───────────── */
interface ProgressiveRevealProps {
  loading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
  delay?: number;
}

export const ProgressiveReveal = memo(({
  loading,
  skeleton,
  children,
  delay = 0,
}: ProgressiveRevealProps) => {
  return (
    <div className="relative">
      <AnimatePresence initial={false} mode="wait">
        {loading ? (
          <motion.div
            key="skeleton"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {skeleton}
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: 0.2,
              delay,
              ease: [0.0, 0.0, 0.2, 1],
            }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
ProgressiveReveal.displayName = "ProgressiveReveal";

/* ── Counter Animation — numbers count up when data loads ───────────────── */
interface AnimatedCounterProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export const AnimatedCounter = memo(({ value, prefix, suffix, className }: AnimatedCounterProps) => {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className={cn("num tabular-nums", className)}
    >
      {prefix}{value.toLocaleString()}{suffix}
    </motion.span>
  );
});
AnimatedCounter.displayName = "AnimatedCounter";

/* ── Inline status indicator with pulse ─────────────────────────────────── */
export const LiveIndicator = memo(({
  label = "Live",
  active = true,
  color = "success",
}: {
  label?: string;
  active?: boolean;
  color?: "success" | "warning" | "danger" | "primary";
}) => {
  const colors = {
    success: { dot: "bg-success-500", text: "text-success-700", ring: "bg-success-500" },
    warning: { dot: "bg-warning-500", text: "text-warning-700", ring: "bg-warning-500" },
    danger:  { dot: "bg-danger-500",  text: "text-danger-700",  ring: "bg-danger-500"  },
    primary: { dot: "bg-primary-500", text: "text-primary-700", ring: "bg-primary-500" },
  };
  const c = colors[color];

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex w-2 h-2">
        <span className={cn("w-2 h-2 rounded-full", c.dot)} />
        {active && (
          <span
            className={cn("absolute inset-0 rounded-full animate-ping opacity-75", c.ring)}
            style={{ animationDuration: "2s" }}
          />
        )}
      </span>
      <span className={cn("text-xs font-medium", c.text)}>{label}</span>
    </span>
  );
});
LiveIndicator.displayName = "LiveIndicator";
