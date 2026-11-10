import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberAccessState, PinVerifierMetadata } from '../src/club-access/club-access-model';
import {
  ClubAccessDynamoItem,
  DynamoClubAccessPersistence,
  accessInvitationFromDynamoItem,
  accessInvitationToDynamoItem,
  accessSessionFromDynamoItem,
  accessSessionToDynamoItem,
  handleLookupFromDynamoItem,
  handleLookupToDynamoItem,
  memberAccessStateFromDynamoItem,
  memberAccessStateToDynamoItem
} from '../src/club-access/club-access-persistence';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const CREATED_AT = '2026-11-10T12:00:00.000Z';
const UPDATED_AT = '2026-11-10T12:05:00.000Z';

const verifier: PinVerifierMetadata = {
  algorithm: 'HMAC-SHA256+SCRYPT',
  kdfVersion: 1,
  saltBase64Url: Buffer.alloc(32, 1).toString('base64url'),
  verifierBase64Url: Buffer.alloc(32, 2).toString('base64url'),
  pepperVersion: 'test-v1',
  N: 32768,
  r: 8,
  p: 3,
  maxmem: 64 * 1024 * 1024,
  keyLength: 32,
  createdAtISO: CREATED_AT,
  updatedAtISO: UPDATED_AT
};

const state: MemberAccessState = {
  studioId: 'bella-mujer',
  clientId: 'client-01',
  handleDigest: DIGEST_A,
  accessStatus: 'active',
  credentialVersion: 2,
  invitationGeneration: 3,
  failedPinAttempts: 1,
  nextAllowedAtISO: UPDATED_AT,
  pinVerifier: verifier,
  createdAtISO: CREATED_AT,
  updatedAtISO: UPDATED_AT
};

const lookup = {
  handleDigest: DIGEST_A,
  studioId: 'bella-mujer',
  clientId: 'client-01',
  accessStatus: 'active' as const,
  credentialVersion: 2,
  createdAtISO: CREATED_AT,
  updatedAtISO: UPDATED_AT
};

const invitation = {
  invitationDigest: DIGEST_B,
  studioId: 'bella-mujer',
  clientId: 'client-01',
  handleDigest: DIGEST_A,
  generation: 3,
  createdAtISO: CREATED_AT,
  expiresAtISO: '2026-11-17T12:00:00.000Z',
  expiresAtEpoch: 1794916800,
  consumed: true,
  consumedAtISO: UPDATED_AT
};

const session = {
  sessionDigest: DIGEST_B,
  studioId: 'bella-mujer',
  clientId: 'client-01',
  credentialVersion: 2,
  createdAtISO: CREATED_AT,
  expiresAtISO: '2026-11-10T20:00:00.000Z',
  expiresAtEpoch: 1794340800,
  revoked: true,
  revokedAtISO: UPDATED_AT
};

describe('Club access serializers', () => {
  it('round-trips every access entity with explicit entity types', () => {
    const cases = [
      [state, memberAccessStateToDynamoItem, memberAccessStateFromDynamoItem, 'MEMBER_ACCESS'],
      [lookup, handleLookupToDynamoItem, handleLookupFromDynamoItem, 'HANDLE'],
      [invitation, accessInvitationToDynamoItem, accessInvitationFromDynamoItem, 'INVITE'],
      [session, accessSessionToDynamoItem, accessSessionFromDynamoItem, 'SESSION']
    ] as const;

    for (const [record, serialize, deserialize, entityType] of cases) {
      const item = serialize(record as never);
      expect(item.entityType).toEqual({ S: entityType });
      expect(deserialize(item) as unknown).toEqual(record);
    }
  });

  it('rejects a physical key that does not match the logical record', () => {
    const item = memberAccessStateToDynamoItem(state);
    expect(() => memberAccessStateFromDynamoItem({
      ...item,
      pk: { S: 'CLIENT#different-client' }
    })).toThrow(/persisted key/);
    const sessionItem = accessSessionToDynamoItem(session);
    expect(() => accessSessionFromDynamoItem({
      ...sessionItem,
      pk: { S: `SESSION#${DIGEST_A}` }
    })).toThrow(/persisted key/);
  });

  it('rejects wrong entity types and malformed digests', () => {
    expect(() => handleLookupFromDynamoItem({
      ...handleLookupToDynamoItem(lookup),
      entityType: { S: 'SESSION' }
    })).toThrow(/entityType/);
    expect(() => accessInvitationFromDynamoItem({
      ...accessInvitationToDynamoItem(invitation),
      invitationDigest: { S: 'not-a-digest' }
    })).toThrow(/digest/);
  });

  it('rejects invalid persisted versions, counters, timestamps, and TTL values', () => {
    const item = memberAccessStateToDynamoItem(state);
    expect(() => memberAccessStateFromDynamoItem({
      ...item,
      credentialVersion: { N: '-1' }
    })).toThrow();
    expect(() => memberAccessStateFromDynamoItem({
      ...item,
      invitationGeneration: { N: '1.5' }
    })).toThrow();
    expect(() => memberAccessStateFromDynamoItem({
      ...item,
      failedPinAttempts: { N: '-1' }
    })).toThrow();
    expect(() => memberAccessStateFromDynamoItem({
      ...item,
      updatedAtISO: { S: 'not-an-iso-timestamp' }
    })).toThrow();
    expect(() => accessSessionFromDynamoItem({
      ...accessSessionToDynamoItem(session),
      expiresAtEpoch: { N: '0' }
    })).toThrow();
    expect(() => accessInvitationFromDynamoItem({
      ...accessInvitationToDynamoItem(invitation),
      generation: { N: '-1' }
    })).toThrow();
  });

  it('rejects malformed or incomplete verifier metadata', () => {
    const item = memberAccessStateToDynamoItem(state);
    const { pinSaltBase64Url: _omitted, ...incomplete } = item;
    expect(() => memberAccessStateFromDynamoItem(incomplete)).toThrow(/PIN verifier/);
    expect(() => memberAccessStateFromDynamoItem({
      ...item,
      pinScryptN: { N: '3' }
    })).toThrow();
  });

  it('rejects raw-secret fields when serializing or deserializing', () => {
    expect(() => memberAccessStateToDynamoItem({
      ...state,
      accessHandle: 'synthetic test access handle'
    } as MemberAccessState)).toThrow(/Forbidden/);
    expect(() => memberAccessStateToDynamoItem({
      ...state,
      phone: 'synthetic test phone'
    } as MemberAccessState)).toThrow(/Forbidden/);
    expect(() => accessSessionFromDynamoItem({
      ...accessSessionToDynamoItem(session),
      sessionToken: { S: 'synthetic test session token' }
    })).toThrow(/Forbidden/);
  });

  it('does not serialize raw credential material', () => {
    const serialized = JSON.stringify(memberAccessStateToDynamoItem(state));
    expect(serialized).not.toContain('accessHandle');
    expect(serialized).not.toContain('invitationToken');
    expect(serialized).not.toContain('sessionToken');
    expect(serialized).not.toContain('"pin"');
    expect(serialized).not.toContain('"pepper"');
  });
});

describe('DynamoClubAccessPersistence', () => {
  const send = vi.fn();
  const persistence = new DynamoClubAccessPersistence(
    { send } as unknown as DynamoDBClient,
    'synthetic-club-access-table'
  );

  beforeEach(() => send.mockReset());

  it('performs only direct strongly consistent reads for each access pattern', async () => {
    const cases = [
      [() => persistence.getMemberAccess('client-01'), memberAccessStateToDynamoItem(state), 'CLIENT#client-01', 'MEMBER_ACCESS'],
      [() => persistence.getHandleLookup(DIGEST_A), handleLookupToDynamoItem(lookup), `HANDLE#${DIGEST_A}`, 'HANDLE'],
      [() => persistence.getInvitation(DIGEST_B), accessInvitationToDynamoItem(invitation), `INVITE#${DIGEST_B}`, 'INVITE'],
      [() => persistence.getSession(DIGEST_B), accessSessionToDynamoItem(session), `SESSION#${DIGEST_B}`, 'SESSION']
    ] as const;

    for (const [read, item, pk, sk] of cases) {
      send.mockResolvedValueOnce({ Item: item });
      await expect(read()).resolves.toBeDefined();
      const command = send.mock.calls.at(-1)?.[0];
      expect(command).toBeInstanceOf(GetItemCommand);
      expect(command.input).toEqual({
        TableName: 'synthetic-club-access-table',
        Key: { pk: { S: pk }, sk: { S: sk } },
        ConsistentRead: true
      });
    }
  });

  it('returns undefined for a missing direct read and validates returned data', async () => {
    send.mockResolvedValueOnce({});
    await expect(persistence.getSession(DIGEST_B)).resolves.toBeUndefined();

    const malformed: ClubAccessDynamoItem = {
      ...accessSessionToDynamoItem(session),
      entityType: { S: 'INVITE' }
    };
    send.mockResolvedValueOnce({ Item: malformed });
    await expect(persistence.getSession(DIGEST_B)).rejects.toThrow(/entityType/);
  });

  it('exposes no generic or workflow mutation methods', () => {
    const prototypeMethods = Object.getOwnPropertyNames(DynamoClubAccessPersistence.prototype);
    expect(prototypeMethods.sort()).toEqual([
      'constructor',
      'getHandleLookup',
      'getInvitation',
      'getMemberAccess',
      'getSession'
    ].sort());
  });
});
