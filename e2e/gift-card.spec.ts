import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
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
});

test('public gift card route does not render admin shell on desktop or mobile', async ({
  page
}) => {
  await page.goto('/#/tarjeta-regalo');

  await expect(page.getByTestId('public-gift-card-page')).toBeVisible();
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
  await expect(page.getByText('Inicio', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Servicios', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Clientes', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Inventario', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Tarjetas regalo', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Asistente', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Configuración', { exact: true })).toHaveCount(0);
});

test('admin gift card route keeps the admin shell', async ({ page }) => {
  await page.goto('/#/tarjetas-regalo');

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

  await page.goto('/#/tarjetas-regalo');
  const row = page.getByTestId('admin-gift-card-row').first();
  await expect(row).toContainText('Mamá Lupita');
  await expect(row).toContainText('Diego Arana');
  await expect(row).toContainText('Pendiente');

  await row.getByTestId('status-selector').click();
  await page.getByRole('option', { name: 'Pagada' }).click();
  await expect(row).toContainText('Pagada');
});

test('admin empty state appears in a clean browser context', async ({ page }) => {
  await page.goto('/#/tarjetas-regalo');

  await expect(page.getByTestId('admin-gift-card-page')).toBeVisible();
  await expect(page.getByTestId('admin-empty-state')).toContainText(
    'Aún no hay tarjetas regalo registradas.'
  );
});
