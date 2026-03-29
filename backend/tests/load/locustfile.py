"""
Load Test v7 — soak + spike + failure injection scenarios.

Run:
  Normal load:   locust -f locustfile.py --host http://localhost --users 50 --spawn-rate 5
  Soak (30min):  locust -f locustfile.py --host http://localhost --headless --users 30 --spawn-rate 2 --run-time 30m --html soak_report.html
  Spike test:    locust -f locustfile.py --host http://localhost --headless --users 200 --spawn-rate 50 --run-time 2m --html spike_report.html
"""
import io, uuid, random, time
from locust import HttpUser, task, between, events, LoadTestShape

SLA_P99_MS = 2000


@events.test_stop.add_listener
def print_sla(environment, **kwargs):
    print("\n═══════ SLA Report ═══════")
    for name, e in environment.runner.stats.entries.items():
        p99 = e.get_response_time_percentile(0.99)
        err = e.num_failures
        icon = "✓" if p99 <= SLA_P99_MS and err == 0 else "✗"
        print(f"{icon} {name}: P99={p99:.0f}ms errors={err}/{e.num_requests}")
    print("══════════════════════════\n")


def make_csv(rows=300):
    lines = ["age,salary,dept,score"]
    for _ in range(rows):
        lines.append(f"{random.randint(22,65)},{random.randint(40000,150000)},{random.choice(['Eng','Mkt','HR'])},{round(random.random(),3)}")
    return "\n".join(lines).encode()


class DPSUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        self.token = None; self.dataset_id = None; self.pipeline_id = None; self.job_id = None
        email = f"load_{uuid.uuid4().hex[:8]}@test.com"
        r = self.client.post("/api/v1/auth/register", json={"email": email, "password": "LoadTest123"})
        if r.status_code == 201: self.token = r.json()["access_token"]

    def _h(self): return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    @task(1)
    def health(self):
        with self.client.get("/health", catch_response=True, name="GET /health") as r:
            r.success() if r.status_code == 200 else r.failure(r.status_code)

    @task(3)
    def upload(self):
        if not self.token: return
        with self.client.post("/api/v1/datasets",
                              files={"file": (f"t_{uuid.uuid4().hex[:6]}.csv", io.BytesIO(make_csv()), "text/csv")},
                              headers={"Authorization": f"Bearer {self.token}"},
                              catch_response=True, name="POST /datasets") as r:
            if r.status_code == 202: d = r.json(); self.dataset_id = d.get("dataset_id"); self.job_id = d.get("job_id"); r.success()
            elif r.status_code in (400, 413): r.success()
            else: r.failure(f"{r.status_code}: {r.text[:60]}")

    @task(5)
    def list_datasets(self):
        if not self.token: return
        with self.client.get("/api/v1/datasets", headers=self._h(), catch_response=True, name="GET /datasets") as r:
            r.success() if r.status_code == 200 else r.failure(r.status_code)

    @task(4)
    def create_pipeline(self):
        if not self.token: return
        steps = [
            {"action": "drop_nulls",        "params": {"columns":[],"method":"","threshold":None,"order":""}},
            {"action": "normalize",         "params": {"columns":[],"method":"","threshold":None,"order":""}},
            {"action": "remove_duplicates", "params": {"columns":[],"method":"","threshold":None,"order":""}},
        ]
        with self.client.post("/api/v1/pipelines", json={"name": f"p_{uuid.uuid4().hex[:6]}", "steps": steps},
                              headers=self._h(), catch_response=True, name="POST /pipelines") as r:
            if r.status_code == 201: self.pipeline_id = r.json().get("id"); r.success()
            else: r.failure(r.status_code)

    @task(2)
    def execute(self):
        if not all([self.token, self.pipeline_id, self.dataset_id]): return
        with self.client.post(f"/api/v1/pipelines/{self.pipeline_id}/execute",
                              json={"dataset_id": self.dataset_id},
                              headers={**self._h(), "Idempotency-Key": str(uuid.uuid4())},
                              catch_response=True, name="POST /execute") as r:
            r.success() if r.status_code in (202, 404) else r.failure(r.status_code)

    @task(2)
    def poll_job(self):
        if not self.token or not self.job_id: return
        with self.client.get(f"/api/v1/jobs/{self.job_id}", headers=self._h(),
                             catch_response=True, name="GET /jobs/{id}") as r:
            r.success() if r.status_code in (200, 404) else r.failure(r.status_code)

    @task(1)
    def translate(self):
        if not self.token: return
        with self.client.post("/api/v1/pipelines/translate",
                              json={"prompt": random.choice(["remove missing values","normalize data","remove outliers"])},
                              headers=self._h(), catch_response=True, name="POST /translate") as r:
            r.success() if r.status_code == 200 else r.failure(r.status_code)

    @task(1)
    def idempotency_replay(self):
        """Same key twice — second must be identical response (replay)."""
        if not all([self.token, self.pipeline_id, self.dataset_id]): return
        key = str(uuid.uuid4())
        headers = {**self._h(), "Idempotency-Key": key}
        payload = {"dataset_id": self.dataset_id}
        for label in ["POST /execute [idem-1st]", "POST /execute [idem-replay]"]:
            with self.client.post(f"/api/v1/pipelines/{self.pipeline_id}/execute",
                                  json=payload, headers=headers, catch_response=True, name=label) as r:
                r.success() if r.status_code in (202, 404, 409) else r.failure(r.status_code)


# ── Spike Test Shape ──────────────────────────────────────────
class SpikeShape(LoadTestShape):
    """
    Spike test: ramp to 200 users in 30s, hold 60s, drop to 10 users.
    Tests auto-scaling and recovery from sudden traffic spike.
    """
    stages = [
        {"duration": 30,  "users": 10,  "spawn_rate": 2},   # warm up
        {"duration": 60,  "users": 200, "spawn_rate": 50},  # spike
        {"duration": 120, "users": 10,  "spawn_rate": 10},  # recover
        {"duration": 150, "users": 0,   "spawn_rate": 50},  # done
    ]

    def tick(self):
        run_time = self.get_run_time()
        for stage in self.stages:
            if run_time < stage["duration"]:
                return stage["users"], stage["spawn_rate"]
        return None


class ReadOnlyUser(HttpUser):
    wait_time = between(0.5, 2)
    weight = 3

    def on_start(self):
        self.token = None
        email = f"ro_{uuid.uuid4().hex[:8]}@test.com"
        r = self.client.post("/api/v1/auth/register", json={"email": email, "password": "ReadOnly123"})
        if r.status_code == 201: self.token = r.json()["access_token"]

    @task(5)
    def health(self): self.client.get("/health", name="GET /health [ro]")

    @task(3)
    def list_datasets(self):
        if self.token: self.client.get("/api/v1/datasets", headers={"Authorization": f"Bearer {self.token}"}, name="GET /datasets [ro]")

    @task(2)
    def list_pipelines(self):
        if self.token: self.client.get("/api/v1/pipelines", headers={"Authorization": f"Bearer {self.token}"}, name="GET /pipelines [ro]")
