/**
 * Pause Command
 *
 * Pauses the syncing loop without stopping the process.
 */

import { isAlreadyRunning, isPaused, setFlag, FLAGS } from '../flags.js';
import { logger } from '../logger.js';

/**
 * Pause the sync process by setting the paused flag.
 * The process will continue running but stop processing sync jobs.
 */
export function pauseCommand(): void {
  // Check if a sync process is running first
  if (!isAlreadyRunning()) {
    logger.info('No running openprotonsync process found.');
    return;
  }

  // Check if already paused
  if (isPaused()) {
    logger.info('Sync is already paused. Use "resume" to continue syncing.');
    return;
  }

  // Set paused flag
  setFlag(FLAGS.PAUSED);
  logger.info('Syncing paused.');
}
