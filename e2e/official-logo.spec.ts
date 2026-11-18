import { expect, test } from '@playwright/test';

const officialLogoPath = 'brand/bella-mujer-logo-master.png';

test('uses the official logo only on spacious trust surfaces and keeps compact BM marks utility-only', async ({
  page,
}) => {
  await page.goto('/#/');

  await expect(page.getByTestId('public-brand-utility-mark')).toHaveText('BM');
  await expect(page.locator('.public-brand')).toContainText('Bella Mujer Studio');
  await expect(
    page.getByTestId('public-shell').locator(`img[src="${officialLogoPath}"]`),
  ).toHaveCount(0);

  await page.goto('/#/admin/inicio');
  await expect(page.getByTestId('admin-shell')).toBeVisible();
  await expect(page.getByTestId('admin-brand-utility-mark')).toHaveText('BM');
  await expect(page.locator('.sidenav-header')).toContainText('Bella Mujer Studio');
  await expect(
    page.getByTestId('admin-shell').locator(`img[src="${officialLogoPath}"]`),
  ).toHaveCount(0);

  await page.goto('/#/admin/login');
  const adminLogo = page.getByTestId('admin-login-official-logo').getByRole('img', {
    name: 'Bella Mujer Studio',
  });
  await expect(adminLogo).toHaveAttribute('src', officialLogoPath);
  await expect
    .poll(() =>
      adminLogo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth),
    )
    .toBe(1563);
  await expect
    .poll(() => adminLogo.evaluate((image: HTMLImageElement) => image.naturalHeight))
    .toBe(1563);

  await page.goto('/#/club');
  const memberLogo = page.getByTestId('member-access-official-logo');
  await expect(memberLogo).toHaveAttribute('src', officialLogoPath);
  await expect(memberLogo).toHaveAttribute('alt', 'Bella Mujer Studio');
  await expect
    .poll(() =>
      memberLogo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth),
    )
    .toBe(1563);
  await expect
    .poll(() => memberLogo.evaluate((image: HTMLImageElement) => image.naturalHeight))
    .toBe(1563);
});

test('captures the responsive official identity acceptance matrix', async ({ page }) => {
  const viewports = [
    { label: '390', width: 390, height: 844 },
    { label: '820', width: 820, height: 1180 },
    { label: '1440', width: 1440, height: 900 },
  ];
  const surfaces = [
    { name: 'public-header', route: '/#/', ready: '[data-testid="public-shell"]' },
    { name: 'admin-shell', route: '/#/admin/inicio', ready: '[data-testid="admin-shell"]' },
    {
      name: 'admin-login',
      route: '/#/admin/login',
      ready: '[data-testid="admin-login-official-logo"]',
    },
    {
      name: 'member-access',
      route: '/#/club',
      ready: '[data-testid="member-access-official-logo"]',
    },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const surface of surfaces) {
      await page.goto(surface.route);
      await expect(page.locator(surface.ready)).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);

      const screenshotTarget =
        surface.name === 'public-header' ? page.locator('.public-header') : page;
      await screenshotTarget.screenshot({
        path: `test-results/official-logo/screenshots/${surface.name}-${viewport.label}.png`,
        animations: 'disabled',
      });
    }
  }
});
