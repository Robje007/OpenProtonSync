/**
 * Sync Module
 *
 * Re-exports all sync-related functionality.
 */

// Engine (orchestration)
export { runOneShotSync, runWatchMode, type SyncOptions } from './engine.js';

// Watcher (file change detection)
export {
  initializeWatcher,
  closeWatcher,
  clearAllSnapshots,
  queryAllChanges,
  setupWatchSubscriptions,
  teardownWatchSubscriptions,
  triggerFullReconciliation,
  type FileChange,
  type FileChangeHandler,
} from './watcher.js';

// Queue (job management)
export {
  jobEvents,
  enqueueJob,
  getNextPendingJob,
  markJobSynced,
  markJobBlocked,
  cleanupFinishedJobs,
  setJobError,
  categorizeError,
  scheduleRetry,
  getJobCounts,
  getRecentJobs,
  getBlockedJobs,
  getProcessingJobs,
  type Job,
  type JobEvent,
  type JobEventType,
} from './queue.js';

// Constants (error types, thresholds)
export { ErrorCategory, type ErrorClassification } from './constants.js';

// Processor (job execution)
export {
  processAvailableJobs,
  waitForActiveTasks,
  drainQueue,
  setSyncConcurrency,
} from './processor.js';
