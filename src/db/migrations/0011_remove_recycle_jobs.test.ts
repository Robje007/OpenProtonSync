import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';

import migration from './0011_remove_recycle_jobs.sql' with { type: 'text' };

describe('recycle queue cleanup migration', () => {
  test('removes unfinished recycle jobs while preserving normal and completed jobs', () => {
    const database = new Database(':memory:');
    database.exec('CREATE TABLE sync_jobs (id INTEGER PRIMARY KEY, status TEXT, local_path TEXT)');
    const insert = database.prepare('INSERT INTO sync_jobs (status, local_path) VALUES (?, ?)');
    insert.run('PENDING', '/data/robin/#recycle/deleted.txt');
    insert.run('BLOCKED', '/data/robin/archive/$RECYCLE.BIN/deleted.txt');
    insert.run('PENDING', '/data/robin/Projects/source.ts');
    insert.run('SYNCED', '/data/robin/#recycle/already-finished.txt');

    database.exec(migration);

    const remaining = database
      .query<
        { status: string; local_path: string },
        []
      >('SELECT status, local_path FROM sync_jobs ORDER BY id')
      .all();
    expect(remaining).toEqual([
      { status: 'PENDING', local_path: '/data/robin/Projects/source.ts' },
      { status: 'SYNCED', local_path: '/data/robin/#recycle/already-finished.txt' },
    ]);
  });
});
