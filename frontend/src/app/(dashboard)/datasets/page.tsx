"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useDropzone } from "react-dropzone";
import { datasetsApi } from "@/lib/api/client";
import { formatBytes, formatNumber, formatRelative, getHealthColor, getHealthBarColor, generateIdempotencyKey } from "@/lib/utils/format";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/stores/ui.store";
import { cn } from "@/lib/utils/cn";
import {
  Upload, Database, Trash2, ChevronRight, BarChart2,
  AlertCircle, CheckCircle2, Clock, RefreshCw, Zap
} from "lucide-react";
import type { Dataset } from "@/types";
import { DatasetSuggestions } from "@/components/features/datasets/DatasetSuggestions";
import { CorrelationHeatmap } from "@/components/features/datasets/CorrelationHeatmap";
import { DistributionSparkline } from "@/components/features/datasets/DistributionSparkline";
import { DatasetAnomalies } from "@/components/features/datasets/DatasetAnomalies";

export default function DatasetsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [selected, setSelected] = useState<Dataset | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["datasets", 1, 20],
    queryFn: () => datasetsApi.list(1, 20),
    staleTime: 30000,
  });

  const uploadMutation = useMutation({
    mutationFn: ({ file, key }: { file: File; key: string }) =>
      datasetsApi.upload(file, key, setUploadProgress),
    onSuccess: () => {
      toast({ type: "success", title: "Dataset uploaded", description: "Profiling in progress…" });
      qc.invalidateQueries({ queryKey: ["datasets"] });
      setUploadProgress(null);
      setTimeout(() => qc.invalidateQueries({ queryKey: ["datasets"] }), 3000);
    },
    onError: () => {
      toast({ type: "error", title: "Upload failed", description: "Check file format and try again." });
      setUploadProgress(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => datasetsApi.delete(id),
    onSuccess: () => {
      toast({ type: "success", title: "Dataset deleted" });
      qc.invalidateQueries({ queryKey: ["datasets"] });
      if (selected) setSelected(null);
    },
    onError: () => toast({ type: "error", title: "Delete failed" }),
  });

  const onDrop = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) return;
      if (!file.name.endsWith(".csv")) {
        toast({ type: "error", title: "Only .csv files are supported" });
        return;
      }
      uploadMutation.mutate({ file, key: generateIdempotencyKey() });
    },
    [uploadMutation, toast]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    maxFiles: 1,
    disabled: uploadMutation.isPending,
  });

  return (
    <div className="layout-page animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Datasets</h2>
          <p className="text-text-secondary text-sm mt-0.5">
            {data?.total ? `${data.total} dataset${data.total !== 1 ? "s" : ""}` : "Upload CSV files to get started"}
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={() => document.getElementById("file-upload-trigger")?.click()}
          loading={uploadMutation.isPending}
        >
          <Upload className="w-4 h-4" />
          Upload CSV
        </Button>
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={cn("drop-zone p-8 text-center mb-6 transition-all duration-200", isDragActive && "active")}
      >
        <input {...getInputProps()} id="file-upload-trigger" />
        <Upload className={cn("w-8 h-8 mx-auto mb-3 transition-colors", isDragActive ? "text-primary-500" : "text-text-tertiary")} />
        <p className="text-sm font-medium text-text-primary mb-1">
          {isDragActive ? "Drop your CSV here" : "Drop a CSV file or click to upload"}
        </p>
        <p className="text-xs text-text-tertiary">Maximum 50MB · CSV format only</p>

        {uploadMutation.isPending && uploadProgress !== null && (
          <div className="mt-4 max-w-xs mx-auto">
            <div className="flex justify-between text-xs text-text-secondary mb-1.5">
              <span>Uploading…</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-danger-50 border border-danger-100 rounded-xl mb-6 text-danger-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Failed to load datasets. Check your connection and try again.
        </div>
      )}

      {/* Table */}
      <Card>
        {isLoading ? (
          <div>
            <div className="px-6 py-4 border-b border-border">
              <Skeleton className="h-4 w-32" />
            </div>
            <table className="data-table">
              <SkeletonTable rows={4} />
            </table>
          </div>
        ) : !data?.items.length ? (
          <CardContent className="py-4">
            <EmptyState
              icon={Database}
              title="No datasets yet"
              description="Upload your first CSV file to start building data pipelines."
            />
          </CardContent>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Size</th>
                    <th>Rows</th>
                    <th>Columns</th>
                    <th>Health</th>
                    <th>Status</th>
                    <th>Uploaded</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {data.items.map((ds) => (
                      <motion.tr
                        key={ds.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSelected(selected?.id === ds.id ? null : ds)}
                        className="cursor-pointer"
                      >
                        <td>
                          <div className="flex items-center gap-2.5">
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                              ds.is_quarantined ? "bg-danger-50" : "bg-primary-50"
                            )}>
                              <Database className={cn("w-4 h-4", ds.is_quarantined ? "text-danger-500" : "text-primary-500")} />
                            </div>
                            <div>
                              <div className="font-medium text-text-primary text-sm">{ds.name}</div>
                              <div className="text-xs text-text-tertiary font-mono">{ds.file_hash?.slice(0, 12)}…</div>
                            </div>
                          </div>
                        </td>
                        <td className="font-mono text-xs">{formatBytes(ds.file_size_bytes)}</td>
                        <td className="font-mono text-xs">{formatNumber(ds.row_count)}</td>
                        <td className="font-mono text-xs">{ds.col_count}</td>
                        <td>
                          {ds.profile ? (
                            <div className="flex items-center gap-2">
                              <div className="progress-track w-16">
                                <div
                                  className={cn("progress-fill", getHealthBarColor(ds.profile.health_score))}
                                  style={{ width: `${ds.profile.health_score}%` }}
                                />
                              </div>
                              <span className={cn("text-xs font-semibold", getHealthColor(ds.profile.health_score))}>
                                {ds.profile.health_score}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-text-tertiary">—</span>
                          )}
                        </td>
                        <td>
                          <StatusIcon status={ds.profiling_status} />
                        </td>
                        <td className="text-xs text-text-tertiary whitespace-nowrap">
                          {formatRelative(ds.created_at)}
                        </td>
                        <td>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(ds.id); }}
                            disabled={deleteMutation.isPending}
                            className="p-1.5 text-text-tertiary hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>

            {/* Inline profile panel */}
            <AnimatePresence>
              {selected && selected.profile && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="border-t border-border overflow-hidden"
                >
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-sm font-semibold text-text-primary flex items-center gap-2">
                        <BarChart2 className="w-4 h-4 text-primary-500" />
                        Dataset Profile: {selected.name}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                        Close
                      </Button>
                    </div>
                    <ProfileGrid dataset={selected} />
                    <DatasetSuggestions datasetId={selected.id} />
                    {selected.profile?.correlations && (
                      <CorrelationHeatmap correlations={selected.profile.correlations} />
                    )}
                    <DatasetAnomalies datasetId={selected.id} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </Card>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return (
    <span className="inline-flex items-center gap-1.5 text-xs text-success-700">
      <CheckCircle2 className="w-3.5 h-3.5" /> Profiled
    </span>
  );
  if (status === "running" || status === "pending") return (
    <span className="inline-flex items-center gap-1.5 text-xs text-accent-600">
      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Profiling…
    </span>
  );
  if (status === "failed") return (
    <span className="inline-flex items-center gap-1.5 text-xs text-danger-600">
      <AlertCircle className="w-3.5 h-3.5" /> Failed
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-tertiary">
      <Clock className="w-3.5 h-3.5" /> Pending
    </span>
  );
}

function ProfileGrid({ dataset }: { dataset: Dataset }) {
  const p = dataset.profile!;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {p.profiles.slice(0, 10).map((col) => (
        <div key={col.col} className="bg-background rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-text-primary truncate max-w-[80px]" title={col.col}>
              {col.col}
            </span>
            <Badge
              variant={col.type === "numeric" ? "primary" : "info"}
              className="text-2xs px-1.5 py-0.5"
            >
              {col.type === "numeric" ? "N" : "C"}
            </Badge>
          </div>
          <div className="space-y-1">
            {col.type === "numeric" ? (
              <>
                <StatRow label="Mean" value={col.mean?.toFixed(2)} />
                <StatRow label="Std"  value={col.std?.toFixed(2)} />
                <StatRow label="Nulls" value={`${col.null_pct?.toFixed(1)}%`} warn={(col.null_pct ?? 0) > 5} />
                {(col.outliers ?? 0) > 0 && (
                  <StatRow label="Outliers" value={col.outliers} warn />
                )}
                {col.min !== undefined && col.max !== undefined && (
                  <div className="pt-2 mt-2 border-t border-border/50">
                    <DistributionSparkline
                      min={col.min} q1={col.q1 ?? col.min}
                      median={col.median ?? col.min}
                      q3={col.q3 ?? col.max} max={col.max}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <StatRow label="Unique" value={col.unique_count} />
                <StatRow label="Nulls" value={`${col.null_pct?.toFixed(1)}%`} warn={(col.null_pct ?? 0) > 5} />
                {col.top_values?.[0] && (
                  <StatRow label="Top" value={String(col.top_values[0][0]).slice(0, 10)} />
                )}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatRow({ label, value, warn }: { label: string; value: unknown; warn?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-2xs text-text-tertiary">{label}</span>
      <span className={cn("text-2xs font-medium font-mono", warn ? "text-warning-600" : "text-text-secondary")}>
        {value ?? "—"}
      </span>
    </div>
  );
}
