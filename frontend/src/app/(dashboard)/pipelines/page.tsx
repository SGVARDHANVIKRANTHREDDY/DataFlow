"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { pipelinesApi, datasetsApi, aiApi } from "@/lib/api/client";
import { usePipelineStore } from "@/stores/pipeline.store";
import { useToast } from "@/stores/ui.store";
import { useJobPoll } from "@/hooks/use-job-poll";
import { generateIdempotencyKey, formatRelative } from "@/lib/utils/format";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import type { Pipeline, PipelineStep, Job } from "@/types";
import {
  GitBranch, Plus, Play, Save, Trash2, Sparkles,
  X, GripVertical, Database, ChevronDown,
  AlertCircle, CheckCircle2, ArrowRight, Wand2, MessageSquare, Info
} from "lucide-react";
import { ForkButton } from "@/components/pipelines/ForkButton";
import { HistoryControls } from "@/components/pipelines/HistoryControls";

const ACTION_META: Record<string, { label: string; color: string; bg: string; category: string }> = {
  drop_nulls:          { label: "Drop Nulls",          color: "text-danger-600",   bg: "bg-danger-50",   category: "Cleaning" },
  fill_nulls:          { label: "Fill Nulls",          color: "text-warning-600",  bg: "bg-warning-50",  category: "Cleaning" },
  remove_outliers:     { label: "Remove Outliers",     color: "text-orange-600",   bg: "bg-orange-50",   category: "Cleaning" },
  remove_duplicates:   { label: "Remove Duplicates",   color: "text-red-500",      bg: "bg-red-50",      category: "Cleaning" },
  normalize:           { label: "Normalize",           color: "text-primary-600",  bg: "bg-primary-50",  category: "Transform" },
  standardize:         { label: "Standardize",         color: "text-primary-600",  bg: "bg-primary-50",  category: "Transform" },
  encode_categorical:  { label: "Encode Categorical",  color: "text-accent-600",   bg: "bg-accent-50",   category: "Transform" },
  convert_types:       { label: "Convert Types",       color: "text-accent-600",   bg: "bg-accent-50",   category: "Transform" },
  filter_rows:         { label: "Filter Rows",         color: "text-success-600",  bg: "bg-success-50",  category: "Filter" },
  select_columns:      { label: "Select Columns",      color: "text-teal-600",     bg: "bg-teal-50",     category: "Select" },
  drop_columns:        { label: "Drop Columns",        color: "text-teal-600",     bg: "bg-teal-50",     category: "Select" },
  sort_values:         { label: "Sort Values",         color: "text-violet-600",   bg: "bg-violet-50",   category: "Sort" },
  groupby_aggregate:   { label: "Group & Aggregate",   color: "text-violet-600",   bg: "bg-violet-50",   category: "Aggregate" },
};

export default function PipelinesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const store = usePipelineStore();
  const [chatInput, setChatInput] = useState("");
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [executionResult, setExecutionResult] = useState<{ status: string; downloadUrl?: string } | null>(null);
  const [explanationResult, setExplanationResult] = useState<string | null>(null);

  const { data: pipelines, isLoading: pipesLoading } = useQuery({
    queryKey: ["pipelines", 1, 10],
    queryFn: () => pipelinesApi.list(1, 10),
    staleTime: 30000,
  });

  const { data: datasets } = useQuery({
    queryKey: ["datasets", 1, 50],
    queryFn: () => datasetsApi.list(1, 50),
    staleTime: 60000,
  });

  const translateMutation = useMutation({
    mutationFn: (prompt: string) =>
      pipelinesApi.translate(prompt, store.activeDataset?.id),
    onMutate: () => store.setIsTranslating(true),
    onSuccess: (data) => {
      store.addSteps(data.steps || []);
      toast({
        type: "success",
        title: `${data.steps?.length || 0} step${data.steps?.length !== 1 ? "s" : ""} added`,
        description: data.steps?.map((s: PipelineStep) => ACTION_META[s.action]?.label || s.action).join(", "),
      });
      setChatInput("");
    },
    onError: () => toast({ type: "error", title: "Translation failed", description: "Could not interpret your request." }),
    onSettled: () => store.setIsTranslating(false),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (store.activePipelineId) {
        return pipelinesApi.update(store.activePipelineId, {
          name: store.name,
          steps: store.steps,
        });
      }
      return pipelinesApi.create({
        name: store.name || "Untitled Pipeline",
        steps: store.steps,
        dataset_id: store.activeDataset?.id || undefined
      });
    },
    onSuccess: (data) => {
      if (!store.activePipelineId && data.id) {
        store.setActivePipelineId(data.id);
      }
      toast({ type: "success", title: store.activePipelineId ? "Pipeline updated" : "Pipeline saved" });
      qc.invalidateQueries({ queryKey: ["pipelines"] });
    },
    onError: () => toast({ type: "error", title: "Save failed" }),
  });

  const executeMutation = useMutation({
    mutationFn: () => {
      if (!store.activePipelineId) throw new Error("Save pipeline first");
      if (!store.activeDataset) throw new Error("Select a dataset first");
      return pipelinesApi.execute(store.activePipelineId, store.activeDataset.id, generateIdempotencyKey());
    },
    onMutate: () => { store.setIsExecuting(true); setExecutionResult(null); },
    onSuccess: (data) => {
      setActiveJobId(data.job_id);
      toast({ type: "info", title: "Execution started", description: "Monitoring job progress…" });
    },
    onError: (e: Error) => {
      store.setIsExecuting(false);
      toast({ type: "error", title: "Execution failed", description: e.message });
    },
  });

  useJobPoll({
    jobId: activeJobId,
    enabled: !!activeJobId,
    onComplete: (job: Job) => {
      store.setIsExecuting(false);
      setActiveJobId(null);
      const result = job.result as Record<string, unknown>;
      setExecutionResult({ status: "success", downloadUrl: result?.download_url as string });
      toast({ type: "success", title: "Execution complete!", description: `${result?.output_row_count || 0} rows processed` });
    },
    onError: (err) => {
      store.setIsExecuting(false);
      setActiveJobId(null);
      toast({ type: "error", title: "Execution failed", description: err });
    },
  });

  function loadPipeline(p: Pipeline) {
    store.setName(p.name);
    store.setSteps(p.steps);
    store.setActivePipelineId(p.id);
    setExecutionResult(null);
    setExplanationResult(null);
    toast({ type: "info", title: `Loaded: ${p.name}` });
  }

  const explainMutation = useMutation({
    mutationFn: () => aiApi.explain(store.steps),
    onSuccess: (data) => {
      if (data.error) toast({ type: "error", title: "Explanation failed", description: data.error });
      else setExplanationResult(data.explanation);
    },
    onError: () => toast({ type: "error", title: "Failed to connect to AI router" }),
  });

  async function handleSaveAndExecute() {
    if (!store.activeDataset) { toast({ type: "warning", title: "Select a dataset first" }); return; }
    if (!store.steps.length)  { toast({ type: "warning", title: "Add at least one step" }); return; }

    try {
      const saved = await saveMutation.mutateAsync();
      if (saved?.id) store.setActivePipelineId(saved.id);
      await executeMutation.mutateAsync();
    } catch { /* handled in mutations */ }
  }

  const handleTranslate = useCallback(() => {
    if (!chatInput.trim() || store.isTranslating) return;
    translateMutation.mutate(chatInput.trim());
  }, [chatInput, store.isTranslating, translateMutation]);

  return (
    <div className="layout-page animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Pipeline Builder</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            Describe transforms in natural language — AI builds the pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="md" onClick={() => store.reset()}>
            <Plus className="w-4 h-4" /> New
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSaveAndExecute}
            loading={store.isExecuting || saveMutation.isPending}
            disabled={!store.steps.length}
          >
            <Play className="w-4 h-4" />
            {store.isExecuting ? "Running…" : "Save & Run"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Saved pipelines list (left) */}
        <div className="col-span-12 lg:col-span-3">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Saved pipelines</CardTitle>
              <span className="text-xs text-text-tertiary">{pipelines?.total || 0}</span>
            </CardHeader>
            {pipesLoading ? (
              <CardContent className="space-y-3">
                {[1,2,3].map(i => (
                  <div key={i} className="flex gap-2 items-center">
                    <div className="skeleton w-8 h-8 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-2.5 w-16" />
                    </div>
                  </div>
                ))}
              </CardContent>
            ) : !pipelines?.items.length ? (
              <CardContent>
                <EmptyState icon={GitBranch} title="No pipelines" description="Save your first pipeline to see it here." size="sm" />
              </CardContent>
            ) : (
              <div className="overflow-y-auto max-h-96">
                {pipelines.items.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => loadPipeline(p)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 text-left",
                      "hover:bg-background transition-colors",
                      store.activePipelineId === p.id && "bg-primary-50"
                    )}
                  >
                    <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <GitBranch className="w-4 h-4 text-primary-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-primary truncate">{p.name}</div>
                      <div className="text-xs text-text-tertiary">{p.steps.length} steps · {formatRelative(p.updated_at)}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <ForkButton pipelineId={p.id} size="icon" showLabel={false} className="h-8 w-8 text-text-tertiary hover:text-primary-600" />
                      {store.activePipelineId === p.id && <div className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Builder (center + right) */}
        <div className="col-span-12 lg:col-span-9 space-y-4">
          {/* Pipeline name + dataset selector */}
          <Card>
            <CardContent className="flex items-center gap-4 py-3 px-4">
              <HistoryControls />
              <input
                value={store.name}
                onChange={(e) => store.setName(e.target.value)}
                className="flex-1 text-base font-semibold text-text-primary bg-transparent border-none outline-none focus:outline-none placeholder:text-text-tertiary"
                placeholder="Pipeline name…"
              />
              <div className="h-5 w-px bg-border" />
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-text-tertiary" />
                <select
                  value={store.activeDataset?.id || ""}
                  onChange={(e) => {
                    const ds = datasets?.items.find((d) => d.id === Number(e.target.value));
                    store.setActiveDataset(ds || null);
                  }}
                  className="text-sm text-text-secondary bg-transparent border-none outline-none cursor-pointer focus:outline-none"
                >
                  <option value="">Select dataset…</option>
                  {datasets?.items.map((ds) => (
                    <option key={ds.id} value={ds.id}>{ds.name}</option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          {/* AI chat input */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary-500" />
                <span className="text-sm font-medium text-text-primary">AI Transform Builder</span>
                <Badge variant="primary" className="text-2xs">Powered by Claude</Badge>
              </div>

              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleTranslate()}
                  placeholder='Describe a transformation — e.g. "remove missing values then normalize salary column"'
                  className="flex-1 h-10 px-4 text-sm border border-border rounded-xl bg-background text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
                />
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleTranslate}
                  loading={store.isTranslating}
                  disabled={!chatInput.trim()}
                >
                  <Wand2 className="w-4 h-4" />
                  Translate
                </Button>
              </div>

              {/* Quick chips */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {[
                  "Remove missing values",
                  "Remove outliers",
                  "Normalize all numeric columns",
                  "Encode categorical columns",
                  "Remove duplicates",
                  "Standardize",
                ].map((chip) => (
                  <button
                    key={chip}
                    onClick={() => { setChatInput(chip); }}
                    className="text-xs px-3 py-1.5 rounded-full border border-border bg-background text-text-secondary hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition-all"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Steps list */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Pipeline steps</CardTitle>
                <div className="text-xs text-text-tertiary">{store.steps.length} step{store.steps.length !== 1 ? "s" : ""}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => explainMutation.mutate()}
                loading={explainMutation.isPending}
                disabled={!store.steps.length}
                className="text-xs font-semibold"
              >
                <MessageSquare className="w-4 h-4 mr-2 text-primary-500" />
                Explain
              </Button>
            </CardHeader>

            {!store.steps.length ? (
              <CardContent>
                <EmptyState
                  icon={GitBranch}
                  title="No steps yet"
                  description='Use the AI builder above to describe what you want — e.g. "remove missing values and normalize the data"'
                  size="sm"
                />
              </CardContent>
            ) : (
              <div className="px-4 py-3 space-y-2">
                <AnimatePresence>
                  {store.steps.map((step, idx) => {
                    const meta = ACTION_META[step.action] || { label: step.action, color: "text-text-secondary", bg: "bg-background", category: "Other" };
                    return (
                      <motion.div
                        key={`${step.action}-${idx}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center gap-3 p-3.5 bg-background rounded-xl border border-border group hover:border-primary-200 transition-colors"
                      >
                        <div className="text-text-tertiary cursor-grab">
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0", meta.bg, meta.color)}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={cn("text-sm font-semibold", meta.color)}>{meta.label}</div>
                          <div className="text-xs text-text-tertiary mt-0.5">
                            {step.params.columns?.length
                              ? `cols: ${step.params.columns.slice(0, 3).join(", ")}${step.params.columns.length > 3 ? "…" : ""}`
                              : "All applicable columns"}
                            {step.params.method ? ` · ${step.params.method}` : ""}
                            {step.params.threshold != null ? ` · threshold: ${step.params.threshold}` : ""}
                            {step.params.order ? ` · ${step.params.order}` : ""}
                          </div>
                        </div>
                        <span className="text-2xs text-text-tertiary bg-border/50 px-2 py-0.5 rounded-full hidden sm:inline">
                          {meta.category}
                        </span>
                        <button
                          onClick={() => store.removeStep(idx)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-text-tertiary hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-all"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {/* Explanation Result */}
                <AnimatePresence>
                  {explanationResult && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden mb-4"
                    >
                      <div className="p-4 bg-primary-50/50 border border-primary-100 rounded-xl flex gap-3 text-sm text-text-secondary leading-relaxed mt-2">
                        <Info className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-primary-900 mb-1">AI Explanation</p>
                          {explanationResult}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => saveMutation.mutate()}
                    loading={saveMutation.isPending}
                    disabled={!store.steps.length}
                  >
                    <Save className="w-3.5 h-3.5" /> Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { store.setSteps([]); setExecutionResult(null); }}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Clear
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Execution result */}
          <AnimatePresence>
            {executionResult && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <Card className="border-success-200 bg-success-50">
                  <CardContent className="flex items-center gap-4 py-4">
                    <CheckCircle2 className="w-5 h-5 text-success-600 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-success-900">Execution complete</div>
                      <div className="text-xs text-success-700 mt-0.5">Output is ready for download</div>
                    </div>
                    {executionResult.downloadUrl && (
                      <a
                        href={executionResult.downloadUrl}
                        className="flex items-center gap-2 px-4 py-2 bg-success-600 text-white text-sm font-semibold rounded-xl hover:bg-success-700 transition-colors"
                      >
                        Download CSV <ArrowRight className="w-4 h-4" />
                      </a>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
