# AGENTS.md

This file provides guidance for AI coding agents working in this repository.

## Project Overview

OpenProtonSync is a macOS CLI tool that syncs local directories to Proton Drive cloud storage. Built with Bun/TypeScript, it uses Node's fs.watch for file system monitoring, SQLite (via Drizzle ORM) for state management, and the Proton Drive SDK for cloud operations.

## Build & Run Commands

| Command                   | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| `make install`            | Install dependencies                                 |
| `make build`              | Compile standalone binary to `dist/openprotonsync`   |
| `make build-check`        | Type-check without emitting files                    |
| `make run ARGS="<cmd>"`   | Run one-off command (e.g., `make run ARGS="status"`) |
| `make dev`                | Run with auto-reload on file changes (watch mode)    |
| `make dev ARGS="--debug"` | Run dev mode with debug logging                      |
| `make pre-commit`         | Run eslint --fix, prettier, and type-check           |
| `make db-inspect`         | Open Drizzle Studio to inspect SQLite database       |
| `make clean`              | Remove `dist/` build artifacts                       |
| `make help`               | Show all available make commands                     |

### Pre-commit Hook

The project uses Husky with a pre-commit hook that runs `make pre-commit`. This executes:

1. `bun run build:check` - TypeScript type checking
2. `bun eslint --fix 'src/**/*.ts'` - ESLint with auto-fix
3. `bun prettier --write 'src/**/*.ts' '*.json' '*.md'` - Prettier formatting

### Testing

**No test suite exists in this project.** Use `make pre-commit` to validate linting and types before committing.

## Code Style

### Formatting (Prettier)

- Single quotes for strings
- Semicolons required
- 2-space indentation
- 100 character line width
- Trailing commas in ES5 contexts

### Imports

- ESM modules with `.js` extension in imports (even for `.ts` files)
- Example: `import { foo } from './bar.js'`
- Group imports: external packages first, then internal modules
- Use named imports; avoid default exports except for config files

```typescript
// Good
import { program } from 'commander';
import { logger } from './logger.js';
import { SyncEventType } from '../db/schema.js';

// Bad - missing .js extension
import { logger } from './logger';
```

### TypeScript

- Strict mode enabled (`"strict": true` in tsconfig)
- **No `any` type allowed** - enforced by ESLint rule `@typescript-eslint/no-explicit-any: error`
- Prefix unused parameters with underscore: `(_unused, used) => ...`
- Use `interface` for object shapes, `type` for unions/aliases
- Use `as const` for enum-like objects

```typescript
// Enum pattern used in this codebase
export const SyncJobStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SYNCED: 'SYNCED',
  BLOCKED: 'BLOCKED',
} as const;

export type SyncJobStatus = (typeof SyncJobStatus)[keyof typeof SyncJobStatus];
```

### Naming Conventions

- `camelCase` for functions, variables, and file names
- `PascalCase` for types, interfaces, and classes
- `SCREAMING_SNAKE_CASE` for constants
- Descriptive names; avoid abbreviations except common ones (e.g., `config`, `db`)

### File Organization

- Entry point: `src/index.ts`
- CLI commands: `src/cli/*.ts`
- Database: `src/db/` (schema, migrations, index)
- Sync engine: `src/sync/` (engine, processor, queue, watcher)
- Proton API: `src/proton/` (create, delete, utils, types)
- Dashboard: `src/dashboard/` (server, views, assets)
- Use `index.ts` barrel files to re-export from directories

### Exports

- Prefer named exports over default exports
- Re-export public APIs from `index.ts` barrel files
- Export types separately when needed for external consumption

```typescript
// src/proton/index.ts - barrel file example
export { createNode } from './create.js';
export { deleteNode } from './delete.js';
export type { ProtonDriveClient, CreateResult } from './types.js';
```

### Logging

Use the Winston logger from `./logger.js`:

```typescript
import { logger } from './logger.js';

logger.info('Operation completed');
logger.error(`Failed to process: ${error.message}`);
logger.debug('Debug details'); // Only shown with --debug flag
logger.warn('Warning message');
```

### Error Handling

- Throw standard `Error` objects (no custom error classes)
- Use try/catch for async operations that may fail
- Log errors with context before re-throwing or handling
- Return result objects for operations that can fail gracefully

```typescript
// Result object pattern
interface CreateResult {
  success: boolean;
  nodeUid?: string;
  error?: string;
}

// Error extraction helper
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
```

### Async Patterns

- Use `async/await` over raw Promises
- Use `Promise.all()` for concurrent operations
- Use `Promise.race()` for timeouts
- Handle cleanup in `finally` blocks

### Comments

- Use JSDoc-style comments for exported functions and modules
- Section headers use comment blocks with `// ===...===`
- Inline comments for non-obvious logic only

```typescript
/**
 * OpenProtonSync - Configuration
 *
 * Reads config from ~/.config/openprotonsync/config.json
 * Supports hot-reloading via namespaced signals
 */

// ============================================================================
// Constants
// ============================================================================

const SHUTDOWN_TIMEOUT_MS = 2_000;
```

## Database

- SQLite database managed by Drizzle ORM
- Schema defined in `src/db/schema.ts`
- Migrations in `src/db/migrations/`
- Use `make db-inspect` to open Drizzle Studio for debugging

## Architecture Notes

### Key Components

- **CLI** (`src/cli/`): Commander.js commands for user interaction
- **Sync Engine** (`src/sync/engine.ts`): Orchestrates watcher, queue, processor
- **Queue** (`src/sync/queue.ts`): SQLite-backed job queue with retry logic
- **Processor** (`src/sync/processor.ts`): Executes sync jobs with concurrency control
- **Watcher** (`src/sync/watcher.ts`): fs.watch integration for file changes
- **Proton API** (`src/proton/`): Wrapper around @protontech/drive-sdk

### Inter-process Communication

- Uses SQLite `signals` table for IPC between CLI commands and daemon
- Flags table for persistent state (running, paused)
- Config hot-reload via signal handlers

### Dashboard

- Hono web server with JSX templates
- IPC with main process via stdout JSON messages
- Static assets in `src/dashboard/assets/`
