import { expect, test, type Locator, type Page } from '@playwright/test';

const routes = [
  { path: '/#/', heading: 'Belleza cuidada, con cita y atención cercana.' },
  { path: '/#/servicios', heading: 'Servicios de belleza en Bella Mujer Studio' },
  { path: '/#/galeria', heading: 'Trabajos reales de Bella Mujer Studio' },
  { path: '/#/contacto', heading: 'Agenda tu cita en Bella Mujer Studio' },
  { path: '/#/tarjeta-regalo', heading: 'Tarjeta regalo Bella Mujer' }
];

async function tabTo(page: Page, target: Locator, limit = 25): Promise<void> {
  for (let attempt = 0; attempt < limit; attempt += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error('Keyboard focus never reached the expected control');
}

test('public routes expose a named navigation, main region, and one page heading', async ({ page }) => {
  for (const route of routes) {
    await page.goto(route.path);
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navegación pública' })).toBeVisible();
    await expect(main.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(main.getByRole('heading', { level: 1, name: route.heading })).toBeVisible();
    await expect(main.getByRole('heading', { level: 2 }).first()).toBeVisible();
  }
});

test('header navigation and the primary customer action accept keyboard focus', async ({ page }) => {
  await page.goto('/#/');
  const nav = page.getByRole('navigation', { name: 'Navegación pública' });
  for (const name of ['Inicio', 'Servicios', 'Galería', 'Contacto', 'Tarjeta de regalo']) {
    const link = nav.getByRole('link', { name, exact: true });
    await expect(link).toBeVisible();
    await tabTo(page, link);
    await expect(link).toBeFocused();
    expect(await link.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
  }
  await tabTo(page, nav.getByRole('link', { name: 'WhatsApp' }));
  await expect(nav.getByRole('link', { name: 'WhatsApp' })).toBeFocused();
  const heroAction = page.getByTestId('public-home-whatsapp-link').first();
  await tabTo(page, heroAction);
  await expect(heroAction).toHaveAccessibleName(/WhatsApp/i);
  await expect(heroAction).toBeFocused();
});

test('contact WhatsApp action has a name and accepts keyboard focus', async ({ page }) => {
  await page.goto('/#/contacto');
  const action = page.getByRole('link', { name: 'Escribir por WhatsApp a Bella Mujer Studio' }).first();
  await tabTo(page, action);
  await expect(action).toBeFocused();
  await expect(action).toHaveAttribute('href', /^https:\/\/wa\.me\//);
});

test('gift-card controls have names and keyboard interaction reaches the submit button', async ({ page }) => {
  await page.goto('/#/tarjeta-regalo');
  const fields = [
    'Nombre de quien regala', 'WhatsApp de quien regala', 'Email opcional',
    'Nombre de mamá o persona que recibe', 'WhatsApp de quien recibe opcional',
    'Mensaje para la tarjeta opcional'
  ];
  for (const name of fields) {
    const field = page.getByLabel(name, { exact: true });
    await tabTo(page, field);
    await expect(field).toBeFocused();
  }
  const presets = page.getByTestId('amount-preset-button');
  await expect(presets).toHaveCount(4);
  for (const preset of await presets.all()) {
    await expect(preset).toHaveAccessibleName(/\$\d/);
    await tabTo(page, preset);
    await expect(preset).toBeFocused();
  }
  await tabTo(page, page.getByLabel('Otro monto'));
  const submit = page.getByRole('button', { name: 'Enviar solicitud por WhatsApp' });
  await tabTo(page, submit);
  await expect(submit).toBeFocused();
  // Focus can continue past the form, so it does not trap keyboard users.
  await page.keyboard.press('Tab');
  await expect(submit).not.toBeFocused();
});

test('empty gift-card submission exposes required errors and invalid inputs', async ({ page }) => {
  await page.goto('/#/tarjeta-regalo');
  await page.getByRole('button', { name: 'Enviar solicitud por WhatsApp' }).click();
  for (const name of ['Nombre de quien regala', 'WhatsApp de quien regala', 'Nombre de mamá o persona que recibe']) {
    await expect(page.getByLabel(name, { exact: true })).toHaveAttribute('aria-invalid', 'true');
  }
  await expect(page.getByText('Este nombre es obligatorio.')).toHaveCount(2);
  await expect(page.getByText('El WhatsApp es obligatorio.')).toBeVisible();
  await expect(page.getByTestId('success-state')).toHaveCount(0);
});

test('mobile navigation and customer controls remain usable within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const route of routes) {
    await page.goto(route.path);
    const controls = [
      ...await page.getByRole('navigation', { name: 'Navegación pública' }).getByRole('link').filter({ visible: true }).all(),
      route.path === '/#/tarjeta-regalo'
        ? page.getByRole('button', { name: 'Enviar solicitud por WhatsApp' })
        : page.getByTestId(route.path === '/#/' ? 'public-home-whatsapp-link' :
            route.path === '/#/servicios' ? 'public-services-whatsapp-link' :
            route.path === '/#/galeria' ? 'public-gallery-whatsapp-link' :
            'public-contact-whatsapp-link').first()
    ];
    for (const control of controls) {
      await expect(control).toBeVisible();
      await control.scrollIntoViewIfNeeded();
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(24);
      expect(box!.height).toBeGreaterThanOrEqual(24);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(376);
    }
  }
});
