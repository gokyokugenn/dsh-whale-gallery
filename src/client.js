/* THEMES and CSS_TEXT are injected by the reproducible build, not loaded remotely. */
const STORAGE_KEY = 'dsh.whale-gallery.v1';
const OWNER_KEY = Symbol.for('dsh.whale-gallery.activation');
const DEFAULTS = Object.freeze({ theme: 'celadon', enabled: true, appearance: 'theme', artwork: 100, reading: 94 });
const themeById = new Map(THEMES.map(theme => [theme.id, theme]));
/** 分类按钮：固定优先顺序 + 其余按主题里实际出现的顺序补齐。 */
const GROUP_ORDER = ['自然', '古风', '日式', '海岸', '幻想', '城市'];
const GROUPS = [...new Set(THEMES.map(theme => theme.group))].sort((a, b) => {
  const ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
});
const clamp = (value, min, max, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
/** 取景比例：100 = 按窗口高度铺满（原图构图）；小于 100 时整幅缩小、贴右下角，顶部羽化。 */
const artScaleOf = theme => {
  const value = Number(theme && theme.artScale);
  return value > 0 ? Math.min(160, Math.max(50, Math.round(value))) : 100;
};
/** 颜色工具：宿主的主按钮/开关是「实色底 + 白字」，主题色若太浅会看不出，这里压到能压白字的深度。 */
const hexToRgb = hex => {
  const raw = String(hex || '').trim().replace('#', '');
  const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw;
  const num = Number.parseInt(full, 16);
  if (!Number.isFinite(num) || full.length !== 6) return { r: 128, g: 128, b: 128 };
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
};
const rgbToHex = ({ r, g, b }) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const relativeLuminance = ({ r, g, b }) => {
  const f = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrastWithWhite = rgb => 1.05 / (relativeLuminance(rgb) + 0.05);
const mixRgb = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
/** 主题实色：保证白字对比度 ≥ 3.6（按钮、开关、勾选框的底色都用它）。 */
const solidAccentOf = hex => {
  let rgb = hexToRgb(hex);
  for (let i = 0; i < 12 && contrastWithWhite(rgb) < 3.6; i++) rgb = mixRgb(rgb, { r: 12, g: 18, b: 26 }, 0.12);
  return rgbToHex(rgb);
};

function sanitize(value) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    theme: themeById.has(input.theme) ? input.theme : DEFAULTS.theme,
    enabled: typeof input.enabled === 'boolean' ? input.enabled : true,
    appearance: ['theme', 'dsh', 'light', 'dark'].includes(input.appearance) ? input.appearance : 'theme',
    artwork: clamp(input.artwork, 20, 100, 100),
    reading: clamp(input.reading, 30, 100, 94),
  };
}

export const inject = ['slots', 'layout'];

export function apply(ctx) {
  const win = window;
  win[OWNER_KEY]?.dispose();
  const cleanups = [];
  let disposed = false;
  const owner = { dispose };
  win[OWNER_KEY] = owner;
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const cleanup of cleanups.reverse()) { try { cleanup(); } catch (error) { console.warn('Whale Gallery cleanup:', error); } }
    cleanups.length = 0;
    if (win[OWNER_KEY] === owner) delete win[OWNER_KEY];
  }
  ctx.effect(() => dispose, 'whale-gallery: activation cleanup');
  try {
    const body = document.body;
    const listeners = new Set();
    let state;
    try { state = sanitize(JSON.parse(win.localStorage.getItem(STORAGE_KEY) || 'null')); }
    catch { state = { ...DEFAULTS }; }
    const attributes = new Map();
    const properties = new Map();
    function attr(name, value) {
      if (!attributes.has(name)) attributes.set(name, { original: body.getAttribute(name), applied: undefined });
      attributes.get(name).applied = value;
      if (value === null) body.removeAttribute(name); else body.setAttribute(name, value);
    }
    function property(name, value) {
      if (!properties.has(name)) properties.set(name, { original: body.style.getPropertyValue(name), priority: body.style.getPropertyPriority(name), applied: undefined });
      properties.get(name).applied = value;
      body.style.setProperty(name, value, 'important');
    }
    cleanups.push(() => {
      for (const [name, item] of attributes) {
        if (body.getAttribute(name) !== item.applied) continue;
        if (item.original === null) body.removeAttribute(name); else body.setAttribute(name, item.original);
      }
      for (const [name, item] of properties) {
        if (body.style.getPropertyValue(name) !== item.applied || body.style.getPropertyPriority(name) !== 'important') continue;
        if (item.original) body.style.setProperty(name, item.original, item.priority); else body.style.removeProperty(name);
      }
      listeners.clear();
    });
    const style = document.createElement('style');
    style.dataset.plugin = 'dsh-whale-gallery';
    style.textContent = CSS_TEXT;
    document.head.append(style);
    cleanups.push(() => style.remove());
    const scene = document.createElement('div');
    scene.className = 'wg-scene';
    scene.setAttribute('aria-hidden', 'true');
    scene.dataset.whaleOwned = 'scene';
    body.prepend(scene);
    cleanups.push(() => scene.remove());

    function render() {
      const theme = themeById.get(state.theme);
      const mode = state.appearance === 'dsh' ? (body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light') : state.appearance === 'theme' ? theme.tone : state.appearance;
      attr('data-dsh-whale-gallery', state.enabled ? theme.id : null);
      attr('data-wg-mode', mode);
      attr('data-wg-art-tone', theme.tone);
      attr('data-wg-motif', theme.motif);
      const dark = mode === 'dark';
      property('--wg-paper', dark ? '#14202e' : (theme.tone === 'light' ? theme.paper : '#eef3fc'));
      property('--wg-ink', dark ? '#eaf2fc' : (theme.tone === 'light' ? theme.ink : '#203950'));
      property('--wg-muted', dark ? '#a9bbcf' : (theme.tone === 'light' ? theme.muted : '#61738a'));
      property('--wg-accent', dark ? theme.darkAccent : theme.accent);
      property('--wg-accent-solid', solidAccentOf(theme.accent));
      property('--wg-accent-fill', dark ? theme.accent : theme.accent);
      property('--wg-border', dark ? '#5b718a' : theme.border);
      property('--wg-surface', dark ? (theme.tone === 'dark' ? theme.surface : '#1b2b3c') : (theme.tone === 'light' ? theme.surface : '#f8fbff'));
      property('--wg-art', `url("${theme.image}")`);
      const artScale = artScaleOf(theme);
      property('--wg-art-scale', artScale + '%');
      attr('data-wg-art-scaled', artScale < 100 ? 'true' : null);
      attr('data-wg-art-flip', theme.artFlip ? 'true' : null);
      property('--wg-art-opacity', String(state.artwork / 100));
      property('--wg-reading', state.reading + '%');
      property('--wg-radius', theme.radius + 'px');
      scene.hidden = !state.enabled;
      for (const listener of listeners) listener();
    }
    const store = {
      getSnapshot: () => state,
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      set(patch, persist = true) {
        if (disposed) return;
        state = sanitize({ ...state, ...patch });
        if (persist) { try { win.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} }
        render();
      },
    };
    render();

    const themeObserver = new MutationObserver(() => { if (state.appearance === 'dsh') render(); });
    themeObserver.observe(body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
    cleanups.push(() => themeObserver.disconnect());
    const storageListener = event => {
      if (event.key !== STORAGE_KEY) return;
      try { store.set(sanitize(JSON.parse(event.newValue || 'null')), false); } catch {}
    };
    win.addEventListener('storage', storageListener);
    cleanups.push(() => win.removeEventListener('storage', storageListener));
    const panelInfo = ctx.layout?.panelInfo;
    if (panelInfo?.getSnapshot && panelInfo?.subscribe) {
      const syncPanel = () => attr('data-wg-panel', panelInfo.getSnapshot().activePanelId === null ? null : '');
      cleanups.push(panelInfo.subscribe(syncPanel));
      syncPanel();
    }

    const React = require('react');
    const { createRoot } = require('react-dom/client');
    const h = React.createElement;
    let dialog = null;
    let dialogRoot = null;
    let trigger = null;
    function closeDialog() { dialog?.close(); }
    function openDialog(event) {
      trigger = event?.currentTarget || null;
      if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.className = 'wg-dialog';
        dialog.setAttribute('aria-label', '鲸鱼娘主题馆');
        dialog.dataset.whaleOwned = 'dialog';
        body.append(dialog);
        dialogRoot = createRoot(dialog);
        dialogRoot.render(h(Gallery, { modal: true }));
        dialog.addEventListener('click', event => { if (event.target === dialog && (event.clientX < dialog.getBoundingClientRect().left || event.clientX > dialog.getBoundingClientRect().right || event.clientY < dialog.getBoundingClientRect().top || event.clientY > dialog.getBoundingClientRect().bottom)) closeDialog(); });
        dialog.addEventListener('close', () => { if (trigger?.isConnected) trigger.focus(); });
      }
      if (!dialog.open) dialog.showModal();
    }
    cleanups.push(() => { dialogRoot?.unmount(); dialog?.remove(); dialog = null; dialogRoot = null; });

    function Gallery({ modal = false }) {
      const current = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
      const [filter, setFilter] = React.useState('全部');
      const [query, setQuery] = React.useState('');
      const active = themeById.get(current.theme);
      const visible = THEMES.filter(theme => (filter === '全部' || theme.group === filter) && (theme.name + theme.keywords).includes(query.trim()));
      return h('section', { className: 'wg-gallery', 'aria-label': '鲸鱼娘主题馆' },
        h('header', { className: 'wg-gallery-header' }, h('div', null,
          h('p', { className: 'wg-eyebrow' }, 'WHALE GIRL COLLECTION'),
          h('h2', null, '鲸鱼娘主题馆'),
          h('p', { className: 'wg-subtitle' }, THEMES.length + ' 个世界，一位熟悉的鲸鱼娘。选择主题，即刻换装。')),
          modal ? h('button', { type: 'button', className: 'wg-close', onClick: closeDialog, 'aria-label': '关闭主题馆' }, '×') : null),
        h('div', { className: 'wg-current', role: 'status', 'aria-live': 'polite' }, current.enabled ? '当前主题 · ' + active.name : '当前使用 DSH 官方外观'),
        h('div', { className: 'wg-controls' },
          h('label', { className: 'wg-check' }, h('input', { type: 'checkbox', checked: current.enabled, onChange: event => store.set({ enabled: event.target.checked }) }), '启用鲸鱼娘皮肤'),
          h('label', null, '明暗配色 ', h('select', { value: current.appearance, onChange: event => store.set({ appearance: event.target.value }), 'aria-label': '明暗配色' },
            h('option', { value: 'theme' }, '主题原色'), h('option', { value: 'dsh' }, '跟随 DSH'), h('option', { value: 'light' }, '浅色'), h('option', { value: 'dark' }, '深色'))),
          h('label', { className: 'wg-range' }, '背景浓度 ', h('input', { type: 'range', min: 20, max: 100, value: current.artwork, onChange: event => store.set({ artwork: Number(event.target.value) }), 'aria-label': '背景浓度' }), h('output', null, current.artwork + '%')),
          h('label', { className: 'wg-range' }, '阅读底色 ', h('input', { type: 'range', min: 30, max: 100, value: current.reading, onChange: event => store.set({ reading: Number(event.target.value) }), 'aria-label': '阅读底色' }), h('output', null, current.reading + '%'))),
        h('div', { className: 'wg-filterbar' }, h('div', { className: 'wg-filters', 'aria-label': '主题分类' },
          ...['全部', ...GROUPS].map(item => h('button', { key: item, type: 'button', 'aria-pressed': filter === item, onClick: () => setFilter(item) }, item))),
          h('input', { className: 'wg-search', type: 'search', placeholder: '搜索主题或关键词', 'aria-label': '搜索主题', value: query, onChange: event => setQuery(event.target.value) })),
        h('div', { className: 'wg-grid' }, ...visible.map(theme => h('button', {
          key: theme.id, type: 'button', className: 'wg-card', 'data-theme-id': theme.id, 'aria-pressed': current.enabled && current.theme === theme.id,
          onClick: () => store.set({ theme: theme.id, enabled: true }), style: { '--card-accent': theme.accent },
        }, h('span', {
          className: 'wg-thumb', role: 'img', 'aria-label': theme.name,
          style: {
            backgroundImage: `url("${theme.image}")`,
            backgroundSize: 'auto ' + artScaleOf(theme) + '%',
            backgroundColor: theme.paper,
            transform: theme.artFlip ? 'scaleX(-1)' : undefined,
          },
        }),
          h('span', { className: 'wg-card-copy' }, h('strong', null, theme.name), h('span', { className: 'wg-badge' }, current.enabled && current.theme === theme.id ? '使用中' : theme.tone === 'dark' ? '深色' : '浅色'), h('small', null, theme.keywords))))),
        visible.length ? null : h('p', { className: 'wg-empty' }, '没有找到匹配的主题。'),
        h('footer', { className: 'wg-gallery-footer' }, h('span', null, '选择会保存在当前浏览器中。'), h('div', { className: 'wg-footer-actions' }, h('button', { type: 'button', onClick: () => store.set({ enabled: false }) }, '恢复官方外观'), modal ? h('button', { type: 'button', className: 'wg-done', onClick: closeDialog }, '完成') : null)));
    }
    function Shortcut() {
      return h('button', { type: 'button', className: 'wg-shortcut', title: '鲸鱼娘主题馆', 'aria-label': '打开鲸鱼娘主题馆', onClick: openDialog },
        h('svg', { viewBox: '0 0 24 24', width: 19, height: 19, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true }, h('path', { d: 'M3 11c0 5 4 8 9 8 4 0 7-2 8-6l2-4-4 1c-1-4-5-6-9-5-4 1-6 3-6 6ZM7 10h.01M12 3l2-2' })),
        h('span', null, '主题馆'));
    }
    const releaseSettings = ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'whale-gallery', order: 116, label: '鲸鱼娘主题馆' }, Gallery));
    if (typeof releaseSettings === 'function') cleanups.push(releaseSettings);
    const releaseShortcut = ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({ name: 'sidebar.footer.action', id: 'whale-gallery-shortcut', order: 16 }, Shortcut));
    if (typeof releaseShortcut === 'function') cleanups.push(releaseShortcut);
  } catch (error) { dispose(); throw error; }
}
