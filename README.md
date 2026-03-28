# TODO List Application

A full-stack TODO list application with recurring tasks, task dependencies, filtering/sorting, and optimistic concurrency control.

## Tech Stack

- **Backend:** Node.js, Express, TypeScript, SQLite (better-sqlite3), Zod
- **Frontend:** React, TypeScript, Vite
- **Testing:** Vitest, Supertest
- **Containerization:** Docker (multi-stage build)

## Features

- **CRUD Operations** — Create, read, update, delete TODOs with name, description, due date, status, and priority
- **Soft Delete** — Deleted TODOs are archived and can be restored via a dedicated endpoint
- **Recurring Tasks** — Daily, weekly, monthly, or custom interval recurrence. Completing a recurring task auto-creates the next occurrence with the correct due date
- **Task Dependencies** — TODOs can depend on other TODOs. Blocked tasks cannot be started until all dependencies are completed. Circular dependency detection via BFS
- **Filtering** — Filter by status, priority, due date range, dependency status (blocked/unblocked), and free-text search
- **Sorting** — Sort by due date, priority, status, or name (ascending/descending)
- **Pagination** — Server-side pagination (default 20, max 100 per page) for 10K+ item support
- **Optimistic Locking** — Concurrent edit detection via version field (HTTP 409 on conflict)
- **Input Validation** — Zod-based request validation with descriptive error messages
- **API Documentation** — Interactive Swagger UI at `/api-docs`

## Prerequisites

- Node.js 18+ (tested with v22)
- npm
- Docker (optional, for containerized deployment)

## Quick Start

```bash
# Terminal 1 — Backend
cd backend
npm install
npm run dev
# API running at http://localhost:3001
# Swagger docs at http://localhost:3001/api-docs

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
# UI running at http://localhost:5173
```

Open **http://localhost:5173** in your browser. The Vite dev server proxies all `/api` requests to the backend automatically.

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Backend server listen port |

The SQLite database is stored at `backend/data/todos.db` (auto-created on first run). SQLite WAL mode and foreign keys are enabled automatically.

### Development Proxy

In development, the Vite dev server (port 5173) proxies `/api` requests to the backend (port 3001). This is configured in `frontend/vite.config.ts`. In production (Docker), the backend serves the frontend static files directly — no proxy needed.

## Running Tests

```bash
cd backend
npm test
```

Runs **52 tests** (31 unit + 21 integration):

| Test Suite | Tests | What's Covered |
|------------|-------|----------------|
| `todoService.test.ts` | 31 | Service-layer logic against in-memory SQLite |
| `api.test.ts` | 21 | Full HTTP request/response via Supertest |

**Coverage includes:**
- CRUD operations (create, read, update, soft delete, restore)
- Optimistic locking — version mismatch detection (409 Conflict)
- Task dependencies — blocking, unblocking on completion, circular dependency rejection
- Recurring tasks — auto-creation of next occurrence with correct due date for daily/weekly/custom
- Filtering by status, priority, due date range, search, dependency status
- Sorting by name, priority
- Pagination (page, limit, total count, total pages)
- Input validation (missing fields, empty name, missing version)
- Error responses (400, 404, 409, 422)

## Docker

Build and run the complete application in a single container:

```bash
docker build -t todo-app .
docker run -p 3001:3001 -v todo-data:/app/data todo-app
```

Open **http://localhost:3001**. The container serves both the API and the frontend static files. The `-v todo-data:/app/data` flag persists the SQLite database across container restarts.

The Dockerfile uses a multi-stage build:
1. **Stage 1** — Build backend (TypeScript → JavaScript)
2. **Stage 2** — Build frontend (React → static files)
3. **Stage 3** — Production image with compiled backend + frontend bundle (~50MB)

## API Reference

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/todos` | List TODOs with filtering, sorting, and pagination |
| `GET` | `/api/todos/:id` | Get a single TODO by ID |
| `POST` | `/api/todos` | Create a new TODO |
| `PUT` | `/api/todos/:id` | Update a TODO (requires `version` for optimistic locking) |
| `DELETE` | `/api/todos/:id` | Soft-delete a TODO (can be restored) |
| `POST` | `/api/todos/:id/restore` | Restore a soft-deleted TODO |
| `GET` | `/api/health` | Health check |
| `GET` | `/api-docs` | Interactive Swagger UI |
| `GET` | `/api-docs.json` | OpenAPI spec (JSON) |

### Query Parameters for `GET /api/todos`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | — | Filter: `not_started`, `in_progress`, `completed`, `archived` |
| `priority` | string | — | Filter: `low`, `medium`, `high` |
| `dueDateFrom` | ISO datetime | — | Filter: due date >= value |
| `dueDateTo` | ISO datetime | — | Filter: due date <= value |
| `dependencyStatus` | string | — | Filter: `blocked` or `unblocked` |
| `search` | string | — | Search in name and description (case-insensitive substring match) |
| `sortField` | string | `createdAt` | Sort by: `dueDate`, `priority`, `status`, `name`, `createdAt` |
| `sortDirection` | string | `desc` | `asc` or `desc` |
| `page` | integer | `1` | Page number |
| `limit` | integer | `20` | Items per page (max: 100) |
| `includeDeleted` | boolean | `false` | Include soft-deleted items in results |

### Create TODO — `POST /api/todos`

```json
{
  "name": "Write unit tests",
  "description": "Cover edge cases for recurring tasks",
  "dueDate": "2025-12-31T23:59:59.000Z",
  "status": "not_started",
  "priority": "high",
  "recurrencePattern": "weekly",
  "recurrenceInterval": null,
  "dependsOn": []
}
```

Only `name` is required. All other fields have sensible defaults (`status: not_started`, `priority: medium`).

### Update TODO — `PUT /api/todos/:id`

```json
{
  "name": "Updated task name",
  "status": "in_progress",
  "version": 1
}
```

The `version` field is **required**. If the stored version doesn't match, the server returns **409 Conflict** — fetch the latest version and retry.

### Response Format

**Single TODO:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Write unit tests",
  "description": "Cover edge cases",
  "dueDate": "2025-12-31T23:59:59.000Z",
  "status": "not_started",
  "priority": "high",
  "recurrencePattern": "weekly",
  "recurrenceInterval": null,
  "parentRecurringId": null,
  "version": 1,
  "isDeleted": false,
  "createdAt": "2025-06-15T10:00:00.000Z",
  "updatedAt": "2025-06-15T10:00:00.000Z",
  "dependsOn": [],
  "isBlocked": false
}
```

**Paginated list:**

```json
{
  "data": [ ... ],
  "total": 142,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

### Error Responses

| Status | Meaning | Example Cause |
|--------|---------|---------------|
| 400 | Validation error | Missing `name`, invalid `priority` value |
| 404 | Not found | TODO ID doesn't exist or is soft-deleted |
| 409 | Conflict | `version` mismatch (another user modified the TODO) |
| 422 | Business rule violation | Starting a blocked task, circular dependency |
| 500 | Internal error | Unexpected server error |

All error responses follow the format:

```json
{
  "error": "Error Type",
  "message": "Human-readable description"
}
```

Validation errors (400) include details:

```json
{
  "error": "Validation Error",
  "details": [
    { "path": "name", "message": "Name is required" }
  ]
}
```

## Key Behaviors

### Recurring Tasks

When a recurring TODO is marked as **Completed**, the system automatically creates a new TODO:
- Same name, description, priority, and recurrence settings
- Due date calculated from the **previous due date** (preserves schedule regularity)
- Status reset to `not_started`
- Linked via `parentRecurringId` to the original recurring task

Recurrence patterns: `daily` (+1 day), `weekly` (+7 days), `monthly` (+1 month), `custom` (+N days where N = `recurrenceInterval`).

### Task Dependencies

- A TODO can depend on one or more other TODOs via the `dependsOn` array (list of TODO IDs)
- A task with incomplete dependencies is **blocked** — it cannot be moved to `in_progress`
- Completing a dependency automatically unblocks dependent tasks
- Soft-deleting a dependency also unblocks dependent tasks
- Circular dependencies (A depends on B, B depends on A) are detected and rejected

### Soft Delete & Restore

- `DELETE /api/todos/:id` performs a soft delete (sets `is_deleted = 1`, status to `archived`)
- Soft-deleted items are hidden from normal listings but still exist in the database
- `POST /api/todos/:id/restore` restores a deleted item (sets `is_deleted = 0`, status to `not_started`)
- Use `?includeDeleted=true` on the list endpoint to see deleted items

### Optimistic Locking

Every TODO has a `version` field that increments on each update. To update a TODO:
1. Fetch the TODO (includes current `version`)
2. Send the update with the `version` you read
3. If another user updated it in between, the server returns **409 Conflict**
4. Fetch the latest version and retry

This prevents silent data loss from concurrent edits without blocking reads.

## Project Structure

```
todo/
├── backend/
│   ├── src/
│   │   ├── index.ts                 — Entry point, starts server
│   │   ├── app.ts                   — Express app factory (routes, middleware, Swagger)
│   │   ├── db/database.ts           — SQLite connection, schema initialization
│   │   ├── services/todoService.ts  — Core business logic (CRUD, dependencies, recurrence, locking)
│   │   ├── routes/todos.ts          — API route handlers with Swagger annotations
│   │   ├── middleware/
│   │   │   ├── validation.ts        — Zod validation schemas
│   │   │   └── errorHandler.ts      — Centralized error → HTTP status mapping
│   │   └── types/todo.ts            — TypeScript enums and interfaces
│   ├── tests/
│   │   ├── todoService.test.ts      — 31 unit tests (service layer)
│   │   └── api.test.ts              — 21 integration tests (HTTP endpoints)
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx                  — Root component (state, layout)
│   │   ├── App.css                  — Application styles
│   │   ├── api/todoApi.ts           — Typed API client (fetch wrapper)
│   │   ├── hooks/useTodos.ts        — Data fetching + filter state hook
│   │   ├── components/
│   │   │   ├── TodoForm.tsx         — Create/edit modal form
│   │   │   ├── TodoItem.tsx         — Single TODO card with quick actions
│   │   │   ├── FilterBar.tsx        — Search, filter, and sort controls
│   │   │   └── Pagination.tsx       — Page navigation
│   │   └── types/todo.ts            — Frontend type definitions
│   ├── vite.config.ts               — Vite config (React plugin, API proxy)
│   └── package.json
├── Dockerfile                       — Multi-stage production build
├── DECISION_LOG.md                  — Architectural decisions and trade-offs
├── .gitignore
└── README.md
```

## Decision Log

See [DECISION_LOG.md](./DECISION_LOG.md) for detailed coverage of:
- How ambiguous requirements were interpreted (soft delete semantics, recurrence model, dependency enforcement rules)
- Key architectural decisions and trade-offs (tech stack, service layer, schema design, error handling)
- What was intentionally omitted and why (auth, real-time updates, bulk ops)
- What would change with more time (PostgreSQL, WebSockets, E2E tests, repository pattern)
