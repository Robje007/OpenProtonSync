/**
 * OpenProtonSync - File State Storage
 *
 * Tracks file state (mtime:size and content SHA1) for synced files to detect changes.
 * Used to skip uploads when file content hasn't changed, even if mtime shifts
 * (e.g. after macOS reboot due to APFS snapshots, Spotlight, Time Machine).
 */

import { createHash } from 'crypto';
import { eq, like } from 'drizzle-orm';
import { type Tx } from '../db/index.js';
import { fileState } from '../db/schema.js';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';

// ============================================================================
// Hash Utilities
// ============================================================================

/**
 * Compute SHA1 hash of a local file without buffering the whole file in memory.
 * Returns hex-encoded hash string, or null if the file cannot be read.
 */
export async function computeFileSha1(filePath: string): Promise<string | null> {
  try {
    const hash = createHash('sha1');
    const stream = Bun.file(filePath).stream();
    for await (const chunk of stream) {
      // chunk can be ArrayBuffer | BufferSource | string; normalize to Buffer
      if (typeof chunk === 'string') {
        hash.update(chunk);
      } else if (chunk instanceof ArrayBuffer) {
        hash.update(Buffer.from(chunk));
      } else if (ArrayBuffer.isView(chunk)) {
        hash.update(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
      } else {
        hash.update(Buffer.from(chunk));
      }
    }
    return hash.digest('hex');
  } catch (error) {
    logger.warn(`Failed to compute SHA1 for ${filePath}: ${error}`);
    return null;
  }
}

// ============================================================================
// File State CRUD
// ============================================================================

/**
 * Get the full stored file state (change token + content SHA1) in a single query.
 * Returns null if no state is stored for this path.
 */
export function getFileState(
  localPath: string,
  tx: Tx
): { changeToken: string; contentSha1: string | null } | null {
  const result = tx.select().from(fileState).where(eq(fileState.localPath, localPath)).get();
  if (!result) return null;
  return { changeToken: result.changeToken, contentSha1: result.contentSha1 };
}

/**
 * Delete the stored state for a local path.
 */
export function deleteChangeToken(localPath: string, dryRun: boolean, tx: Tx): void {
  if (dryRun) return;
  tx.delete(fileState).where(eq(fileState.localPath, localPath)).run();
}

/**
 * Delete all stored state under a directory path.
 * Used when a directory is deleted.
 */
export function deleteChangeTokensUnderPath(dirPath: string, tx: Tx): void {
  const pathPrefix = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
  tx.delete(fileState)
    .where(like(fileState.localPath, `${pathPrefix}%`))
    .run();
}

/**
 * Update the local path for stored state (used during rename/move).
 */
export function updateChangeTokenPath(
  oldLocalPath: string,
  newLocalPath: string,
  dryRun: boolean,
  tx: Tx
): void {
  if (dryRun) return;
  tx.update(fileState)
    .set({ localPath: newLocalPath, updatedAt: new Date() })
    .where(eq(fileState.localPath, oldLocalPath))
    .run();
}

/**
 * Update all stored state under a directory when the directory is renamed.
 * Replaces oldDirPath prefix with newDirPath for all children.
 */
export function updateChangeTokensUnderPath(
  oldDirPath: string,
  newDirPath: string,
  dryRun: boolean,
  tx: Tx
): void {
  if (dryRun) return;
  const pathPrefix = oldDirPath.endsWith('/') ? oldDirPath : `${oldDirPath}/`;
  const children = tx
    .select()
    .from(fileState)
    .where(like(fileState.localPath, `${pathPrefix}%`))
    .all();

  for (const child of children) {
    const newPath = newDirPath + child.localPath.slice(oldDirPath.length);
    tx.update(fileState)
      .set({ localPath: newPath, updatedAt: new Date() })
      .where(eq(fileState.localPath, child.localPath))
      .run();
  }
}

/**
 * Remove state for paths no longer under any sync directory.
 */
export function cleanupOrphanedChangeTokens(tx: Tx): number {
  const config = getConfig();
  const syncDirs = config.sync_dirs;

  if (syncDirs.length === 0) {
    // No sync dirs configured, clear all state
    tx.delete(fileState).run();
    return 0;
  }

  // Get all state entries
  const allState = tx.select().from(fileState).all();
  let removedCount = 0;

  for (const entry of allState) {
    const isUnderSyncDir = syncDirs.some(
      (dir) =>
        entry.localPath === dir.source_path || entry.localPath.startsWith(`${dir.source_path}/`)
    );

    if (!isUnderSyncDir) {
      tx.delete(fileState).where(eq(fileState.localPath, entry.localPath)).run();
      removedCount++;
    }
  }

  return removedCount;
}

// ============================================================================
// File State - Write Operations
// ============================================================================

/**
 * Store or update the file state (change token + optional content SHA1) after successful sync.
 * Fails silently with a warning log if storage fails.
 */
export function storeFileState(
  localPath: string,
  changeToken: string,
  contentSha1: string | null,
  dryRun: boolean,
  tx: Tx
): void {
  if (dryRun) return;
  try {
    tx.insert(fileState)
      .values({
        localPath,
        changeToken,
        contentSha1,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: fileState.localPath,
        set: {
          changeToken,
          contentSha1,
          updatedAt: new Date(),
        },
      })
      .run();
    logger.debug(`Stored file state for ${localPath}`);
  } catch (error) {
    logger.warn(
      `Failed to store file state for ${localPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Update only the change token (mtime:size) for a file, preserving the stored SHA1.
 * Used when SHA1 matches but mtime has shifted (e.g. after macOS reboot).
 */
export function updateChangeToken(
  localPath: string,
  newChangeToken: string,
  dryRun: boolean,
  tx: Tx
): void {
  if (dryRun) return;
  try {
    tx.update(fileState)
      .set({
        changeToken: newChangeToken,
        updatedAt: new Date(),
      })
      .where(eq(fileState.localPath, localPath))
      .run();
    logger.debug(`Updated change token for ${localPath}`);
  } catch (error) {
    logger.warn(
      `Failed to update change token for ${localPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
