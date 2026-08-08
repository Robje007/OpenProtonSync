/**
 * Linux systemd service implementation
 * Supports both user-level (~/.config/systemd/user/) and system-level (/etc/systemd/system/) services
 * Uses file-based encrypted credential storage (no gnome-keyring dependency)
 *
 * Flatpak support: When running inside a Flatpak sandbox, systemctl commands are
 * executed on the host via `flatpak-spawn --host`. The systemd service is configured
 * to launch the app via `flatpak run` so it runs within the sandbox correctly.
 */

import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

import { isFlatpak } from '../../environment.js';
import { setFlag, clearFlag, FLAGS } from '../../flags.js';
import { logger } from '../../logger.js';
import {
  getEffectiveHome,
  getSudoUser,
  getEffectiveUid,
  chownToEffectiveUser,
} from '../../paths.js';
import type { ServiceOperations, InstallScope } from './types.js';
// @ts-expect-error Bun text imports
import serviceTemplate from './templates/openprotonsync.service' with { type: 'text' };

// ============================================================================
// Constants
// ============================================================================

const SERVICE_NAME = 'openprotonsync';

// Default encryption password for file-based credential storage
// This is stored in the systemd service file anyway, so hardcoding doesn't reduce security
const ENCRYPTION_PASSWORD = 'openprotonsync';

const FLATPAK_APP_ID = 'io.github.robje007.OpenProtonSync';

// ============================================================================
// Path Helpers
// ============================================================================

interface ServicePaths {
  serviceDir: string;
  servicePath: string;
  dataDir: string;
}

function getPaths(scope: InstallScope): ServicePaths {
  const home = getEffectiveHome();

  if (scope === 'system') {
    return {
      serviceDir: '/etc/systemd/system',
      servicePath: '/etc/systemd/system/openprotonsync.service',
      dataDir: '/etc/openprotonsync',
    };
  }

  return {
    serviceDir: join(home, '.config', 'systemd', 'user'),
    servicePath: join(home, '.config', 'systemd', 'user', 'openprotonsync.service'),
    dataDir: join(home, '.config', 'openprotonsync'),
  };
}

// ============================================================================
// System Helpers
// ============================================================================

/**
 * Spawn a command on the host system.
 * Inside Flatpak, this uses `flatpak-spawn --host` to escape the sandbox.
 * Outside Flatpak, it runs the command directly.
 */
function spawnOnHost(
  args: string[],
  options?: { env?: Record<string, string | undefined> }
): { exitCode: number; stdout: Uint8Array; stderr: Uint8Array } {
  const command = isFlatpak() ? ['flatpak-spawn', '--host', ...args] : args;
  return Bun.spawnSync(command, options);
}

function isRunningAsRoot(): boolean {
  return process.getuid?.() === 0;
}

function getCurrentUser(): string {
  // When running as root via sudo, SUDO_USER contains the original user
  const sudoUser = getSudoUser();
  if (sudoUser) {
    return sudoUser;
  }
  // Fallback to whoami (run on host if inside Flatpak)
  const result = spawnOnHost(['whoami']);
  return new TextDecoder().decode(result.stdout).trim();
}

function runSystemctl(
  scope: InstallScope,
  ...args: string[]
): { success: boolean; error?: string } {
  const systemctlArgs =
    scope === 'user' ? ['systemctl', '--user', ...args] : ['systemctl', ...args];

  // For user scope, ensure XDG_RUNTIME_DIR is set (required for systemctl --user)
  const env =
    scope === 'user'
      ? { ...process.env, XDG_RUNTIME_DIR: `/run/user/${getEffectiveUid()}` }
      : undefined;

  const result = spawnOnHost(systemctlArgs, { env });
  if (result.exitCode === 0) {
    return { success: true };
  }
  const stderr = new TextDecoder().decode(result.stderr).trim();
  return { success: false, error: stderr || `exit code ${result.exitCode}` };
}

function daemonReload(scope: InstallScope): boolean {
  const result = runSystemctl(scope, 'daemon-reload');
  return result.success;
}

// ============================================================================
// Service File Generation
// ============================================================================

function generateServiceFile(binPath: string, password: string, scope: InstallScope): string {
  const home = getEffectiveHome();
  const uid = getEffectiveUid();

  // Inside Flatpak, the systemd service should launch via `flatpak run` so the
  // app runs within its sandbox with proper permissions and filesystem access.
  const execStart = isFlatpak()
    ? `flatpak run ${FLATPAK_APP_ID} start --no-daemon`
    : `${binPath} start --no-daemon`;

  let content = serviceTemplate
    .replace('{{BIN_PATH}}', execStart)
    .replace(/\{\{HOME\}\}/g, home)
    .replace(/\{\{UID\}\}/g, String(uid))
    .replace('{{KEYRING_PASSWORD}}', password)
    .replace('{{WANTED_BY}}', scope === 'system' ? 'multi-user.target' : 'default.target');

  if (scope === 'system') {
    const user = getCurrentUser();
    content = content.replace('{{USER_LINE}}', `User=${user}`);
  } else {
    content = content.replace('{{USER_LINE}}\n', '');
  }

  return content;
}

// ============================================================================
// Main Service Operations
// ============================================================================

function createLinuxService(scope: InstallScope): ServiceOperations {
  const paths = getPaths(scope);

  return {
    async install(binPath: string): Promise<boolean> {
      // System scope requires root
      if (scope === 'system' && !isRunningAsRoot()) {
        logger.error('System scope requires running with sudo');
        return false;
      }

      // Use hardcoded encryption password for file-based credential storage
      const password = ENCRYPTION_PASSWORD;

      // Create systemd directory if it doesn't exist
      if (!existsSync(paths.serviceDir)) {
        mkdirSync(paths.serviceDir, { recursive: true });
        chownToEffectiveUser(paths.serviceDir);
      }

      // Create data directory if it doesn't exist
      if (!existsSync(paths.dataDir)) {
        mkdirSync(paths.dataDir, { recursive: true });
        chownToEffectiveUser(paths.dataDir);
      }

      logger.info(`Installing openprotonsync service (${scope} scope)...`);

      if (isFlatpak()) {
        logger.info('Flatpak detected: service will be managed on the host via flatpak-spawn.');
      }

      // If service exists, stop and disable it first
      if (existsSync(paths.servicePath)) {
        runSystemctl(scope, 'stop', SERVICE_NAME);
        runSystemctl(scope, 'disable', SERVICE_NAME);
      }

      // Write main service file
      const content = generateServiceFile(binPath, password, scope);
      writeFileSync(paths.servicePath, content);
      logger.info(`Created: ${paths.servicePath}`);

      // Reload systemd to pick up new service
      if (!daemonReload(scope)) {
        if (scope === 'user') {
          // User services require a login session - this is expected to fail over SSH
          logger.error('Could not reload systemd daemon (user services require a login session)');
          logger.info('The service will start automatically on your next login.');
          logger.info('To manage services over SSH, use system-level installation instead:');
          logger.info('  openprotonsync service install --install-scope system');
        } else {
          logger.error('Failed to reload systemd daemon');
        }
        return false;
      }

      setFlag(FLAGS.SERVICE_INSTALLED);

      if (this.load()) {
        logger.info('openprotonsync service installed and started.');
        return true;
      } else {
        logger.error('openprotonsync service installed but failed to start.');
        return false;
      }
    },

    async uninstall(interactive: boolean): Promise<boolean> {
      // Check both user and system level for installed services
      const userPaths = getPaths('user');
      const systemPaths = getPaths('system');

      const hasUserService = existsSync(userPaths.servicePath);
      const hasSystemService = existsSync(systemPaths.servicePath);

      if (!hasUserService && !hasSystemService) {
        if (interactive) {
          logger.info('No service is installed.');
        }
        return true;
      }

      // Check if we need root for system service
      if (hasSystemService && !isRunningAsRoot()) {
        logger.error('System service found. Run with sudo to uninstall.');
        return false;
      }

      // Uninstall user-level service if it exists
      if (hasUserService) {
        logger.info('Uninstalling user-level service...');

        // Stop and disable the service
        runSystemctl('user', 'stop', SERVICE_NAME);
        runSystemctl('user', 'disable', SERVICE_NAME);

        // Remove service file
        if (existsSync(userPaths.servicePath)) {
          unlinkSync(userPaths.servicePath);
          logger.info(`Removed: ${userPaths.servicePath}`);
        }

        daemonReload('user');
      }

      // Uninstall system-level service if it exists
      if (hasSystemService) {
        logger.info('Uninstalling system-level service...');

        // Stop and disable the service
        runSystemctl('system', 'stop', SERVICE_NAME);
        runSystemctl('system', 'disable', SERVICE_NAME);

        // Remove service file
        if (existsSync(systemPaths.servicePath)) {
          unlinkSync(systemPaths.servicePath);
          logger.info(`Removed: ${systemPaths.servicePath}`);
        }

        daemonReload('system');
      }

      clearFlag(FLAGS.SERVICE_INSTALLED);
      clearFlag(FLAGS.SERVICE_LOADED);
      logger.info('openprotonsync service uninstalled.');
      return true;
    },

    load(): boolean {
      // System scope requires root
      if (scope === 'system' && !isRunningAsRoot()) {
        logger.error('System scope requires running with sudo');
        return false;
      }

      if (!existsSync(paths.servicePath)) {
        return false;
      }

      // Enable and start the service
      const enableResult = runSystemctl(scope, 'enable', SERVICE_NAME);
      if (!enableResult.success) {
        logger.error(`Failed to enable service: ${enableResult.error}`);
        return false;
      }

      const startResult = runSystemctl(scope, 'start', SERVICE_NAME);
      if (!startResult.success) {
        logger.error(`Failed to start service: ${startResult.error}`);
        return false;
      }

      setFlag(FLAGS.SERVICE_LOADED);
      logger.info(`Service loaded: will start on ${scope === 'system' ? 'boot' : 'login'}`);
      return true;
    },

    unload(): boolean {
      // System scope requires root
      if (scope === 'system' && !isRunningAsRoot()) {
        logger.error('System scope requires running with sudo');
        return false;
      }

      if (!existsSync(paths.servicePath)) {
        clearFlag(FLAGS.SERVICE_LOADED);
        return true;
      }

      // Stop the service
      const stopResult = runSystemctl(scope, 'stop', SERVICE_NAME);
      if (!stopResult.success) {
        // Service might not be running, that's OK
        logger.debug(`Stop result: ${stopResult.error}`);
      }

      // Disable the service
      const disableResult = runSystemctl(scope, 'disable', SERVICE_NAME);
      if (!disableResult.success) {
        logger.error(`Failed to disable service: ${disableResult.error}`);
        return false;
      }

      clearFlag(FLAGS.SERVICE_LOADED);
      logger.info(`Service unloaded: will not start on ${scope === 'system' ? 'boot' : 'login'}`);
      return true;
    },

    isInstalled(): boolean {
      return existsSync(paths.servicePath);
    },

    getServicePath(): string {
      return paths.servicePath;
    },
  };
}

// Export a function that creates the service with the specified scope
export function getLinuxService(scope: InstallScope): ServiceOperations {
  return createLinuxService(scope);
}

// Default export for backward compatibility (user scope)
export const linuxService: ServiceOperations = createLinuxService('user');
