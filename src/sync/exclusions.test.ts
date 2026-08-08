import { describe, expect, test } from 'bun:test';

import { isPathExcluded, validateGlob } from './exclusions.js';

describe('exclusions', () => {
  const patterns = [{ path: '/', globs: ['node_modules', '.npm', '__pycache__'] }];

  test('excludes generated directories at every depth', () => {
    expect(
      isPathExcluded(
        '/data/Projects/app/frontend/node_modules/pkg/index.js',
        '/data/Projects',
        patterns
      )
    ).toBe(true);
    expect(
      isPathExcluded('/data/Projects/api/__pycache__/module.pyc', '/data/Projects', patterns)
    ).toBe(true);
  });

  test('does not exclude project source or git history', () => {
    expect(isPathExcluded('/data/Projects/app/src/index.ts', '/data/Projects', patterns)).toBe(
      false
    );
    expect(isPathExcluded('/data/Projects/app/.git/HEAD', '/data/Projects', patterns)).toBe(false);
  });

  test('rejects absolute globs', () => {
    expect(validateGlob('/node_modules').valid).toBe(false);
  });

  test('applies exclusions only to the selected backup mapping', () => {
    const scoped = [{ path: '/data/photos', globs: ['private', '*.tmp'] }];

    expect(isPathExcluded('/data/photos/private/image.jpg', '/data/photos', scoped)).toBe(true);
    expect(isPathExcluded('/data/photos/upload.tmp', '/data/photos', scoped)).toBe(true);
    expect(isPathExcluded('/data/documents/private/notes.txt', '/data/documents', scoped)).toBe(
      false
    );
  });

  test('handles mapping-specific exclusions with Windows paths', () => {
    const scoped = [{ path: 'C:\\Backups\\Photos', globs: ['private'] }];

    expect(
      isPathExcluded('C:\\Backups\\Photos\\private\\image.jpg', 'C:\\Backups\\Photos', scoped)
    ).toBe(true);
    expect(
      isPathExcluded('C:\\Backups\\Documents\\private\\notes.txt', 'C:\\Backups\\Documents', scoped)
    ).toBe(false);
  });

  test('always excludes two-way safety folders', () => {
    expect(
      isPathExcluded('/data/Projects/.proton-sync-conflicts/2026/file.txt', '/data/Projects', [])
    ).toBe(true);
    expect(
      isPathExcluded('/data/Projects/.proton-sync-recovery/file.txt', '/data/Projects', [])
    ).toBe(true);
  });

  test('always excludes platform recycle folders even with an empty config', () => {
    expect(isPathExcluded('/data/robin/#recycle/file.txt', '/data/robin', [])).toBe(true);
    expect(isPathExcluded('/data/robin/archive/$RECYCLE.BIN/file.txt', '/data/robin', [])).toBe(
      true
    );
    expect(isPathExcluded('/data/robin/.Trashes/file.txt', '/data/robin', [])).toBe(true);
  });
});
