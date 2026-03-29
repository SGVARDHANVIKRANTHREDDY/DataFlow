"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Search } from "lucide-react";
import { MobileNav } from "./MobileNav";
import { ThemeToggle } from "./ThemeToggle";

const PAGE_META: Record<string, { title: string; breadcrumb?: string }> = {
  "/dashboard":  { title: "Dashboard" },
  "/datasets":   { title: "Datasets",   breadcrumb: "Workspace" },
  "/pipelines":  { title: "Pipelines",  breadcrumb: "Workspace" },
  "/executions": { title: "Executions", breadcrumb: "Workspace" },
  "/admin":      { title: "Admin",      breadcrumb: "Settings" },
};

export function Topbar() {
  const pathname = usePathname();

  const match = Object.entries(PAGE_META).find(
    ([p]) => pathname === p || pathname.startsWith(p + "/")
  );
  const meta = match?.[1] || { title: "Dashboard" };

  return (
    <header
      className="fixed top-0 right-0 z-20 flex items-center justify-between bg-white border-b border-[#E2E8F0] w-full lg:w-[calc(100%-var(--sidebar-width))]"
      style={{
        height: "var(--topbar-height)",
        paddingLeft: "24px",
        paddingRight: "24px",
      }}
    >
      <div className="flex items-center gap-4">
        <MobileNav />
        {/* Left: title + breadcrumb */}
        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
          {meta.breadcrumb && (
            <>
              <span className="hidden sm:inline" style={{ fontSize: "0.8125rem", color: "#94A3B8", fontWeight: 500 }}>
                {meta.breadcrumb}
              </span>
              <span className="hidden sm:inline" style={{ color: "#CBD5E1", fontSize: "0.875rem" }}>/</span>
            </>
          )}
          <h1
            style={{
              fontSize: "0.9375rem",
              fontWeight: 600,
              color: "#0F172A",
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
            }}
          >
            {meta.title}
          </h1>
        </div>
      </div>

      {/* Right: theme toggle + search */}
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <button
          className="hidden sm:flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] transition-all"
          style={{
            height: "34px",
            padding: "0 12px",
            fontSize: "0.8125rem",
            color: "#94A3B8",
            transition: "border-color 120ms, box-shadow 120ms",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "#6366F1";
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.12)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "#E2E8F0";
            e.currentTarget.style.boxShadow = "none";
          }}
          aria-label="Search (⌘K)"
        >
          <Search style={{ width: 13, height: 13, flexShrink: 0 }} />
          <span style={{ marginLeft: 4 }}>Search…</span>
          <kbd
            className="hidden md:inline-flex items-center ml-3"
            style={{
              fontSize: "10px",
              fontFamily: "'JetBrains Mono', monospace",
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              borderRadius: 5,
              padding: "2px 5px",
              color: "#94A3B8",
              lineHeight: 1,
            }}
          >
            ⌘K
          </kbd>
        </button>
      </div>
    </header>
  );
}
