/**
 * Reconcile Command - Trigger full filesystem scan on running daemon
 */

import { isAlreadyRunning } from '../flags.js';
import { sendSignal } from '../signals.js';
import { logger } from '../logger.js';

export async function reconcileCommand(): Promise<void> {
  // Check if daemon is running
  if (!isAlreadyRunning()) {
    logger.error('No running daemon found. Start the daemon first with: openprotonsync start');
    process.exit(1);
  }

  // Send reconcile signal to the running daemon
  sendSignal('reconcile');
  logger.info('Reconcile signal sent to daemon. Check daemon logs for progress.');
}
