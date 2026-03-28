# Decision Log

## 1. Interpreting Ambiguous Requirements

### 1.1 "Data should not be permanently lost when a TODO is deleted"

**Interpretation:** Soft delete. When a user deletes a TODO, the record is marked `is_deleted = 1` and its status set to `archived`. The row persists in the database and can be restored via `POST /api/todos/:id/restore`. Soft-deleted items are excluded from normal listings but visible when the `includeDeleted=true` query parameter is passed.

**Alternatives considered:**
- **Event sourcing / audit trail:** Would preserve a complete history of all mutations, enabling full undo of any change, not just deletion. However, this adds significant complexity (event store, projections, replay logic) that is disproportionate for a TODO app.
- **Trash bin with TTL expiry:** Soft-deleted items could auto-purge after N days. This is a natural extension of the current design but was omitted to keep scope tight.

**Edge case — dependencies on deleted items:** Dependency rows in `todo_dependencies` are not cleaned up on soft delete. Instead, the `isBlocked` check explicitly filters out deleted dependencies (`dep.is_deleted = 0`). This means soft-deleting a dependency effectively **unblocks** any tasks that depended on it — a pragmatic choice, since the user intentionally removed the blocker.

**Edge case — restore loses original status:** Restoring a soft-deleted TODO resets its status to `not_started`, not to whatever it was before deletion. Preserving the original status would require storing it separately (e.g. a `pre_delete_status` column), which adds schema complexity for marginal benefit.

---

### 1.2 "Recurring tasks: when completed, the next occurrence should be created automatically"

**Interpretation:** When a recurring TODO transitions to **Completed** (and was not already completed), the system automatically creates a new independent TODO with:
- The same name, description, priority, and recurrence settings
- A new due date calculated from the **previous due date** (not from today), preserving schedule regularity
- Status reset to `Not Started`
- A `parentRecurringId` linking back to the root of the recurrence chain

**Why calculate from previous due date, not today?** If a daily task due Monday is completed on Wednesday, the next occurrence should be due Tuesday (the next regular slot), not Thursday. This preserves the intended cadence and avoids "drift" that would accumulate with each late completion.

**Why independent TODOs, not a template + instances model?** A template model (one master record that spawns read-only instances) would enable "edit all future occurrences" in a single operation. However, it constrains flexibility — users often want to modify a single occurrence (e.g. push one weekly meeting by a day) without affecting the series. The independent model supports this naturally. The trade-off is that changing the recurrence pattern only affects the *next* auto-generated instance, not all future ones.

**What `parentRecurringId` enables:** Each auto-created occurrence stores the ID of the original (root) recurring task. This enables future features like "show all occurrences of this recurring task" or "stop this recurrence chain" without requiring schema changes.

**Edge case — recurring task with no due date:** If a recurring task has no `dueDate`, the next occurrence also gets `null` as its due date. The recurrence still works — it just lacks date-based scheduling.

**Edge case — recurring task with dependencies:** The auto-created next occurrence does **not** inherit `dependsOn` from the completed parent. Dependencies are typically specific to a particular instance (e.g. "this week's report depends on this week's data pull"), so blanket inheritance would create incorrect constraints.

---

### 1.3 "A dependent task cannot be moved to In Progress until all dependencies are Completed"

**Interpretation:** The constraint is enforced at the API level only when a task transitions **to** `in_progress`. Attempting this on a blocked task returns HTTP 422. The UI reinforces this by showing a "BLOCKED" badge and hiding the "Start" button for blocked tasks.

**Why only enforce for the `in_progress` transition?** Strict enforcement across all transitions would prevent, for example, directly completing a blocked task when external factors have resolved it — or archiving a task that's no longer relevant. The spec says "cannot be moved to In Progress," and the implementation follows that literally without adding extra restrictions.

**Circular dependency detection:** A BFS traversal runs whenever dependencies are modified via `PUT /api/todos/:id`. It walks the dependency graph from the proposed new dependency to check if the current task is reachable — if so, adding the dependency would create a cycle, and the request is rejected with HTTP 422. This check is not needed during `POST /api/todos` because a newly created task has no dependents yet, making cycles structurally impossible.

**Definition of "blocked" vs "unblocked" in filtering:** A task with zero dependencies is classified as `unblocked`. This means the `unblocked` filter returns both "all deps completed" and "has no deps at all." From a workflow perspective, both categories are equally actionable, so separating them into a third state felt unnecessary.

---

### 1.4 "Support multiple users accessing the same TODO list concurrently"

**Interpretation:** Optimistic locking via a `version` integer column. Every `PUT /api/todos/:id` request must include the current `version` value. If another user modified the record in between, the version will have incremented and the update is rejected with HTTP 409 Conflict. The client is expected to refresh and retry.

**Why not pessimistic locking?** Pessimistic locking (`SELECT ... FOR UPDATE`) holds row-level locks for the duration of a transaction, blocking other readers/writers. For a TODO app with low write contention (users rarely edit the exact same item simultaneously), this is unnecessarily heavy. Optimistic locking handles the realistic conflict scenario without degrading read performance.

**Implementation detail — double-check:** The service performs two version checks: (1) a pre-check comparing the supplied version against the current row, and (2) a `WHERE version = ?` clause on the `UPDATE` statement itself. The first provides a clear, immediate error message. The second is the actual atomic guard against TOCTOU (time-of-check-to-time-of-use) races.

---

### 1.5 "Handle 10,000+ items without degrading user experience"

**Implementation:**
- **Server-side pagination** with configurable page size (default 20, max 100). The client never receives the full dataset.
- **Database indexes** on `status`, `priority`, `due_date`, and `is_deleted` columns. All filtering and sorting is done in SQL, not in application code.
- **SQLite WAL mode** (`PRAGMA journal_mode = WAL`) enables concurrent reads while a write is in progress, preventing readers from being blocked.
- **Parameterized queries only** — no string concatenation in SQL, preventing both injection and enabling SQLite to cache query plans.

**What this does not address:** For truly large-scale concurrent multi-user workloads, SQLite's single-writer limitation becomes the bottleneck. See section 4 for how this would be addressed with more time.

---

## 2. Key Architectural Decisions

### 2.1 Tech Stack

| Choice | Rationale |
|--------|-----------|
| **Node.js + Express** | Widely used, minimal boilerplate, easy for reviewers to read. TypeScript adds type safety without a heavy framework. |
| **SQLite (better-sqlite3)** | Zero infrastructure — no Docker, no database server. Just `npm install` and run. Synchronous API avoids callback complexity and makes transactions straightforward. |
| **React + Vite** | Fast HMR in development, TypeScript out of the box, minimal configuration. |
| **Zod** | Runtime validation with TypeScript type inference. A single schema definition handles both validation and type generation. |
| **Vitest + Supertest** | Fast test runner with HTTP-level integration testing. Shares the Vite/Node ecosystem, keeping the dependency tree small. |

### 2.2 Service Layer Pattern

The `TodoService` class encapsulates all business logic: CRUD, dependency validation, recurrence, and optimistic locking. Routes are thin — they parse/validate input, call the service, and format the HTTP response. Benefits:

1. **Testability:** 31 unit tests run the service directly against in-memory SQLite, with no HTTP overhead.
2. **Replaceability:** The service depends on a `Database` instance, not on Express. Swapping to PostgreSQL requires only changing the database module and SQL dialect.
3. **Readability:** Business rules live in one place. Route handlers read as input -> process -> output.

### 2.3 Database Schema

```
todos
  id TEXT PK (UUID)
  name, description
  due_date (nullable ISO datetime)
  status (CHECK: not_started | in_progress | completed | archived)
  priority (CHECK: low | medium | high)
  recurrence_pattern (nullable: daily | weekly | monthly | custom)
  recurrence_interval (nullable integer, for custom recurrence)
  parent_recurring_id (FK -> todos.id, links recurrence chains)
  version (integer, optimistic locking)
  is_deleted (integer 0/1, soft delete)
  created_at, updated_at
  INDEXES on status, priority, due_date, is_deleted

todo_dependencies
  todo_id (FK -> todos.id)
  depends_on_id (FK -> todos.id)
  PK (todo_id, depends_on_id)
  CHECK (todo_id != depends_on_id)  -- prevents self-dependency
```

**Why a junction table for dependencies instead of a JSON array column?** A junction table enables efficient SQL-level filtering (`EXISTS` subquery for blocked/unblocked) and referential integrity via foreign keys. A JSON array would require application-level parsing for every query and offers no integrity guarantees.

### 2.4 Error Handling Strategy

| HTTP Status | When Used | Error Class |
|-------------|-----------|-------------|
| 400 | Validation failures (missing/invalid fields) | `ZodError` |
| 404 | Resource not found | `Error` with "not found" in message |
| 409 | Optimistic locking conflict (stale version) | `ConflictError` |
| 422 | Business rule violation (blocked task, circular dependency) | `DependencyError` |
| 500 | Unexpected / unhandled errors | Catch-all in error handler |

A centralized `errorHandler` middleware maps error types to HTTP status codes. This keeps route handlers clean — they throw domain errors and the middleware translates them to the appropriate HTTP response.

### 2.5 Frontend Architecture

The React frontend follows a straightforward component hierarchy:

- **`App`** — Top-level state (form visibility, editing target), orchestrates child components
- **`useTodos` hook** — Encapsulates data fetching, filter/pagination state, and refresh logic
- **`FilterBar`** — Controlled inputs that update query parameters
- **`TodoItem`** — Renders a single TODO with quick-action buttons (Start, Complete, Edit, Delete)
- **`TodoForm`** — Modal form for create/edit with all fields including dependencies
- **`Pagination`** — Page navigation controls

The API client (`todoApi.ts`) is a thin wrapper around `fetch` with consistent error handling. The Vite dev server proxies `/api` requests to the backend, so the frontend has no hardcoded backend URL.

---

## 3. What I Chose NOT to Build

1. **User authentication** — Listed as nice-to-have. Adding JWT/session auth would roughly double the codebase (user model, registration, login, token refresh, per-user data scoping) without adding core TODO functionality. The current design uses a single shared TODO list.

2. **Real-time updates (WebSocket/SSE)** — Nice-to-have. Would enable instant cross-tab/cross-user sync. The current approach requires manual refresh. For a demo, this is acceptable.

3. **Bulk operations** — Nice-to-have. Endpoints like "complete all tasks in a group" or "delete selected" are useful UX features but not core. Individual CRUD covers the required functionality.

4. **Production database (PostgreSQL)** — SQLite is sufficient for local demo and avoids requiring external services. The service layer is database-aware but not database-coupled, so migration would be contained.

5. **Advanced UI polish** — The UI is functional and responsive, but minimal. I prioritized feature completeness and correctness over visual refinement.

6. **E2E tests** — Browser-based tests (Playwright/Cypress) would verify the full user flow. I prioritized unit and integration tests for the core business logic, which cover the most critical paths with less infrastructure overhead.

---

## 4. What I Would Do Differently With More Time

1. **PostgreSQL + connection pooling** — SQLite's single-writer model is fine for demo/development, but production concurrent writes need PostgreSQL with `pg-pool`. The `TodoService` currently takes a `Database` instance; abstracting this behind a repository interface would make the swap clean.

2. **Repository pattern** — Extract a `TodoRepository` interface that the service depends on, with SQLite and PostgreSQL implementations. This would make the service truly database-agnostic and enable mock-based unit tests.

3. **WebSocket real-time updates** — On every write operation, broadcast the change to all connected clients. This would make multi-user collaboration seamless and eliminate the need for manual refresh.

4. **Authentication + per-user lists** — JWT-based auth with `userId` scoping on all queries. Each user would see only their own TODOs. Admin roles could enable shared lists.

5. **Better recurring task management** — A dedicated UI panel for viewing the full recurrence chain, editing the pattern for all future occurrences, and skipping or rescheduling individual occurrences.

6. **Full Docker Compose** — A `docker-compose.yml` with backend, frontend (nginx), and PostgreSQL services. One command to bring up the full production-like stack.

7. **E2E tests** — Playwright tests for the complete user flow: create -> edit -> filter -> complete recurring -> check next occurrence -> delete -> restore.

8. **Undo/redo stack** — The soft delete infrastructure could be extended to a general-purpose undo mechanism for all operations, likely via an event/audit log table.

9. **API rate limiting** — `express-rate-limit` middleware to prevent abuse, especially important once authentication is added.

10. **Observability** — Structured logging (pino), request tracing, and basic metrics for production monitoring.
