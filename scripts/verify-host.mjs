import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const themes = JSON.parse(await readFile(path.join(root, 'lib/themes.json'), 'utf8'));
const prefix = process.env.WHALE_QA_PREFIX || 'qa';
const hostVersion = process.env.WHALE_QA_VERSION || '0.2.1-rc.2';
const log = await readFile(path.join(root, '../' + prefix + '-server.log'), 'utf8');
const target = log.match(/http:\/\/127\.0\.0\.1:\d+\/[^\s]*/)?.[0];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 960 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const failures = [];
const pluginResponses = [];
page.on('response', response => { if (response.url().includes('/plugins/') && response.url().includes('dsh-whale-gallery')) pluginResponses.push(response); });
page.on('response', response => { if (response.url().includes('/skin-assets/whale-gallery/') && response.status() !== 200 && response.status() !== 304) failures.push(response.status() + ' ' + new URL(response.url()).pathname); });
const shots = path.join(root, '../' + prefix + '-shots');
await mkdir(path.join(shots, 'themes'), { recursive: true });
const check = async (condition, message) => assert.ok(await condition, message);
const skin = () => page.locator('body').getAttribute('data-dsh-whale-gallery');
async function settle() { await page.waitForTimeout(150); }
async function open() { await page.getByRole('button', { name: '打开鲸鱼娘主题馆', exact: true }).click(); await page.locator('.wg-dialog[open]').waitFor(); }
async function close() { await page.getByRole('button', { name: '关闭主题馆', exact: true }).click(); await page.locator('.wg-dialog[open]').waitFor({ state: 'hidden' }); }
await page.goto(target, { waitUntil: 'networkidle' });
if (await page.getByRole('button', { name: '继续', exact: true }).count()) { await page.getByRole('button', { name: '继续', exact: true }).click(); await page.waitForTimeout(300); }
if (await page.getByRole('button', { name: '关闭', exact: true }).count()) { await page.getByRole('button', { name: '关闭', exact: true }).first().click(); await settle(); }
await check((await skin()) === 'celadon', 'default theme');
const candidate = await readFile(path.join(root, 'lib/client.js'), 'utf8');
const servedBodies = await Promise.all(pluginResponses.map(response => response.text()));
assert.ok(servedBodies.some(body => body.includes(candidate.trim())), 'host must serve the exact candidate client in its combined plugin response');
const themeResults = [];
function contrast(first, second) {
  const lum = color => { const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; };
  const a = lum(first), b = lum(second); return (Math.max(a,b) + .05) / (Math.min(a,b) + .05);
}
for (const theme of themes) {
  await open();
  assert.equal(await page.locator('.wg-dialog .wg-card').count(), 13);
  await page.locator(`.wg-dialog .wg-card[data-theme-id="${theme.id}"]`).click();
  assert.equal(await skin(), theme.id);
  assert.equal(await page.locator('.wg-scene').count(), 1);
  await close();
  await page.evaluate(url => new Promise((resolve, reject) => { const image = new Image(); image.onload = resolve; image.onerror = reject; image.src = url; }), theme.image);
  const editor = page.locator('[data-composer-input]');
  assert.ok(await editor.isVisible());
  const card = await page.locator('[data-composer-card]').boundingBox();
  assert.ok(card.x >= 280 && card.x + card.width <= 1050, 'hero composer leaves room for heroine');
  await settle();
  await page.screenshot({ path: path.join(shots, 'themes', theme.id + '.png') });
  const buttonColors = await page.locator('[data-slot="sidebar"] button[class*="_newSession"]').evaluate(element => ({color:getComputedStyle(element).color,background:getComputedStyle(element).backgroundColor}));
  const buttonContrast = contrast(buttonColors.color, buttonColors.background);
  assert.ok(buttonContrast >= 4.5, 'readable native New Session button: ' + theme.id + ' / ' + buttonContrast);
  themeResults.push({ id: theme.id, name: theme.name, loaded: true, composer: card, newSessionContrast: buttonContrast });
}
await page.reload({ waitUntil: 'networkidle' });
assert.equal(await skin(), 'neon-konbini', 'theme survives reload');
const draft = '这是一段皮肤验证草稿，检查输入与主题切换。';
await page.locator('[data-composer-input]').fill(draft);
// A clean test profile has no model account; DSH opens its own setup prompt on first input.
if (await page.getByRole('button', { name: '关闭', exact: true }).count()) await page.getByRole('button', { name: '关闭', exact: true }).first().click();
await open();
await page.locator('.wg-dialog .wg-card[data-theme-id="celadon"]').click();
await close();
assert.equal(await page.locator('[data-composer-input]').innerText(), draft, 'native input survives skin switch');
await page.locator('[data-composer-input]').fill('');
await open();
await page.locator('.wg-dialog select[aria-label="明暗配色"]').selectOption('dark');
assert.equal(await page.locator('body').getAttribute('data-wg-mode'), 'dark');
await page.screenshot({ path: path.join(shots, 'gallery-dark.png') });
await page.locator('.wg-dialog select[aria-label="明暗配色"]').selectOption('light');
await page.locator('.wg-dialog input[aria-label="搜索主题"]').fill('温室');
assert.equal(await page.locator('.wg-dialog .wg-card').count(), 1);
await page.locator('.wg-dialog input[aria-label="搜索主题"]').fill('');
await page.getByRole('button', { name: '恢复官方外观', exact: true }).click();
assert.equal(await skin(), null);
assert.ok(await page.locator('.wg-scene').evaluate(element => element.hidden));
await page.locator('.wg-dialog .wg-card[data-theme-id="celadon"]').click();
await page.locator('.wg-dialog select[aria-label="明暗配色"]').selectOption('theme');
await page.locator('.wg-dialog').evaluate(element => { element.scrollTop = 0; });
await page.screenshot({ path: path.join(shots, 'gallery.png') });
await close();
assert.equal(await page.locator(':focus').getAttribute('aria-label'), '打开鲸鱼娘主题馆', 'dialog returns keyboard focus');
await page.getByRole('button', { name: '账号菜单', exact: true }).click();
const settings = page.getByRole('menuitem', { name: /设置/ });
if (await settings.count()) {
  await settings.first().click();
  const nav = page.getByText('鲸鱼娘主题馆', { exact: true }).filter({ visible: true });
  await nav.first().click();
  assert.equal(await page.locator('.wg-gallery:visible .wg-card').count(), 13);
  await page.screenshot({ path: path.join(shots, 'native-settings.png') });
  await page.keyboard.press('Escape');
  if (await page.getByRole('button', { name: '关闭', exact: true }).count()) await page.getByRole('button', { name: '关闭', exact: true }).first().click();
} else {
  throw Error('Native Settings menu entry missing: ' + (await page.locator('[role="menu"]').allTextContents()).join(' / '));
}
await page.setViewportSize({ width: 430, height: 900 });
await settle();
if (!(await page.getByRole('button', { name: '打开鲸鱼娘主题馆', exact: true }).isVisible())) {
  const expand = page.getByRole('button', { name: /展开侧边栏|打开侧边栏/ });
  if (await expand.count()) await expand.first().click();
}
await open();
const dialogRect = await page.locator('.wg-dialog').boundingBox();
assert.ok(dialogRect.x >= 0 && dialogRect.x + dialogRect.width <= 431);
assert.ok(await page.locator('.wg-dialog').evaluate(element => element.scrollWidth <= element.clientWidth + 1), 'no horizontal overflow');
await page.screenshot({ path: path.join(shots, 'gallery-mobile.png') });
await close();
assert.deepEqual(failures, []);
assert.deepEqual(errors, []);
const result = { hostVersion, candidateHashVerified: true, themeResults, persistence: true, draftPreserved: true, darkLight: true, restoreOfficial: true, nativeSettings: true, mobile: true, assetFailures: failures, browserErrors: errors };
await writeFile(path.join(root, '../' + prefix + '-result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ passed: true, themes: themeResults.length, browserErrors: errors.length }));
await browser.close();
