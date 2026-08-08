/**
 * OpenProtonSync - Logger
 *
 * Logs to both file and console by default.
 * In daemon mode, console logging is disabled.
 * In dry-run mode, file logging is disabled and [DRY-RUN] prefix is added.
 * In dashboard mode, logs are sent via stdout JSON IPC to parent process.
 *
 * Log file is circular: rotates at 1MB, keeps only the current file.
 */

import winston from 'winston';
import { STATE_DIR } from './db/index.js';

const LOG_FILE = `${STATE_DIR}/sync.log`;
const MAX_LOG_SIZE = 1 * 1024 * 1024; // 1MB

let dryRunMode = false;

const fileTransport = new winston.transports.File({
  filename: LOG_FILE,
  maxsize: MAX_LOG_SIZE, // Rotate when file reaches 1MB
  maxFiles: 1, // Keep only 1 rotated file (2 total: sync.log + sync.log.1)
  tailable: true, // Always write to sync.log, rotated files get .1 suffix
});

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.printf(({ level, message }) => {
    const prefix = dryRunMode ? '[DRY-RUN] ' : '';
    return `${level}: ${prefix}${message}`;
  })
);

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [fileTransport, new winston.transports.Console({ format: consoleFormat })],
});

/**
 * Disable console logging (for daemon mode - background process)
 */
export function disableConsoleLogging(): void {
  logger.transports.forEach((transport) => {
    if (transport instanceof winston.transports.Console) {
      transport.silent = true;
    }
  });
}

/**
 * Enable dry-run mode: disables file logging, adds [DRY-RUN] prefix to console
 */
export function setDryRun(enabled: boolean): void {
  dryRunMode = enabled;
  if (enabled) {
    logger.remove(fileTransport);
  }
}

/**
 * Enable debug level logging
 */
export function enableDebug(): void {
  logger.level = 'debug';
}

/**
 * Check if debug logging is enabled
 */
export function isDebugEnabled(): boolean {
  return logger.level === 'debug';
}

/**
 * Enable IPC logging mode for dashboard subprocess.
 * Removes file and console transports, adds a custom transport that sends
 * log messages as JSON to stdout for the parent process to handle.
 */
export function enableIpcLogging(): void {
  // Remove all existing transports
  logger.clear();

  // Add custom IPC transport that writes JSON to stdout
  const ipcTransport = new winston.transports.Stream({
    stream: process.stdout,
    format: winston.format.printf(({ level, message }) => {
      // Strip ANSI color codes from level if present (ESC char + [...m sequence)
      const ESC = String.fromCharCode(27);
      const cleanLevel = level.replace(new RegExp(ESC + '\\[[0-9;]*m', 'g'), '');
      const logMessage = {
        type: 'log',
        level: cleanLevel as 'error' | 'warn' | 'info' | 'debug',
        message: String(message),
      };
      return JSON.stringify(logMessage);
    }),
  });

  logger.add(ipcTransport);
}
