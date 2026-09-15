import { describe, expect, test } from 'bun:test';
import {
  MemberRole,
  NodeType,
  RevisionState,
  type NodeEntity,
  type ProtonDriveClient,
} from '@protontech/drive-sdk';
import { adaptSdkClient } from './sdkAdapter.js';

function fileNode(): NodeEntity {
  const date = new Date('2026-09-15T12:00:00Z');
  return {
    uid: 'file',
    parentUid: 'root',
    name: { ok: true, value: 'report.txt' },
    keyAuthor: { ok: true, value: 'author@example.com' },
    nameAuthor: { ok: true, value: 'author@example.com' },
    directRole: MemberRole.Admin,
    ownedBy: {},
    type: NodeType.File,
    isShared: true,
    isSharedByUrl: true,
    creationTime: date,
    modificationTime: date,
    treeEventScopeId: 'tree',
    totalStorageSize: 100,
    activeRevision: {
      uid: 'revision',
      state: RevisionState.Active,
      creationTime: date,
      contentAuthor: { ok: true, value: 'author@example.com' },
      storageSize: 100,
      isImported: false,
      claimedSize: 12,
      claimedModificationTime: date,
      claimedDigests: { sha1: '1234', sha1Verified: true },
    },
  };
}

function clientFor(nodes: NodeEntity[], listingError?: Error) {
  const client = {
    async getNode() {
      return nodes[0];
    },
    async *iterateFolderChildren() {
      yield* nodes;
      if (listingError) throw listingError;
    },
  } satisfies Partial<ProtonDriveClient>;
  return adaptSdkClient(client as unknown as ProtonDriveClient);
}

describe('SDK 0.21 compatibility', () => {
  test('preserves revision identity, hashes, dates and URL sharing for sync', async () => {
    const source = fileNode();
    const node = await clientFor([source]).getNode('file');
    expect(node.activeRevision?.uid).toBe('revision');
    expect(node.activeRevision?.claimedDigests?.sha1).toBe('1234');
    expect(node.size).toBe(12);
    expect(node.updatedAt).toEqual(source.activeRevision?.claimedModificationTime);
    expect(node.isSharedPublicly).toBe(true);
  });

  test('supports folders without an active revision', async () => {
    const source = { ...fileNode(), type: NodeType.Folder, activeRevision: undefined };
    expect((await clientFor([source]).getNode('folder')).activeRevision).toBeUndefined();
  });

  test('surfaces degraded metadata so two-way sync cannot infer remote deletions', async () => {
    const source = { ...fileNode(), errors: [new Error('Cannot decrypt attributes')] };
    const client = clientFor([source]);
    await expect(client.getNode('file')).rejects.toThrow('Could not read remote node metadata');
    const results = [];
    for await (const result of client.iterateFolderChildren('root')) results.push(result);
    expect(results[0].ok).toBe(false);
  });

  test('preserves a listing failure after the SDK yields readable nodes', async () => {
    const client = clientFor([fileNode()], new Error('Incomplete listing'));
    const iterator = client.iterateFolderChildren('root')[Symbol.asyncIterator]();
    expect((await iterator.next()).value?.ok).toBe(true);
    await expect(iterator.next()).rejects.toThrow('Incomplete listing');
  });
});
