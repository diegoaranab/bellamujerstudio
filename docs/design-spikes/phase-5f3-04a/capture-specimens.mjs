import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const specimenUrl = pathToFileURL(resolve(here, 'specimen.html'));
const outputDirectory = resolve(here, 'screenshots');
const widths = [390, 820, 1440];

async function verifySpecimen(page, system) {
  const expectedFonts =
    system === 'a'
      ? ['600 24px "Playfair Display"', '400 16px "Poppins"']
      : ['600 24px "Newsreader"', '400 16px "Source Sans 3"'];
  const result = await page.evaluate((fonts) => ({
    fonts: fonts.map((font) => [font, document.fonts.check(font)]),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }), expectedFonts);
  assert.deepEqual(
    result.fonts,
    expectedFonts.map((font) => [font, true]),
    `System ${system.toUpperCase()} did not load every requested real font`
  );
  assert.ok(result.overflow <= 0, `System ${system.toUpperCase()} has horizontal overflow`);
}

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  for (const system of ['a', 'b']) {
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const url = new URL(specimenUrl);
      url.searchParams.set('system', system);
      await page.goto(url.href, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await verifySpecimen(page, system);
      await page.screenshot({
        path: resolve(outputDirectory, `system-${system}-${width}.png`),
        fullPage: true
      });
      await page.close();
    }

    const scaledPage = await browser.newPage({ viewport: { width: 390, height: 1000 } });
    await scaledPage.emulateMedia({ reducedMotion: 'reduce' });
    const scaledUrl = new URL(specimenUrl);
    scaledUrl.searchParams.set('system', system);
    scaledUrl.searchParams.set('scale', '200');
    await scaledPage.goto(scaledUrl.href, { waitUntil: 'networkidle' });
    await scaledPage.evaluate(() => document.fonts.ready);
    await verifySpecimen(scaledPage, system);
    await scaledPage.screenshot({
      path: resolve(outputDirectory, `system-${system}-390-text-200.png`),
      fullPage: true
    });
    await scaledPage.close();
  }
} finally {
  await browser.close();
}
