/**
 * OpenProtonSync - Cross-platform Path Helpers
 *
 * Provides consistent paths across macOS, Linux, and Windows:
 * - macOS/Linux: Uses XDG Base Directory specification
 * - Windows: Uses %APPDATA% and %LOCALAPPDATA%
 *
 * Also provides SUDO_USER awareness on Linux/macOS:
 * - When running via sudo, paths resolve to the original user's directories
 * - Files created are chowned to the original user
 */

import { chownSync, cpSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Lazy logger import to avoid circular dependency during initialization
// (logger.ts -> db/index.ts -> paths.ts -> logger.ts)
let _logger: typeof import('./logger.js').logger | null = null;
function getLogger() {
  if (!_logger) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _logger = require('./logger.js').logger;
    } catch {
      // Logger not yet initialized, ignore
    }
  }
  return _logger;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default UID/GID fallback for platforms without process.getuid()/process.getgid()
 * (e.g., Windows). Value 1000 is the typical first non-system user on Linux.
 */
const DEFAULT_UID = 1000;
const DEFAULT_GID = 1000;
const APP_DIRECTORY_NAME = 'openprotonsync';
const LEGACY_APP_DIRECTORY_NAME = 'proton-drive-sync';

/** Copy legacy data once so upgrades continue with the renamed application directories. */
function resolveRenamedDirectory(parent: string): string {
  const target = join(parent, APP_DIRECTORY_NAME);
  const legacy = join(parent, LEGACY_APP_DIRECTORY_NAME);
  if (!existsSync(target) && existsSync(legacy)) {
    try {
      cpSync(legacy, target, { recursive: true, errorOnExist: false });
    } catch (error) {
      getLogger()?.warn(`Could not migrate legacy data from ${legacy}: ${String(error)}`);
    }
  }
  return target;
}

// ============================================================================
// SUDO_USER Awareness Helpers
// ============================================================================

/**
 * Get the effective user when running with sudo.
 * Returns SUDO_USER if set, otherwise null.
 */
export function getSudoUser(): string | null {
  return process.env.SUDO_USER || null;
}

/**
 * Get the UID of the effective user (for chown operations).
 * Returns SUDO_UID if set, otherwise current UID.
 */
export function getEffectiveUid(): number {
  const sudoUid = process.env.SUDO_UID;
  if (sudoUid) {
    return parseInt(sudoUid, 10);
  }
  return process.getuid?.() ?? DEFAULT_UID;
}

/**
 * Get the GID of the effective user (for chown operations).
 * Returns SUDO_GID if set, otherwise current GID.
 */
export function getEffectiveGid(): number {
  const sudoGid = process.env.SUDO_GID;
  if (sudoGid) {
    return parseInt(sudoGid, 10);
  }
  return process.getgid?.() ?? DEFAULT_GID;
}

/**
 * Get home directory, respecting SUDO_USER on Linux/macOS.
 * When running as root via sudo, returns the original user's home.
 */
export function getEffectiveHome(): string {
  const sudoUser = getSudoUser();

  if (sudoUser && (process.platform === 'linux' || process.platform === 'darwin')) {
    if (process.platform === 'linux') {
      // Linux: use getent passwd to resolve home directory
      const result = Bun.spawnSync(['getent', 'passwd', sudoUser]);
      const output = new TextDecoder().decode(result.stdout).trim();
      const parts = output.split(':');
      if (parts.length >= 6 && parts[5]) {
        return parts[5];
      }
    } else if (process.platform === 'darwin') {
      // macOS: use dscl to get home directory
      const result = Bun.spawnSync([
        'dscl',
        '.',
        '-read',
        `/Users/${sudoUser}`,
        'NFSHomeDirectory',
      ]);
      const output = new TextDecoder().decode(result.stdout).trim();
      // Output format: "NFSHomeDirectory: /Users/username"
      const match = output.match(/NFSHomeDirectory:\s*(.+)/);
      if (match && match[1]) {
        return match[1];
      }
    }
  }

  return homedir();
}

/**
 * Change ownership of path to the effective user.
 * When running as root via sudo, chowns to the original user (SUDO_USER).
 * When not running as root, this is a no-op (files already owned by current user).
 */
export function chownToEffectiveUser(path: string): void {
  const sudoUser = getSudoUser();
  const isRoot = process.getuid?.() === 0;

  if (isRoot && sudoUser) {
    const uid = getEffectiveUid();
    const gid = getEffectiveGid();
    try {
      chownSync(path, uid, gid);
      getLogger()?.debug(`chown ${path} to ${uid}:${gid} (user: ${sudoUser})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      getLogger()?.warn(`Failed to chown ${path} to ${sudoUser}: ${message}`);
    }
  }
}

/**
 * Create directory if it doesn't exist, and chown to effective user if applicable.
 */
export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    getLogger()?.debug(`Created directory: ${dir}`);
  }
  chownToEffectiveUser(dir);
}

// ============================================================================
// Path Resolution Functions
// ============================================================================

/**
 * Get the configuration directory path.
 * - macOS/Linux: ~/.config/openprotonsync
 * - Windows: %APPDATA%\openprotonsync
 *
 * Respects SUDO_USER on Linux/macOS when running via sudo.
 */
export function getConfigDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (!appData) {
      throw new Error('APPDATA environment variable is not set');
    }
    return resolveRenamedDirectory(appData);
  }

  // macOS/Linux: Use XDG Base Directory
  // When SUDO_USER is set, we need to construct the path manually
  // since xdg-basedir uses os.homedir() which returns root's home
  const sudoUser = getSudoUser();
  if (sudoUser) {
    const home = getEffectiveHome();
    const xdgConfigHome = process.env.XDG_CONFIG_HOME || join(home, '.config');
    return resolveRenamedDirectory(xdgConfigHome);
  }

  // Normal case: use xdg-basedir
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { xdgConfig } = require('xdg-basedir');
  if (!xdgConfig) {
    throw new Error('Could not determine XDG config directory');
  }
  return resolveRenamedDirectory(xdgConfig);
}

/**
 * Get the state directory path (for database, logs, etc.).
 * - macOS/Linux: ~/.local/state/openprotonsync
 * - Windows: %LOCALAPPDATA%\openprotonsync
 *
 * Respects SUDO_USER on Linux/macOS when running via sudo.
 */
export function getStateDir(): string {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) {
      throw new Error('LOCALAPPDATA environment variable is not set');
    }
    return resolveRenamedDirectory(localAppData);
  }

  // macOS/Linux: Use XDG Base Directory
  // When SUDO_USER is set, we need to construct the path manually
  const sudoUser = getSudoUser();
  if (sudoUser) {
    const home = getEffectiveHome();
    const xdgStateHome = process.env.XDG_STATE_HOME || join(home, '.local', 'state');
    return resolveRenamedDirectory(xdgStateHome);
  }

  // Normal case: use xdg-basedir
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { xdgState } = require('xdg-basedir');
  if (!xdgState) {
    throw new Error('Could not determine XDG state directory');
  }
  return resolveRenamedDirectory(xdgState);
}
