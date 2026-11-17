import { expect, test, type Page } from '@playwright/test';

const MEMBER_ACCESS = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const MEMBER_INVITATION = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE';

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth
  }));

  expect(widths.body).toBeLessThanOrEqual(widths.viewport);
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
}

test('desktop Club administration renders its safe local configuration state', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/admin/club');

  await expect(page).toHaveURL(/#\/admin\/club\/clientas$/);
  await expect(page.getByTestId('admin-shell')).toBeVisible();
  await expect(page.getByTestId('public-shell')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Bella Mujer Club' })).toBeVisible();
  await expect(page.getByTestId('club-not-configured')).toContainText(
    'Servicio de Club no configurado'
  );
  await expect(page.getByText('Datos de demostración')).toHaveCount(0);
  await expect(page.getByText('Clienta demo A')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Clientas Club' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Agregar clienta' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Historial de movimientos' })).toBeVisible();
  await expect(page.getByTestId('history-no-client')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Registrar visita' })).toBeVisible();
  await expect(page.getByTestId('create-client-submit')).toBeDisabled();
  await expect(page.getByTestId('visit-submit')).toBeDisabled();
  await expectNoHorizontalOverflow(page);
});

test('mobile Club administration remains readable and is discoverable from Inicio', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/admin/club');

  await expect(page.getByRole('heading', { level: 1, name: 'Bella Mujer Club' })).toBeVisible();
  await expect(page.getByTestId('club-not-configured')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Detalle de clienta' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Agregar clienta' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Historial de movimientos' })).toBeVisible();
  await expect(page.getByTestId('history-no-client')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Registrar visita' })).toBeVisible();
  await expect(page.getByTestId('visit-submit')).toBeDisabled();
  await expectNoHorizontalOverflow(page);

  const bottomNav = page.getByTestId('admin-bottom-nav');
  await expect(bottomNav).toBeVisible();
  await expect(bottomNav.locator(':scope > .bottom-nav__item')).toHaveCount(5);
  await expect(bottomNav.getByRole('link', { name: 'Club' })).toBeVisible();

  await page.goto('/#/admin/inicio');
  const clubEntry = page.getByTestId('club-preview-card');
  await expect(clubEntry).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await clubEntry.getByRole('link', { name: /Explorar Club/ }).click();
  await expect(page).toHaveURL(/#\/admin\/club\/clientas$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Bella Mujer Club' })).toBeVisible();
});

test('Club workspace deep links use only the opaque client identifier', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/admin/club/clientas/client-opaque-123/historial');

  await expect(page).toHaveURL(/#\/admin\/club\/clientas\/client-opaque-123\/historial$/);
  expect(page.url()).not.toContain('?');
  expect(page.url()).not.toContain('Ana');
  await expect(page.getByRole('heading', { level: 1, name: 'Bella Mujer Club' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('member Club route renders its access surface', async ({ page }) => {
  await page.goto('/#/club');

  await expect(page.getByTestId('member-club-access')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Bella Mujer Club' })).toBeVisible();
});

test('activation scrubs the invitation again when the same link is reopened', async ({ page }) => {
  const originalUrl = `/#/club/activar?access=${MEMBER_ACCESS}&invite=${MEMBER_INVITATION}`;
  const scrubbedUrl = new RegExp(`#\/club\/activar\\?access=${MEMBER_ACCESS}$`);
  await page.goto(originalUrl);

  await expect(page.getByTestId('member-enrollment')).toBeVisible();
  await expect(page).toHaveURL(scrubbedUrl);
  expect(page.url()).not.toContain('invite=');
  expect(page.url()).toContain(`access=${MEMBER_ACCESS}`);

  await page.evaluate((url) => {
    window.location.href = url;
  }, originalUrl);

  await expect(page).toHaveURL(scrubbedUrl);
  await expect(page.getByTestId('member-enrollment')).toBeVisible();
  expect(page.url()).not.toContain('invite=');
});

test('mobile member access has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#/club?access=${MEMBER_ACCESS}`);

  await expect(page.getByTestId('member-login')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('member recovery and reveal controls remain usable at mobile text scaling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#/club?access=${MEMBER_ACCESS}`);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await expect(page.getByTestId('member-login-reveal')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto('/#/club');
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await expect(page.getByTestId('member-invalid-link-recovery')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('member NIP entry keeps paste, autocomplete, and keyboard-operated reveal available', async ({
  page,
  context
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:4200'
  });
  await page.goto(`/#/club?access=${MEMBER_ACCESS}`);
  const pin = page.getByTestId('member-login-pin');
  const reveal = page.getByTestId('member-login-reveal');

  await expect(pin).toHaveAttribute('autocomplete', 'current-password');
  await expect(pin).toHaveAttribute('inputmode', 'numeric');
  await page.evaluate(() => navigator.clipboard.writeText('482731'));
  await pin.focus();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
  await expect(pin).toHaveValue('482731');

  await page.keyboard.press('Tab');
  await expect(reveal).toBeFocused();
  await expect(reveal).toHaveAttribute('aria-label', 'Mostrar NIP');
  await page.keyboard.press('Enter');
  await expect(pin).toHaveAttribute('type', 'text');
  await expect(pin).toHaveValue('482731');
  await expect(reveal).toHaveAttribute('aria-label', 'Ocultar NIP');
});

test('member invalid forms focus the field that needs correction without requesting authentication', async ({
  page
}) => {
  await page.goto(`/#/club/activar?access=${MEMBER_ACCESS}&invite=${MEMBER_INVITATION}`);
  await page.getByRole('button', { name: 'Activar mi acceso' }).click();
  await expect(page.getByTestId('member-enrollment-pin')).toBeFocused();
  await expect(page.getByText('Ingresa exactamente seis dígitos.')).toBeVisible();

  await page.getByTestId('member-enrollment-pin').fill('482731');
  await page.getByRole('button', { name: 'Activar mi acceso' }).click();
  await expect(page.getByTestId('member-enrollment-confirmation')).toBeFocused();
  await expect(page.getByText('Confirma los seis dígitos.')).toBeVisible();

  await page.goto(`/#/club?access=${MEMBER_ACCESS}`);
  await page.getByTestId('member-login-submit').click();
  await expect(page.getByTestId('member-login-pin')).toBeFocused();
  await expect(page.getByText('Ingresa exactamente seis dígitos.')).toBeVisible();
});
