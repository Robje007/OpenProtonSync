import { basename } from 'node:path';
import { SyncEventType, type SyncEventType as SyncEventTypeValue } from '../../../db/schema.js';
import type { RemoteDeleteBehavior } from '../../../config.js';

export function formatPath(path: string): string {
  return basename(path);
}

export function formatTime(date: Date | string | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString();
}

export function formatJobAction(
  eventType: SyncEventTypeValue,
  phase: 'pending' | 'active' | 'complete',
  deleteBehavior?: RemoteDeleteBehavior
): string {
  if (eventType === SyncEventType.DELETE) {
    if (!deleteBehavior) {
      return phase === 'complete' ? 'Removed from Drive' : 'Removing from Drive';
    }
    if (phase === 'complete') {
      return deleteBehavior === 'trash' ? 'Moved to Drive trash' : 'Deleted from Drive';
    }
    return deleteBehavior === 'trash' ? 'Moving to Drive trash' : 'Deleting from Drive';
  }
  if (eventType === SyncEventType.CREATE_DIR) {
    return phase === 'complete' ? 'Folder created in Drive' : 'Creating folder in Drive';
  }
  if (eventType === SyncEventType.UPDATE) {
    return phase === 'complete' ? 'Update uploaded' : 'Uploading update';
  }
  return phase === 'complete' ? 'Uploaded' : 'Uploading';
}
