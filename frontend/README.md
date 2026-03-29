# Data Pipeline Studio v11 — Next.js Frontend

Production-grade React/Next.js frontend built to FAANG engineering standards.

## Tech Stack
- **Next.js 14** (App Router)
- **TypeScript** (strict mode)
- **Tailwind CSS** (custom design tokens)
- **Zustand** (state: auth, pipeline builder, UI)
- **React Query** (server state, caching, staleTime)
- **Framer Motion** (page transitions, micro-interactions)
- **Recharts** (data visualization)
- **Radix UI** (accessible primitives)

## Design System
- Background: `#F8FAFC` (slate-50)
- Surface: `#FFFFFF`
- Primary: `#6366F1` (indigo)
- Accent: `#06B6D4` (cyan)
- Text: `#0F172A` / `#64748B`
- Border: `#E2E8F0`
- Radius: 12px (cards) / 10px (inputs)
- Spacing: 4px grid

## Screens
- `/login` — Split-panel auth with stats
- `/register` — Clean registration with password strength
- `/dashboard` — Metrics, activity chart, quick actions
- `/datasets` — Upload (drag & drop), profile viewer, health score
- `/pipelines` — AI-powered pipeline builder with step manager
- `/executions` — Execution history with step-level logs
- `/admin` — DLQ management, audit log (admin only)

## Quick start
```bash
# Set backend URL
cp .env.example .env.local
# Edit NEXT_PUBLIC_API_URL if needed

npm install
npm run dev
# → http://localhost:3000
```

## Connect to backend
The frontend connects to your v10 backend. Make sure backend is running:
```bash
cd .. && make up        # starts backend + docker services
cd frontend && npm run dev  # starts Next.js
```
