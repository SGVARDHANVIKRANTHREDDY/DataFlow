import { formatDistanceToNow, format, parseISO } from "date-fns";
import type { ExecutionStatus, JobStatus } from "@/types";

export function formatNumber(n: number | null | undefined, decimals = 0): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function formatDate(dateStr: string | null | undefined, fmt = "MMM d, yyyy"): string {
  if (!dateStr) return "—";
  try { return format(parseISO(dateStr), fmt); }
  catch { return "—"; }
}

export function formatRelative(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try { return formatDistanceToNow(parseISO(dateStr), { addSuffix: true }); }
  catch { return "—"; }
}

export function formatPercent(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "—";
  return `${v.toFixed(decimals)}%`;
}

export function getStatusConfig(status: ExecutionStatus | JobStatus | string) {
  const configs: Record<string, { label: string; dot: string; badge: string; text: string }> = {
    success:   { label: "Success",   dot: "bg-success-500",  badge: "bg-success-50  text-success-700",  text: "text-success-700"  },
    completed: { label: "Completed", dot: "bg-success-500",  badge: "bg-success-50  text-success-700",  text: "text-success-700"  },
    partial:   { label: "Partial",   dot: "bg-warning-500",  badge: "bg-warning-50  text-warning-700",  text: "text-warning-700"  },
    running:   { label: "Running",   dot: "bg-accent-500",   badge: "bg-accent-50   text-accent-700",   text: "text-accent-700"   },
    pending:   { label: "Pending",   dot: "bg-text-tertiary",badge: "bg-border      text-text-secondary",text: "text-text-secondary"},
    failed:    { label: "Failed",    dot: "bg-danger-500",   badge: "bg-danger-50   text-danger-700",   text: "text-danger-700"   },
  };
  return configs[status] || configs["pending"];
}

export function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function getHealthColor(score: number): string {
  if (score >= 80) return "text-success-600";
  if (score >= 50) return "text-warning-600";
  return "text-danger-600";
}

export function getHealthBarColor(score: number): string {
  if (score >= 80) return "bg-success-500";
  if (score >= 50) return "bg-warning-500";
  return "bg-danger-500";
}

export function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
