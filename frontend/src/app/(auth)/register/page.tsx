"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuthStore } from "@/stores/auth.store";
import { useToast } from "@/stores/ui.store";
import { cn } from "@/lib/utils/cn";
import { Database, ArrowRight, Eye, EyeOff, Check } from "lucide-react";

const FEATURES = [
  "13 production-safe transforms",
  "AI-powered natural language translation",
  "Exactly-once execution guarantee",
  "HMAC cryptographic audit trail",
];

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading } = useAuthStore();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email) { setError("Email is required"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    try {
      await register(email, password);
      toast({ type: "success", title: "Account created!", description: "Welcome to Pipeline Studio." });
      router.replace("/dashboard");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message || "Registration failed";
      setError(msg);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="w-full max-w-[960px] grid lg:grid-cols-2 gap-12 items-center">

        {/* Left */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center gap-2.5 mb-10">
            <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center shadow-sm">
              <Database className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-text-primary">Pipeline Studio</span>
          </div>

          <h1 className="text-4xl font-bold text-text-primary mb-4 leading-tight">
            Start processing data<br />
            <span className="gradient-text">in minutes</span>
          </h1>
          <p className="text-text-secondary text-lg leading-relaxed mb-8">
            Free to start. No credit card. Connect to your backend and process data at scale.
          </p>

          <ul className="space-y-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3">
                <div className="w-5 h-5 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-primary-600" />
                </div>
                <span className="text-sm text-text-secondary">{f}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Right: form */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
        >
          <div className="bg-surface rounded-2xl border border-border p-8"
            style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
            <h2 className="text-xl font-bold text-text-primary mb-1">Create your account</h2>
            <p className="text-text-secondary text-sm mb-6">Get started in under a minute</p>

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
                  autoFocus
                  className={cn(
                    "w-full h-11 px-3.5 text-sm bg-surface border border-border rounded-[10px]",
                    "text-text-primary placeholder:text-text-tertiary",
                    "transition-all duration-150",
                    "focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400",
                    error && "border-danger-400"
                  )}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  Password
                  <span className="text-text-tertiary font-normal ml-1">(min. 6 chars)</span>
                </label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a strong password"
                    className={cn(
                      "w-full h-11 px-3.5 pr-11 text-sm bg-surface border border-border rounded-[10px]",
                      "text-text-primary placeholder:text-text-tertiary",
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
                {password && (
                  <div className="mt-2">
                    <div className="progress-track">
                      <div
                        className={cn("progress-fill transition-all duration-300",
                          password.length < 6 ? "danger" : password.length < 10 ? "accent" : "success"
                        )}
                        style={{ width: `${Math.min((password.length / 14) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-text-tertiary mt-1">
                      {password.length < 6 ? "Too short" : password.length < 10 ? "Good" : "Strong"}
                    </p>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className={cn(
                  "w-full h-11 flex items-center justify-center gap-2 mt-2",
                  "bg-primary-600 hover:bg-primary-700 active:bg-primary-800",
                  "text-white text-sm font-semibold rounded-xl",
                  "transition-all duration-150 shadow-sm",
                  "focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:ring-offset-2",
                  "disabled:opacity-60 disabled:cursor-not-allowed"
                )}
              >
                {isLoading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Create account
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-text-secondary">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-primary-600 font-medium hover:text-primary-700 transition-colors"
              >
                Sign in
              </Link>
            </p>

            <p className="mt-4 text-xs text-text-tertiary text-center leading-relaxed">
              By creating an account you agree to our terms of service and privacy policy.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
