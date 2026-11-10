import {
  DynamoDBClient,
  GetItemCommand,
  TransactWriteItemsCommand
} from '@aws-sdk/client-dynamodb';
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
const DIGEST_C = 'c'.repeat(64);
const DIGEST_D = 'd'.repeat(64);
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
      'completeEnrollment',
      'completeSuccessfulLogin',
      'constructor',
      'createInitialInvitation',
      'fullResetAccess',
      'getHandleLookup',
      'getInvitation',
      'getMemberAccess',
      'getSession',
      'recordFailedPinAttempt',
      'revokeSession',
      'rotatePreEnrollmentInvitation'
    ].sort());
  });

  it('completes enrollment with four atomic exact-condition puts and commit-time expiry', async () => {
    send.mockResolvedValueOnce({});
    const expectedState: MemberAccessState = {
      studioId: 'bella-mujer', clientId: 'client-01', handleDigest: DIGEST_A,
      accessStatus: 'invited', credentialVersion: 0, invitationGeneration: 1,
      failedPinAttempts: 0, createdAtISO: CREATED_AT, updatedAtISO: CREATED_AT
    };
    const expectedLookup = {
      handleDigest: DIGEST_A, studioId: 'bella-mujer', clientId: 'client-01',
      accessStatus: 'invited' as const, credentialVersion: 0,
      createdAtISO: CREATED_AT, updatedAtISO: CREATED_AT
    };
    const expectedInvitation = {
      invitationDigest: DIGEST_B, studioId: 'bella-mujer', clientId: 'client-01',
      handleDigest: DIGEST_A, generation: 1, createdAtISO: CREATED_AT,
      expiresAtISO: '2026-11-17T12:00:00.000Z', expiresAtEpoch: 1794916800,
      consumed: false
    };
    const nextState: MemberAccessState = {
      ...expectedState, accessStatus: 'active', pinVerifier: verifier, updatedAtISO: UPDATED_AT
    };
    const nextLookup = {
      ...expectedLookup, accessStatus: 'active' as const, updatedAtISO: UPDATED_AT
    };
    const consumedInvitation = {
      ...expectedInvitation, consumed: true, consumedAtISO: UPDATED_AT
    };
    const newSession = {
      sessionDigest: DIGEST_C, studioId: 'bella-mujer', clientId: 'client-01',
      credentialVersion: 0, createdAtISO: UPDATED_AT,
      expiresAtISO: '2026-11-10T20:05:00.000Z', expiresAtEpoch: 1794341100,
      revoked: false
    };

    await persistence.completeEnrollment(
      expectedState, expectedLookup, expectedInvitation, nextState, nextLookup,
      consumedInvitation, newSession, UPDATED_AT
    );

    const items = send.mock.calls[0][0].input.TransactItems ?? [];
    expect(items).toHaveLength(4);
    expect(items[0].Put?.ConditionExpression).toContain('attribute_not_exists(#pinAlgorithm)');
    expect(items[1].Put?.ConditionExpression).toContain('#updatedAtISO = :updatedAtISO');
    expect(items[2].Put?.ConditionExpression).toContain('#consumed = :notConsumed');
    expect(items[2].Put?.ConditionExpression).toContain('#expiresAtISO > :commitAtISO');
    expect(items[2].Put?.ExpressionAttributeValues).toMatchObject({
      ':generation': { N: '1' }, ':notConsumed': { BOOL: false },
      ':commitAtISO': { S: UPDATED_AT }
    });
    expect(items[3].Put?.ConditionExpression).toBe(
      'attribute_not_exists(#pk) AND attribute_not_exists(#sk)'
    );
    expect(JSON.stringify(items)).not.toMatch(/accessHandle|invitationToken|sessionToken|"pin"/);
  });

  it('protects failed-attempt CAS with exact counter, backoff, credential, and verifier metadata', async () => {
    send.mockResolvedValueOnce({});
    const expected: MemberAccessState = {
      ...state, failedPinAttempts: 3, nextAllowedAtISO: UPDATED_AT
    };
    const next: MemberAccessState = {
      ...expected, failedPinAttempts: 4, nextAllowedAtISO: '2026-11-10T12:08:00.000Z',
      updatedAtISO: '2026-11-10T12:06:00.000Z'
    };
    await persistence.recordFailedPinAttempt(expected, next);
    const put = send.mock.calls[0][0].input.TransactItems[0].Put;
    expect(put.ConditionExpression).toContain('#failedPinAttempts = :failedPinAttempts');
    expect(put.ConditionExpression).toContain('#nextAllowedAtISO = :nextAllowedAtISO');
    expect(put.ConditionExpression).toContain('#credentialVersion = :credentialVersion');
    expect(put.ConditionExpression).toContain('#pinSaltBase64Url = :pinSaltBase64Url');
    expect(put.ConditionExpression).toContain('#pinVerifierBase64Url = :pinVerifierBase64Url');
    expect(put.ExpressionAttributeValues).toMatchObject({
      ':failedPinAttempts': { N: '3' }, ':nextAllowedAtISO': { S: UPDATED_AT },
      ':credentialVersion': { N: '2' }
    });
    expect(put.Item.failedPinAttempts).toEqual({ N: '4' });
    expect(put.Item.nextAllowedAtISO).toEqual({ S: '2026-11-10T12:08:00.000Z' });
  });

  it('atomically resets exact verified state and conditionally creates a login session', async () => {
    send.mockResolvedValueOnce({});
    const authenticatedAt = '2026-11-10T12:06:00.000Z';
    const next: MemberAccessState = {
      ...state, failedPinAttempts: 0, nextAllowedAtISO: undefined,
      updatedAtISO: authenticatedAt
    };
    const newSession = {
      sessionDigest: DIGEST_C, studioId: state.studioId, clientId: state.clientId,
      credentialVersion: state.credentialVersion, createdAtISO: authenticatedAt,
      expiresAtISO: '2026-11-10T20:06:00.000Z', expiresAtEpoch: 1794341160,
      revoked: false
    };
    await persistence.completeSuccessfulLogin(state, next, newSession);
    const items = send.mock.calls[0][0].input.TransactItems;
    expect(items).toHaveLength(2);
    expect(items[0].Put.ConditionExpression).toContain('#updatedAtISO = :updatedAtISO');
    expect(items[0].Put.Item.failedPinAttempts).toEqual({ N: '0' });
    expect(items[0].Put.Item.nextAllowedAtISO).toBeUndefined();
    expect(items[1].Put.ConditionExpression).toContain('attribute_not_exists(#pk)');
  });

  it('revokes a session through an exact false-to-true conditional replacement', async () => {
    send.mockResolvedValueOnce({});
    const expected = { ...session, revoked: false as const, revokedAtISO: undefined };
    const next = { ...expected, revoked: true as const, revokedAtISO: UPDATED_AT };
    await persistence.revokeSession(expected, next);
    const put = send.mock.calls[0][0].input.TransactItems[0].Put;
    expect(put.ConditionExpression).toContain('#sessionDigest = :sessionDigest');
    expect(put.ConditionExpression).toContain('#credentialVersion = :credentialVersion');
    expect(put.ConditionExpression).toContain('#expiresAtISO = :expiresAtISO');
    expect(put.ConditionExpression).toContain('#revoked = :notRevoked');
    expect(put.Item).toMatchObject({ revoked: { BOOL: true }, revokedAtISO: { S: UPDATED_AT } });
  });

  it('creates initial access, handle, and invitation with three conditional atomic puts', async () => {
    send.mockResolvedValueOnce({});
    const initialState: MemberAccessState = {
      studioId: 'bella-mujer', clientId: 'client-01', handleDigest: DIGEST_C,
      accessStatus: 'invited', credentialVersion: 0, invitationGeneration: 1,
      failedPinAttempts: 0, createdAtISO: CREATED_AT, updatedAtISO: CREATED_AT
    };
    const initialLookup = {
      handleDigest: DIGEST_C, studioId: 'bella-mujer', clientId: 'client-01',
      accessStatus: 'invited' as const, credentialVersion: 0,
      createdAtISO: CREATED_AT, updatedAtISO: CREATED_AT
    };
    const initialInvitation = {
      invitationDigest: DIGEST_D, studioId: 'bella-mujer', clientId: 'client-01',
      handleDigest: DIGEST_C, generation: 1, createdAtISO: CREATED_AT,
      expiresAtISO: '2026-11-17T12:00:00.000Z', expiresAtEpoch: 1794916800,
      consumed: false
    };

    await persistence.createInitialInvitation(initialState, initialLookup, initialInvitation);

    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(TransactWriteItemsCommand);
    expect(command.input.TransactItems).toHaveLength(3);
    for (const item of command.input.TransactItems ?? []) {
      expect(item.Put?.ConditionExpression).toBe(
        'attribute_not_exists(#pk) AND attribute_not_exists(#sk)'
      );
    }
    const serialized = JSON.stringify(command.input);
    expect(serialized).not.toMatch(/accessHandle|invitationToken|rawSecret|rawToken/);
  });

  it('rotates pre-enrollment access with exact-state protection and atomic handle invalidation', async () => {
    send.mockResolvedValueOnce({});
    const expected: MemberAccessState = {
      studioId: 'bella-mujer', clientId: 'client-01', handleDigest: DIGEST_A,
      accessStatus: 'invited', credentialVersion: 4, invitationGeneration: 8,
      failedPinAttempts: 0, createdAtISO: CREATED_AT, updatedAtISO: UPDATED_AT
    };
    const next: MemberAccessState = {
      ...expected, handleDigest: DIGEST_C, invitationGeneration: 9, updatedAtISO: CREATED_AT
    };
    const nextLookup = {
      handleDigest: DIGEST_C, studioId: 'bella-mujer', clientId: 'client-01',
      accessStatus: 'invited' as const, credentialVersion: 4,
      createdAtISO: CREATED_AT, updatedAtISO: CREATED_AT
    };
    const nextInvitation = {
      invitationDigest: DIGEST_D, studioId: 'bella-mujer', clientId: 'client-01',
      handleDigest: DIGEST_C, generation: 9, createdAtISO: CREATED_AT,
      expiresAtISO: '2026-11-17T12:00:00.000Z', expiresAtEpoch: 1794916800,
      consumed: false
    };

    await persistence.rotatePreEnrollmentInvitation(
      expected, next, nextLookup, nextInvitation
    );

    const items = send.mock.calls[0][0].input.TransactItems ?? [];
    expect(items).toHaveLength(4);
    expect(items[0].Put?.ConditionExpression).toContain('#accessStatus = :accessStatus');
    expect(items[0].Put?.ConditionExpression).toContain('#handleDigest = :handleDigest');
    expect(items[0].Put?.ConditionExpression).toContain('#credentialVersion = :credentialVersion');
    expect(items[0].Put?.ConditionExpression).toContain(
      '#invitationGeneration = :invitationGeneration'
    );
    expect(items[0].Put?.ConditionExpression).toContain('attribute_not_exists(#pinAlgorithm)');
    expect(items[0].Put?.ExpressionAttributeValues).toMatchObject({
      ':accessStatus': { S: 'invited' }, ':handleDigest': { S: DIGEST_A },
      ':credentialVersion': { N: '4' }, ':invitationGeneration': { N: '8' }
    });
    expect(items[1].Delete?.Key).toEqual({
      pk: { S: `HANDLE#${DIGEST_A}` }, sk: { S: 'HANDLE' }
    });
    expect(items[1].Delete?.ConditionExpression).toContain('#clientId = :clientId');
    expect(items[1].Delete?.ConditionExpression).toContain('#handleDigest = :handleDigest');
    expect(items[1].Delete?.ConditionExpression).toContain('#credentialVersion = :credentialVersion');
    expect(items[2].Put?.ConditionExpression).toContain('attribute_not_exists');
    expect(items[3].Put?.ConditionExpression).toContain('attribute_not_exists');
    expect(JSON.stringify(items)).not.toMatch(/Scan|Query/);
  });

  it('fully resets established access with incremented versions and no stale PIN fields', async () => {
    send.mockResolvedValueOnce({});
    const next: MemberAccessState = {
      studioId: state.studioId, clientId: state.clientId, handleDigest: DIGEST_C,
      accessStatus: 'invited', credentialVersion: 3, invitationGeneration: 4,
      failedPinAttempts: 0, createdAtISO: state.createdAtISO, updatedAtISO: CREATED_AT
    };
    const nextLookup = {
      handleDigest: DIGEST_C, studioId: state.studioId, clientId: state.clientId,
      accessStatus: 'invited' as const, credentialVersion: 3,
      createdAtISO: CREATED_AT, updatedAtISO: CREATED_AT
    };
    const nextInvitation = {
      invitationDigest: DIGEST_D, studioId: state.studioId, clientId: state.clientId,
      handleDigest: DIGEST_C, generation: 4, createdAtISO: CREATED_AT,
      expiresAtISO: '2026-11-17T12:00:00.000Z', expiresAtEpoch: 1794916800,
      consumed: false
    };

    await persistence.fullResetAccess(state, next, nextLookup, nextInvitation);

    const items = send.mock.calls[0][0].input.TransactItems ?? [];
    expect(items).toHaveLength(4);
    expect(items[0].Put?.ExpressionAttributeValues).toMatchObject({
      ':accessStatus': { S: 'active' }, ':handleDigest': { S: DIGEST_A },
      ':credentialVersion': { N: '2' }, ':invitationGeneration': { N: '3' }
    });
    expect(items[0].Put?.Item).toMatchObject({
      credentialVersion: { N: '3' }, invitationGeneration: { N: '4' },
      failedPinAttempts: { N: '0' }, handleDigest: { S: DIGEST_C }
    });
    expect(items[0].Put?.Item?.pinVerifierBase64Url).toBeUndefined();
    expect(items[0].Put?.Item?.pinSaltBase64Url).toBeUndefined();
    expect(items[0].Put?.Item?.nextAllowedAtISO).toBeUndefined();
    expect(items[1].Delete?.Key).toEqual({
      pk: { S: `HANDLE#${DIGEST_A}` }, sk: { S: 'HANDLE' }
    });
    expect(items[2].Put?.ConditionExpression).toContain('attribute_not_exists');
    expect(items[3].Put?.ConditionExpression).toContain('attribute_not_exists');
  });

  it('rejects malformed lifecycle transitions before sending a transaction', async () => {
    const invited: MemberAccessState = {
      studioId: 'bella-mujer', clientId: 'client-01', handleDigest: DIGEST_A,
      accessStatus: 'invited', credentialVersion: 0, invitationGeneration: 1,
      failedPinAttempts: 0, createdAtISO: CREATED_AT, updatedAtISO: CREATED_AT
    };
    await expect(persistence.fullResetAccess(
      invited,
      { ...invited, handleDigest: DIGEST_C, invitationGeneration: 2 },
      {
        handleDigest: DIGEST_C, studioId: invited.studioId, clientId: invited.clientId,
        accessStatus: 'invited', credentialVersion: 0,
        createdAtISO: CREATED_AT, updatedAtISO: CREATED_AT
      },
      {
        invitationDigest: DIGEST_D, studioId: invited.studioId, clientId: invited.clientId,
        handleDigest: DIGEST_C, generation: 2, createdAtISO: CREATED_AT,
        expiresAtISO: '2026-11-17T12:00:00.000Z', expiresAtEpoch: 1794916800,
        consumed: false
      }
    )).rejects.toThrow(/reset transition/);
    expect(send).not.toHaveBeenCalled();
  });
});
