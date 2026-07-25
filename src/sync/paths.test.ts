import { describe, expect, test } from 'bun:test';

import type { Config, SyncDir } from '../config.js';
import {
  buildRemotePath,
  findOverlappingSyncDir,
  findSyncDirForJob,
  isLocalPathInside,
  normalizeRemoteRoot,
} from './paths.js';

const mapping: SyncDir = {
  source_path: '/data/documents/Projects',
  remote_root: '/Backups/',
};

describe('remote path normalization', () => {
  test('uses one leading slash and removes trailing slashes', () => {
    expect(normalizeRemoteRoot('//Backups///projects/')).toBe('/Backups/projects');
    expect(normalizeRemoteRoot('/')).toBe('/');
  });

  test('never creates a double slash for a root mapping', () => {
    expect(
      buildRemotePath(
        { source_path: '/data/documents', remote_root: '/' },
        '/data/documents/Projects/app'
      )
    ).toBe('/Projects/app');
  });

  test('maps a project to the configured remote root', () => {
    expect(buildRemotePath(mapping, '/data/documents/Projects/example/.git/HEAD')).toBe(
      '/Backups/example/.git/HEAD'
    );
  });
});

describe('local path boundaries', () => {
  test('does not confuse similarly prefixed directories', () => {
    expect(isLocalPathInside('/data/project-old/file', '/data/project')).toBe(false);
    expect(isLocalPathInside('/data/project/file', '/data/project')).toBe(true);
  });

  test('detects nested mappings', () => {
    expect(
      findOverlappingSyncDir('/data/documents/Projects', [
        { source_path: '/data/documents', remote_root: '/' },
      ])?.source_path
    ).toBe('/data/documents');
  });
});

test('old remote-root jobs no longer match current config', () => {
  const config = {
    sync_dirs: [mapping],
    sync_concurrency: 2,
    remote_delete_behavior: 'trash',
    dashboard_host: '127.0.0.1',
    dashboard_port: 4242,
    exclude_patterns: [],
  } satisfies Config;

  expect(
    findSyncDirForJob(
      '/data/documents/Projects/example/package.json',
      '//Projects/old-location/package.json',
      config
    )
  ).toBeNull();
  expect(
    findSyncDirForJob(
      '/data/documents/Projects/example/package.json',
      '/Backups/example/package.json',
      config
    )
  ).toEqual(mapping);
});

test('legacy double-slash jobs are discarded even for a root mapping', () => {
  const config = {
    sync_dirs: [{ source_path: '/data/documents', remote_root: '/' }],
    sync_concurrency: 2,
    remote_delete_behavior: 'trash',
    dashboard_host: '127.0.0.1',
    dashboard_port: 4242,
    exclude_patterns: [],
  } satisfies Config;

  expect(
    findSyncDirForJob(
      '/data/documents/Projects/example/package.json',
      '//Projects/old-location/package.json',
      config
    )
  ).toBeNull();
});
