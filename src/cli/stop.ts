/**
 * Stop Command
 *
 * Stops a running openprotonsync process gracefully.
 */

import { sendSignal } from '../signals.js';
import { isAlreadyRunning } from '../flags.js';
import { logger } from '../logger.js';

/**
 * Stop the sync process gracefully by sending a stop signal.
 * The process will detect this signal and exit cleanly (exit code 0),
 * which means the service manager (launchd/systemd) won't restart it.
 */
export function stopCommand(): void {
  // Check if a sync process is running first
  if (!isAlreadyRunning()) {
    logger.info('No running openprotonsync process found.');
    return;
  }

  // Send stop signal to the process
  sendSignal('stop');
  logger.info('Stop signal sent. Waiting for process to exit...');

  // Wait for up to 15 seconds for the process to exit (running signal disappears)
  const startTime = Date.now();
  const timeout = 15000;
  const checkInterval = 100;

  const waitForExit = (): void => {
    if (!isAlreadyRunning()) {
      logger.info('openprotonsync stopped.');
      return;
    }

    if (Date.now() - startTime < timeout) {
      setTimeout(waitForExit, checkInterval);
    } else {
      logger.info('Process did not respond to stop signal.');
    }
  };

  waitForExit();
}
