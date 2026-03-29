/**
 * API Client v12 — SECURITY REWRITE
 * No localStorage. No exposed tokens. All auth via HttpOnly cookies + BFF proxy.
 */
import type {
  UserOut, DatasetListResponse, DatasetOut, UploadResponse, SuggestionsResponse,
  PipelineListResponse, PipelineOut, PipelineCreate, PipelineUpdate,
  TranslateRequest, TranslateResponse, ExecuteResponse, ExecutionOut,
  JobOut, DLQListResponse, AuditListResponse, AuditVerifyResponse,
} from "@/lib/generated/api-types";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data?: unknown
  ) { super(message); this.name = "ApiClientError"; }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit & { params?: Record<string, string | number | boolean> } = {}
): Promise<T> {
  const { params, ...rest } = options;
  let url = `/api/proxy/${path}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    );
    url += `?${qs}`;
  }
  const res = await fetch(url, {
    ...rest,
    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest", ...(rest.headers || {}) },
    credentials: "same-origin", // sends HttpOnly cookies automatically
  });
  if (!res.ok) {
    let errData: unknown;
    try { errData = await res.json(); } catch { errData = null; }
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    const msg = (errData as { error?: { message?: string } })?.error?.message || `API error ${res.status}`;
    throw new ApiClientError(msg, res.status, errData);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// Auth calls BFF routes directly (not through proxy)
export const authApi = {
  login: async (email: string, password: string): Promise<void> => {
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }), credentials: "same-origin" });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new ApiClientError(d.error?.message || "Login failed", res.status, d); }
  },
  register: async (email: string, password: string): Promise<void> => {
    const res = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }), credentials: "same-origin" });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new ApiClientError(d.error?.message || "Registration failed", res.status, d); }
  },
  logout: (): Promise<void> => fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).then(() => undefined),
  me: (): Promise<UserOut> => fetch("/api/auth/me", { credentials: "same-origin" }).then(async r => { if (!r.ok) throw new ApiClientError("Not authenticated", r.status); return r.json(); }),
};

export const datasetsApi = {
  list: (page = 1, pageSize = 20): Promise<DatasetListResponse> => apiFetch("datasets", { params: { page, page_size: pageSize } }),
  get: (id: number): Promise<DatasetOut> => apiFetch(`datasets/${id}`),
  upload: (file: File, idempotencyKey: string, onProgress?: (pct: number) => void): Promise<UploadResponse> => {
    const form = new FormData();
    form.append("file", file);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/proxy/datasets");
      xhr.withCredentials = true;
      xhr.setRequestHeader("Idempotency-Key", idempotencyKey);
      xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) { resolve(JSON.parse(xhr.responseText) as UploadResponse); }
        else { let msg = "Upload failed"; try { msg = JSON.parse(xhr.responseText)?.error?.message || msg; } catch {} reject(new ApiClientError(msg, xhr.status)); }
      };
      xhr.onerror = () => reject(new ApiClientError("Network error", 0));
      xhr.send(form);
    });
  },
  delete: (id: number): Promise<void> => apiFetch(`datasets/${id}`, { method: "DELETE" }),
  suggestions: (id: number): Promise<SuggestionsResponse> => apiFetch(`datasets/${id}/suggestions`),
  anomalies: (id: number): Promise<{anomalies: any[], total_scanned: number}> => apiFetch(`datasets/${id}/anomalies`),
  compare: (id1: number, id2: number): Promise<any> => apiFetch(`datasets/compare?id1=${id1}&id2=${id2}`),
};

export const pipelinesApi = {
  list: (page = 1, pageSize = 20): Promise<PipelineListResponse> => apiFetch("pipelines", { params: { page, page_size: pageSize } }),
  get: (id: number): Promise<PipelineOut> => apiFetch(`pipelines/${id}`),
  create: (body: PipelineCreate): Promise<PipelineOut> => apiFetch("pipelines", { method: "POST", body: JSON.stringify(body) }),
  update: (id: number, body: PipelineUpdate): Promise<PipelineOut> => apiFetch(`pipelines/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (id: number): Promise<void> => apiFetch(`pipelines/${id}`, { method: "DELETE" }),
  translate: (body: TranslateRequest): Promise<TranslateResponse> => apiFetch("pipelines/translate", { method: "POST", body: JSON.stringify(body) }),
  execute: (id: number, datasetId: number, idempotencyKey: string): Promise<ExecuteResponse> => apiFetch(`pipelines/${id}/execute`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ dataset_id: datasetId }) }),
  fork: (id: number): Promise<PipelineOut> => apiFetch(`pipelines/${id}/fork`, { method: "POST" }),
  executions: (id: number): Promise<ExecutionOut[]> => apiFetch(`pipelines/${id}/executions`),
  metricsActivity: (): Promise<Array<{date: string, executions: number, success: number}>> => apiFetch("pipelines/metrics/activity"),
};

export const jobsApi = {
  get: (id: number): Promise<JobOut> => apiFetch(`jobs/${id}`),
};

export const adminApi = {
  listDlq:     (page = 1): Promise<DLQListResponse>           => apiFetch("admin/dlq", { params: { page } }),
  replayDlq:   (id: number): Promise<Record<string, unknown>> => apiFetch(`admin/dlq/${id}/replay`, { method: "POST" }),
  listAudit:   (page = 1): Promise<AuditListResponse>         => apiFetch("admin/audit", { params: { page } }),
  verifyChain: (userId?: number): Promise<AuditVerifyResponse> => apiFetch("admin/audit/verify", { params: userId ? { user_id: userId } : {} }),
  grantAdmin:  (userId: number): Promise<Record<string, unknown>> => apiFetch(`admin/users/${userId}/grant-admin`, { method: "POST" }),
};

export const aiApi = {
  explain: (steps: any[]): Promise<{explanation: string, error?: string}> => apiFetch("ai/explain", { method: "POST", body: JSON.stringify({ steps }) }),
};
