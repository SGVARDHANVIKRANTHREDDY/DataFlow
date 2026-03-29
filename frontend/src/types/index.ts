// ─── Auth ────────────────────────────────────────────────────────────────────
export interface User {
  id: number;
  email: string;
  is_active: boolean;
  is_admin: boolean;
  is_super_admin: boolean;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

// ─── Dataset ─────────────────────────────────────────────────────────────────
export interface ColumnProfile {
  col: string;
  type: "numeric" | "categorical";
  null_count: number;
  null_pct: number;
  mean?: number;
  median?: number;
  std?: number;
  min?: number;
  max?: number;
  q1?: number;
  q3?: number;
  iqr?: number;
  outliers?: number;
  skew?: number;
  unique_count?: number;
  top_values?: [string, number][];
}

export interface DatasetProfile {
  profiles: ColumnProfile[];
  corr: Record<string, Record<string, number>>;
  numeric_cols: string[];
  health_score: number;
  row_count: number;
  col_count: number;
}

export interface Dataset {
  id: number;
  name: string;
  original_filename: string;
  row_count: number;
  col_count: number;
  file_size_bytes: number;
  headers: string[] | null;
  profile: DatasetProfile | null;
  profiling_status: "pending" | "running" | "completed" | "failed";
  file_hash: string | null;
  is_quarantined: boolean;
  created_at: string;
}

export interface DatasetListResponse {
  items: Dataset[];
  total: number;
  page: number;
  page_size: number;
}

// ─── Pipeline ────────────────────────────────────────────────────────────────
export type PipelineAction =
  | "drop_nulls"
  | "fill_nulls"
  | "remove_outliers"
  | "normalize"
  | "standardize"
  | "encode_categorical"
  | "filter_rows"
  | "select_columns"
  | "drop_columns"
  | "sort_values"
  | "groupby_aggregate"
  | "remove_duplicates"
  | "convert_types";

export interface StepParams {
  columns: string[];
  method: string;
  threshold: number | null;
  order: "asc" | "desc" | "";
}

export interface PipelineStep {
  action: PipelineAction;
  params: StepParams;
}

export interface Pipeline {
  id: number;
  name: string;
  dataset_id: number | null;
  steps: PipelineStep[];
  version: number;
  created_at: string;
  updated_at: string;
}

export interface PipelineListResponse {
  items: Pipeline[];
  total: number;
  page: number;
  page_size: number;
}

// ─── Job ─────────────────────────────────────────────────────────────────────
export type JobStatus = "pending" | "running" | "completed" | "failed" | "revoked";

export interface Job {
  id: number;
  celery_task_id: string | null;
  job_type: "profile" | "execute";
  status: JobStatus;
  progress: number;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  retry_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// ─── Execution ───────────────────────────────────────────────────────────────
export type ExecutionStatus = "pending" | "running" | "success" | "partial" | "failed";

export interface StepLog {
  index: number;
  action: string;
  rows_before: number;
  rows_after: number;
  delta: number;
  ms: number;
  status: "ok" | "error";
  error: string | null;
}

export interface ExecutionReport {
  status: ExecutionStatus;
  steps_total: number;
  steps_ok: number;
  steps_failed: number;
  input_count: number;
  output_count: number;
  total_ms: number;
  log: StepLog[];
}

export interface Execution {
  id: number;
  pipeline_id: number;
  input_dataset_id: number;
  job_id: string | null;
  status: ExecutionStatus;
  report: ExecutionReport | null;
  output_s3_key: string | null;
  output_row_count: number | null;
  duration_ms: number | null;
  schema_warnings: string[] | null;
  error_detail: string | null;
  created_at: string;
  completed_at: string | null;
  download_url: string | null;
}

// ─── Admin / DLQ ─────────────────────────────────────────────────────────────
export interface DLQEntry {
  id: number;
  task_name: string;
  queue: string;
  error: string;
  retry_count: number;
  replay_count: number;
  suppressed: boolean;
  replayed: boolean;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  global_seq: number | null;
  user_id: number | null;
  action: string;
  resource_type: string | null;
  resource_id: number | null;
  ip_address: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

// ─── UI Helpers ──────────────────────────────────────────────────────────────
export interface ToastItem {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  description?: string;
}

export interface MetricCard {
  label: string;
  value: string | number;
  delta?: { value: string; positive: boolean };
  icon?: React.ReactNode;
  color?: "primary" | "success" | "warning" | "danger" | "accent";
}
