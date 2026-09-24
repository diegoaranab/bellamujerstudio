import { expect, test } from '@playwright/test';

test('transitional admin login explains local mode and continues to the panel', async ({ page }) => {
  await page.goto('/#/admin/login?returnUrl=%2Fadmin%2Fclientes');

  await expect(page.getByRole('heading', { name: 'Panel Bella Mujer' })).toBeVisible();
  await expect(page.getByText(/acceso local es transitorio/i)).toBeVisible();

  await page.getByRole('button', { name: 'Continuar al panel' }).click();

  await expect(page).toHaveURL(/#\/admin\/clientes$/);
  await expect(page.getByTestId('admin-shell')).toBeVisible();
});
