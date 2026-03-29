"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useAuthStore } from "@/stores/auth.store";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isInitialized, initialize } = useAuthStore();

  useEffect(() => { if (!isInitialized) initialize(); }, [isInitialized, initialize]);
  useEffect(() => { if (isInitialized && !user) router.replace("/login"); }, [isInitialized, user, router]);

  useEffect(() => {
    const main = document.getElementById("main-content");
    if (main) main.scrollTop = 0;
  }, [pathname]);

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "#F8FAFC" }} aria-busy="true">
        <div className="flex flex-col items-center gap-4">
          <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid #E0E7FF", borderTopColor: "#6366F1", animation: "spin 0.65s linear infinite" }} />
          <p style={{ fontSize: "0.875rem", color: "#94A3B8" }}>Loading…</p>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!user) return null;

  return (
    <>
      <div className="skip-link"><a href="#main-content">Skip to main content</a></div>
      <div className="layout-main">
        <Sidebar />
        <div className="layout-content">
          <Topbar />
          <main id="main-content" className="flex-1 overflow-y-auto" style={{ paddingTop: "var(--topbar-height)" }} tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
