/**
 * Auto-generated types from FastAPI OpenAPI schema.
 *
 * In production: run `npm run generate:api` to regenerate from live schema.
 * Command: openapi-typescript http://localhost:8000/api/openapi.json -o src/lib/generated/api-types.ts
 *
 * These types exactly match the FastAPI Pydantic models — any backend change
 * causes a TypeScript compile error here instead of a silent runtime bug.
 */

// ─── Auth ────────────────────────────────────────────────────────────────────
export interface UserOut {
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
  token_type: "bearer";
}

export interface UserLogin {
  email: string;
  password: string;
}

export interface UserRegister {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

// ─── Dataset ─────────────────────────────────────────────────────────────────
export type ProfilingStatus = "pending" | "running" | "completed" | "failed";

export interface ColumnProfileNumeric {
  col: string;
  type: "numeric";
  null_count: number;
  null_pct: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
  iqr: number;
  outliers: number;
  skew: number;
}

export interface ColumnProfileCategorical {
  col: string;
  type: "categorical";
  null_count: number;
  null_pct: number;
  unique_count: number;
  top_values: [string, number][];
}

export type ColumnProfile = ColumnProfileNumeric | ColumnProfileCategorical;

export interface DatasetProfile {
  profiles: ColumnProfile[];
  corr: Record<string, Record<string, number>>;
  numeric_cols: string[];
  health_score: number;
  row_count: number;
  col_count: number;
}

export interface DatasetOut {
  id: number;
  name: string;
  original_filename: string;
  row_count: number;
  col_count: number;
  file_size_bytes: number;
  headers: string[] | null;
  profile: DatasetProfile | null;
  profiling_status: ProfilingStatus;
  file_hash: string | null;
  is_quarantined: boolean;
  created_at: string;
}

export interface DatasetListResponse {
  items: DatasetOut[];
  total: number;
  page: number;
  page_size: number;
}

export interface UploadResponse {
  dataset_id: number;
  job_id: number;
  celery_task_id: string;
  warnings: string[];
}

export interface SuggestionsResponse {
  suggestions: SmartSuggestion[];
}

export interface SmartSuggestion {
  prompt: string;
  reason: string;
  icon: string;
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

export interface PipelineOut {
  id: number;
  name: string;
  dataset_id: number | null;
  steps: PipelineStep[];
  version: number;
  created_at: string;
  updated_at: string;
}

export interface PipelineListResponse {
  items: PipelineOut[];
  total: number;
  page: number;
  page_size: number;
}

export interface PipelineCreate {
  name: string;
  steps: PipelineStep[];
  dataset_id?: number | null;
}

export interface PipelineUpdate {
  name?: string;
  steps?: PipelineStep[];
}

export interface TranslateRequest {
  prompt: string;
  dataset_id?: number | null;
}

export interface TranslateResponse {
  steps: PipelineStep[];
  rejected: unknown[];
  warnings: string[];
}

export interface ExecuteRequest {
  dataset_id: number;
}

export interface ExecuteResponse {
  execution_id: number;
  job_id: number;
  celery_task_id: string;
  status: "pending";
}

// ─── Job ─────────────────────────────────────────────────────────────────────
export type JobStatus = "pending" | "running" | "completed" | "failed" | "revoked";

export interface JobOut {
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

export interface ExecutionOut {
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

// ─── Admin ───────────────────────────────────────────────────────────────────
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

export interface DLQListResponse {
  items: DLQEntry[];
  total: number;
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

export interface AuditListResponse {
  items: AuditEntry[];
  total: number;
}

export interface AuditVerifyResponse {
  valid: boolean;
  entries_checked: number;
  gaps_found?: number;
  broken_at_id?: number;
  reason?: string;
}

// ─── Error ───────────────────────────────────────────────────────────────────
export interface ApiError {
  error: {
    type: string;
    message: string;
    status_code?: number;
    request_id?: string;
  };
}

export function isApiError(data: unknown): data is ApiError {
  return (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as ApiError).error?.message === "string"
  );
}
