"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { useAuthStore } from "@/stores/auth.store";
import {
  Database, GitBranch, PlayCircle, LayoutDashboard,
  ShieldCheck, LogOut, ChevronDown, Zap, ArrowRightLeft
} from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/dashboard",  label: "Dashboard",  icon: LayoutDashboard, exact: true },
  { href: "/datasets",   label: "Datasets",   icon: Database },
  { href: "/compare",    label: "Compare",    icon: ArrowRightLeft },
  { href: "/pipelines",  label: "Pipelines",  icon: GitBranch },
  { href: "/executions", label: "Executions", icon: PlayCircle },
];

const ADMIN_ITEMS = [
  { href: "/admin", label: "Admin Console", icon: ShieldCheck },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : "??";

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside
      className="fixed left-0 top-0 h-screen hidden lg:flex flex-col z-30 bg-white"
      style={{ width: "var(--sidebar-width)", borderRight: "1px solid #E2E8F0" }}
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-4 flex-shrink-0"
        style={{ height: "var(--topbar-height)", borderBottom: "1px solid #F1F5F9" }}
      >
        <div className="w-7 h-7 flex items-center justify-center rounded-xl flex-shrink-0" style={{ background: "#6366F1" }}>
          <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <div className="text-sm font-bold leading-tight" style={{ color: "#0F172A", letterSpacing: "-0.01em" }}>
            Pipeline Studio
          </div>
          <div className="text-[9px] font-bold mt-0.5 leading-none tracking-[0.12em] uppercase" style={{ color: "#94A3B8" }}>
            v11 · Production
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-4" aria-label="Primary navigation">
        <p style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94A3B8", padding: "0 6px", marginBottom: "6px" }}>
          Main
        </p>

        <ul role="list" className="space-y-px mb-6">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href, item.exact);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="relative flex items-center gap-2.5 w-full rounded-lg px-2.5 py-[7px] transition-colors"
                  style={{
                    background: active ? "#EEF2FF" : "transparent",
                    color: active ? "#4338CA" : "#64748B",
                    fontSize: "0.875rem",
                    fontWeight: active ? 600 : 500,
                    textDecoration: "none",
                    transition: "background-color 80ms, color 80ms",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "#F8FAFC";
                      e.currentTarget.style.color = "#0F172A";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "#64748B";
                    }
                  }}
                >
                  <item.icon
                    className="flex-shrink-0"
                    style={{ width: 15, height: 15, color: active ? "#6366F1" : "#94A3B8", strokeWidth: active ? 2.5 : 2 }}
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {user?.is_admin && (
          <>
            <p style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94A3B8", padding: "0 6px", marginBottom: "6px" }}>
              Admin
            </p>
            <ul role="list" className="space-y-px">
              {ADMIN_ITEMS.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className="relative flex items-center gap-2.5 w-full rounded-lg px-2.5 py-[7px]"
                      style={{
                        background: active ? "#EEF2FF" : "transparent",
                        color: active ? "#4338CA" : "#64748B",
                        fontSize: "0.875rem",
                        fontWeight: active ? 600 : 500,
                        textDecoration: "none",
                        transition: "background-color 80ms, color 80ms",
                      }}
                      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = "#F8FAFC"; e.currentTarget.style.color = "#0F172A"; } }}
                      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#64748B"; } }}
                    >
                      <item.icon style={{ width: 15, height: 15, flexShrink: 0, color: active ? "#6366F1" : "#94A3B8", strokeWidth: active ? 2.5 : 2 }} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="px-2.5 pb-3 pt-2 flex-shrink-0" style={{ borderTop: "1px solid #F1F5F9" }}>
        <button
          onClick={() => setShowUserMenu((v) => !v)}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors duration-75"
          style={{ transition: "background 80ms" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#F8FAFC"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          aria-expanded={showUserMenu}
          aria-haspopup="menu"
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "#EEF2FF", color: "#4338CA", fontSize: "11px", fontWeight: 700 }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="truncate" style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#0F172A", lineHeight: 1.3 }}>
              {user?.email || "User"}
            </div>
            <div style={{ fontSize: "10px", color: "#94A3B8", lineHeight: 1.3 }}>
              {user?.is_super_admin ? "Super Admin" : user?.is_admin ? "Admin" : "Member"}
            </div>
          </div>
          <ChevronDown
            style={{ width: 13, height: 13, flexShrink: 0, color: "#94A3B8", transform: showUserMenu ? "rotate(180deg)" : "", transition: "transform 120ms" }}
          />
        </button>

        <AnimatePresence>
          {showUserMenu && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.1 }}
              role="menu"
              className="mt-1 mx-0.5 overflow-hidden rounded-lg border border-[#E2E8F0] bg-white"
              style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
            >
              <button
                role="menuitem"
                onClick={() => { setShowUserMenu(false); logout(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left"
                style={{ fontSize: "0.8125rem", color: "#64748B", transition: "background 80ms, color 80ms" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#FEF2F2"; e.currentTarget.style.color = "#DC2626"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#64748B"; }}
              >
                <LogOut style={{ width: 13, height: 13, flexShrink: 0 }} />
                Sign out
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  );
}
