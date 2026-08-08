/**
 * Logs command to view openprotonsync logs
 */

import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { getStateDir } from '../paths.js';
import { logger } from '../logger.js';

const STATE_DIR = getStateDir();
const LOG_PATH = join(STATE_DIR, 'sync.log');

interface LogsOptions {
  follow?: boolean;
}

export function logsCommand(options: LogsOptions): void {
  if (!existsSync(LOG_PATH)) {
    logger.error(`Log file not found: ${LOG_PATH}`);
    logger.error('The service may not have run yet.');
    process.exit(1);
  }

  if (options.follow) {
    if (process.platform === 'win32') {
      // Windows: Use PowerShell Get-Content -Wait
      const ps = Bun.spawn(
        ['powershell', '-Command', `Get-Content -Path "${LOG_PATH}" -Wait -Tail 50`],
        {
          stdio: ['inherit', 'inherit', 'inherit'],
        }
      );

      ps.exited.catch((err: Error) => {
        logger.error('Failed to follow logs:', err.message);
        process.exit(1);
      });

      // Handle Ctrl+C gracefully
      process.on('SIGINT', () => {
        ps.kill();
        process.exit(0);
      });
    } else {
      // Unix: Use tail -f
      const tail = Bun.spawn(['tail', '-f', LOG_PATH], {
        stdio: ['inherit', 'inherit', 'inherit'],
      });

      tail.exited.catch((err: Error) => {
        logger.error('Failed to follow logs:', err.message);
        process.exit(1);
      });

      // Handle Ctrl+C gracefully
      process.on('SIGINT', () => {
        tail.kill();
        process.exit(0);
      });
    }
  } else {
    const content = readFileSync(LOG_PATH, 'utf-8');

    if (!content.trim()) {
      logger.info('Log file is empty.');
      return;
    }

    // Write directly to stdout to avoid double-encoding through the JSON logger
    process.stdout.write(content);
  }
}

export function logsClearCommand(): void {
  if (!existsSync(LOG_PATH)) {
    logger.info('No log file to clear.');
    return;
  }

  unlinkSync(LOG_PATH);
  logger.info('Logs cleared.');
}
