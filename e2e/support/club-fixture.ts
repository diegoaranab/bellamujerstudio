import type { Page, Route } from '@playwright/test';

const FIXTURE_API_PATH = '/__club_fixture__';
const CLIENT_ID = 'clienta-ejemplo-a';
const FIXTURE_TOKEN = 'playwright-club-fixture-token';
export const memberClubFixture = {
  access: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  session: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc',
  qrIdentifier: '123e4567-e89b-42d3-a456-426614174000',
  summary: { profile: { name: 'Mariana Prueba' }, loyalty: { stampCount: 3 } },
  history: {
    items: [
      { occurredAtISO: '2026-11-16T18:30:00.000Z', type: 'STAMP_EARNED', stampDelta: 1, stampCountAfter: 3 },
      { occurredAtISO: '2026-10-22T17:15:00.000Z', type: 'ELIGIBLE_SPEND_ADDED', stampDelta: 0, stampCountAfter: 2 }
    ]
  }
} as const;

const longPromotionDescription = (
  'Contenido sintético del Club para comprobar la lectura de una descripción extensa en distintos tamaños de pantalla, con líneas que fluyen sin recortes ni desplazamiento horizontal. '
).repeat(5).slice(0, 499) + '…';

export const memberClubPromotionFixture = {
  title: 'Beneficio de prueba del Club con un título lo bastante extenso para verificar el ajuste de línea',
  description: longPromotionDescription,
  startsAtISO: '2026-11-01T15:00:00.000Z',
  endsAtISO: '2026-12-01T15:00:00.000Z'
} as const;

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

export async function installMemberClubFixture(
  page: Page,
  options: {
    failFirstSummary?: 'authentication' | 'server';
    qr?: 'server-then-success' | 'authentication';
    history?: 'empty' | 'authentication' | 'server' | 'paginated' | 'load-more-failure';
    promotion?: 'active' | 'server' | 'server-then-success' | 'authentication' | 'malformed';
  } = {}
): Promise<void> {
  await page.route('**/*.js', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (!body.includes('bellaMujerApiBaseUrl: ""')) {
      await route.fulfill({ response });
      return;
    }
    await route.fulfill({
      response,
      body: body.replace(
        'bellaMujerApiBaseUrl: ""',
        `bellaMujerApiBaseUrl: "${FIXTURE_API_PATH}"`
      )
    });
  });

  let summaryAttempts = 0;
  let historyAttempts = 0;
  let qrAttempts = 0;
  let promotionAttempts = 0;
  await page.route(`**${FIXTURE_API_PATH}/club/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.slice(FIXTURE_API_PATH.length);
    if (path === '/club/access/login' && route.request().method() === 'POST') {
      await json(route, {
        session: {
          token: memberClubFixture.session,
          expiresAtISO: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        }
      });
      return;
    }
    if (path === '/club/me' && route.request().method() === 'GET') {
      summaryAttempts += 1;
      if (summaryAttempts === 1 && options.failFirstSummary === 'authentication') {
        await json(route, { error: 'CLUB_ACCESS_AUTHENTICATION_FAILED' }, 401);
        return;
      }
      if (summaryAttempts === 1 && options.failFirstSummary === 'server') {
        await json(route, { error: 'private detail' }, 500);
        return;
      }
      await json(route, memberClubFixture.summary);
      return;
    }
    if (path === '/club/me/history' && route.request().method() === 'GET') {
      historyAttempts += 1;
      if (options.history === 'authentication' && historyAttempts === 1) {
        await json(route, { error: 'CLUB_ACCESS_AUTHENTICATION_FAILED' }, 401);
        return;
      }
      if (options.history === 'server' && historyAttempts === 1) {
        await json(route, { error: 'private detail' }, 500);
        return;
      }
      if (options.history === 'empty') {
        await json(route, { items: [] });
        return;
      }
      if (options.history === 'paginated' || options.history === 'load-more-failure') {
        if (url.searchParams.get('nextToken') === 'member-fixture-next-page') {
          if (options.history === 'load-more-failure' && historyAttempts === 2) {
            await json(route, { error: 'private detail' }, 500);
            return;
          }
          await json(route, { items: [{ occurredAtISO: '2026-09-03T16:00:00.000Z', type: 'ADMIN_ADJUSTMENT', stampDelta: -1, stampCountAfter: 1 }] });
          return;
        }
        await json(route, { ...memberClubFixture.history, nextToken: 'member-fixture-next-page' });
        return;
      }
      await json(route, memberClubFixture.history);
      return;
    }
    if (path === '/club/me/qr' && route.request().method() === 'GET') {
      qrAttempts += 1;
      if (options.qr === 'authentication') {
        await json(route, { error: 'private detail' }, 401);
        return;
      }
      if (options.qr === 'server-then-success' && qrAttempts === 1) {
        await json(route, { error: 'private detail' }, 500);
        return;
      }
      await json(route, { qr: { identifier: memberClubFixture.qrIdentifier } });
      return;
    }
    if (path === '/club/me/promotions' && route.request().method() === 'GET') {
      promotionAttempts += 1;
      if (options.promotion === 'authentication') {
        await json(route, { error: 'private detail' }, 401);
        return;
      }
      if (options.promotion === 'server' || (options.promotion === 'server-then-success' && promotionAttempts === 1)) {
        await json(route, { error: 'private detail' }, 500);
        return;
      }
      if (options.promotion === 'malformed') {
        await json(route, { promotion: { ...memberClubPromotionFixture, studioId: 'private' } });
        return;
      }
      await json(route, {
        promotion: options.promotion === 'active' || options.promotion === 'server-then-success'
          ? memberClubPromotionFixture
          : null
      });
      return;
    }
    if (path === '/club/access/logout' && route.request().method() === 'POST') {
      await route.fulfill({ status: 204 });
      return;
    }
    await json(route, { error: `Unexpected member fixture request: ${path}` }, 404);
  });
}
