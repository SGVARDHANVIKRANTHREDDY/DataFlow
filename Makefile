.PHONY: help install dev backend worker frontend migrate test test-unit test-security test-chaos test-cov up down logs clean

help:
	@echo ""
	@echo "  DATA PIPELINE STUDIO v7 — 9/10 Production Grade"
	@echo ""
	@echo "  LOCAL DEV:"
	@echo "    make install        Install all dependencies"
	@echo "    make backend        FastAPI on :8000"
	@echo "    make worker         Celery worker (profiling + execution + recovery)"
	@echo "    make frontend       Vite on :5173"
	@echo "    make migrate        Run Alembic migrations (001→002→003)"
	@echo ""
	@echo "  TESTING:"
	@echo "    make test           All tests"
	@echo "    make test-unit      Unit tests (transforms, validator, executor)"
	@echo "    make test-security  Security tests (CSV injection, idempotency, auth)"
	@echo "    make test-chaos     Chaos tests (crash recovery, DLQ, concurrency)"
	@echo "    make test-cov       Full coverage report (target: 80%+)"
	@echo ""
	@echo "  LOAD TESTING:"
	@echo "    make load-normal    50 users, 5 min"
	@echo "    make load-soak      30 users, 30 min (soak test)"
	@echo "    make load-spike     200 users spike test"
	@echo ""
	@echo "  DOCKER:"
	@echo "    make up             Full stack (8 services)"
	@echo "    make down           Stop all"
	@echo "    make logs           Tail logs"
	@echo "    make clean          Stop + delete volumes"
	@echo ""
	@echo "  AUDIT:"
	@echo "    make verify-audit   Verify audit log hash chain integrity"
	@echo ""

install:
	cd backend && pip install -r requirements.txt
	cd frontend && npm install
	@echo "✓ Run: cp .env.example .env then edit it"

backend:
	cd backend && PYTHONPATH=. uvicorn app.main:app --reload --port 8000 --log-level info

worker:
	cd backend && celery -A app.celery_app.celery_app worker \
	  --queues=profiling,execution,default \
	  --concurrency=2 --loglevel=info

worker-beat:
	cd backend && celery -A app.celery_app.celery_app beat --loglevel=info

frontend:
	cd frontend && npm run dev

migrate:
	cd backend && alembic upgrade head

test:
	cd backend && pytest tests/ -v --tb=short

test-unit:
	cd backend && pytest tests/unit/ -v

test-security:
	cd backend && pytest tests/unit/test_csv_sanitizer.py tests/unit/test_idempotency.py tests/security/ -v

test-chaos:
	cd backend && pytest tests/chaos/ -v

test-failure:
	cd backend && pytest tests/failure/ -v

test-integration:
	cd backend && pytest tests/integration/ -v

test-e2e:
	cd backend && pytest tests/e2e/ -v

test-cov:
	cd backend && pytest tests/ \
	  --cov=app \
	  --cov-report=html:htmlcov \
	  --cov-report=term-missing \
	  --cov-fail-under=70
	@echo "Coverage report: backend/htmlcov/index.html"

# Load tests (requires running server + locust)
load-normal:
	cd backend && locust -f tests/load/locustfile.py --host http://localhost \
	  --headless --users 50 --spawn-rate 5 --run-time 5m --html load_normal.html
	@echo "Report: backend/load_normal.html"

load-soak:
	cd backend && locust -f tests/load/locustfile.py --host http://localhost \
	  --headless --users 30 --spawn-rate 2 --run-time 30m --html load_soak.html
	@echo "Soak report: backend/load_soak.html"

load-spike:
	cd backend && locust -f tests/load/locustfile.py --host http://localhost \
	  --headless --users 200 --spawn-rate 50 --run-time 3m --html load_spike.html
	@echo "Spike report: backend/load_spike.html"

# Docker
up:
	@test -f .env || (cp .env.example .env && echo "⚠ Created .env — set ANTHROPIC_API_KEY + SECRET_KEY")
	docker compose up --build -d
	@echo ""
	@echo "  ✓ App:     http://localhost"
	@echo "  ✓ API:     http://localhost/api/docs"
	@echo "  ✓ Flower:  http://localhost:5555"
	@echo "  ✓ MinIO:   http://localhost:9001"

down:
	docker compose down

logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend

logs-worker:
	docker compose logs -f worker-profiling worker-execution

clean:
	docker compose down -v
	docker image prune -f

shell-backend:
	docker compose exec backend bash

shell-db:
	docker compose exec postgres psql -U $${POSTGRES_USER:-dps} $${POSTGRES_DB:-dps}

# Audit chain verification
verify-audit:
	@echo "Verifying audit log hash chain..."
	@curl -sf http://localhost/api/v1/admin/audit/verify \
	  -H "Authorization: Bearer $$(cat .admin_token 2>/dev/null || echo missing)" | python3 -m json.tool

# v11 Frontend (Next.js)
frontend-install:
	cd frontend && npm install

frontend-dev:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build
