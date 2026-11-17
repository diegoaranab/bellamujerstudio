import type { Page, Route } from '@playwright/test';

const FIXTURE_API_PATH = '/__club_fixture__';
const CLIENT_ID = 'clienta-ejemplo-a';
const FIXTURE_TOKEN = 'playwright-club-fixture-token';

export const configuredClubClient = {
  studioId: 'studio-fixture',
  clientId: CLIENT_ID,
  name: 'Clienta ejemplo A',
  phone: '+52 000 000 0101',
  status: 'active',
  createdAtISO: '2026-08-01T16:00:00.000Z',
  updatedAtISO: '2026-11-16T18:30:00.000Z'
} as const;

const configuredClubClients = [
  configuredClubClient,
  {
    ...configuredClubClient,
    clientId: 'clienta-ejemplo-b',
    name: 'Clienta ejemplo B',
    phone: '+52 000 000 0202',
    status: 'active'
  },
  {
    ...configuredClubClient,
    clientId: 'clienta-ejemplo-c',
    name: 'Clienta ejemplo C',
    phone: '+52 000 000 0303',
    status: 'inactive'
  }
] as const;

const balance = {
  studioId: 'studio-fixture',
  clientId: CLIENT_ID,
  stampCount: 3,
  eligibleSpendCarryMXN: 420,
  version: 7,
  updatedAtISO: '2026-11-16T18:30:00.000Z'
};

const ledger = {
  items: [
    {
      studioId: 'studio-fixture',
      clientId: CLIENT_ID,
      entryId: 'movement-003',
      type: 'STAMP_EARNED',
      occurredAtISO: '2026-11-16T18:30:00.000Z',
      createdAtISO: '2026-11-16T18:31:00.000Z',
      stampDelta: 1,
      eligibleSpendDeltaMXN: -580,
      stampCountAfter: 3,
      eligibleSpendCarryAfterMXN: 420,
      createdByAdminSub: 'fixture-admin',
      visitId: 'visit-003'
    },
    {
      studioId: 'studio-fixture',
      clientId: CLIENT_ID,
      entryId: 'movement-002',
      type: 'ELIGIBLE_SPEND_ADDED',
      occurredAtISO: '2026-10-22T17:15:00.000Z',
      createdAtISO: '2026-10-22T17:16:00.000Z',
      stampDelta: 0,
      eligibleSpendDeltaMXN: 750,
      stampCountAfter: 2,
      eligibleSpendCarryAfterMXN: 1000,
      createdByAdminSub: 'fixture-admin',
      visitId: 'visit-002'
    }
  ]
};

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

export async function installConfiguredClubFixture(page: Page): Promise<void> {
  await page.route('**/*.js', async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    let changed = false;

    if (body.includes('bellaMujerApiBaseUrl: ""')) {
      body = body.replace(
        'bellaMujerApiBaseUrl: ""',
        `bellaMujerApiBaseUrl: "${FIXTURE_API_PATH}"`
      );
      changed = true;
    }

    const accessTokenMethod = `async getAccessToken() {
    await this.initialize();
    if (!this.isCognitoMode || !this.client) {
      return null;
    }`;
    if (body.includes(accessTokenMethod)) {
      body = body.replace(
        accessTokenMethod,
        `async getAccessToken() {
    await this.initialize();
    if (!this.isCognitoMode) {
      return "${FIXTURE_TOKEN}";
    }
    if (!this.client) {
      return null;
    }`
      );
      changed = true;
    }

    if (changed) {
      await route.fulfill({ response, body });
      return;
    }
    await route.fulfill({ response });
  });

  await page.route(`**${FIXTURE_API_PATH}/admin/club/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.slice(FIXTURE_API_PATH.length);
    const method = route.request().method();

    if (method === 'GET' && path === '/admin/club/clients') {
      await json(route, { items: configuredClubClients });
      return;
    }
    if (method === 'GET' && path === `/admin/club/clients/${CLIENT_ID}`) {
      await json(route, { client: configuredClubClient, balance });
      return;
    }
    if (method === 'GET' && path === `/admin/club/clients/${CLIENT_ID}/ledger`) {
      await json(route, ledger);
      return;
    }
    if (method === 'GET' && path === `/admin/club/clients/${CLIENT_ID}/access`) {
      await json(route, {
        access: {
          status: 'active',
          credentialVersion: 2,
          invitationGeneration: 1,
          hasPin: true,
          updatedAtISO: '2026-11-16T18:30:00.000Z'
        }
      });
      return;
    }
    if (method === 'POST' && path === `/admin/club/clients/${CLIENT_ID}/visits`) {
      await json(route, {
        visit: {
          studioId: 'studio-fixture',
          clientId: CLIENT_ID,
          visitId: 'visit-fixture',
          occurredAtISO: '2026-11-17T16:00:00.000Z',
          amountMXN: 850,
          eligibleAmountMXN: 850,
          serviceIds: [],
          source: 'admin',
          createdByAdminSub: 'fixture-admin',
          createdAtISO: '2026-11-17T16:01:00.000Z'
        },
        loyalty: {
          stampsAwarded: 0,
          stampCountAfter: 3,
          eligibleSpendCarryAfterMXN: 1270
        },
        balance: { ...balance, eligibleSpendCarryMXN: 1270, version: 8 },
        replayed: false
      });
      return;
    }

    await json(route, { message: `Unexpected Club fixture request: ${method} ${path}` }, 404);
  });
}
