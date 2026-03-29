"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Menu, X, Database, GitBranch, PlayCircle, 
  LayoutDashboard, ShieldCheck, Zap, ArrowRightLeft 
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useAuthStore } from "@/stores/auth.store";

const NAV_ITEMS = [
  { href: "/dashboard",  label: "Dashboard",  icon: LayoutDashboard, exact: true },
  { href: "/datasets",   label: "Datasets",   icon: Database },
  { href: "/compare",    label: "Compare",    icon: ArrowRightLeft },
  { href: "/pipelines",  label: "Pipelines",  icon: GitBranch },
  { href: "/executions", label: "Executions", icon: PlayCircle },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuthStore();

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <div className="lg:hidden flex items-center pr-4">
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button 
            className="p-2 -ml-2 text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>
        </Dialog.Trigger>
        <AnimatePresence>
          {open && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
                />
              </Dialog.Overlay>
              <Dialog.Content asChild>
                <motion.div
                  initial={{ x: "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ type: "spring", damping: 25, stiffness: 200 }}
                  className="fixed inset-y-0 left-0 z-50 w-full max-w-[280px] bg-white shadow-2xl flex flex-col"
                >
                  <div className="flex items-center justify-between h-[var(--topbar-height)] px-6 border-b border-border">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 flex items-center justify-center rounded-xl bg-primary-600">
                        <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
                      </div>
                      <span className="font-bold text-sm text-text-primary">Studio</span>
                    </div>
                    <Dialog.Close asChild>
                      <button className="p-2 -mr-2 text-text-tertiary hover:text-text-primary transition-colors">
                        <X className="w-5 h-5" />
                      </button>
                    </Dialog.Close>
                  </div>

                  <nav className="flex-1 overflow-y-auto py-6 px-4">
                    <div className="space-y-1">
                      {NAV_ITEMS.map((item) => {
                        const active = isActive(item.href, item.exact);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setOpen(false)}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                              active 
                                ? "bg-primary-50 text-primary-700" 
                                : "text-text-secondary hover:bg-background hover:text-text-primary"
                            )}
                          >
                            <item.icon className={cn("w-5 h-5", active ? "text-primary-600" : "text-text-tertiary")} />
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>

                    {user?.is_admin && (
                      <div className="mt-8">
                        <p className="px-3 text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-2">Admin</p>
                        <Link
                          href="/admin"
                          onClick={() => setOpen(false)}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                            isActive("/admin")
                              ? "bg-primary-50 text-primary-700"
                              : "text-text-secondary hover:bg-background hover:text-text-primary"
                          )}
                        >
                          <ShieldCheck className={cn("w-5 h-5", isActive("/admin") ? "text-primary-600" : "text-text-tertiary")} />
                          Admin Console
                        </Link>
                      </div>
                    )}
                  </nav>

                  <div className="p-4 border-t border-border">
                    <div className="bg-background rounded-2xl p-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold">
                        {user?.email?.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-primary truncate">{user?.email}</p>
                        <p className="text-xs text-text-tertiary truncate">Personal Workspace</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>
    </div>
  );
}
