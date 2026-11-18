import { expect, test, type Page } from '@playwright/test';
import { installMemberClubFixture, memberClubFixture } from './support/club-fixture';

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

async function signIntoMemberClub(page: Page): Promise<void> {
  await page.goto(`/#/club?access=${memberClubFixture.access}`);
  await page.getByTestId('member-login-pin').fill('482731');
  await page.getByTestId('member-login-submit').click();
  await expect(page.getByTestId('member-club-home')).toBeVisible();
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
  await expect(page.getByTestId('club-directory-task')).toBeVisible();
  await expect(page.getByTestId('club-new-client-task')).toHaveCount(0);
  await expect(page.getByTestId('visit-registration')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test('mobile Club administration remains readable and is discoverable from Inicio', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/admin/club');

  await expect(page.getByRole('heading', { level: 1, name: 'Bella Mujer Club' })).toBeVisible();
  await expect(page.getByTestId('club-not-configured')).toBeVisible();
  await expect(page.getByTestId('club-directory-task')).toBeVisible();
  await expect(page.getByTestId('client-detail')).toHaveCount(0);
  await expect(page.getByTestId('visit-registration')).toHaveCount(0);
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
  await expect(page.getByTestId('loyalty-history')).toBeVisible();
  await expect(page.getByTestId('visit-registration')).toHaveCount(0);
  await expect(
    page.getByTestId('club-workspace-nav').getByRole('link', { name: 'Historial' })
  ).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Movimientos de fidelidad' })).toBeFocused();
  await expectNoHorizontalOverflow(page);
});

test('selected-client composition keeps the URL authoritative across desktop and tablet', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/admin/club/clientas/client-opaque-123/acceso');

  await expect(page.getByTestId('club-master-detail')).toBeVisible();
  await expect(page.getByTestId('club-master-detail').locator('aside')).toBeVisible();
  await expect(page.getByTestId('client-access')).toBeVisible();
  await expect(page.getByTestId('visit-registration')).toHaveCount(0);
  await expect(
    page.getByTestId('club-workspace-nav').getByRole('link', { name: 'Acceso' })
  ).toHaveAttribute('aria-current', 'page');
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.getByTestId('club-master-detail').locator('aside')).toBeHidden();
  await expect(page.getByTestId('client-access')).toBeVisible();
  await expect(page).toHaveURL(/\/client-opaque-123\/acceso$/);
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

test('authenticated member home renders only the mocked name and real stamp count', async ({ page }) => {
  await installMemberClubFixture(page);
  await signIntoMemberClub(page);

  await expect(page.getByTestId('member-club-home')).toContainText('Hola, Mariana Prueba');
  await expect(page.getByTestId('member-club-home')).toContainText('3 sellos');
  await expect(page.getByRole('heading', { level: 1, name: 'Mi Club' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Tus sellos' })).toBeVisible();
  await expect(page.getByTestId('member-earned-stamps')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByTestId('member-earned-stamps').locator('.member-progress__seal')).toHaveCount(3);
  await expect(page.getByTestId('member-club-home')).not.toContainText(/3 de 4|recompensa|historial|mi qr/i);
  await expect(page.getByTestId('member-club-home')).not.toContainText('Sesión válida hasta');
  await expect(page.getByTestId('member-logout')).toBeVisible();
  await expect(page.evaluate(() => [localStorage.length, sessionStorage.length])).resolves.toEqual([0, 0]);
});

test('member home recovers from a transient summary failure without losing its memory-only session', async ({
  page
}) => {
  await installMemberClubFixture(page, { failFirstSummary: 'server' });
  await page.goto(`/#/club?access=${memberClubFixture.access}`);
  await page.getByTestId('member-login-pin').fill('482731');
  await page.getByTestId('member-login-submit').click();

  await expect(page.getByTestId('member-home-load-error')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Mi Club' })).toBeVisible();
  await expect(page.getByText('Tu sesión sigue activa.')).toBeVisible();
  await page.getByTestId('member-home-retry').focus();
  await expect(page.getByTestId('member-home-retry')).toBeFocused();
  await page.getByTestId('member-home-retry').click();
  await expect(page.getByTestId('member-club-home')).toBeVisible();
});

test('member authentication failure and logout return to login', async ({ page }) => {
  await installMemberClubFixture(page, { failFirstSummary: 'authentication' });
  await page.goto(`/#/club?access=${memberClubFixture.access}`);
  await page.getByTestId('member-login-pin').fill('482731');
  await page.getByTestId('member-login-submit').click();
  await expect(page.getByTestId('member-login')).toBeVisible();

  await signIntoMemberClub(page);
  await page.getByTestId('member-logout').click();
  await expect(page.getByTestId('member-login')).toBeVisible();
});

test('mobile authenticated member home has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMemberClubFixture(page);
  await signIntoMemberClub(page);
  await expectNoHorizontalOverflow(page);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await expect(page.getByTestId('member-logout')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('authenticated member home stays contained at 720px with enlarged text', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await installMemberClubFixture(page);
  await signIntoMemberClub(page);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });

  await expect(page.getByTestId('member-club-home')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Tus sellos' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const progress = page.getByTestId('member-progress');
  await expect(progress).toBeVisible();
  const bounds = await progress.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(720);
  await expect(page.getByTestId('member-logout')).toBeVisible();
});

test('captures the final Phase 6B member visual evidence', async ({ page }) => {
  const evidenceDir = 'test-results/phase6b/screenshots';
  const views = [
    { name: 'authenticated-390.png', width: 390, height: 844 },
    { name: 'authenticated-390-text-200.png', width: 390, height: 900, textScale: true },
    { name: 'authenticated-720-text-200.png', width: 720, height: 900, textScale: true },
    { name: 'authenticated-820.png', width: 820, height: 1180 },
    { name: 'authenticated-1440.png', width: 1440, height: 900 }
  ] as const;

  for (const view of views) {
    const viewPage = await page.context().newPage();
    await viewPage.setViewportSize({ width: view.width, height: view.height });
    await installMemberClubFixture(viewPage);
    await signIntoMemberClub(viewPage);
    if (view.textScale) await viewPage.addStyleTag({ content: 'html { font-size: 200%; }' });
    await expectNoHorizontalOverflow(viewPage);
    await viewPage.screenshot({ path: `${evidenceDir}/${view.name}`, animations: 'disabled' });
    await viewPage.close();
  }

  const errorPage = await page.context().newPage();
  await errorPage.setViewportSize({ width: 390, height: 844 });
  await installMemberClubFixture(errorPage, { failFirstSummary: 'server' });
  await errorPage.goto(`/#/club?access=${memberClubFixture.access}`);
  await errorPage.getByTestId('member-login-pin').fill('482731');
  await errorPage.getByTestId('member-login-submit').click();
  await expect(errorPage.getByTestId('member-home-load-error')).toBeVisible();
  await errorPage.getByTestId('member-home-retry').click();
  await expect(errorPage.getByTestId('member-club-home')).toBeVisible();
  await expectNoHorizontalOverflow(errorPage);
  await errorPage.screenshot({
    path: `${evidenceDir}/transient-error-retry-390.png`,
    animations: 'disabled'
  });
  await errorPage.close();
});
