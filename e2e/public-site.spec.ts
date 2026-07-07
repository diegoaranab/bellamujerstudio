import { expect, test, type Locator, type Page } from '@playwright/test';

type BoundingBox = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

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
    expectedPageTestId: 'public-home-page',
    heading: 'Belleza cuidada, con cita y atención cercana.'
  },
  {
    testId: 'public-nav-services-link',
    name: 'Servicios',
    expectedUrl: /#\/servicios$/,
    expectedPageTestId: 'public-services-page',
    heading: 'Servicios de belleza en Bella Mujer Studio'
  },
  {
    testId: 'public-nav-gallery-link',
    name: 'Galería',
    expectedUrl: /#\/galeria$/,
    expectedPageTestId: 'public-gallery-page',
    heading: 'Trabajos reales de Bella Mujer Studio'
  },
  {
    testId: 'public-nav-contact-link',
    name: 'Contacto',
    expectedUrl: /#\/contacto$/,
    expectedPageTestId: 'public-contact-page',
    heading: 'Agenda tu cita en Bella Mujer Studio'
  },
  {
    testId: 'public-nav-gift-card-link',
    name: 'Tarjeta de regalo',
    expectedUrl: /#\/tarjeta-regalo$/,
    expectedPageTestId: 'public-gift-card-page',
    heading: 'Tarjeta regalo Bella Mujer'
  }
];

const publicRoutesWithQueryParams = [
  {
    path: '/#/servicios?utm_source=instagram',
    expectedUrl: /#\/servicios\?utm_source=instagram$/,
    activeNavTestId: 'public-nav-services-link'
  },
  {
    path: '/#/galeria?utm_source=instagram',
    expectedUrl: /#\/galeria\?utm_source=instagram$/,
    activeNavTestId: 'public-nav-gallery-link'
  },
  {
    path: '/#/contacto?utm_source=instagram',
    expectedUrl: /#\/contacto\?utm_source=instagram$/,
    activeNavTestId: 'public-nav-contact-link'
  },
  {
    path: '/#/tarjeta-regalo?utm_source=instagram',
    expectedUrl: /#\/tarjeta-regalo\?utm_source=instagram$/,
    activeNavTestId: 'public-nav-gift-card-link'
  },
  {
    path: '/#/?utm_source=instagram',
    expectedUrl: /#\/\?utm_source=instagram$/,
    activeNavTestId: 'public-nav-home-link'
  }
];

const mobileViewports = [
  { width: 390, height: 844 },
  { width: 375, height: 812 },
  { width: 360, height: 800 }
];

const heroCollageRegressionViewports = [
  { width: 1280, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 900 },
  { width: 512, height: 720 },
  ...mobileViewports
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

function boxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
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

async function expectPageNearTop(page: Page, heading: string): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(120);

  const headingLocator = page.getByRole('heading', { level: 1, name: heading });
  await expect(headingLocator).toBeVisible();

  const headingTop = await headingLocator.evaluate((element) => element.getBoundingClientRect().top);
  expect(headingTop).toBeLessThan(450);
  expect(headingTop).toBeGreaterThanOrEqual(0);
}

async function scrollNearBottom(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
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

test('public nav active state ignores query params while keeping exact paths', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const route of publicRoutesWithQueryParams) {
    await page.goto(route.path);

    await expect(page).toHaveURL(route.expectedUrl);
    await expectPublicNav(page);

    await expect(page.getByTestId(route.activeNavTestId)).toHaveAttribute('aria-current', 'page');

    for (const link of navLinks.filter((link) => link.testId !== route.activeNavTestId)) {
      await expect(page.getByTestId(link.testId)).not.toHaveAttribute('aria-current', 'page');
    }

    await expect(page.getByTestId('public-nav-whatsapp-link')).not.toHaveAttribute(
      'aria-current',
      'page'
    );
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

test('public nav route changes reset scroll to the destination page top', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const link of navLinks.filter((link) => link.testId !== 'public-nav-home-link')) {
    await page.goto('/#/');
    await expect(page.getByTestId('public-home-page')).toBeVisible();
    await scrollNearBottom(page);
    await page.getByTestId(link.testId).click();

    await expect(page).toHaveURL(link.expectedUrl);
    await expect(page.getByTestId(link.expectedPageTestId)).toBeVisible();
    await expectPageNearTop(page, link.heading);
  }

  await page.goto('/#/galeria');
  await expect(page.getByTestId('public-gallery-page')).toBeVisible();
  await scrollNearBottom(page);
  const homeLink = navLinks.find((link) => link.testId === 'public-nav-home-link');

  if (!homeLink) {
    throw new Error('Home nav link configuration was not found.');
  }

  await page.getByTestId(homeLink.testId).click();

  await expect(page).toHaveURL(homeLink.expectedUrl);
  await expect(page.getByTestId(homeLink.expectedPageTestId)).toBeVisible();
  await expectPageNearTop(page, homeLink.heading);
});

test('homepage CTA route changes reset scroll to the destination page top', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  const ctaLinks = [
    {
      sectionTestId: 'public-home-contact',
      name: 'Ver contacto',
      expectedUrl: /#\/contacto$/,
      expectedPageTestId: 'public-contact-page',
      heading: 'Agenda tu cita en Bella Mujer Studio'
    },
    {
      sectionTestId: 'public-home-gallery',
      name: 'Ver galería completa',
      expectedUrl: /#\/galeria$/,
      expectedPageTestId: 'public-gallery-page',
      heading: 'Trabajos reales de Bella Mujer Studio'
    },
    {
      sectionTestId: 'public-home-services',
      name: 'Ver todos los servicios',
      expectedUrl: /#\/servicios$/,
      expectedPageTestId: 'public-services-page',
      heading: 'Servicios de belleza en Bella Mujer Studio'
    }
  ];

  for (const cta of ctaLinks) {
    await page.goto('/#/');
    await page.getByTestId(cta.sectionTestId).scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    await page.getByRole('link', { name: cta.name }).click();

    await expect(page).toHaveURL(cta.expectedUrl);
    await expect(page.getByTestId(cta.expectedPageTestId)).toBeVisible();
    await expectPageNearTop(page, cta.heading);
  }
});

test('homepage hero collage badge does not overlap category labels across layouts', async ({
  page
}) => {
  for (const viewport of heroCollageRegressionViewports) {
    await page.setViewportSize(viewport);
    await page.goto('/#/');

    await expect(page.getByTestId('public-home-page')).toBeVisible();

    const heroImages = page.getByTestId('public-hero-image');
    await expect(heroImages).toHaveCount(4);

    for (let index = 0; index < 4; index += 1) {
      await expect(heroImages.nth(index)).toBeVisible();
    }

    const maquillajeLabel = page.locator('.hero-collage__item figcaption', {
      hasText: 'Maquillaje y peinado'
    });
    await expect(maquillajeLabel).toBeVisible();

    const badge = page.locator('.hero-collage__badge');
    await expect(badge).toBeVisible();

    const badgeBox = await badge.boundingBox();
    expect(badgeBox).not.toBeNull();

    const badgeBounds: BoundingBox = {
      left: badgeBox!.x,
      right: badgeBox!.x + badgeBox!.width,
      top: badgeBox!.y,
      bottom: badgeBox!.y + badgeBox!.height
    };

    const labels = page.locator('.hero-collage__item figcaption');
    await expect(labels).toHaveCount(4);

    for (let index = 0; index < 4; index += 1) {
      const label = labels.nth(index);
      await expect(label).toBeVisible();

      const labelBox = await label.boundingBox();
      expect(labelBox).not.toBeNull();

      const labelBounds: BoundingBox = {
        left: labelBox!.x,
        right: labelBox!.x + labelBox!.width,
        top: labelBox!.y,
        bottom: labelBox!.y + labelBox!.height
      };

      expect(boxesOverlap(badgeBounds, labelBounds)).toBe(false);
    }

    await expectNoHorizontalOverflow(page);
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
