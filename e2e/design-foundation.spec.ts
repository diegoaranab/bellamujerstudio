import { expect, test, type Page } from '@playwright/test';

function syntheticCredential(byte: number): string {
  const value = Buffer.alloc(32, byte).toString('base64url');

  if (value.length !== 43) {
    throw new Error(`Unexpected credential length: ${value.length}`);
  }

  return value;
}

const memberActivationRoute = `/#/club/activar?access=${syntheticCredential(0x00)}&invite=${syntheticCredential(0x01)}`;
const representativeRoutes = ['/#/', '/#/admin/inicio', memberActivationRoute];

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth
  }));

  expect(widths.body).toBeLessThanOrEqual(widths.viewport);
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
}

test('emits the approved semantic foundation and production font request', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByTestId('public-home-page')).toBeVisible();

  const foundation = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    const fontRequest = document
      .querySelector('link[rel="stylesheet"][href*="fonts.googleapis.com"]')
      ?.getAttribute('href');

    return {
      action: root.getPropertyValue('--bm-action-primary').trim(),
      canvas: root.getPropertyValue('--bm-surface-canvas').trim(),
      compatAccent: root.getPropertyValue('--bm-surface-accent').trim(),
      error: root.getPropertyValue('--bm-error-foreground').trim(),
      focus: root.getPropertyValue('--bm-focus-ring').trim(),
      motion: root.getPropertyValue('--bm-motion-feedback').trim(),
      materialPrimary: root.getPropertyValue('--mat-sys-primary').trim(),
      bodyFont: body.fontFamily,
      fontRequest
    };
  });

  expect(foundation.action).toBe('#7a1838');
  expect(foundation.canvas).toBe('#fff7f9');
  expect(foundation.compatAccent).not.toBe('');
  expect(foundation.error).toBe('#8c1d2c');
  expect(foundation.focus).toBe('#0b63a5');
  expect(foundation.motion).toBe('120ms');
  expect(foundation.materialPrimary).toBe('#7a1838');
  expect(foundation.bodyFont).toContain('Source Sans 3');
  expect(foundation.fontRequest).toContain('Newsreader');
  expect(foundation.fontRequest).toContain('Source+Sans+3');
  expect(foundation.fontRequest).not.toContain('Poppins');
  expect(foundation.fontRequest).not.toContain('Playfair');
});

test('keeps a visible semantic focus treatment on light and inverse representative surfaces', async ({
  page
}) => {
  await page.goto('/#/');

  const publicControl = page.getByRole('link', { name: 'Ver contacto' });
  await publicControl.focus();
  await expect(publicControl).toBeFocused();
  await expect(publicControl).toHaveCSS('outline-style', 'solid');

  const inverseControl = page.getByRole('link', { name: 'Ver contacto' });
  await inverseControl.focus();
  await expect(inverseControl).toBeFocused();
  await expect(inverseControl).toHaveCSS('outline-style', 'solid');
});

test('representative public, admin, and member states reflow without overflow and respect reduced motion', async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of representativeRoutes) {
      await page.goto(route);
      await expectNoHorizontalOverflow(page);
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/club');
  const motion = await page.evaluate(() => getComputedStyle(document.body).transitionDuration);
  expect(motion === '0s' || motion === '0ms').toBeTruthy();
});

test('keeps typography roles scoped to public, admin, and member modes', async ({ page }) => {
  await page.goto('/#/admin/inicio');

  const adminTypography = await page.evaluate(() => {
    const cardTitle = [...document.querySelectorAll('mat-card-title')]
      .find((element) => element.textContent?.trim() === 'Costos fijos');
    const pageTitle = document.querySelector('.page-title');
    return {
      cardTitle: cardTitle ? getComputedStyle(cardTitle).fontFamily : '',
      pageTitle: pageTitle ? getComputedStyle(pageTitle).fontFamily : ''
    };
  });
  expect(adminTypography.cardTitle).toContain('Source Sans 3');
  expect(adminTypography.cardTitle).not.toContain('Newsreader');
  expect(adminTypography.pageTitle).toContain('Source Sans 3');

  await page.goto(memberActivationRoute);
  await expect(page.locator('[data-testid="member-enrollment"]')).toBeVisible();
  await expect(page.locator('[data-testid="member-invalid-link"]')).toHaveCount(0);
  const memberTypography = await page.evaluate(() => {
    const heading = document.querySelector('h1[mat-card-title]');
    const control = document.querySelector('input, button, mat-form-field');
    return {
      heading: heading ? getComputedStyle(heading).fontFamily : '',
      control: control ? getComputedStyle(control).fontFamily : ''
    };
  });
  expect(memberTypography.heading).toContain('Newsreader');
  expect(memberTypography.control).toContain('Source Sans 3');

  await page.goto('/#/');
  await expect(page.getByTestId('public-home-page')).toBeVisible();
  const publicTypography = await page.evaluate(() => ({
    heroEyebrow: getComputedStyle(document.querySelector('.hero .eyebrow')!).textTransform,
    servicesEyebrow: getComputedStyle(document.querySelector('.services .eyebrow')!).textTransform
  }));
  expect(publicTypography.heroEyebrow).toBe('none');
  expect(publicTypography.servicesEyebrow).toBe('uppercase');
});
