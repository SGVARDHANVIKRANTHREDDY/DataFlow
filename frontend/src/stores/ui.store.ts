import { create } from "zustand";
import type { ToastItem } from "@/types";

interface UIState {
  sidebarCollapsed: boolean;
  toasts: ToastItem[];
  toggleSidebar: () => void;
  toast: (item: Omit<ToastItem, "id">) => void;
  dismissToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toasts: [],

  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  toast: (item) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const duration = item.type === "error" ? 6000 : 4000;
    set((s) => ({ toasts: [...s.toasts, { ...item, id }] }));
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      duration
    );
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Convenience hook
export function useToast() {
  return useUIStore((s) => s.toast);
}
