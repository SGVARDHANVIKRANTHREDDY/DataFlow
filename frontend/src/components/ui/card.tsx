/**
 * Card v11.1
 *
 * Information density: padding scales with content type.
 * - Card: 0px padding (composited)
 * - CardHeader: 16px horizontal, 14px vertical (compact)
 * - CardContent: 20px (breathing room)
 * - CardFooter: 16px horizontal, 12px vertical (secondary)
 *
 * Hover states: box-shadow transition only (no transform) for
 * cards containing interactive children — avoids stacking context issues.
 */
import { forwardRef, type HTMLAttributes, memo } from "react";
import { cn } from "@/lib/utils/cn";

type DivProps = HTMLAttributes<HTMLDivElement>;

export const Card = memo(forwardRef<HTMLDivElement, DivProps & {
  hoverable?: boolean;
  flush?: boolean;
}>(
  ({ className, hoverable, flush, style, ...props }, ref) => (
    <div
      ref={ref}
      role="region"
      className={cn(
        "bg-white rounded-xl border border-[#E2E8F0]",
        !flush && "overflow-hidden",
        hoverable && [
          "cursor-pointer",
          "transition-shadow duration-[120ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
          "hover:shadow-[0_4px_12px_rgba(0,0,0,0.07),0_0_0_1px_rgba(15,23,42,0.08)]",
        ].join(" "),
        className
      )}
      style={{
        boxShadow: "var(--shadow-card)",
        ...style,
      }}
      {...props}
    />
  )
));
Card.displayName = "Card";

export const CardHeader = memo(forwardRef<HTMLDivElement, DivProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-between",
        "px-5 py-[14px]",     /* 14px vertical — compact but not cramped */
        "border-b border-[#F1F5F9]",
        className
      )}
      {...props}
    />
  )
));
CardHeader.displayName = "CardHeader";

export const CardTitle = memo(forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn(
        "text-sm font-semibold text-[#0F172A] leading-snug flex items-center gap-2",
        className
      )}
      {...props}
    />
  )
));
CardTitle.displayName = "CardTitle";

export const CardDescription = memo(forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("text-sm text-[#64748B] leading-relaxed", className)}
      {...props}
    />
  )
));
CardDescription.displayName = "CardDescription";

export const CardContent = memo(forwardRef<HTMLDivElement, DivProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("px-5 py-5", className)}
      {...props}
    />
  )
));
CardContent.displayName = "CardContent";

export const CardFooter = memo(forwardRef<HTMLDivElement, DivProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "px-5 py-3",
        "border-t border-[#F1F5F9]",
        "bg-[#F8FAFC]",
        className
      )}
      {...props}
    />
  )
));
CardFooter.displayName = "CardFooter";

export const CardSection = memo(forwardRef<HTMLDivElement, DivProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("px-5 py-4 border-b border-[#F1F5F9] last:border-0", className)}
      {...props}
    />
  )
));
CardSection.displayName = "CardSection";

/* ── Metric Card — large number display ──────────────────────────────────── */
export const MetricCard = memo(({
  label,
  value,
  icon,
  delta,
  trend,
  color = "primary",
  className,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  delta?: string;
  trend?: "up" | "down" | "flat";
  color?: "primary" | "success" | "warning" | "danger" | "accent";
  className?: string;
}) => {
  const colorMap = {
    primary: { icon: "bg-primary-50 text-primary-600",   value: "text-[#0F172A]" },
    success: { icon: "bg-success-50 text-success-600",   value: "text-[#0F172A]" },
    warning: { icon: "bg-warning-50 text-warning-600",   value: "text-[#0F172A]" },
    danger:  { icon: "bg-danger-50  text-danger-600",    value: "text-[#0F172A]" },
    accent:  { icon: "bg-accent-50  text-accent-600",    value: "text-[#0F172A]" },
  };
  const trendColor = trend === "up" ? "text-success-600" : trend === "down" ? "text-danger-600" : "text-[#64748B]";

  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between mb-3">
        {icon && (
          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", colorMap[color].icon)}>
            {icon}
          </div>
        )}
      </div>
      <div className={cn("metric-value num mb-1", colorMap[color].value)}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="text-xs font-medium text-[#64748B]">{label}</div>
      {delta && (
        <div className={cn("text-xs mt-1.5 font-medium", trendColor)}>{delta}</div>
      )}
    </Card>
  );
});
MetricCard.displayName = "MetricCard";
