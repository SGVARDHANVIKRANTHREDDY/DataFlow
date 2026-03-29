/**
 * Dialog v11.1 — Accessible modal with:
 * - Focus trap (keyboard navigation stays inside)
 * - Restore focus on close (returns to trigger element)
 * - Escape key close
 * - Proper ARIA: role, aria-modal, aria-labelledby, aria-describedby
 * - Backdrop click close (optional)
 * - Entry/exit animation via Framer Motion
 */
"use client";

import {
  useEffect, useRef, useCallback,
  type ReactNode, memo
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  closeOnBackdrop?: boolean;
  className?: string;
}

const DIALOG_SIZES = {
  sm:   "max-w-sm",
  md:   "max-w-md",
  lg:   "max-w-lg",
  xl:   "max-w-2xl",
  full: "max-w-5xl",
};

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export const Dialog = memo(({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  closeOnBackdrop = true,
  className,
}: DialogProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = `dialog-title-${title?.toLowerCase().replace(/\s+/g, "-")}`;
  const descId  = `dialog-desc-${title?.toLowerCase().replace(/\s+/g, "-")}`;

  // Save and restore focus
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Focus first focusable element in dialog after mount
      requestAnimationFrame(() => {
        const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
        first?.focus();
      });
    } else {
      previousFocusRef.current?.focus();
    }
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus trap
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }, []);

  // Prevent body scroll
  useEffect(() => {
    if (open) {
      const scrollY = window.scrollY;
      document.body.style.cssText = `
        overflow: hidden;
        position: fixed;
        top: -${scrollY}px;
        left: 0; right: 0;
      `;
    } else {
      const scrollY = parseInt(document.body.style.top || "0") * -1;
      document.body.style.cssText = "";
      window.scrollTo(0, scrollY);
    }
    return () => { document.body.style.cssText = ""; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div
          role="presentation"
          style={{ position: "fixed", inset: 0, zIndex: 100 }}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.32)",
              backdropFilter: "blur(2px)",
            }}
            onClick={closeOnBackdrop ? onClose : undefined}
            aria-hidden="true"
          />

          {/* Dialog */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px",
              pointerEvents: "none",
            }}
          >
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              aria-describedby={description ? descId : undefined}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1,    y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 4 }}
              transition={{ duration: 0.18, ease: [0.0, 0.0, 0.2, 1] }}
              onKeyDown={handleKeyDown}
              className={cn(
                "relative w-full bg-white rounded-2xl border border-[#E2E8F0]",
                "shadow-[0_24px_48px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)]",
                "pointer-events-auto overflow-hidden",
                DIALOG_SIZES[size],
                className
              )}
            >
              {/* Header */}
              {title && (
                <div className="flex items-start justify-between px-6 py-5 border-b border-[#F1F5F9]">
                  <div>
                    <h2
                      id={titleId}
                      className="text-base font-semibold text-[#0F172A] leading-snug"
                    >
                      {title}
                    </h2>
                    {description && (
                      <p id={descId} className="text-sm text-[#64748B] mt-1">
                        {description}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={onClose}
                    aria-label="Close dialog"
                    className="ml-4 flex-shrink-0 p-1.5 rounded-lg text-[#94A3B8] hover:text-[#64748B] hover:bg-[#F1F5F9] transition-colors duration-[120ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Body */}
              <div className="px-6 py-5">{children}</div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
});

Dialog.displayName = "Dialog";

/* ── Convenience sub-components ─────────────────────────────────────────── */
export function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(
      "flex items-center justify-end gap-2 px-6 py-4",
      "border-t border-[#F1F5F9] bg-[#F8FAFC] -mx-6 -mb-5 mt-2",
      className
    )}>
      {children}
    </div>
  );
}
