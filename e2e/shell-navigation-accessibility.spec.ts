import { expect, test, type Page } from '@playwright/test';

async function expectFocusedElementIsNotCovered(page: Page, coveringSelector: string): Promise<void> {
  const isCovered = await page.evaluate((selector) => {
    const focused = document.activeElement?.getBoundingClientRect();
    const covering = document.querySelector(selector)?.getBoundingClientRect();
    if (!focused || !covering) return false;

    return !(
      focused.right <= covering.left ||
      focused.left >= covering.right ||
      focused.bottom <= covering.top ||
      focused.top >= covering.bottom
    );
  }, coveringSelector);

  expect(isCovered).toBe(false);
}

async function setEffectiveZoom(page: Page, zoom: number): Promise<void> {
  await page.evaluate((value) => {
    document.documentElement.style.zoom = String(value);
  }, zoom);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );

  expect(hasOverflow).toBe(false);
}

test('public skip control preserves the hash route and focuses its main region', async ({ page }) => {
  await page.goto('/#/servicios');
  const skip = page.getByTestId('public-skip-link');

  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/#\/servicios$/);
  await expect(page.getByRole('main')).toBeFocused();
});

test('public route changes focus the new heading without changing history navigation', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByRole('heading', { level: 1 })).not.toBeFocused();

  await page.getByTestId('public-nav-services-link').click();
  await expect(page.getByRole('heading', { level: 1, name: /servicios de belleza/i })).toBeFocused();

  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: /belleza cuidada/i })).toBeFocused();

  await page.goForward();
  await expect(page.getByRole('heading', { level: 1, name: /servicios de belleza/i })).toBeFocused();
});

test('desktop admin sidebar exposes one current page and its skip control focuses main', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/admin/inicio');

  const sidebar = page.locator('.sidenav');
  await expect(sidebar.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
  await expect(sidebar.locator('a[aria-current="page"]')).toHaveCount(1);

  const skip = page.getByTestId('admin-skip-link');
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/admin\/inicio$/);
  await expect(page.getByRole('main')).toBeFocused();

  await sidebar.getByRole('link', { name: 'Tarjetas regalo' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tarjetas regalo' })).toBeFocused();
  await expect(sidebar.getByRole('link', { name: 'Tarjetas regalo' })).toHaveAttribute(
    'aria-current',
    'page'
  );
});

test('mobile fixed shell controls do not cover keyboard-focused content', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 400 });
  await page.goto('/#/');
  await setEffectiveZoom(page, 2);
  const publicAction = page.getByRole('link', { name: 'Ver contacto' });
  await publicAction.focus();
  await expectFocusedElementIsNotCovered(page, '.sticky-whatsapp');
  await expectNoHorizontalOverflow(page);

  await page.goto('/#/admin/inicio');
  await setEffectiveZoom(page, 2);
  const adminAction = page.getByRole('link', { name: 'Explorar Club' });
  await adminAction.focus();
  await expectFocusedElementIsNotCovered(page, '.bottom-nav');
  await expectNoHorizontalOverflow(page);
});
