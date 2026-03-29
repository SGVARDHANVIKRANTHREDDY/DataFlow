"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { pipelinesApi } from "@/lib/api/client";
import {
  formatRelative, formatDuration, formatNumber, getStatusConfig
} from "@/lib/utils/format";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import type { Execution, StepLog } from "@/types";
import {
  PlayCircle, ChevronDown, ChevronUp, Download,
  CheckCircle2, XCircle, AlertTriangle, Clock
} from "lucide-react";

export default function ExecutionsPage() {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: pipelines, isLoading: pipesLoading } = useQuery({
    queryKey: ["pipelines", 1, 20],
    queryFn: () => pipelinesApi.list(1, 20),
    staleTime: 30000,
  });

  // Get executions for the first pipeline as example — in production iterate all
  const firstPipeId = pipelines?.items[0]?.id;
  const { data: executions, isLoading: execLoading } = useQuery({
    queryKey: ["executions", firstPipeId],
    queryFn: () => pipelinesApi.executions(firstPipeId!),
    enabled: !!firstPipeId,
    staleTime: 15000,
    refetchInterval: 10000,
  });

  const isLoading = pipesLoading || execLoading;

  return (
    <div className="layout-page animate-fade-in">
      <div className="mb-8">
        <h2 className="text-xl font-bold text-text-primary">Executions</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          Monitor pipeline runs, view step-by-step logs, and download results
        </p>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total", value: executions?.length || 0, icon: PlayCircle, color: "text-primary-600", bg: "bg-primary-50" },
          { label: "Success", value: executions?.filter(e => e.status === "success").length || 0, icon: CheckCircle2, color: "text-success-600", bg: "bg-success-50" },
          { label: "Partial", value: executions?.filter(e => e.status === "partial").length || 0, icon: AlertTriangle, color: "text-warning-600", bg: "bg-warning-50" },
          { label: "Failed", value: executions?.filter(e => e.status === "failed").length || 0, icon: XCircle, color: "text-danger-600", bg: "bg-danger-50" },
        ].map((m) => (
          <div key={m.label} className="bg-surface rounded-xl border border-border p-5" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className={`w-8 h-8 rounded-lg ${m.bg} flex items-center justify-center mb-3`}>
              <m.icon className={`w-4 h-4 ${m.color}`} />
            </div>
            <div className="text-2xl font-bold text-text-primary">{m.value}</div>
            <div className="text-xs text-text-tertiary mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Executions table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent executions</CardTitle>
          {executions?.length ? (
            <span className="text-xs text-text-tertiary">Refreshes every 10s</span>
          ) : null}
        </CardHeader>

        {isLoading ? (
          <table className="data-table">
            <SkeletonTable rows={5} />
          </table>
        ) : !executions?.length ? (
          <CardContent>
            <EmptyState
              icon={PlayCircle}
              title="No executions yet"
              description="Run a pipeline to see execution history and step-by-step logs here."
            />
          </CardContent>
        ) : (
          <div>
            {executions.map((exec) => (
              <ExecutionRow
                key={exec.id}
                exec={exec}
                isExpanded={expandedId === exec.id}
                onToggle={() => setExpandedId(expandedId === exec.id ? null : exec.id)}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ExecutionRow({ exec, isExpanded, onToggle }: {
  exec: Execution;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const cfg = getStatusConfig(exec.status);

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-6 py-4 hover:bg-background transition-colors text-left"
      >
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", cfg.badge.split(" ")[0])}>
          <PlayCircle className={cn("w-4 h-4", cfg.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">Execution #{exec.id}</span>
            <StatusBadge status={exec.status} />
          </div>
          <div className="text-xs text-text-tertiary mt-0.5">
            {formatRelative(exec.created_at)}
            {exec.duration_ms ? ` · ${formatDuration(exec.duration_ms)}` : ""}
            {exec.report
              ? ` · ${formatNumber(exec.report.input_count)} → ${formatNumber(exec.report.output_count)} rows`
              : ""}
          </div>
        </div>
        {exec.download_url && (
          <a
            href={exec.download_url}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-xs text-primary-600 font-medium px-3 py-1.5 rounded-lg border border-primary-200 bg-primary-50 hover:bg-primary-100 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </a>
        )}
        {isExpanded ? <ChevronUp className="w-4 h-4 text-text-tertiary flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-text-tertiary flex-shrink-0" />}
      </button>

      {isExpanded && exec.report && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="px-6 pb-5 overflow-hidden"
        >
          <div className="bg-background rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-surface">
              <div className="flex items-center gap-4 text-xs text-text-secondary">
                <span><strong className="text-text-primary">{exec.report.steps_ok}</strong>/{exec.report.steps_total} steps passed</span>
                {exec.report.steps_failed > 0 && (
                  <span className="text-danger-600"><strong>{exec.report.steps_failed}</strong> failed</span>
                )}
                <span>{formatDuration(exec.report.total_ms)} total</span>
              </div>
            </div>
            {exec.report.log.map((log: StepLog) => (
              <div
                key={log.index}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 text-xs",
                  log.status === "error" ? "bg-danger-50" : ""
                )}
              >
                <div className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0",
                  log.status === "ok" ? "bg-success-100 text-success-600" : "bg-danger-100 text-danger-600"
                )}>
                  {log.status === "ok"
                    ? <CheckCircle2 className="w-3 h-3" />
                    : <XCircle className="w-3 h-3" />}
                </div>
                <span className="font-medium text-text-primary w-36 truncate">
                  {log.index + 1}. {log.action.replace(/_/g, " ")}
                </span>
                <span className="text-text-tertiary">
                  {formatNumber(log.rows_before)} → {formatNumber(log.rows_after)} rows
                  <span className={cn("ml-1 font-medium", log.delta < 0 ? "text-danger-600" : log.delta > 0 ? "text-success-600" : "text-text-tertiary")}>
                    ({log.delta >= 0 ? "+" : ""}{log.delta})
                  </span>
                </span>
                <span className="ml-auto text-text-tertiary font-mono">{formatDuration(log.ms)}</span>
                {log.error && (
                  <span className="text-danger-600 truncate max-w-[200px]">{log.error}</span>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
