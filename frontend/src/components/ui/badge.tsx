import { cn } from "@/lib/utils/cn";
import type { ExecutionStatus, JobStatus } from "@/types";
import { getStatusConfig } from "@/lib/utils/format";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "success" | "warning" | "danger" | "info" | "primary" | "neutral";
  className?: string;
  dot?: boolean;
}

const BADGE_STYLES = {
  success: "bg-success-50 text-success-700",
  warning: "bg-warning-50 text-warning-700",
  danger:  "bg-danger-50  text-danger-700",
  info:    "bg-accent-50  text-accent-700",
  primary: "bg-primary-50 text-primary-700",
  neutral: "bg-background text-text-secondary border border-border",
};

const DOT_STYLES = {
  success: "bg-success-500",
  warning: "bg-warning-500",
  danger:  "bg-danger-500",
  info:    "bg-accent-500",
  primary: "bg-primary-500",
  neutral: "bg-text-tertiary",
};

export function Badge({ children, variant = "neutral", className, dot }: BadgeProps) {
  return (
    <span className={cn("status-badge", BADGE_STYLES[variant], className)}>
      {dot && <span className={cn("status-dot", DOT_STYLES[variant])} />}
      {children}
    </span>
  );
}

interface StatusBadgeProps {
  status: ExecutionStatus | JobStatus | string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = getStatusConfig(status);
  return (
    <span className={cn("status-badge", config.badge, className)}>
      <span className={cn("status-dot", config.dot)} />
      {config.label}
    </span>
  );
}
