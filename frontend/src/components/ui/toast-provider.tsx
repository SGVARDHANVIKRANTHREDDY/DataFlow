"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useUIStore } from "@/stores/ui.store";
import { cn } from "@/lib/utils/cn";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";

const ICONS = {
  success: CheckCircle2,
  error:   XCircle,
  warning: AlertTriangle,
  info:    Info,
};

const STYLES = {
  success: "bg-success-50 border-success-200 text-success-900",
  error:   "bg-danger-50  border-danger-200  text-danger-900",
  warning: "bg-warning-50 border-warning-200 text-warning-900",
  info:    "bg-primary-50 border-primary-200 text-primary-900",
};

const ICON_STYLES = {
  success: "text-success-600",
  error:   "text-danger-600",
  warning: "text-warning-600",
  info:    "text-primary-600",
};

export function ToastProvider() {
  const { toasts, dismissToast } = useUIStore();

  return (
    <div
      className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-label="Notifications"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.type];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className={cn(
                "pointer-events-auto flex items-start gap-3 px-4 py-3.5 rounded-xl border",
                "max-w-[360px] w-full",
                "shadow-lg",
                STYLES[toast.type]
              )}
            >
              <Icon className={cn("w-4 h-4 mt-0.5 flex-shrink-0", ICON_STYLES[toast.type])} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-snug">{toast.title}</p>
                {toast.description && (
                  <p className="text-xs mt-0.5 opacity-80 leading-relaxed">{toast.description}</p>
                )}
              </div>
              <button
                onClick={() => dismissToast(toast.id)}
                className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity -mt-0.5 -mr-1"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
