import { expect, test, type Locator, type Page } from '@playwright/test';

type Rgb = { alpha: number; blue: number; green: number; red: number };

function parseRgb(value: string): Rgb {
  const match = value.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/
  );
  if (!match) throw new Error(`Expected a rendered rgb/rgba color, received: ${value}`);
  return {
    red: Number(match[1]), green: Number(match[2]), blue: Number(match[3]),
    alpha: match[4] === undefined ? 1 : Number(match[4])
  };
}

function relativeLuminance(color: Rgb): number {
  const linearize = (channel: number): number => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(color.red) + 0.7152 * linearize(color.green) +
    0.0722 * linearize(color.blue);
}

function contrastRatio(first: Rgb, second: Rgb): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05);
}

async function effectivePanelBackground(control: Locator): Promise<string> {
  return control.evaluate((element) => {
    const panel = element.closest('.contact-panel');
    if (!(panel instanceof HTMLElement)) throw new Error('Contact panel was not found');
    return getComputedStyle(panel).backgroundColor;
  });
}

async function renderedContrast(control: Locator): Promise<number> {
  const [foreground, background] = await Promise.all([
    control.evaluate((element) => getComputedStyle(element).color),
    effectivePanelBackground(control)
  ]);
  return contrastRatio(parseRgb(foreground), parseRgb(background));
}

async function tabTo(page: Page, target: Locator, limit = 30): Promise<void> {
  for (let attempt = 0; attempt < limit; attempt += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error('Keyboard focus never reached the expected control');
}

test('home contact secondary CTA keeps AA contrast and visible focus treatment', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/#/');
    const section = page.getByTestId('public-home-contact');
    const link = section.getByRole('link', { name: 'Ver contacto' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', /#\/contacto$/);
    const panel = section.locator('.contact-panel');
    const panelBox = await panel.boundingBox();
    const linkBox = await link.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(linkBox).not.toBeNull();
    expect(linkBox!.x).toBeGreaterThanOrEqual(panelBox!.x);
    expect(linkBox!.x + linkBox!.width).toBeLessThanOrEqual(panelBox!.x + panelBox!.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    expect(await renderedContrast(link)).toBeGreaterThanOrEqual(4.5);
    await link.hover();
    expect(await renderedContrast(link)).toBeGreaterThanOrEqual(4.5);
    await tabTo(page, link);
    await expect(link).toBeFocused();
    expect(await renderedContrast(link)).toBeGreaterThanOrEqual(4.5);
    const focusStyles = await link.evaluate((element) => {
      const styles = getComputedStyle(element);
      return { outlineColor: styles.outlineColor, outlineStyle: styles.outlineStyle, outlineWidth: styles.outlineWidth };
    });
    expect(focusStyles.outlineStyle).not.toBe('none');
    expect(parseRgb(focusStyles.outlineColor).alpha).toBeGreaterThan(0);
    expect(parseFloat(focusStyles.outlineWidth)).toBeGreaterThanOrEqual(2);
  }
});

test('home contact CTA remains operable at 200 percent effective zoom', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/');
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  const link = page.getByTestId('public-home-contact').getByRole('link', { name: 'Ver contacto' });
  await expect(link).toBeVisible();
  const box = await link.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeVisible();
  await tabTo(page, link);
  await expect(link).toBeFocused();
});
