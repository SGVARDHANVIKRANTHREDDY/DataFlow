"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { adminApi } from "@/lib/api/client";
import { formatRelative, formatDate } from "@/lib/utils/format";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/stores/ui.store";
import { useAuthStore } from "@/stores/auth.store";
import { cn } from "@/lib/utils/cn";
import {
  ShieldCheck, RefreshCw, AlertCircle, ClipboardList,
  CheckCircle2, Link2, Lock
} from "lucide-react";

export default function AdminPage() {
  const { user } = useAuthStore();
  const toast = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"dlq" | "audit">("dlq");

  const { data: dlq, isLoading: dlqLoading } = useQuery({
    queryKey: ["admin-dlq"],
    queryFn: () => adminApi.listDlq(),
    enabled: !!user?.is_admin,
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const { data: audit, isLoading: auditLoading } = useQuery({
    queryKey: ["admin-audit"],
    queryFn: () => adminApi.listAudit(),
    enabled: !!user?.is_admin && activeTab === "audit",
    staleTime: 30000,
  });

  const replayMutation = useMutation({
    mutationFn: (id: number) => adminApi.replayDlq(id),
    onSuccess: () => {
      toast({ type: "success", title: "Task re-dispatched" });
      qc.invalidateQueries({ queryKey: ["admin-dlq"] });
    },
    onError: (e: Error) =>
      toast({ type: "error", title: "Replay failed", description: e.message }),
  });

  const verifyChain = useMutation({
    mutationFn: () => adminApi.verifyChain(),
    onSuccess: (data) =>
      toast({
        type: data.valid ? "success" : "error",
        title: data.valid ? "Audit chain intact" : "Chain integrity BROKEN",
        description: `${data.entries_checked} entries verified`,
      }),
    onError: () => toast({ type: "error", title: "Verification failed" }),
  });

  if (!user?.is_admin) {
    return (
      <div className="layout-page">
        <Card>
          <CardContent className="py-16 flex flex-col items-center justify-center gap-4">
            <Lock className="w-10 h-10 text-text-tertiary" />
            <div className="text-center">
              <h3 className="font-semibold text-text-primary">Access Restricted</h3>
              <p className="text-sm text-text-secondary mt-1">This area requires admin privileges.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="layout-page animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary-500" /> Admin Console
          </h2>
          <p className="text-sm text-text-secondary mt-0.5">Dead letter queue, audit trail, and user management</p>
        </div>
        <Button
          variant="secondary"
          size="md"
          onClick={() => verifyChain.mutate()}
          loading={verifyChain.isPending}
        >
          <Link2 className="w-4 h-4" /> Verify Audit Chain
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-background border border-border rounded-xl p-1 w-fit">
        {(["dlq", "audit"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-5 py-2 text-sm font-medium rounded-lg transition-all duration-150",
              activeTab === tab
                ? "bg-surface text-text-primary shadow-sm border border-border"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            {tab === "dlq" ? (
              <span className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5" /> Dead Letter Queue
                {(dlq?.total ?? 0) > 0 && (
                  <span className="px-1.5 py-0.5 bg-danger-100 text-danger-700 text-2xs rounded-full font-semibold">
                    {dlq?.total}
                  </span>
                )}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <ClipboardList className="w-3.5 h-3.5" /> Audit Log
              </span>
            )}
          </button>
        ))}
      </div>

      {/* DLQ Tab */}
      {activeTab === "dlq" && (
        <Card>
          <CardHeader>
            <CardTitle>Dead Letter Queue</CardTitle>
            <span className="text-xs text-text-tertiary">
              Failed tasks after max retries. Safe to replay.
            </span>
          </CardHeader>
          {dlqLoading ? (
            <table className="data-table"><SkeletonTable rows={3} /></table>
          ) : !dlq?.items?.length ? (
            <CardContent>
              <EmptyState
                icon={CheckCircle2}
                title="DLQ is empty"
                description="All tasks completed successfully. No failed jobs require attention."
                size="sm"
              />
            </CardContent>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Queue</th>
                    <th>Error</th>
                    <th>Retries</th>
                    <th>Replays</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {dlq.items.map((entry: { id: number; task_name: string; queue: string; error: string; retry_count: number; replay_count: number; suppressed: boolean; replayed: boolean; created_at: string }) => (
                    <tr key={entry.id}>
                      <td>
                        <span className="font-mono text-xs text-text-primary">
                          {entry.task_name.split(".").pop()}
                        </span>
                      </td>
                      <td>
                        <Badge variant="neutral">{entry.queue}</Badge>
                      </td>
                      <td>
                        <span className="text-xs text-danger-600 max-w-[200px] truncate block" title={entry.error}>
                          {entry.error.slice(0, 60)}{entry.error.length > 60 ? "…" : ""}
                        </span>
                      </td>
                      <td className="font-mono text-xs">{entry.retry_count}</td>
                      <td className="font-mono text-xs">{entry.replay_count}</td>
                      <td>
                        {entry.suppressed
                          ? <Badge variant="danger">Suppressed</Badge>
                          : entry.replayed
                          ? <Badge variant="success">Replayed</Badge>
                          : <Badge variant="warning">Pending</Badge>}
                      </td>
                      <td className="text-xs text-text-tertiary whitespace-nowrap">
                        {formatRelative(entry.created_at)}
                      </td>
                      <td>
                        {!entry.suppressed && !entry.replayed && (
                          <Button
                            variant="outline"
                            size="xs"
                            loading={replayMutation.isPending}
                            onClick={() => replayMutation.mutate(entry.id)}
                          >
                            <RefreshCw className="w-3 h-3" /> Replay
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Audit Tab */}
      {activeTab === "audit" && (
        <Card>
          <CardHeader>
            <CardTitle>Audit Log</CardTitle>
            <span className="text-xs text-text-tertiary">HMAC hash chain · tamper-evident</span>
          </CardHeader>
          {auditLoading ? (
            <table className="data-table"><SkeletonTable rows={6} /></table>
          ) : !audit?.items?.length ? (
            <CardContent>
              <EmptyState icon={ClipboardList} title="No audit entries" description="Actions will appear here." size="sm" />
            </CardContent>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Seq</th>
                    <th>Action</th>
                    <th>User</th>
                    <th>Resource</th>
                    <th>IP</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.items.map((entry: { id: number; global_seq: number | null; action: string; user_id: number | null; resource_type: string | null; resource_id: number | null; ip_address: string | null; created_at: string }) => (
                    <tr key={entry.id}>
                      <td className="font-mono text-xs text-text-tertiary">
                        {entry.global_seq ?? "—"}
                      </td>
                      <td>
                        <span className="font-mono text-xs text-primary-600">{entry.action}</span>
                      </td>
                      <td className="font-mono text-xs">{entry.user_id ?? "system"}</td>
                      <td className="text-xs text-text-secondary">
                        {entry.resource_type
                          ? `${entry.resource_type}/${entry.resource_id}`
                          : "—"}
                      </td>
                      <td className="font-mono text-xs text-text-tertiary">
                        {entry.ip_address ?? "—"}
                      </td>
                      <td className="text-xs text-text-tertiary whitespace-nowrap">
                        {formatRelative(entry.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
