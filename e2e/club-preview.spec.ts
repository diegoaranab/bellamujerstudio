import { expect, test, type Page } from '@playwright/test';
import { installMemberClubFixture, memberClubFixture, memberClubPromotionFixture } from './support/club-fixture';

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
  await expect(page.getByTestId('member-history')).toContainText('Actividad reciente');
  await expect(page.getByTestId('member-history')).toContainText('Sello ganado');
  await expect(page.getByTestId('member-club-home')).not.toContainText(/3 de 4|recompensa/i);
  await expect(page.getByTestId('member-qr')).toBeVisible();
  await expect(page.getByTestId('member-club-home')).not.toContainText('Sesión válida hasta');
  await expect(page.getByTestId('member-logout')).toBeVisible();
  await expect(page.evaluate(() => [localStorage.length, sessionStorage.length])).resolves.toEqual([0, 0]);
});

test('member promotion omits empty results and presents active validity after history before logout', async ({ page }) => {
  await installMemberClubFixture(page);
  await signIntoMemberClub(page);
  await expect(page.getByTestId('member-promotion')).toHaveCount(0);
  await page.goto('about:blank');

  await installMemberClubFixture(page, { promotion: 'active' });
  await signIntoMemberClub(page);
  const promotion = page.getByTestId('member-promotion');
  await expect(promotion).toBeVisible();
  await expect(promotion.getByRole('heading', { level: 2, name: 'Promoción' })).toBeVisible();
  await expect(promotion.getByRole('heading', { level: 3, name: memberClubPromotionFixture.title })).toBeVisible();
  await expect(promotion).toContainText('Contenido sintético del Club');
  const descriptionLength = await promotion.locator('.member-promotion__description').evaluate(
    (element) => Array.from(element.textContent ?? '').length
  );
  expect(descriptionLength).toBe(500);
  await expect(promotion).toContainText('Desde');
  await expect(promotion).toContainText('Antes de');
  await expect(promotion).toContainText('Hora de Ciudad de México');
  const order = await page.evaluate(() => {
    const history = document.querySelector('[data-testid="member-history"]')!;
    const activePromotion = document.querySelector('[data-testid="member-promotion"]')!;
    const logout = document.querySelector('[data-testid="member-logout"]')!;
    return (history.compareDocumentPosition(activePromotion) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
      (activePromotion.compareDocumentPosition(logout) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });
  expect(order).toBe(true);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('promotion failure stays local, retry recovers, and auth failure returns to login', async ({ page }) => {
  await installMemberClubFixture(page, { promotion: 'server-then-success' });
  await signIntoMemberClub(page);
  await expect(page.getByTestId('member-promotion-feedback')).toContainText('No pudimos cargar la promoción. Intenta de nuevo.');
  await expect(page.getByTestId('member-progress')).toBeVisible();
  await expect(page.getByTestId('member-history')).toBeVisible();
  await page.getByTestId('member-qr-toggle').click();
  await expect(page.getByTestId('member-qr-image')).toBeVisible();
  await page.getByTestId('member-promotion-retry').click();
  await expect(page.getByTestId('member-promotion')).toContainText(memberClubPromotionFixture.title);

  await page.goto('about:blank');
  await installMemberClubFixture(page, { promotion: 'authentication' });
  await page.goto(`/#/club?access=${memberClubFixture.access}`);
  await page.getByTestId('member-login-pin').fill('482731');
  await page.getByTestId('member-login-submit').click();
  await expect(page.getByTestId('member-login')).toBeVisible();
  await expect(page.getByTestId('member-login-heading')).toBeFocused();
});

test('active promotion reflows without clipping at required member widths and landscape', async ({ page }) => {
  await installMemberClubFixture(page, { promotion: 'active' });
  await signIntoMemberClub(page);
  for (const [width, height, enlarged] of [
    [320, 760, false], [390, 844, false], [720, 900, true],
    [820, 1180, false], [1440, 1000, false], [844, 390, false]
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((zoomed) => {
      document.documentElement.style.fontSize = zoomed ? '200%' : '';
    }, enlarged);
    await expect(page.getByTestId('member-promotion')).toBeVisible();
    await expect(page.getByTestId('member-logout')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    if (width === 320 || width === 390 || width === 720 || width === 820 || width === 1440 || height === 390) {
      await page.screenshot({ path: `/tmp/phase6e2-active-${width}${enlarged ? '-200' : ''}.png`, fullPage: true });
    }
  }
});

test('promotion error remains contained at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMemberClubFixture(page, { promotion: 'server' });
  await signIntoMemberClub(page);
  await expect(page.getByTestId('member-promotion-feedback')).toBeVisible();
  await expect(page.getByTestId('member-promotion-retry')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: '/tmp/phase6e2-error-390.png', fullPage: true });
});

test('member history supports empty, recovery, authentication, and paginated activity states', async ({ page }) => {
  await installMemberClubFixture(page, { history: 'empty' });
  await signIntoMemberClub(page);
  await expect(page.getByTestId('member-history-empty')).toBeVisible();
  await expect(page.getByTestId('member-progress')).toBeVisible();

  await page.goto('about:blank');
  await installMemberClubFixture(page, { history: 'server' });
  await signIntoMemberClub(page);
  await expect(page.getByTestId('member-history-error')).toBeVisible();
  await page.getByTestId('member-history-retry').click();
  await expect(page.getByTestId('member-history-list')).toContainText('Sello ganado');

  await page.goto('about:blank');
  await installMemberClubFixture(page, { history: 'paginated' });
  await signIntoMemberClub(page);
  await page.getByTestId('member-history-load-more').click();
  await expect(page.getByTestId('member-history-list').locator('li')).toHaveCount(3);
  await expect(page.getByTestId('member-history-list')).toContainText('Ajuste de sellos');
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

test('captures Phase 6C2 member history visual evidence', async ({ page }) => {
  const evidenceDir = 'test-results/phase6c2/screenshots';
  const views = [
    { name: 'authenticated-history-390.png', width: 390, height: 844 },
    { name: 'authenticated-history-390-text-200.png', width: 390, height: 900, textScale: true },
    { name: 'authenticated-history-720-text-200.png', width: 720, height: 900, textScale: true },
    { name: 'authenticated-history-820.png', width: 820, height: 1180 },
    { name: 'authenticated-history-1440.png', width: 1440, height: 900 }
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

  const emptyPage = await page.context().newPage();
  await emptyPage.setViewportSize({ width: 390, height: 844 });
  await installMemberClubFixture(emptyPage, { history: 'empty' });
  await signIntoMemberClub(emptyPage);
  await emptyPage.screenshot({ path: `${evidenceDir}/history-empty-390.png`, animations: 'disabled' });
  await emptyPage.close();

  const errorPage = await page.context().newPage();
  await errorPage.setViewportSize({ width: 390, height: 844 });
  await installMemberClubFixture(errorPage, { history: 'server' });
  await signIntoMemberClub(errorPage);
  await expect(errorPage.getByTestId('member-history-error')).toBeVisible();
  await expectNoHorizontalOverflow(errorPage);
  await errorPage.screenshot({
    path: `${evidenceDir}/history-error-390.png`,
    animations: 'disabled'
  });
  await errorPage.close();
});

test('member QR is user initiated, identification only, and removed when hidden', async ({ page }) => {
  await installMemberClubFixture(page);
  await signIntoMemberClub(page);
  const qrRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/club/me/qr')) qrRequests.push(request.url());
  });
  const section = page.getByTestId('member-qr');
  await expect(section).toContainText('Mi QR');
  await expect(section.getByTestId('member-qr-image')).toHaveCount(0);
  expect(qrRequests).toHaveLength(0);
  await section.getByTestId('member-qr-toggle').click();
  await expect(section.getByTestId('member-qr-image')).toBeVisible();
  await expect(section).toContainText('Tu QR está listo.');
  await expect(section).toContainText('Muéstralo al equipo de Bella Mujer Studio para que identifique tu cuenta.');
  await expect(section).toContainText('Tu QR no incluye tu nombre ni tu teléfono. Tampoco inicia sesión ni registra una visita.');
  await expect(section.getByTestId('member-qr-image')).toHaveAttribute('src', /^data:image\/gif;base64,/);
  await expect(section).not.toContainText(memberClubFixture.qrIdentifier);
  await expect(page.locator('body')).not.toContainText('/admin/club/clientas/');
  await expect(page.evaluate(() => [localStorage.length, sessionStorage.length])).resolves.toEqual([0, 0]);
  await section.getByTestId('member-qr-toggle').click();
  await expect(section.getByTestId('member-qr-image')).toHaveCount(0);
  await section.getByTestId('member-qr-toggle').click();
  await expect(section.getByTestId('member-qr-image')).toBeVisible();
  expect(qrRequests).toHaveLength(2);
});

test('member QR retries safely and clears the session after authentication failure', async ({ page }) => {
  await installMemberClubFixture(page, { qr: 'server-then-success' });
  await signIntoMemberClub(page);
  const section = page.getByTestId('member-qr');
  const qrStatuses: number[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/club/me/qr')) qrStatuses.push(response.status());
  });
  await section.getByTestId('member-qr-toggle').click();
  await expect(section.getByRole('alert')).toHaveText('No pudimos mostrar tu QR.');
  await section.getByTestId('member-qr-retry').click();
  await expect.poll(() => qrStatuses.length).toBe(2);
  expect(qrStatuses).toEqual([500, 200]);
  await expect(section.getByTestId('member-qr-image')).toBeVisible();
  await expect(page.getByTestId('member-club-home')).toBeVisible();
  await page.goto('about:blank');

  await installMemberClubFixture(page, { qr: 'authentication' });
  await signIntoMemberClub(page);
  await page.getByTestId('member-qr-toggle').click();
  await expect(page.getByTestId('member-login')).toBeVisible();
  await expect(page.getByTestId('member-access-error')).toContainText('Tu sesión del Club ya no está activa. Ingresa nuevamente.');
  await expect(page.getByTestId('member-qr')).toHaveCount(0);
});

test('captures Phase 6D2 open QR visual evidence and validates responsive widths', async ({ page }) => {
  const evidenceDir = 'test-results/phase6d2/screenshots';
  const views = [
    { name: 'qr-320.png', width: 320, height: 800 },
    { name: 'qr-390.png', width: 390, height: 844 },
    { name: 'qr-390-text-200.png', width: 390, height: 844, textScale: true },
    { name: 'qr-720-text-200.png', width: 720, height: 900, textScale: true },
    { name: 'qr-820.png', width: 820, height: 1180 },
    { name: 'qr-1440.png', width: 1440, height: 900 },
    { name: 'qr-844-landscape.png', width: 844, height: 390 }
  ] as const;
  for (const view of views) {
    const viewPage = await page.context().newPage();
    await viewPage.setViewportSize({ width: view.width, height: view.height });
    await installMemberClubFixture(viewPage);
    await signIntoMemberClub(viewPage);
    if (view.textScale) await viewPage.addStyleTag({ content: 'html { font-size: 200%; }' });
    await viewPage.getByTestId('member-qr-toggle').click();
    await expect(viewPage.getByTestId('member-qr-image')).toBeVisible();
    if (view.name === 'qr-720-text-200.png') {
      const columns = await viewPage.getByTestId('member-qr-disclosure').evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.split(' ').length
      );
      expect(columns).toBe(1);
    }
    await expectNoHorizontalOverflow(viewPage);
    await viewPage.screenshot({ path: `${evidenceDir}/${view.name}`, animations: 'disabled', fullPage: true });
    await viewPage.close();
  }

  const errorPage = await page.context().newPage();
  await errorPage.setViewportSize({ width: 390, height: 844 });
  await installMemberClubFixture(errorPage, { qr: 'server-then-success' });
  await signIntoMemberClub(errorPage);
  await errorPage.getByTestId('member-qr-toggle').click();
  await expect(errorPage.getByTestId('member-qr-retry')).toBeVisible();
  await errorPage.screenshot({ path: `${evidenceDir}/qr-error-390.png`, animations: 'disabled', fullPage: true });
  await errorPage.close();
});
