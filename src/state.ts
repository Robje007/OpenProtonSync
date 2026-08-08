/**
 * OpenProtonSync - State Management
 *
 * Persists sync state to ~/.local/state/openprotonsync/state.db using SQLite.
 * Snapshot management is handled by the watcher module.
 */

import { STATE_DIR } from './db/index.js';

// Re-export STATE_DIR for other modules
export { STATE_DIR };

// Note: Clock management has been removed. The watcher now uses the fileHashes
// database table for change detection. See src/sync/watcher.ts for details.
