import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
for (const key of ['window', 'document', 'HTMLElement', 'Node', 'MutationObserver', 'Event']) Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? window : window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: window.navigator });
const require = createRequire(import.meta.url);
let plugin;
window.__ModuleLoader__ = { load({ factory }) { plugin = factory(require); } };
window.eval(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'));
const ownerKey = Symbol.for('dsh.whale-gallery.activation');
const storage = Object.getOwnPropertyDescriptor(window, 'localStorage');
const contexts = [];

function context(options = {}) {
  const cleanups = [];
  const registrations = new Map();
  const subscribers = new Set();
  const ctx = {
    effect(factory) { const cleanup = factory(); cleanups.push(cleanup); return cleanup; },
    layout: { panelInfo: { getSnapshot: () => ({ activePanelId: null }), subscribe(callback) { subscribers.add(callback); return () => subscribers.delete(callback); } } },
    slots: {
      inject(name, factory) { if (options.failSlots) throw Error('injected failure'); return factory(); },
      register(meta, component) { const entry = { meta, component }; registrations.set(meta.id, entry); return () => { if (registrations.get(meta.id) === entry) registrations.delete(meta.id); }; },
    },
    dispose() { for (const cleanup of cleanups.toReversed()) cleanup?.(); },
    registrations, subscribers,
  };
  contexts.push(ctx);
  return ctx;
}
beforeEach(() => {
  window[ownerKey]?.dispose();
  Object.defineProperty(window, 'localStorage', storage);
  window.localStorage.clear();
  document.body.removeAttribute('style');
  document.body.removeAttribute('data-ds-dark-theme');
});
afterEach(() => { for (const ctx of contexts.splice(0)) ctx.dispose(); });

test('unloading restores existing values and removes only owned scene, style, subscriptions and slots', () => {
  document.body.style.setProperty('--wg-accent', 'tomato');
  document.body.setAttribute('data-wg-mode', 'previous-mode');
  const ctx = context();
  plugin.apply(ctx);
  assert.equal(document.body.getAttribute('data-dsh-whale-gallery'), 'celadon');
  assert.equal(ctx.registrations.size, 2);
  assert.equal(ctx.subscribers.size, 1);
  ctx.dispose();
  assert.equal(document.body.style.getPropertyValue('--wg-accent'), 'tomato');
  assert.equal(document.body.getAttribute('data-wg-mode'), 'previous-mode');
  assert.equal(document.body.getAttribute('data-dsh-whale-gallery'), null);
  assert.equal(document.querySelectorAll('.wg-scene,style[data-plugin="dsh-whale-gallery"]').length, 0);
  assert.equal(ctx.registrations.size, 0);
  assert.equal(ctx.subscribers.size, 0);
  document.body.removeAttribute('data-wg-mode');
});

test('old activation cleanup cannot remove a replacement activation', () => {
  const first = context(); plugin.apply(first);
  const second = context(); plugin.apply(second);
  first.dispose();
  assert.equal(document.body.getAttribute('data-dsh-whale-gallery'), 'celadon');
  assert.equal(document.querySelectorAll('.wg-scene').length, 1);
  assert.equal(document.querySelectorAll('style[data-plugin="dsh-whale-gallery"]').length, 1);
  second.dispose();
  assert.equal(document.querySelectorAll('.wg-scene').length, 0);
});

test('cleanup preserves a property changed by another owner after activation', () => {
  const ctx = context(); plugin.apply(ctx);
  document.body.style.setProperty('--wg-accent', 'external-owner', 'important');
  ctx.dispose();
  assert.equal(document.body.style.getPropertyValue('--wg-accent'), 'external-owner');
});

test('partial activation failure rolls back all presentation state', () => {
  const ctx = context({ failSlots: true });
  assert.throws(() => plugin.apply(ctx), /injected failure/);
  assert.equal(document.body.hasAttribute('data-dsh-whale-gallery'), false);
  assert.equal(document.querySelectorAll('.wg-scene,style[data-plugin="dsh-whale-gallery"]').length, 0);
  assert.equal(ctx.subscribers.size, 0);
  assert.equal(window[ownerKey], undefined);
});

test('blocked storage and malformed preferences do not prevent activation', () => {
  Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } } });
  const ctx = context();
  plugin.apply(ctx);
  assert.equal(document.body.getAttribute('data-dsh-whale-gallery'), 'celadon');
  window.dispatchEvent(new window.StorageEvent('storage', { key: 'dsh.whale-gallery.v1', newValue: '{invalid' }));
  assert.equal(document.body.getAttribute('data-dsh-whale-gallery'), 'celadon');
});

test('cross-tab changes validate themes, clamp ranges, and follow DSH dark mode', async () => {
  const ctx = context(); plugin.apply(ctx);
  window.dispatchEvent(new window.StorageEvent('storage', { key: 'dsh.whale-gallery.v1', newValue: JSON.stringify({ theme: 'not-a-theme', artwork: -200, reading: 900, appearance: 'dsh', enabled: true }) }));
  assert.equal(document.body.getAttribute('data-dsh-whale-gallery'), 'celadon');
  assert.equal(document.body.style.getPropertyValue('--wg-art-opacity'), '0.2');
  assert.equal(document.body.style.getPropertyValue('--wg-reading'), '100%');
  document.body.setAttribute('data-ds-dark-theme', '');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(document.body.getAttribute('data-wg-mode'), 'dark');
});
