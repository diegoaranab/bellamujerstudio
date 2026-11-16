import assert from 'node:assert/strict';
import { mkdir, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const screenshotDirectory = resolve(here, 'screenshots');
const origin = 'http://127.0.0.1:4200';
const widths = [390, 820, 1440];

function syntheticCredential(byte) {
  const value = Buffer.alloc(32, byte).toString('base64url');

  if (value.length !== 43) {
    throw new Error(`Unexpected credential length: ${value.length}`);
  }

  return value;
}

const memberAccess = syntheticCredential(0x00);
const memberInvite = syntheticCredential(0x01);
const surfaces = [
  { name: 'public', route: '/#/', heading: 'main h1', expectedHeading: 'Newsreader' },
  { name: 'admin', route: '/#/admin/inicio', heading: '[data-testid="admin-shell"] h1', expectedHeading: 'Source Sans 3' },
  {
    name: 'member',
    route: `/#/club/activar?access=${memberAccess}&invite=${memberInvite}`,
    heading: '[data-testid="member-club-access"] h1',
    expectedHeading: 'Newsreader'
  }
];

await mkdir(screenshotDirectory, { recursive: true });

function describeFont(value) {
  return `${value.fontFamily} / ${value.fontSize} / ${value.fontWeight}`;
}

async function waitForApp(page) {
  await page.locator('app-root').waitFor({ state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

async function assertFonts(page, surface) {
  const result = await page.evaluate(async ({ headingSelector, expectedHeading }) => {
    const approvedFaces = [
      '500 16px "Newsreader"',
      '600 16px "Newsreader"',
      '400 16px "Source Sans 3"',
      '600 16px "Source Sans 3"',
      '700 16px "Source Sans 3"'
    ];
    await Promise.all(approvedFaces.map((face) => document.fonts.load(face)));
    await document.fonts.ready;
    const heading = document.querySelector(headingSelector);
    const body = getComputedStyle(document.body);
    const controls = [...document.querySelectorAll('button, input, select, textarea')];
    const resolved = [...document.fonts].map((font) => `${font.family}:${font.weight}:${font.status}`);
    const checks = approvedFaces.map((face) => document.fonts.check(face));
    return {
      heading: heading ? getComputedStyle(heading).fontFamily : '',
      body: body.fontFamily,
      controls: controls.slice(0, 12).map((element) => getComputedStyle(element).fontFamily),
      resolved,
      checks,
      expectedHeading
    };
  }, { headingSelector: surface.heading, expectedHeading: surface.expectedHeading });

  assert.ok(result.heading, `${surface.name}: required heading was not found`);
  assert.match(result.heading, new RegExp(result.expectedHeading.replace(/[ .*+?^${}()|[\]\\]/g, '\\$&')),
    `${surface.name}: heading font was ${result.heading}`);
  assert.match(result.body, /Source Sans 3/, `${surface.name}: body font was ${result.body}`);
  assert.ok(result.checks.every(Boolean), `${surface.name}: approved production font faces did not resolve: ${result.resolved.join(', ')}`);
  if (surface.name === 'admin') {
    assert.ok(result.controls.every((font) => /Source Sans 3/.test(font)),
      `${surface.name}: a control did not use Source Sans 3: ${result.controls.join('; ')}`);
  }
  if (surface.name === 'member') {
    assert.ok(result.controls.some((font) => /Source Sans 3/.test(font)),
      `${surface.name}: no representative form/control used Source Sans 3: ${result.controls.join('; ')}`);
  }
  console.log(`[fonts] ${surface.name}: heading=${describeFont({ fontFamily: result.heading, fontSize: 'computed', fontWeight: 'computed' })}; body=${result.body}`);
}

async function assertMemberEnrollment(page) {
  await page.locator('[data-testid="member-enrollment"]').waitFor({ state: 'visible' });
  const invalidLink = page.locator('[data-testid="member-invalid-link"]');
  assert.equal(await invalidLink.count(), 0, 'member: invalid-link state exists for canonical credentials');
}

async function assertNoOverflow(page, label) {
  const result = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll('body *')].map((element) => {
      const box = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        id: element.id,
        className: typeof element.className === 'string' ? element.className : '',
        left: Math.round(box.left),
        right: Math.round(box.right),
        width: Math.round(box.width)
      };
    }).filter((box) => box.width > 0 && (box.left < -1 || box.right > viewport + 1)).slice(0, 12);
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: viewport,
      offenders
    };
  });
  if (result.scrollWidth > result.clientWidth) {
    console.error(`[overflow] ${label}: scrollWidth=${result.scrollWidth}, clientWidth=${result.clientWidth}`);
    console.error(JSON.stringify(result.offenders, null, 2));
    assert.fail(`${label}: horizontal overflow`);
  }
}

const browser = await chromium.launch({ headless: true });
try {
  for (const surface of surfaces) {
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${origin}${surface.route}`, { waitUntil: 'domcontentloaded' });
      await waitForApp(page);
      if (surface.name === 'member') {
        await assertMemberEnrollment(page);
      }
      await assertFonts(page, surface);
      await assertNoOverflow(page, `${surface.name}-${width}`);
      await page.screenshot({ path: resolve(screenshotDirectory, `${surface.name}-${width}.png`), fullPage: true });
      await page.close();
    }

    const zoomed = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await zoomed.emulateMedia({ reducedMotion: 'reduce' });
    await zoomed.goto(`${origin}${surface.route}`, { waitUntil: 'domcontentloaded' });
    await waitForApp(zoomed);
    if (surface.name === 'member') {
      await assertMemberEnrollment(zoomed);
    }
    await zoomed.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await zoomed.waitForTimeout(150);
    await assertFonts(zoomed, surface);
    await assertNoOverflow(zoomed, `${surface.name}-390-200`);
    const effectiveZoom = await zoomed.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
    }));
    assert.ok(effectiveZoom.reducedMotion, `${surface.name}: reduced motion was not active`);
    console.log(`[zoom] ${surface.name}: automated effective 200% CSS zoom approximation; reduced motion=${effectiveZoom.reducedMotion}`);
    await zoomed.screenshot({ path: resolve(screenshotDirectory, `${surface.name}-390-200.png`), fullPage: true });
    await zoomed.close();
  }
} finally {
  await browser.close();
}

const required = surfaces.flatMap(({ name }) => [
  ...widths.map((width) => `${name}-${width}.png`),
  `${name}-390-200.png`
]);
for (const filename of required) {
  const file = await stat(resolve(screenshotDirectory, filename));
  assert.ok(file.size > 0, `Screenshot is empty: ${filename}`);
}
console.log(`[screenshots] captured and verified ${required.length} actual-app screenshots in ${screenshotDirectory}`);
