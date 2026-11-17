import { expect, test, type Page } from '@playwright/test';

import { configuredClubClient, installConfiguredClubFixture } from './support/club-fixture';

const routes = {
  directory: '/#/admin/club/clientas',
  resumen: `/#/admin/club/clientas/${configuredClubClient.clientId}/resumen`,
  visita: `/#/admin/club/clientas/${configuredClubClient.clientId}/visita`,
  historial: `/#/admin/club/clientas/${configuredClubClient.clientId}/historial`,
  acceso: `/#/admin/club/clientas/${configuredClubClient.clientId}/acceso`
} as const;

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth
  }));
  expect(widths.body).toBeLessThanOrEqual(widths.viewport);
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
}

test.beforeEach(async ({ page }) => {
  await installConfiguredClubFixture(page);
});

test('configured Club keeps directory, selected context, route semantics, and visit inputs coherent', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(routes.visita);

  await expect(page.getByTestId('club-not-configured')).toHaveCount(0);
  await expect(page.getByTestId('selected-client-context')).toContainText(
    configuredClubClient.name
  );
  await expect(page.getByTestId('client-list')).toContainText(configuredClubClient.name);
  await expect(page.getByTestId('visit-no-client')).toHaveCount(0);
  await expect(page.getByTestId('visit-date')).toBeEnabled();
  await expect(page.getByTestId('visit-amount')).toBeEnabled();
  await expect(page.getByTestId('visit-eligible-amount')).toBeEnabled();
  await expect(
    page.getByTestId('club-workspace-nav').getByRole('link', { name: 'Visita' })
  ).toHaveAttribute('aria-current', 'page');
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.getByTestId('club-master-detail').locator('aside')).toBeHidden();
  await expect(page.getByTestId('visit-registration')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('captures the configured visual acceptance matrix', async ({ page }) => {
  const viewports = [
    { label: '390x844', width: 390, height: 844 },
    { label: '820x1180', width: 820, height: 1180 },
    { label: '1440x900', width: 1440, height: 900 }
  ] as const;

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const [view, route] of Object.entries(routes)) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1, name: 'Bella Mujer Club' })).toBeVisible();
      if (view === 'directory') {
        await expect(page.getByTestId('client-list')).toContainText(configuredClubClient.name);
      } else {
        await expect(page.getByTestId('selected-client-context')).toContainText(
          configuredClubClient.name
        );
      }
      await expectNoHorizontalOverflow(page);
      await page.waitForTimeout(750);
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        window.scrollTo(0, 0);
      });
      await page.screenshot({
        path: `test-results/phase5f3-09/screenshots/${viewport.label}-${view}.png`,
        animations: 'disabled'
      });
    }
  }
});
