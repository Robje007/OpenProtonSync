/**
 * Resume Command
 *
 * Resumes the syncing loop after it has been paused.
 */

import { isAlreadyRunning, isPaused, clearFlag, FLAGS } from '../flags.js';
import { logger } from '../logger.js';

/**
 * Resume the sync process by clearing the paused flag.
 * The process will start processing sync jobs again.
 */
export function resumeCommand(): void {
  // Check if a sync process is running first
  if (!isAlreadyRunning()) {
    logger.info('No running openprotonsync process found.');
    return;
  }

  // Check if actually paused
  if (!isPaused()) {
    logger.info('Sync is not paused.');
    return;
  }

  // Clear paused flag
  clearFlag(FLAGS.PAUSED);
  logger.info('Syncing resumed.');
}
