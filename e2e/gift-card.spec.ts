import { expect, test, type Page } from '@playwright/test';

const seededGiftCards = [
  {
    id: 'gc-lupita',
    folio: 'BM-REGALO-20260424-LUPI',
    createdAtISO: '2026-04-24T12:00:00.000Z',
    buyerName: 'Diego Arana',
    buyerPhone: '2381110000',
    recipientName: 'Mamá Lupita',
    recipientPhone: '2381111111',
    amountMXN: 500,
    message: 'Te queremos mucho.',
    paymentMethod: 'transferencia',
    status: 'pendiente',
    notes: 'Validar comprobante'
  },
  {
    id: 'gc-ana',
    folio: 'BM-REGALO-20260424-ANA1',
    createdAtISO: '2026-04-24T13:00:00.000Z',
    buyerName: 'Alejandra Ruiz',
    buyerPhone: '2382223333',
    recipientName: 'Ana Sofía',
    recipientPhone: '2383334444',
    amountMXN: 700,
    message: 'Disfruta tu regalo.',
    paymentMethod: 'transferencia',
    status: 'pagada',
    confirmedAtISO: '2026-04-24T14:00:00.000Z'
  },
  {
    id: 'gc-caro',
    folio: 'BM-REGALO-20260424-CARO',
    createdAtISO: '2026-04-24T15:00:00.000Z',
    buyerName: 'María López',
    buyerPhone: '2384445555',
    recipientName: 'Carolina',
    amountMXN: 1000,
    paymentMethod: 'efectivo',
    status: 'entregada',
    deliveredAtISO: '2026-04-24T16:00:00.000Z'
  }
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
});

async function seedGiftCards(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate((giftCards) => {
    window.localStorage.setItem(
      'bm_state_v1',
      JSON.stringify({
        version: 1,
        updatedAtISO: '2026-04-24T12:00:00.000Z',
        serviceOverrides: [],
        inventoryAdjustments: [],
        clientsOverrides: [],
        transactions: [],
        assistantChatHistory: [],
        giftCards
      })
    );
  }, seededGiftCards);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth
  }));

  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
}

test('public home route renders the homepage MVP without the admin shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('public-home-page')).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'Belleza cuidada, con cita y atención cercana.'
    })
  ).toBeVisible();
  await expect(page.getByTestId('public-home-hero')).toBeVisible();
  await expect(page.getByTestId('public-home-services')).toBeVisible();
  await expect(page.getByTestId('public-home-gallery')).toBeVisible();
  await expect(page.getByTestId('public-home-why')).toBeVisible();
  await expect(page.getByTestId('public-home-booking')).toBeVisible();
  await expect(page.getByTestId('public-home-contact')).toBeVisible();
  await expect(page.getByTestId('public-home-faq')).toBeVisible();

  await expect(page.getByTestId('public-hero-image')).toHaveCount(4);
  await expect(page.getByTestId('public-hero-image').first()).toHaveAttribute(
    'src',
    /assets\/gallery\/maquillaje-peinado-glam-01\.webp/
  );
  await expect(page.getByTestId('public-hero-image').first()).toHaveAttribute(
    'alt',
    /Maquillaje glam y peinado/
  );
  await expect(page.getByTestId('public-gallery-card')).toHaveCount(8);
  await expect(page.getByTestId('public-gallery-image')).toHaveCount(8);
  await expect(
    page.locator(
      '[data-testid="public-gallery-image"][src*="cabello-alisado-tratamiento-01.webp"]'
    )
  ).toHaveCount(0);
  await expect(page.getByTestId('public-gallery-image').first()).toHaveAttribute(
    'src',
    /assets\/gallery\/maquillaje-peinado-glam-01\.webp/
  );
  await expect(page.getByText('Glam completo para evento')).toBeVisible();
  await expect(page.getByText('Uñas coloridas en acrílico')).toBeVisible();

  const whatsappLink = page.getByTestId('public-home-whatsapp-link');
  await expect(whatsappLink).toBeVisible();
  await expect(whatsappLink).toHaveAttribute('href', /https:\/\/wa\.me\/522381117950/);

  await expect(page.getByTestId('public-shell')).toBeVisible();
  await expect(page.getByTestId('admin-shell')).toHaveCount(0);
  await expect(page.getByText('Panel Bella Mujer')).toHaveCount(0);
  await expect(page.getByText('Nueva cita')).toHaveCount(0);
});

test('public gift card route loads with transfer explanation', async ({ page }) => {
  await page.goto('/#/tarjeta-regalo');

  await expect(page.getByTestId('public-gift-card-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tarjeta regalo Bella Mujer' })).toBeVisible();
  await expect(page.getByRole('banner', { name: 'Bella Mujer Studio' })).toContainText(
    'Tarjeta de regalo'
  );
  await expect(page.getByRole('banner', { name: 'Bella Mujer Studio' })).toContainText(
    'Tehuacán, Puebla'
  );
  await expect(page.getByText('La tarjeta se activa solo cuando Bella Mujer confirme')).toBeVisible();
  await expect(page.getByText('WhatsApp no se envía automáticamente')).toBeVisible();
  await expect(page.getByText('Adjunta manualmente la captura de tu comprobante')).toBeVisible();
  await expect(page.getByTestId('how-it-works-section')).toBeVisible();
  await expect(page.getByText('Llena los datos de la tarjeta.')).toBeVisible();
  await expect(page.getByText('Bella Mujer confirma el pago y activa la tarjeta.')).toBeVisible();
});

test('public gift card route does not render admin shell on desktop or mobile', async ({
  page
}) => {
  await page.goto('/#/tarjeta-regalo');

  await expect(page.getByTestId('public-gift-card-page')).toBeVisible();
  await expect(page.getByTestId('public-shell')).toBeVisible();
  await expect(page.getByTestId('admin-shell')).toHaveCount(0);
  await expect(page.getByText('Panel Bella Mujer')).toHaveCount(0);
  await expect(page.getByText('Operación diaria del estudio')).toHaveCount(0);
  await expect(page.getByText('Nueva cita')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Buscar' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Notificaciones' })).toHaveCount(0);
  await expect(page.getByText('Clientes', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Inventario', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Asistente', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Configuración', { exact: true })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/tarjeta-regalo');

  await expect(page.getByTestId('public-gift-card-page')).toBeVisible();
  await expect(page.locator('.bottom-nav')).toHaveCount(0);
  await expect(page.getByText('Clientes', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Inventario', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Tarjetas regalo', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Asistente', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Configuración', { exact: true })).toHaveCount(0);
});

test('public gift card route has no horizontal overflow on mobile viewports', async ({
  page
}) => {
  const mobileViewports = [
    { width: 390, height: 844 },
    { width: 375, height: 812 },
    { width: 360, height: 800 }
  ];

  for (const viewport of mobileViewports) {
    await page.setViewportSize(viewport);
    await page.goto('/#/tarjeta-regalo');
    await expect(page.getByTestId('public-gift-card-page')).toBeVisible();

    await expectNoHorizontalOverflow(page);
  }
});

test('public home route has no horizontal overflow on mobile viewports', async ({ page }) => {
  const mobileViewports = [
    { width: 390, height: 844 },
    { width: 375, height: 812 },
    { width: 360, height: 800 }
  ];

  for (const viewport of mobileViewports) {
    await page.setViewportSize(viewport);
    await page.goto('/#/');
    await expect(page.getByTestId('public-home-page')).toBeVisible();

    await expectNoHorizontalOverflow(page);
  }
});

test('admin dashboard route renders the admin shell', async ({ page }) => {
  await page.goto('/#/admin/inicio');

  await expect(page.getByTestId('admin-shell')).toBeVisible();
  await expect(page.getByText('Panel Bella Mujer')).toBeVisible();
  await expect(page.getByRole('link', { name: /Inicio/ })).toBeVisible();
});

test('legacy admin route redirects to the admin namespace', async ({ page }) => {
  await page.goto('/#/inicio');

  await expect(page).toHaveURL(/#\/admin\/inicio$/);
  await expect(page.getByTestId('admin-shell')).toBeVisible();
  await expect(page.getByText('Panel Bella Mujer')).toBeVisible();
});

test('legacy gift card detail route redirects to the admin namespace', async ({ page }) => {
  await seedGiftCards(page);
  await page.goto('/#/tarjetas-regalo/gc-ana');

  await expect(page).toHaveURL(/#\/admin\/tarjetas-regalo\/gc-ana$/);
  await expect(page.getByTestId('admin-shell')).toBeVisible();
  await expect(page.getByTestId('admin-gift-card-detail-page')).toBeVisible();
  await expect(page.getByTestId('detail-recipient')).toContainText('Ana Sofía');
});

test('admin gift card route keeps the admin shell', async ({ page }) => {
  await page.goto('/#/admin/tarjetas-regalo');

  await expect(page.getByTestId('admin-gift-card-page')).toBeVisible();
  await expect(page.getByTestId('admin-shell')).toBeVisible();
  await expect(page.getByText('Panel Bella Mujer')).toBeVisible();
  await expect(page.getByRole('link', { name: /Tarjetas regalo/ })).toBeVisible();
});

test('validation prevents empty gift card requests', async ({ page }) => {
  await page.goto('/#/tarjeta-regalo');
  await page.getByTestId('submit-whatsapp-button').click();

  await expect(page.getByTestId('success-state')).toBeHidden();
  await expect(page.getByText('Este nombre es obligatorio.').first()).toBeVisible();
  await expect(page.getByText('El WhatsApp es obligatorio.')).toBeVisible();
});

test('gift card preview updates from form values', async ({ page }) => {
  await page.goto('/#/tarjeta-regalo');

  await page.getByTestId('buyer-name-input').fill('Diego Arana');
  await page.getByTestId('buyer-phone-input').fill('2381110000');
  await page.getByTestId('recipient-name-input').fill('Mamá Lupita');
  await page.locator('[data-testid="amount-preset-button"][data-amount="500"]').click();
  await page.getByTestId('message-input').fill('Gracias por cuidarnos siempre.');

  await expect(page.getByTestId('preview-recipient')).toContainText('Mamá Lupita');
  await expect(page.getByTestId('preview-buyer')).toContainText('Diego Arana');
  await expect(page.getByTestId('preview-amount')).toContainText('$500');
  await expect(page.getByTestId('preview-message')).toContainText('Gracias por cuidarnos siempre.');
});

test('submit creates WhatsApp URL without navigating externally', async ({ page }) => {
  await page.goto('/#/tarjeta-regalo');
  await page.evaluate(() => {
    window.open = (url?: string | URL) => {
      window.localStorage.setItem('__last_open_url__', String(url));
      return null;
    };
  });
  await page.getByTestId('buyer-name-input').fill('Diego Arana');
  await page.getByTestId('buyer-phone-input').fill('2381110000');
  await page.getByTestId('recipient-name-input').fill('Mamá Lupita');
  await page.locator('[data-testid="amount-preset-button"][data-amount="700"]').click();
  await page.getByTestId('message-input').fill('Te queremos mucho.');
  await page.getByTestId('submit-whatsapp-button').click();

  await expect(page.getByTestId('success-state')).toBeVisible();
  const openedUrl = await page.evaluate(() => window.localStorage.getItem('__last_open_url__'));

  expect(openedUrl).toContain('https://wa.me/522381117950');
  expect(decodeURIComponent(openedUrl ?? '')).toContain('BM-REGALO-');
  expect(decodeURIComponent(openedUrl ?? '')).toContain('Diego Arana');
  expect(decodeURIComponent(openedUrl ?? '')).toContain('Mamá Lupita');
  expect(decodeURIComponent(openedUrl ?? '')).toContain('$700');
  expect(decodeURIComponent(openedUrl ?? '')).toContain('transferencia');
  expect(decodeURIComponent(openedUrl ?? '')).toContain('comprobante');
});

test('created request appears in admin and status can change', async ({ page }) => {
  await page.goto('/#/tarjeta-regalo');
  await page.evaluate(() => {
    window.open = (url?: string | URL) => {
      window.localStorage.setItem('__last_open_url__', String(url));
      return null;
    };
  });
  await page.getByTestId('buyer-name-input').fill('Diego Arana');
  await page.getByTestId('buyer-phone-input').fill('2381110000');
  await page.getByTestId('recipient-name-input').fill('Mamá Lupita');
  await page.locator('[data-testid="amount-preset-button"][data-amount="500"]').click();
  await page.getByTestId('submit-whatsapp-button').click();

  await page.goto('/#/admin/tarjetas-regalo');
  const row = page.getByTestId('admin-gift-card-row').first();
  await expect(row).toContainText('Mamá Lupita');
  await expect(row).toContainText('Diego Arana');
  await expect(row).toContainText('Pendiente');

  await row.getByTestId('status-selector').click();
  await page.getByRole('option', { name: 'Pagada' }).click();
  await expect(row).toContainText('Pagada');
});

test('admin gift card search and status filters update visible rows', async ({ page }) => {
  await seedGiftCards(page);
  await page.goto('/#/admin/tarjetas-regalo');

  await expect(page.getByTestId('admin-gift-card-row')).toHaveCount(3);

  await page.getByTestId('gift-card-search-input').fill('Ana Sofía');
  await expect(page.getByTestId('admin-gift-card-row')).toHaveCount(1);
  await expect(page.getByTestId('admin-gift-card-row')).toContainText('Ana Sofía');

  await page.getByTestId('gift-card-search-input').fill('CARO');
  await expect(page.getByTestId('admin-gift-card-row')).toHaveCount(1);
  await expect(page.getByTestId('admin-gift-card-row')).toContainText('Carolina');

  await page.getByTestId('gift-card-search-input').fill('');
  await page.getByTestId('gift-card-status-filter').click();
  await page.getByRole('option', { name: 'Pagadas' }).click();
  await expect(page.getByTestId('admin-gift-card-row')).toHaveCount(1);
  await expect(page.getByTestId('admin-gift-card-row')).toContainText('Ana Sofía');
  await expect(page.getByTestId('admin-gift-card-row')).toContainText('Pagada');
});

test('admin quick actions expose copy, WhatsApp, and detail controls', async ({ page }) => {
  await seedGiftCards(page);
  await page.goto('/#/admin/tarjetas-regalo');
  await page.evaluate(() => {
    window.open = (url?: string | URL) => {
      window.localStorage.setItem('__last_open_url__', String(url));
      return null;
    };
  });

  const row = page.getByTestId('admin-gift-card-row').filter({ hasText: 'Mamá Lupita' });
  await row.getByTestId('gift-card-actions-button').click();

  await expect(page.getByTestId('copy-folio-action')).toBeVisible();
  await expect(page.getByTestId('copy-client-message-action')).toBeVisible();
  await expect(page.getByTestId('view-gift-card-action')).toBeVisible();
  await page.getByTestId('open-buyer-whatsapp-action').click();

  const openedUrl = await page.evaluate(() => window.localStorage.getItem('__last_open_url__'));
  const decoded = decodeURIComponent(openedUrl ?? '');

  expect(openedUrl).toContain('https://wa.me/522381110000');
  expect(decoded).toContain('BM-REGALO-20260424-LUPI');
  expect(decoded).toContain('Mamá Lupita');
  expect(decoded).toContain('$500 MXN');
});

test('admin detail route displays preview and not-found state', async ({ page }) => {
  await seedGiftCards(page);
  await page.goto('/#/admin/tarjetas-regalo/gc-ana');

  await expect(page.getByTestId('admin-shell')).toBeVisible();
  await expect(page.getByTestId('admin-gift-card-detail-page')).toBeVisible();
  await expect(page.getByTestId('detail-gift-card-preview')).toContainText(
    'BM-REGALO-20260424-ANA1'
  );
  await expect(page.getByTestId('detail-recipient')).toContainText('Ana Sofía');
  await expect(page.getByTestId('detail-buyer')).toContainText('Alejandra Ruiz');
  await expect(page.getByTestId('detail-amount')).toContainText('$700');
  await expect(page.getByTestId('detail-status')).toContainText('Pagada');
  await expect(page.getByTestId('print-gift-card-button')).toBeVisible();

  await page.goto('/#/admin/tarjetas-regalo/no-existe');
  await expect(page.getByTestId('gift-card-not-found')).toContainText(
    'No encontramos esta tarjeta regalo.'
  );
});

test('admin empty state appears in a clean browser context', async ({ page }) => {
  await page.goto('/#/admin/tarjetas-regalo');

  await expect(page.getByTestId('admin-gift-card-page')).toBeVisible();
  await expect(page.getByTestId('admin-empty-state')).toContainText(
    'Aún no hay tarjetas regalo registradas.'
  );
});
