"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuthStore } from "@/stores/auth.store";
import { useToast } from "@/stores/ui.store";
import { cn } from "@/lib/utils/cn";
import { Database, Eye, EyeOff, ArrowRight, Sparkles } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) { setError("Email and password are required"); return; }
    try {
      await login(email, password);
      toast({ type: "success", title: "Welcome back!", description: "You are now signed in." });
      router.replace("/dashboard");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message || "Invalid credentials";
      setError(msg);
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] bg-primary-600 p-12 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center">
            <Database className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-semibold text-lg">Pipeline Studio</span>
        </div>

        <div>
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-2 mb-8">
            <Sparkles className="w-4 h-4 text-primary-200" />
            <span className="text-primary-100 text-sm font-medium">AI-powered v11</span>
          </div>
          <h2 className="text-white text-4xl font-bold leading-tight mb-4">
            Transform data with<br />natural language
          </h2>
          <p className="text-primary-200 text-lg leading-relaxed">
            Describe transformations in plain English. Our AI translates them into exactly-once, production-safe pipelines.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            { label: "Transforms", value: "13" },
            { label: "Uptime SLO", value: "99.9%" },
            { label: "Exactly-once", value: "✓" },
            { label: "HMAC Audit", value: "✓" },
          ].map((s) => (
            <div key={s.label} className="bg-white/10 rounded-xl p-4">
              <div className="text-white font-bold text-2xl">{s.value}</div>
              <div className="text-primary-200 text-sm mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-[400px]"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <Database className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-text-primary">Pipeline Studio</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-text-primary mb-1">Sign in</h1>
            <p className="text-text-secondary text-sm">Welcome back to your workspace</p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mb-5 p-3 bg-danger-50 border border-danger-100 rounded-lg text-danger-700 text-sm"
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                autoFocus
                className={cn(
                  "w-full h-11 px-3.5 text-sm bg-surface border border-border",
                  "rounded-[10px] text-text-primary placeholder:text-text-tertiary",
                  "transition-all duration-150",
                  "focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400",
                  error && "border-danger-400"
                )}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-text-primary">Password</label>
              </div>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={cn(
                    "w-full h-11 px-3.5 pr-11 text-sm bg-surface border border-border",
                    "rounded-[10px] text-text-primary placeholder:text-text-tertiary",
                    "transition-all duration-150",
                    "focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400",
                    error && "border-danger-400"
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                "w-full h-11 flex items-center justify-center gap-2",
                "bg-primary-600 hover:bg-primary-700 active:bg-primary-800",
                "text-white text-sm font-semibold rounded-xl",
                "transition-all duration-150",
                "focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:ring-offset-2",
                "disabled:opacity-60 disabled:cursor-not-allowed",
                "shadow-sm"
              )}
            >
              {isLoading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Sign in
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-text-secondary">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="text-primary-600 font-medium hover:text-primary-700 transition-colors"
            >
              Create one
            </Link>
          </p>

          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-xs text-text-tertiary text-center">
              Protected by HMAC audit chains and exactly-once execution guarantees.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
