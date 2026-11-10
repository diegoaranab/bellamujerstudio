import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { digestSecret } from '../src/club-access/club-access-crypto';
import { MemberAccessState, PinVerifierMetadata } from '../src/club-access/club-access-model';
import { ClubClient } from '../src/club/club-model';
import {
  AdminClubAccessHandlerDependencies,
  ClubAccessLifecyclePersistence,
  ClubClientAccessReadPersistence,
  createAdminClubAccessHandler
} from '../src/handlers/admin-club-access';

const clientId = '11111111-1111-4111-8111-111111111111';
const nowISO = '2026-11-10T12:00:00.123Z';
const expiresAtISO = '2026-11-17T12:00:00.123Z';
const rawHandle = 'synthetic handle/+ value';
const rawInvitation = 'synthetic invitation?& value';
const oldHandleDigest = 'a'.repeat(64);

const client: ClubClient = {
  studioId: 'bella-mujer', clientId, name: 'Persona Sintética', phone: '+52 55 0000 0000',
  status: 'active', createdAtISO: nowISO, updatedAtISO: nowISO
};

const verifier: PinVerifierMetadata = {
  algorithm: 'HMAC-SHA256+SCRYPT', kdfVersion: 1,
  saltBase64Url: Buffer.alloc(32, 1).toString('base64url'),
  verifierBase64Url: Buffer.alloc(32, 2).toString('base64url'), pepperVersion: 'test-v1',
  N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024, keyLength: 32,
  createdAtISO: nowISO, updatedAtISO: nowISO
};

const invitedState: MemberAccessState = {
  studioId: 'bella-mujer', clientId, handleDigest: oldHandleDigest,
  accessStatus: 'invited', credentialVersion: 2, invitationGeneration: 4,
  failedPinAttempts: 0, createdAtISO: '2026-11-01T12:00:00.000Z', updatedAtISO: nowISO
};

const activeState: MemberAccessState = {
  ...invitedState, accessStatus: 'active', credentialVersion: 3,
  failedPinAttempts: 5, nextAllowedAtISO: '2026-11-10T13:00:00.000Z', pinVerifier: verifier
};

const eventFor = (
  routeKey: string,
  options: { id?: string; omitId?: boolean; body?: string } = {}
): APIGatewayProxyEventV2 => ({
  routeKey,
  headers: { origin: 'http://localhost:4200' },
  ...(options.omitId ? {} : { pathParameters: { id: options.id ?? clientId.toUpperCase() } }),
  ...(options.body === undefined ? {} : { body: options.body }),
  requestContext: { requestId: 'api-request-id' }
}) as unknown as APIGatewayProxyEventV2;

const transactionCanceled = (codes?: string[]) => Object.assign(new Error('secret failure'), {
  name: 'TransactionCanceledException',
  ...(codes ? { CancellationReasons: codes.map((Code) => ({ Code })) } : {})
});

const setup = (
  existing?: MemberAccessState,
  overrides: Partial<AdminClubAccessHandlerDependencies> = {}
) => {
  const getClient = vi.fn<ClubClientAccessReadPersistence['getClient']>().mockResolvedValue(client);
  const getMemberAccess = vi.fn<ClubAccessLifecyclePersistence['getMemberAccess']>()
    .mockResolvedValue(existing);
  const createInitialInvitation = vi.fn<ClubAccessLifecyclePersistence['createInitialInvitation']>()
    .mockResolvedValue();
  const rotatePreEnrollmentInvitation = vi.fn<
    ClubAccessLifecyclePersistence['rotatePreEnrollmentInvitation']
  >().mockResolvedValue();
  const fullResetAccess = vi.fn<ClubAccessLifecyclePersistence['fullResetAccess']>()
    .mockResolvedValue();
  const handler = createAdminClubAccessHandler({
    clubPersistence: { getClient },
    accessPersistence: {
      getMemberAccess, createInitialInvitation, rotatePreEnrollmentInvitation, fullResetAccess
    },
    studioId: 'bella-mujer',
    clock: () => new Date(nowISO),
    accessHandleGenerator: () => rawHandle,
    invitationTokenGenerator: () => rawInvitation,
    ...overrides
  });
  return {
    handler, getClient, getMemberAccess, createInitialInvitation,
    rotatePreEnrollmentInvitation, fullResetAccess
  };
};

const getRoute = 'GET /admin/club/clients/{id}/access';
const invitationRoute = 'POST /admin/club/clients/{id}/access/invitation';
const resetRoute = 'POST /admin/club/clients/{id}/access/reset';

describe('administrative Club member-access handler', () => {
  it('returns null when the operational client exists without access state', async () => {
    const { handler, getClient, getMemberAccess } = setup();
    const response = await handler(eventFor(getRoute));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? '{}')).toEqual({ access: null });
    expect(getClient).toHaveBeenCalledWith('bella-mujer', clientId);
    expect(getMemberAccess).toHaveBeenCalledWith(clientId);
  });

  it('returns only a safe access summary for existing state', async () => {
    const { handler } = setup(activeState);
    const response = await handler(eventFor(getRoute));
    const body = JSON.parse(response.body ?? '{}');
    expect(body).toEqual({ access: {
      status: 'active', credentialVersion: 3, invitationGeneration: 4,
      hasPin: true, updatedAtISO: nowISO
    }});
    expect(JSON.stringify(body)).not.toMatch(
      /handleDigest|invitationDigest|sessionDigest|pinVerifier|salt|pepper|entityType|"pk"|"sk"/
    );
  });

  it.each([undefined, 'bad', ` ${clientId}`, `${clientId} `, 'CLIENT#value'])
  ('rejects invalid client selector %j before persistence', async (id) => {
    const { handler, getClient, getMemberAccess } = setup();
    const response = await handler(eventFor(getRoute, id === undefined
      ? { omitId: true }
      : { id }));
    expect(response.statusCode).toBe(400);
    expect(getClient).not.toHaveBeenCalled();
    expect(getMemberAccess).not.toHaveBeenCalled();
  });

  it('normalizes accepted UUIDs and rejects unsupported mutation bodies', async () => {
    const valid = setup();
    await valid.handler(eventFor(getRoute, { id: clientId.toUpperCase() }));
    expect(valid.getClient).toHaveBeenCalledWith('bella-mujer', clientId);

    for (const body of ['{}', ' ', '{"studioId":"other"}']) {
      const invalid = setup();
      expect((await invalid.handler(eventFor(invitationRoute, { body }))).statusCode).toBe(400);
      expect(invalid.getClient).not.toHaveBeenCalled();
    }
  });

  it('returns 404 before reading or creating access for a missing operational client', async () => {
    const state = setup();
    state.getClient.mockResolvedValue(undefined);
    const response = await state.handler(eventFor(invitationRoute));
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body ?? '{}').error).toBe('CLUB_CLIENT_NOT_FOUND');
    expect(state.getMemberAccess).not.toHaveBeenCalled();
    expect(state.createInitialInvitation).not.toHaveBeenCalled();
  });

  it('creates an initial digest-only invitation with one-time secrets and seven-day expiry', async () => {
    const state = setup();
    const response = await state.handler(eventFor(invitationRoute));
    const body = JSON.parse(response.body ?? '{}');
    expect(response.statusCode).toBe(201);
    expect(body).toEqual({
      access: {
        status: 'invited', credentialVersion: 0, invitationGeneration: 1,
        hasPin: false, updatedAtISO: nowISO
      },
      invitation: {
        activationFragment:
          '#/club/activar?access=synthetic%20handle%2F%2B%20value' +
          '&invite=synthetic%20invitation%3F%26%20value',
        expiresAtISO
      }
    });
    expect(state.createInitialInvitation).toHaveBeenCalledOnce();
    const [access, lookup, invitation] = state.createInitialInvitation.mock.calls[0];
    expect(access).toMatchObject({
      accessStatus: 'invited', credentialVersion: 0, invitationGeneration: 1,
      failedPinAttempts: 0, handleDigest: digestSecret(rawHandle),
      createdAtISO: nowISO, updatedAtISO: nowISO
    });
    expect(lookup.handleDigest).toBe(digestSecret(rawHandle));
    expect(invitation).toMatchObject({
      invitationDigest: digestSecret(rawInvitation), handleDigest: digestSecret(rawHandle),
      generation: 1, createdAtISO: nowISO, expiresAtISO, consumed: false,
      expiresAtEpoch: Math.floor(new Date(expiresAtISO).getTime() / 1000)
    });
    const persistedArguments = JSON.stringify(state.createInitialInvitation.mock.calls[0]);
    expect(persistedArguments).not.toContain(rawHandle);
    expect(persistedArguments).not.toContain(rawInvitation);
    expect(body.invitation.activationFragment.startsWith('#')).toBe(true);
  });

  it('regenerates invited access with a new handle, incremented generation, and unchanged credential version', async () => {
    const state = setup(invitedState);
    const response = await state.handler(eventFor(invitationRoute));
    expect(response.statusCode).toBe(201);
    expect(state.rotatePreEnrollmentInvitation).toHaveBeenCalledOnce();
    const [expected, next, lookup, invitation] =
      state.rotatePreEnrollmentInvitation.mock.calls[0];
    expect(expected).toBe(invitedState);
    expect(next).toMatchObject({
      handleDigest: digestSecret(rawHandle), credentialVersion: 2,
      invitationGeneration: 5, accessStatus: 'invited', failedPinAttempts: 0,
      createdAtISO: invitedState.createdAtISO, updatedAtISO: nowISO
    });
    expect(next.handleDigest).not.toBe(oldHandleDigest);
    expect(lookup).toMatchObject({ handleDigest: next.handleDigest, credentialVersion: 2 });
    expect(invitation).toMatchObject({ handleDigest: next.handleDigest, generation: 5 });
  });

  it.each(['active', 'disabled'] as const)
  ('requires full reset instead of invitation regeneration for %s access', async (accessStatus) => {
    const state = setup({ ...activeState, accessStatus });
    const response = await state.handler(eventFor(invitationRoute));
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body ?? '{}').error).toBe('CLUB_ACCESS_RESET_REQUIRED');
    expect(state.rotatePreEnrollmentInvitation).not.toHaveBeenCalled();
  });

  it('fully resets established access and removes verifier and backoff state', async () => {
    const state = setup(activeState);
    const response = await state.handler(eventFor(resetRoute));
    const body = JSON.parse(response.body ?? '{}');
    expect(response.statusCode).toBe(200);
    expect(body.access).toMatchObject({
      status: 'invited', credentialVersion: 4, invitationGeneration: 5, hasPin: false
    });
    expect(state.fullResetAccess).toHaveBeenCalledOnce();
    const [expected, next, lookup, invitation] = state.fullResetAccess.mock.calls[0];
    expect(expected).toBe(activeState);
    expect(next).toEqual(expect.objectContaining({
      accessStatus: 'invited', credentialVersion: 4, invitationGeneration: 5,
      failedPinAttempts: 0, handleDigest: digestSecret(rawHandle)
    }));
    expect(next).not.toHaveProperty('pinVerifier');
    expect(next).not.toHaveProperty('nextAllowedAtISO');
    expect(next.handleDigest).not.toBe(activeState.handleDigest);
    expect(lookup).toMatchObject({ credentialVersion: 4, handleDigest: next.handleDigest });
    expect(invitation).toMatchObject({ generation: 5, handleDigest: next.handleDigest });
  });

  it('supports disabled established access through full reset', async () => {
    const state = setup({ ...activeState, accessStatus: 'disabled' });
    expect((await state.handler(eventFor(resetRoute))).statusCode).toBe(200);
    expect(state.fullResetAccess).toHaveBeenCalledOnce();
  });

  it('requires initial invitation when reset has no state and regeneration for invited state', async () => {
    const missing = setup();
    const missingResponse = await missing.handler(eventFor(resetRoute));
    expect(missingResponse.statusCode).toBe(409);
    expect(JSON.parse(missingResponse.body ?? '{}').error).toBe(
      'CLUB_ACCESS_INVITATION_REQUIRED'
    );

    const invited = setup(invitedState);
    const invitedResponse = await invited.handler(eventFor(resetRoute));
    expect(invitedResponse.statusCode).toBe(409);
    expect(JSON.parse(invitedResponse.body ?? '{}').error).toBe(
      'CLUB_ACCESS_REGENERATION_REQUIRED'
    );
    expect(invited.fullResetAccess).not.toHaveBeenCalled();
  });

  it('maps structurally known conditional transaction cancellation to a safe conflict', async () => {
    const state = setup(invitedState);
    state.rotatePreEnrollmentInvitation.mockRejectedValue(transactionCanceled([
      'ConditionalCheckFailed', 'None', 'None', 'None'
    ]));
    const response = await state.handler(eventFor(invitationRoute));
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body ?? '{}').error).toBe('CLUB_ACCESS_CONCURRENT_UPDATE');
    expect(state.rotatePreEnrollmentInvitation).toHaveBeenCalledOnce();
  });

  it.each([
    transactionCanceled(),
    transactionCanceled(['ProvisionedThroughputExceeded', 'None', 'None', 'None']),
    transactionCanceled(['ConditionalCheckFailed'])
  ])('keeps unexpected transaction cancellation as a safe server error', async (error) => {
    const state = setup(activeState);
    state.fullResetAccess.mockRejectedValue(error);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await state.handler(eventFor(resetRoute));
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body ?? '{}').error).toBe('SERVER_ERROR');
    expect(state.fullResetAccess).toHaveBeenCalledOnce();
    log.mockRestore();
  });

  it('does not log PII, generated secrets, activation fragment, or failure messages', async () => {
    const state = setup();
    state.createInitialInvitation.mockRejectedValue(Object.assign(
      new Error(`${client.name} ${client.phone} ${rawHandle} ${rawInvitation}`),
      { $metadata: { requestId: 'aws-request-id', httpStatusCode: 500 } }
    ));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await state.handler(eventFor(invitationRoute));
    const logged = JSON.stringify(log.mock.calls);
    expect(response.statusCode).toBe(500);
    expect(logged).toContain('api-request-id');
    expect(logged).toContain('aws-request-id');
    for (const forbidden of [client.name, client.phone, rawHandle, rawInvitation, '#/club/activar']) {
      expect(logged).not.toContain(forbidden);
    }
    log.mockRestore();
  });

  it('fails closed on invalid invited semantics and counter exhaustion', async () => {
    const invalid = setup({ ...invitedState, pinVerifier: verifier });
    const firstLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await invalid.handler(eventFor(invitationRoute))).statusCode).toBe(500);
    expect(invalid.rotatePreEnrollmentInvitation).not.toHaveBeenCalled();
    firstLog.mockRestore();

    const exhausted = setup({
      ...activeState,
      credentialVersion: Number.MAX_SAFE_INTEGER
    });
    const secondLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await exhausted.handler(eventFor(resetRoute))).statusCode).toBe(500);
    expect(exhausted.fullResetAccess).not.toHaveBeenCalled();
    secondLog.mockRestore();

    const generationExhausted = setup({
      ...invitedState,
      invitationGeneration: Number.MAX_SAFE_INTEGER
    });
    const thirdLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await generationExhausted.handler(eventFor(invitationRoute))).statusCode).toBe(500);
    expect(generationExhausted.rotatePreEnrollmentInvitation).not.toHaveBeenCalled();
    thirdLog.mockRestore();
  });
});
