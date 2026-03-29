"use client";

import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { datasetsApi, pipelinesApi } from "@/lib/api/client";
import { formatBytes, formatRelative, formatNumber, getStatusConfig } from "@/lib/utils/format";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { SkeletonCard } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell
} from "recharts";
import {
  Database, GitBranch, PlayCircle, TrendingUp,
  Plus, ArrowRight, Zap, Activity, CheckCircle2, Circle
} from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { OnboardingCard } from "./OnboardingCard";
import { ForkButton } from "@/components/pipelines/ForkButton";

const FADE_UP = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.06, duration: 0.25, ease: [0.4, 0, 0.2, 1] }
  }),
};

const CHART_COLORS = ["#6366F1", "#06B6D4", "#22C55E", "#F59E0B", "#EF4444"];

// Activity charting data now fetched from the actual backend metrics endpoint.
export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data: dsData, isLoading: dsLoading } = useQuery({
    queryKey: ["datasets", 1, 5],
    queryFn: () => datasetsApi.list(1, 5),
    staleTime: 30000,
  });

  const { data: pipeData, isLoading: pipeLoading } = useQuery({
    queryKey: ["pipelines", 1, 5],
    queryFn: () => pipelinesApi.list(1, 5),
    staleTime: 30000,
  });

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ["pipelineActivityMetrics"],
    queryFn: () => pipelinesApi.metricsActivity(),
    staleTime: 60000,
  });

  const firstName = user?.email?.split("@")[0] ?? "there";

  const metrics = [
    {
      label: "Datasets",
      value: dsData?.total ?? 0,
      icon: Database,
      color: "text-primary-600",
      bg: "bg-primary-50",
      href: "/datasets",
      delta: "+2 this week",
    },
    {
      label: "Pipelines",
      value: pipeData?.total ?? 0,
      icon: GitBranch,
      color: "text-accent-600",
      bg: "bg-accent-50",
      href: "/pipelines",
      delta: "ready to run",
    },
    {
      label: "Executions",
      value: activityData?.reduce((acc, curr) => acc + curr.executions, 0) ?? "-",
      icon: PlayCircle,
      color: "text-success-600",
      bg: "bg-success-50",
      href: "/executions",
      delta: "total last 14 days",
    },
    {
      label: "Success Rate",
      value: activityData?.reduce((acc, curr) => acc + curr.success, 0)
          ? `${Math.round((activityData.reduce((acc, curr) => acc + curr.success, 0) / Math.max(1, activityData.reduce((acc, curr) => acc + curr.executions, 0))) * 100)}%`
          : "N/A",
      icon: TrendingUp,
      color: "text-warning-600",
      bg: "bg-warning-50",
      href: "/executions",
      delta: "rolling average",
    },
  ];

  return (
    <div className="layout-page animate-fade-in">
      {/* Welcome header */}
      <motion.div
        initial="hidden"
        animate="visible"
        custom={0}
        variants={FADE_UP}
        className="mb-8"
      >
        <h2 className="text-2xl font-bold text-text-primary">
          Good {getGreeting()}, {firstName} 👋
        </h2>
        <p className="text-text-secondary mt-1">
          Here&apos;s what&apos;s happening with your pipelines today.
        </p>
      </motion.div>

      {/* Onboarding Flow: only if no datasets */}
      {!dsLoading && (dsData?.total ?? 0) === 0 && (
         <motion.div initial="hidden" animate="visible" custom={0.5} variants={FADE_UP} className="mb-8">
            <OnboardingCard />
         </motion.div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {(dsLoading || pipeLoading)
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : metrics.map((m, i) => (
            <motion.div key={m.label} initial="hidden" animate="visible" custom={i + 1} variants={FADE_UP}>
              <Link href={m.href}>
                <Card className="hover:shadow-md transition-shadow duration-200 cursor-pointer group p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-9 h-9 rounded-lg ${m.bg} flex items-center justify-center`}>
                      <m.icon className={`w-4.5 h-4.5 ${m.color}`} />
                    </div>
                    <ArrowRight className="w-4 h-4 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="text-2xl font-bold text-text-primary mb-0.5">
                    {typeof m.value === "number" ? formatNumber(m.value) : m.value}
                  </div>
                  <div className="text-xs font-medium text-text-secondary mb-0.5">{m.label}</div>
                  <div className="text-xs text-text-tertiary">{m.delta}</div>
                </Card>
              </Link>
            </motion.div>
          ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {/* Area chart */}
        <motion.div initial="hidden" animate="visible" custom={5} variants={FADE_UP} className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary-500" />
                Execution activity
              </CardTitle>
              <Badge variant="neutral">Last 14 days</Badge>
            </CardHeader>
            <CardContent className="pt-2">
              {activityLoading ? (
                <div className="w-full h-[200px] flex items-center justify-center">
                  <div className="skeleton w-full h-[180px] rounded-lg" />
                </div>
              ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={activityData || []} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorExec" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22C55E" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="0" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#94A3B8" }}
                    axisLine={false}
                    tickLine={false}
                    interval={2}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94A3B8" }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #E2E8F0",
                      borderRadius: 10,
                      fontSize: 12,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="executions"
                    stroke="#6366F1"
                    strokeWidth={2}
                    fill="url(#colorExec)"
                    dot={false}
                    name="Executions"
                  />
                  <Area
                    type="monotone"
                    dataKey="success"
                    stroke="#22C55E"
                    strokeWidth={2}
                    fill="url(#colorSuccess)"
                    dot={false}
                    name="Successful"
                  />
                </AreaChart>
              </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick actions */}
        <motion.div initial="hidden" animate="visible" custom={6} variants={FADE_UP}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-accent-500" />
                Quick actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { href: "/datasets",  label: "Upload dataset",     icon: Database,   desc: "Import a CSV file",          color: "bg-primary-50 text-primary-600" },
                { href: "/pipelines", label: "New pipeline",       icon: GitBranch,  desc: "AI-powered builder",         color: "bg-accent-50 text-accent-600" },
                { href: "/pipelines", label: "Run pipeline",       icon: PlayCircle, desc: "Execute and download output",color: "bg-success-50 text-success-600" },
              ].map((item) => (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  className="flex items-center gap-3 p-3 rounded-xl border border-transparent hover:border-border hover:bg-background transition-all duration-150 group"
                >
                  <div className={`w-9 h-9 rounded-lg ${item.color} flex items-center justify-center flex-shrink-0`}>
                    <item.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-text-primary">{item.label}</div>
                    <div className="text-xs text-text-tertiary">{item.desc}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-text-tertiary ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent: datasets + pipelines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent datasets */}
        <motion.div initial="hidden" animate="visible" custom={7} variants={FADE_UP}>
          <Card>
            <CardHeader>
              <CardTitle>Recent datasets</CardTitle>
              <Link href="/datasets">
                <Button variant="ghost" size="sm" className="text-xs">
                  View all <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </CardHeader>
            {dsLoading ? (
              <CardContent>
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="skeleton w-8 h-8 rounded-lg" />
                      <div className="flex-1 space-y-1.5">
                        <div className="skeleton h-3 w-32" />
                        <div className="skeleton h-2.5 w-20" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            ) : !dsData?.items.length ? (
              <CardContent>
                <EmptyState
                  icon={Database}
                  title="No datasets yet"
                  description="Upload your first CSV to get started."
                  size="sm"
                  action={
                    <Link href="/datasets">
                      <Button size="sm">
                        <Plus className="w-4 h-4" /> Upload dataset
                      </Button>
                    </Link>
                  }
                />
              </CardContent>
            ) : (
              <div>
                {dsData.items.slice(0, 4).map((ds) => (
                  <Link key={ds.id} href="/datasets">
                    <div className="flex items-center gap-3 px-6 py-3.5 border-b border-border last:border-0 hover:bg-background transition-colors">
                      <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Database className="w-4 h-4 text-primary-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text-primary truncate">{ds.name}</div>
                        <div className="text-xs text-text-tertiary">
                          {formatNumber(ds.row_count)} rows · {formatBytes(ds.file_size_bytes)}
                        </div>
                      </div>
                      <div className="text-xs text-text-tertiary flex-shrink-0">
                        {formatRelative(ds.created_at)}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </motion.div>

        {/* Recent pipelines */}
        <motion.div initial="hidden" animate="visible" custom={8} variants={FADE_UP}>
          <Card>
            <CardHeader>
              <CardTitle>Recent pipelines</CardTitle>
              <Link href="/pipelines">
                <Button variant="ghost" size="sm" className="text-xs">
                  View all <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </CardHeader>
            {pipeLoading ? (
              <CardContent>
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="skeleton w-8 h-8 rounded-lg" />
                      <div className="flex-1 space-y-1.5">
                        <div className="skeleton h-3 w-40" />
                        <div className="skeleton h-2.5 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            ) : !pipeData?.items.length ? (
              <CardContent>
                <EmptyState
                  icon={GitBranch}
                  title="No pipelines yet"
                  description="Build your first pipeline using the AI-powered editor."
                  size="sm"
                  action={
                    <Link href="/pipelines">
                      <Button size="sm">
                        <Plus className="w-4 h-4" /> New pipeline
                      </Button>
                    </Link>
                  }
                />
              </CardContent>
            ) : (
              <div>
                {pipeData.items.slice(0, 4).map((p) => (
                  <Link key={p.id} href="/pipelines">
                    <div className="flex items-center gap-3 px-6 py-3.5 border-b border-border last:border-0 hover:bg-background transition-colors">
                      <div className="w-8 h-8 bg-accent-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <GitBranch className="w-4 h-4 text-accent-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text-primary truncate">{p.name}</div>
                        <div className="text-xs text-text-tertiary">
                          {p.steps.length} step{p.steps.length !== 1 ? "s" : ""} · v{p.version}
                        </div>
                      </div>
                      <div className="text-xs text-text-tertiary flex-shrink-0">
                        {formatRelative(p.updated_at)}
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <ForkButton pipelineId={p.id} size="icon" showLabel={false} className="h-8 w-8 text-text-tertiary hover:text-primary-600" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
