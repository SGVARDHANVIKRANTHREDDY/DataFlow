/**
 * Button v11.1
 *
 * Interaction physics:
 * - Press: scale(0.97) in 60ms — feels instant, not laggy
 * - Release: spring back with slight overshoot (--ease-spring)
 * - Loading: spinner appears immediately (latency masking)
 * - Success: brief green shimmer before returning to normal
 * - Hover: background shift in 120ms, no abrupt jump
 *
 * Accessibility:
 * - aria-busy on loading
 * - aria-disabled when disabled
 * - focus-visible ring matches brand color
 */
import { forwardRef, type ButtonHTMLAttributes, memo } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  [
    /* Base layout */
    "inline-flex items-center justify-center gap-2",
    "font-semibold text-sm",
    "select-none whitespace-nowrap",
    "relative overflow-hidden",
    /* Focus */
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    /* Disabled */
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
    /* Press physics — instant scale, spring release */
    "active:scale-[0.97] active:[transition-duration:60ms]",
    /* Base transition for all other states */
    "transition-all",
    "[transition-duration:120ms]",
    "[transition-timing-function:cubic-bezier(0.4,0,0.2,1)]",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: [
          "bg-primary-600 text-white",
          "hover:bg-primary-700",
          "active:bg-primary-800",
          "focus-visible:ring-primary-500/40",
          "[--shadow-btn:0_1px_2px_rgba(0,0,0,0.12),0_0_0_1px_rgba(99,102,241,0.3)]",
        ].join(" "),
        secondary: [
          "bg-white text-[#0F172A] border border-[#E2E8F0]",
          "hover:bg-[#F8FAFC] hover:border-[#CBD5E1]",
          "active:bg-[#F1F5F9]",
          "focus-visible:ring-primary-500/20",
          "[--shadow-btn:0_1px_2px_rgba(0,0,0,0.06)]",
        ].join(" "),
        ghost: [
          "bg-transparent text-[#64748B]",
          "hover:bg-[#F1F5F9] hover:text-[#0F172A]",
          "active:bg-[#E2E8F0]",
          "focus-visible:ring-primary-500/20",
        ].join(" "),
        danger: [
          "bg-danger-600 text-white",
          "hover:bg-danger-700",
          "active:bg-danger-800",
          "focus-visible:ring-danger-500/40",
        ].join(" "),
        "danger-ghost": [
          "bg-transparent text-danger-600",
          "hover:bg-danger-50",
          "active:bg-danger-100",
          "focus-visible:ring-danger-500/20",
        ].join(" "),
        accent: [
          "bg-accent-500 text-white",
          "hover:bg-accent-600",
          "active:bg-accent-700",
          "focus-visible:ring-accent-500/40",
        ].join(" "),
        outline: [
          "bg-transparent text-primary-600 border border-primary-200",
          "hover:bg-primary-50 hover:border-primary-300",
          "active:bg-primary-100",
          "focus-visible:ring-primary-500/20",
        ].join(" "),
        link: [
          "bg-transparent text-primary-600 underline-offset-4",
          "hover:underline",
          "focus-visible:ring-primary-500/20",
          "p-0 h-auto",
        ].join(" "),
      },
      size: {
        "2xs":  "h-6  px-2   text-xs  rounded-md  gap-1",
        xs:     "h-7  px-2.5 text-xs  rounded-lg  gap-1.5",
        sm:     "h-8  px-3   text-sm  rounded-lg  gap-1.5",
        md:     "h-9  px-4   text-sm  rounded-xl  gap-2",
        lg:     "h-10 px-5   text-sm  rounded-xl  gap-2",
        xl:     "h-11 px-6   text-base rounded-xl gap-2",
        icon:      "h-9  w-9  rounded-xl p-0",
        "icon-sm": "h-8  w-8  rounded-lg p-0",
        "icon-xs": "h-7  w-7  rounded-md p-0",
        "icon-lg": "h-10 w-10 rounded-xl p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  shadow?: boolean;
}

const Spinner = ({ className }: { className?: string }) => (
  <span
    className={cn("flex-shrink-0 animate-spin rounded-full border-2 border-current/25 border-t-current", className)}
    style={{ animationDuration: "0.65s" }}
    aria-hidden="true"
  />
);

export const Button = memo(forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className, variant, size, loading, loadingText,
      leftIcon, rightIcon, shadow, children, disabled, ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        aria-disabled={isDisabled || undefined}
        className={cn(
          buttonVariants({ variant, size }),
          /* Apply button shadow for primary/secondary only — not ghost/link */
          shadow !== false &&
            (variant === "primary" || variant === "secondary" || !variant) &&
            "shadow-sm",
          className
        )}
        {...props}
      >
        {/* Left icon / loading spinner */}
        {loading ? (
          <Spinner className="w-3.5 h-3.5" />
        ) : leftIcon ? (
          <span className="flex-shrink-0">{leftIcon}</span>
        ) : null}

        {/* Label */}
        {loading && loadingText ? (
          <span>{loadingText}</span>
        ) : (
          <span>{children}</span>
        )}

        {/* Right icon */}
        {!loading && rightIcon && (
          <span className="flex-shrink-0">{rightIcon}</span>
        )}
      </button>
    );
  }
));

Button.displayName = "Button";
export { buttonVariants };

/* ── Icon Button shorthand ────────────────────────────────────────────────── */
export const IconButton = memo(forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "children"> & {
    icon: React.ReactNode;
    label: string;
  }
>(({ icon, label, size = "icon", ...props }, ref) => (
  <Button ref={ref} size={size} aria-label={label} title={label} {...props}>
    {icon}
  </Button>
)));

IconButton.displayName = "IconButton";
