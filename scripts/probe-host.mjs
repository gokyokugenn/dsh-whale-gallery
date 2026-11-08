import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const log = await readFile(path.join(root, '../' + (process.env.WHALE_QA_PREFIX || 'qa') + '-server.log'), 'utf8');
const target = log.match(/http:\/\/127\.0\.0\.1:\d+\/[^\s]*/)?.[0];
if (!target) throw Error('Test server URL missing');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 960 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text().slice(0, 350)); });
await page.goto(target, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
if (await page.getByRole('button', { name: '继续', exact: true }).count()) {
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.waitForTimeout(500);
}
if (await page.getByRole('button', { name: '关闭', exact: true }).count()) {
  await page.getByRole('button', { name: '关闭', exact: true }).first().click();
  await page.waitForTimeout(300);
}
await mkdir(path.join(root, '../qa-shots'), { recursive: true });
await page.screenshot({ path: path.join(root, '../qa-shots/initial.png'), fullPage: true });
const info = await page.evaluate(() => ({
  title: document.title,
  scripts: [...document.scripts].map(script => script.src).filter(Boolean),
  newSessionButtons: [...document.querySelectorAll('[data-slot="sidebar"] button[aria-label="新建会话"]')].map(el=>({html:el.outerHTML.slice(0,3000),parent:el.parentElement.outerHTML.slice(0,4000)})),
  skin: document.body.getAttribute('data-dsh-whale-gallery'),
  bodyAttributes: [...document.body.attributes].map(a => [a.name, a.value]).filter(([name]) => name !== 'style'),
  slots: [...document.querySelectorAll('[data-slot]')].map(el => el.getAttribute('data-slot')),
  buttons: [...document.querySelectorAll('button')].map(el => ({ text: el.innerText.slice(0, 60), label: el.getAttribute('aria-label'), title: el.title })),
  headings: [...document.querySelectorAll('h1,h2,h3')].map(el => el.textContent),
  phases: [...document.querySelectorAll('[data-phase]')].map(el => [el.getAttribute('data-phase'), el.className]),
  composer: [...document.querySelectorAll('[contenteditable],textarea,[data-composer-card]')].map(el => ({ tag: el.tagName, attrs: [...el.attributes].map(a => [a.name, a.value]) })),
  heroHtml: document.querySelector('[data-phase="hero"]')?.outerHTML.slice(0, 16000),
  heroParents: (() => { const items = []; let el = document.querySelector('[data-phase="hero"]'); for (let i=0;el && i<5;i++,el=el.parentElement) {const r=el.getBoundingClientRect();items.push({tag:el.tagName,classes:el.className,rect:{x:r.x,y:r.y,width:r.width,height:r.height},display:getComputedStyle(el).display});} return items; })(),
  placement: [...document.querySelectorAll('[data-composer-seat],[data-composer-card],[data-conversation-content],[data-phase="hero"] [class*="composerStack"],[data-phase="hero"] [class*="headline"]')].map(el => {const r=el.getBoundingClientRect(),c=getComputedStyle(el);return {classes:el.className,x:r.x,y:r.y,w:r.width,h:r.height,position:c.position,flex:c.flex,alignItems:c.alignItems,justifyContent:c.justifyContent,padding:c.padding,margin:c.margin,maxWidth:c.maxWidth};}),
}));
await writeFile(path.join(root, '../qa-probe.json'), JSON.stringify({ ...info, errors }, null, 2));
console.log(JSON.stringify({ skin: info.skin, headings: info.headings, buttonCount: info.buttons.length, errors }));
await browser.close();
