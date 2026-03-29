import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  size = "md",
}: EmptyStateProps) {
  const sizes = {
    sm: { wrap: "py-8",  icon: "w-8 h-8",  iconBox: "w-12 h-12", title: "text-sm", desc: "text-xs" },
    md: { wrap: "py-12", icon: "w-10 h-10", iconBox: "w-16 h-16", title: "text-base", desc: "text-sm" },
    lg: { wrap: "py-20", icon: "w-12 h-12", iconBox: "w-20 h-20", title: "text-lg", desc: "text-base" },
  }[size];

  return (
    <div className={cn("flex flex-col items-center justify-center text-center", sizes.wrap, className)}>
      <div
        className={cn(
          "rounded-2xl bg-background border border-border flex items-center justify-center mb-4",
          sizes.iconBox
        )}
      >
        <Icon className={cn("text-text-tertiary", sizes.icon)} />
      </div>
      <h3 className={cn("font-semibold text-text-primary mb-1.5", sizes.title)}>{title}</h3>
      <p className={cn("text-text-secondary max-w-[320px] leading-relaxed", sizes.desc)}>{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
