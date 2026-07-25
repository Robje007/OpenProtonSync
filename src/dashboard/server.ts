/**
 * Dashboard Server - Spawns dashboard as a separate process
 *
 * The dashboard runs in its own process for true parallelism,
 * communicating via JSON over stdin/stdout.
 */

import { type Subprocess } from 'bun';
import { jobEvents, type JobEvent } from '../sync/queue.js';
import { logger } from '../logger.js';
import type { Config } from '../config.js';
import {
  type AuthStatusUpdate,
  type SyncStatus,
  type DashboardStatus,
  type ParentMessage,
  type ChildMessage,
  parseMessage,
} from './ipc.js';

// Re-export types for external use
export type {
  AuthStatus,
  AuthStatusUpdate,
  SyncStatus,
  DashboardStatus,
  DashboardJob,
} from './ipc.js';

// ============================================================================
// Constants
// ============================================================================

// ============================================================================
// Server Management
// ============================================================================

/** Type for our dashboard subprocess with piped stdin/stdout */
type DashboardSubprocess = Subprocess<'pipe', 'pipe', 'inherit'>;

let dashboardProcess: DashboardSubprocess | null = null;
let jobEventHandler: ((event: JobEvent) => void) | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let currentAuthStatus: AuthStatusUpdate = { status: 'unauthenticated' };
let lastSentStatus: DashboardStatus | null = null;
let lastSyncHeartbeat: number = 0;
let lastPausedState = false;

// Batching state for job events (reduces IPC flood during high-throughput sync)
let refreshPending = false;
let flushRefreshTimer: ReturnType<typeof setTimeout> | null = null;
const REFRESH_BATCH_INTERVAL_MS = 50;

// How long to wait before considering sync loop dead (90 seconds)
const SYNC_HEARTBEAT_TIMEOUT_MS = 90_000;

// SSE keepalive. Status changes are sent immediately by the sync engine.
const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * Send a message to the dashboard subprocess via stdin.
 * Bun's stdin is a FileSink when using stdin: 'pipe'.
 */
function sendToChild(message: ParentMessage): void {
  if (!dashboardProcess?.stdin) return;
  // Bun's FileSink has a write() method that accepts strings
  dashboardProcess.stdin.write(JSON.stringify(message) + '\n');
}

/**
 * Schedule a batched refresh trigger to the dashboard subprocess.
 * Accumulates events for REFRESH_BATCH_INTERVAL_MS before sending.
 */
function scheduleRefreshFlush(): void {
  if (flushRefreshTimer) return; // Already scheduled

  flushRefreshTimer = setTimeout(() => {
    flushRefreshTimer = null;
    if (!dashboardProcess) return;

    if (refreshPending) {
      sendToChild({ type: 'job_refresh' });
      refreshPending = false;
    }
  }, REFRESH_BATCH_INTERVAL_MS);
}

/**
 * Read and process messages from the dashboard subprocess stdout.
 */
async function readChildMessages(stdout: ReadableStream<Uint8Array>): Promise<void> {
  const reader = stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      let newlineIdx;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);

        if (!line.trim()) continue;

        const msg = parseMessage<ChildMessage>(line);
        if (!msg) continue;

        if (msg.type === 'ready') {
          const host = msg.host ?? 'localhost';
          logger.info(`Dashboard bound to ${host} on port ${msg.port}`);

          // Send initial status when dashboard is ready
          sendStatusToDashboard();

          // Start heartbeat loop to continuously send status
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
          }
          heartbeatInterval = setInterval(sendStatusToDashboard, HEARTBEAT_INTERVAL_MS);
        } else if (msg.type === 'error') {
          logger.error(`Dashboard server error: ${msg.error} (code: ${msg.code})`);
        } else if (msg.type === 'log') {
          // Forward dashboard logs to main logger with [dashboard] tag
          const taggedMessage = `[dashboard] ${msg.message}`;
          logger[msg.level](taggedMessage);
        }
      }
    }
  } catch (err) {
    // Stream closed, process likely exited
    logger.debug(`Dashboard stdout stream closed: ${err}`);
  } finally {
    reader.releaseLock();
  }
}

/**
 * Start the dashboard in a separate process.
 */
export function startDashboard(config: Config, dryRun = false): void {
  if (dashboardProcess) {
    logger.warn('Dashboard process already running');
    return;
  }

  logger.debug(`Dashboard starting with dryRun=${dryRun}`);

  dashboardProcess = Bun.spawn(['proton-drive-sync', 'start', '--dashboard'], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'inherit',
    env: { ...process.env },
  });

  // Set up SIGTERM handler to clean up dashboard child on parent exit
  // This ensures clean restarts when using bun --watch
  process.on('SIGTERM', () => {
    if (dashboardProcess) {
      dashboardProcess.kill();
    }
  });
  process.on('SIGINT', () => {
    if (dashboardProcess) {
      dashboardProcess.kill();
    }
  });

  // Read messages from child stdout
  if (dashboardProcess.stdout) {
    readChildMessages(dashboardProcess.stdout);
  }

  // Handle child process exit
  dashboardProcess.exited.then((code) => {
    if (code !== 0) {
      logger.warn(`Dashboard process exited with code ${code}`);
    }
    dashboardProcess = null;
    if (jobEventHandler) {
      jobEvents.off('job', jobEventHandler);
      jobEventHandler = null;
    }
  });

  // Send initial config
  sendToChild({ type: 'config', config, dryRun });

  // Forward job events to child process via stdin with batching
  // Events are accumulated for 50ms before sending to reduce IPC flood
  jobEventHandler = () => {
    if (!dashboardProcess) return;

    refreshPending = true;
    scheduleRefreshFlush();
  };
  jobEvents.on('job', jobEventHandler);
}

/**
 * Stop the dashboard process.
 */
export async function stopDashboard(): Promise<void> {
  // Stop batching timer
  if (flushRefreshTimer) {
    clearTimeout(flushRefreshTimer);
    flushRefreshTimer = null;
  }

  // Stop heartbeat
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  if (dashboardProcess) {
    // Remove event listener
    if (jobEventHandler) {
      jobEvents.off('job', jobEventHandler);
      jobEventHandler = null;
    }

    const proc = dashboardProcess;
    dashboardProcess = null;

    // Kill and wait for process to exit
    proc.kill();
    await proc.exited;

    logger.debug('Dashboard process stopped');
  }
}

/**
 * Send current status (auth + syncStatus) to the dashboard subprocess.
 * Always sends a heartbeat, but only includes status data if changed.
 * Called on heartbeat interval and when auth/sync status changes.
 *
 * @param options.auth - Auth status update (stores and sends immediately)
 * @param options.paused - Sync loop heartbeat with paused state (updates heartbeat timestamp)
 * @param options.disconnected - If true, marks sync as disconnected (resets heartbeat to 0)
 */
export function sendStatusToDashboard(options?: {
  auth?: AuthStatusUpdate;
  paused?: boolean;
  disconnected?: boolean;
}): void {
  // Update stored state based on options
  if (options?.auth) {
    currentAuthStatus = options.auth;
  }
  if (options?.paused !== undefined) {
    lastSyncHeartbeat = Date.now();
    lastPausedState = options.paused;
  }
  if (!dashboardProcess) return;

  // Determine sync status
  const heartbeatRecent = Date.now() - lastSyncHeartbeat < SYNC_HEARTBEAT_TIMEOUT_MS;
  let syncStatus: SyncStatus;
  if (!heartbeatRecent || options?.disconnected) {
    syncStatus = 'disconnected';
  } else if (lastPausedState) {
    syncStatus = 'paused';
  } else {
    syncStatus = 'syncing';
  }

  const status: DashboardStatus = {
    auth: currentAuthStatus,
    syncStatus,
  };

  // Helper to safely get username from auth status
  const getUsername = (auth: AuthStatusUpdate) =>
    auth.status === 'authenticated' ? auth.username : undefined;

  // Check if status has actually changed (compare values, not just presence of options)
  const hasChanged =
    !lastSentStatus ||
    lastSentStatus.syncStatus !== status.syncStatus ||
    lastSentStatus.auth.status !== status.auth.status ||
    getUsername(lastSentStatus.auth) !== getUsername(status.auth);

  if (hasChanged) {
    sendToChild({ type: 'status', ...status });
    lastSentStatus = status;
  } else {
    // Always send heartbeat to keep SSE connection alive
    sendToChild({ type: 'heartbeat' });
  }
}
