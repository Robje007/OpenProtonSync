/**
 * Dashboard IPC Types and Utilities
 *
 * Defines the message types for communication between the main sync process
 * (parent) and the dashboard subprocess (child) via stdin/stdout JSON streams.
 */

import type { Config } from '../config.js';
import type { SyncEventType } from '../db/schema.js';

// ============================================================================
// Shared Types (used by both parent and child)
// ============================================================================

/** Authentication status */
export type AuthStatus = 'unauthenticated' | 'authenticating' | 'authenticated' | 'failed';

/** Authentication status update with optional username */
export interface AuthStatusUpdate {
  status: AuthStatus;
  username?: string;
}

/** Sync status for three-state badge */
export type SyncStatus = 'syncing' | 'paused' | 'disconnected';

/** Combined status for dashboard display */
export interface DashboardStatus {
  auth: AuthStatusUpdate;
  syncStatus: SyncStatus;
}

/** A job item for display in the dashboard */
export interface DashboardJob {
  id: number;
  eventType: SyncEventType;
  localPath: string;
  remotePath?: string | null;
  lastError?: string | null;
  nRetries?: number;
  retryAt?: Date;
  createdAt?: Date;
}

// ============================================================================
// Parent → Child Messages (sent via stdin)
// ============================================================================

/** Initial configuration message sent once at startup */
export interface ConfigMessage {
  type: 'config';
  config: Config;
  dryRun: boolean;
}

/** Job refresh trigger message - tells dashboard to re-query DB */
export interface JobRefreshMessage {
  type: 'job_refresh';
}

/** Status update message sent on auth/sync status changes */
export interface StatusMessage {
  type: 'status';
  auth: AuthStatusUpdate;
  syncStatus: SyncStatus;
}

/** Heartbeat message sent periodically to keep connection alive */
export interface HeartbeatMessage {
  type: 'heartbeat';
}

/** Union of all messages parent can send to child */
export type ParentMessage = ConfigMessage | JobRefreshMessage | StatusMessage | HeartbeatMessage;

// ============================================================================
// Child → Parent Messages (sent via stdout)
// ============================================================================

/** Ready message sent when dashboard server starts successfully */
export interface ReadyMessage {
  type: 'ready';
  port: number;
  host?: string;
}

/** Error message sent when dashboard server fails to start */
export interface ErrorMessage {
  type: 'error';
  error: string;
  code?: string;
}

/** Log message sent from dashboard to parent for forwarding to main logger */
export interface LogMessage {
  type: 'log';
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
}

/** Union of all messages child can send to parent */
export type ChildMessage = ReadyMessage | ErrorMessage | LogMessage;

// ============================================================================
// Utilities
// ============================================================================

/**
 * Send a message to stdout as newline-delimited JSON.
 * Used by child process to communicate with parent.
 */
export function sendToParent(message: ChildMessage): void {
  console.log(JSON.stringify(message));
}

/**
 * Parse a JSON message from a line of text.
 * Returns null if parsing fails.
 */
export function parseMessage<T>(line: string): T | null {
  try {
    return JSON.parse(line) as T;
  } catch {
    return null;
  }
}
