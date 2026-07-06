import { expect, test, type Locator, type Page } from '@playwright/test';

const adminOnlyCopy = [
  'Panel Bella Mujer',
  'Operación diaria del estudio',
  'Nueva cita',
  'Define paquetes, precios y duración',
  '+ Agregar servicio'
];

const publicRoutes = [
  {
    path: '/#/',
    expectedUrl: /#\/$/,
    pageTestId: 'public-home-page',
    activeNavTestId: 'public-nav-home-link',
    title: 'Bella Mujer Studio | Uñas, pestañas, maquillaje y cabello en Tehuacán',
    description:
      'Estudio de belleza en Tehuacán, Puebla. Uñas, pestañas, maquillaje, peinado, cejas y cabello con atención por cita y contacto por WhatsApp.',
    ctaTestId: 'public-home-whatsapp-link'
  },
  {
    path: '/#/servicios',
    expectedUrl: /#\/servicios$/,
    pageTestId: 'public-services-page',
    activeNavTestId: 'public-nav-services-link',
    title: 'Servicios Bella Mujer Studio | Uñas, pestañas, maquillaje y cabello',
    description:
      'Conoce los servicios de Bella Mujer Studio en Tehuacán: uñas, pestañas, maquillaje, peinado, cejas, cabello y cuidado personal con atención por cita.',
    ctaTestId: 'public-services-whatsapp-link'
  },
  {
    path: '/#/galeria',
    expectedUrl: /#\/galeria$/,
    pageTestId: 'public-gallery-page',
    activeNavTestId: 'public-nav-gallery-link',
    title: 'Galería Bella Mujer Studio | Trabajos de uñas, maquillaje y cabello',
    description:
      'Explora trabajos reales de Bella Mujer Studio en Tehuacán: uñas, pestañas, maquillaje, peinado, cejas y cabello con atención por cita.',
    ctaTestId: 'public-gallery-whatsapp-link'
  },
  {
    path: '/#/contacto',
    expectedUrl: /#\/contacto$/,
    pageTestId: 'public-contact-page',
    activeNavTestId: 'public-nav-contact-link',
    title: 'Contacto Bella Mujer Studio | Agenda por WhatsApp en Tehuacán',
    description:
      'Contacta a Bella Mujer Studio en Tehuacán por WhatsApp para resolver dudas, revisar disponibilidad y cotizar servicios de belleza con cita previa.',
    ctaTestId: 'public-contact-whatsapp-link'
  },
  {
    path: '/#/tarjeta-regalo',
    expectedUrl: /#\/tarjeta-regalo$/,
    pageTestId: 'public-gift-card-page',
    activeNavTestId: 'public-nav-gift-card-link',
    title: 'Tarjeta regalo Bella Mujer Studio | Belleza en Tehuacán',
    description:
      'Regala una experiencia de belleza en Bella Mujer Studio Tehuacán con tarjeta de regalo y coordinación por WhatsApp.'
  }
];

const navLinks = [
  {
    testId: 'public-nav-home-link',
    name: 'Inicio',
    expectedUrl: /#\/$/,
    expectedPageTestId: 'public-home-page'
  },
  {
    testId: 'public-nav-services-link',
    name: 'Servicios',
    expectedUrl: /#\/servicios$/,
    expectedPageTestId: 'public-services-page'
  },
  {
    testId: 'public-nav-gallery-link',
    name: 'Galería',
    expectedUrl: /#\/galeria$/,
    expectedPageTestId: 'public-gallery-page'
  },
  {
    testId: 'public-nav-contact-link',
    name: 'Contacto',
    expectedUrl: /#\/contacto$/,
    expectedPageTestId: 'public-contact-page'
  },
  {
    testId: 'public-nav-gift-card-link',
    name: 'Tarjeta de regalo',
    expectedUrl: /#\/tarjeta-regalo$/,
    expectedPageTestId: 'public-gift-card-page'
  }
];

const mobileViewports = [
  { width: 390, height: 844 },
  { width: 375, height: 812 },
  { width: 360, height: 800 }
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
});

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth
  }));

  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
}

async function expectMobilePublicNavUsability(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => {
    const header = document.querySelector('.public-header');
    const nav = document.querySelector<HTMLElement>('[data-testid="public-nav"]');
    const publicNavLinks = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid^="public-nav-"][data-testid$="-link"]:not([data-testid="public-nav-whatsapp-link"])'
      )
    );

    const navStyles = nav ? getComputedStyle(nav) : null;
    const headerRect = header?.getBoundingClientRect();
    const navRect = nav?.getBoundingClientRect();
    const linkRects = publicNavLinks.map((link) => {
      const rect = link.getBoundingClientRect();

      return {
        height: rect.height,
        top: rect.top
      };
    });

    return {
      headerHeight: headerRect?.height ?? 0,
      linkCount: linkRects.length,
      maxLinkHeight: Math.max(...linkRects.map((rect) => rect.height)),
      maxLinkTop: Math.max(...linkRects.map((rect) => rect.top)),
      minLinkHeight: Math.min(...linkRects.map((rect) => rect.height)),
      minLinkTop: Math.min(...linkRects.map((rect) => rect.top)),
      navClientWidth: nav?.clientWidth ?? 0,
      navFlexWrap: navStyles?.flexWrap ?? null,
      navOverflowX: navStyles?.overflowX ?? null,
      navScrollWidth: nav?.scrollWidth ?? 0,
      navWidth: navRect?.width ?? 0,
      viewportWidth: window.innerWidth
    };
  });

  expect(metrics.headerHeight).toBeGreaterThan(0);
  expect(metrics.headerHeight).toBeLessThan(150);
  expect(metrics.linkCount).toBe(navLinks.length);
  expect(metrics.navFlexWrap).toBe('nowrap');
  expect(['auto', 'scroll']).toContain(metrics.navOverflowX);
  expect(metrics.navWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.navClientWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.navScrollWidth).toBeGreaterThanOrEqual(metrics.navClientWidth);
  expect(metrics.maxLinkTop - metrics.minLinkTop).toBeLessThan(4);
  expect(metrics.minLinkHeight).toBeGreaterThanOrEqual(34);
  expect(metrics.maxLinkHeight).toBeLessThanOrEqual(48);
}

async function expectAdminShellAbsent(page: Page): Promise<void> {
  await expect(page.getByTestId('admin-shell')).toHaveCount(0);
  await expect(page.locator('.topbar')).toHaveCount(0);

  for (const copy of adminOnlyCopy) {
    await expect(page.locator('body')).not.toContainText(copy);
  }
}

async function expectPublicNav(page: Page): Promise<Locator> {
  const nav = page.getByTestId('public-nav');

  await expect(nav).toBeVisible();

  for (const link of navLinks) {
    await expect(page.getByTestId(link.testId)).toBeVisible();
    await expect(page.getByTestId(link.testId)).toContainText(link.name);
  }

  const whatsappLink = page.getByTestId('public-nav-whatsapp-link');
  await expect(whatsappLink).toBeVisible();
  await expect(whatsappLink).toContainText('WhatsApp');
  await expect(whatsappLink).toHaveAttribute('href', /https:\/\/wa\.me\/522381117950/);
  await expect(whatsappLink).toHaveAttribute('target', '_blank');
  await expect(whatsappLink).toHaveAttribute('rel', /noopener/);
  await expect(whatsappLink).not.toHaveAttribute('aria-current', 'page');

  return nav;
}

test('public routes render the public shell, current nav state, metadata, and no desktop overflow', async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const route of publicRoutes) {
    await page.goto(route.path);

    await expect(page).toHaveURL(route.expectedUrl);
    await expect(page).toHaveTitle(route.title);
    await expect(page.getByTestId('public-shell')).toBeVisible();
    await expect(page.getByTestId(route.pageTestId)).toBeVisible();
    await expectAdminShellAbsent(page);
    await expectPublicNav(page);

    const description = await page.evaluate(
      () => document.head.querySelector('meta[name="description"]')?.getAttribute('content') ?? null
    );
    expect(description).toBe(route.description);

    const activeLink = page.getByTestId(route.activeNavTestId);
    await expect(activeLink).toHaveAttribute('aria-current', 'page');
    await expect(activeLink).toHaveClass(/public-nav__link--active/);

    for (const link of navLinks.filter((link) => link.testId !== route.activeNavTestId)) {
      await expect(page.getByTestId(link.testId)).not.toHaveAttribute('aria-current', 'page');
    }

    if (route.path !== '/#/') {
      await expect(page.getByTestId('public-nav-home-link')).not.toHaveAttribute(
        'aria-current',
        'page'
      );
    }

    if (route.ctaTestId) {
      const cta = page.getByTestId(route.ctaTestId).first();
      await expect(cta).toBeVisible();
      await expect(cta).toHaveAttribute('href', /https:\/\/wa\.me\/522381117950/);
      await expect(cta).toHaveAttribute('target', '_blank');
      await expect(cta).toHaveAttribute('rel', /noopener/);
    }

    await expectNoHorizontalOverflow(page);
  }
});

test('public nav routes between all public pages without opening WhatsApp', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const route of publicRoutes) {
    for (const link of navLinks) {
      await page.goto(route.path);
      await page.getByTestId(link.testId).click();

      await expect(page).toHaveURL(link.expectedUrl);
      await expect(page.getByTestId(link.expectedPageTestId)).toBeVisible();
      await expect(page.getByTestId(link.testId)).toHaveAttribute('aria-current', 'page');
    }
  }
});

test('public routes keep usable mobile nav and avoid horizontal overflow', async ({ page }) => {
  for (const viewport of mobileViewports) {
    await page.setViewportSize(viewport);

    for (const route of publicRoutes) {
      await page.goto(route.path);

      await expect(page.getByTestId('public-shell')).toBeVisible();
      await expect(page.getByTestId(route.pageTestId)).toBeVisible();
      await expect(page.getByTestId('public-nav')).toBeVisible();

      for (const link of navLinks) {
        await expect(page.getByTestId(link.testId)).toBeVisible();
      }

      await expect(page.getByTestId(route.activeNavTestId)).toHaveAttribute(
        'aria-current',
        'page'
      );
      await expectAdminShellAbsent(page);
      await expectMobilePublicNavUsability(page);
      await expectNoHorizontalOverflow(page);
    }
  }
});

test('public crawl files remain homepage-only for hash-routed public children', async ({
  page
}) => {
  const robotsResponse = await page.request.get('/robots.txt');
  const sitemapResponse = await page.request.get('/sitemap.xml');

  expect(robotsResponse.ok()).toBeTruthy();
  expect(sitemapResponse.ok()).toBeTruthy();

  const robots = await robotsResponse.text();
  const sitemap = await sitemapResponse.text();

  expect(robots).toContain('Sitemap: https://diegoaranab.github.io/bellamujerstudio/sitemap.xml');
  expect(sitemap).toContain('<loc>https://diegoaranab.github.io/bellamujerstudio/</loc>');
  expect(sitemap).not.toContain('/servicios');
  expect(sitemap).not.toContain('/galeria');
  expect(sitemap).not.toContain('/contacto');
  expect(sitemap).not.toContain('/tarjeta-regalo');
  expect(sitemap).not.toContain('admin');
  expect(sitemap).not.toContain('#/admin');
});
