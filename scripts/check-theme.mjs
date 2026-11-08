/**
 * 新主题自检：配色对比度、图片规格、元数据完整性、build 是否已同步。
 * 用法：node scripts/check-theme.mjs      （在 work/whale-gallery 目录下）
 * 退出码：有「错误」= 1，只有提示 = 0。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const readJson = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const definitions = readJson('themes.json');
const sources = new Map(readJson('art-sources.json').map(item => [item.id, item.path]));

const REQUIRED = ['id', 'name', 'group', 'tone', 'accent', 'muted', 'paper', 'ink', 'border', 'surface', 'darkAccent', 'motif', 'radius', 'keywords'];
const GROUPS = ['自然', '古风', '日式', '海岸', '幻想', '城市'];
const TONES = ['light', 'dark'];

const hex = value => {
  const match = /^#([0-9a-f]{6})$/i.exec(String(value ?? ''));
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const luminance = ([r, g, b]) => {
  const channel = c => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};
const pngSize = bytes => (bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' ? [bytes.readUInt32BE(16), bytes.readUInt32BE(20)] : null);

const problems = [];
const notes = [];
const seen = new Set();
const built = new Set();

for (const theme of definitions) {
  const label = theme.id || '(缺 id)';
  for (const key of REQUIRED) if (theme[key] === undefined || theme[key] === '') problems.push(`${label}：缺字段 ${key}`);
  if (seen.has(theme.id)) problems.push(`${label}：id 重复`);
  seen.add(theme.id);
  if (theme.group && !GROUPS.includes(theme.group)) notes.push(`${label}：group「${theme.group}」不在预设分类（${GROUPS.join(' / ')}）里，主题馆的分类按钮点不到它`);
  if (theme.tone && !TONES.includes(theme.tone)) problems.push(`${label}：tone 只能是 light 或 dark`);

  const paper = hex(theme.paper);
  const ink = hex(theme.ink);
  const muted = hex(theme.muted);
  const accent = hex(theme.accent);
  const surface = hex(theme.surface);
  for (const [key, value] of Object.entries({ paper, ink, muted, accent, surface })) if (!value) problems.push(`${label}：${key} 不是 #rrggbb`);
  if (paper && ink) {
    const value = contrast(paper, ink);
    if (value < 4.5) problems.push(`${label}：ink 对 paper 只有 ${value.toFixed(2)}:1（正文会糊，至少 4.5，理想 7+）`);
    else if (value < 7) notes.push(`${label}：ink 对 paper ${value.toFixed(2)}:1，正文够用但偏紧`);
  }
  if (paper && muted) {
    const value = contrast(paper, muted);
    if (value < 3) problems.push(`${label}：muted 对 paper 只有 ${value.toFixed(2)}:1（次要文字看不清，至少 3）`);
    else if (value < 4.5) notes.push(`${label}：muted 对 paper ${value.toFixed(2)}:1，偏淡`);
  }
  if (paper && accent) {
    const value = contrast(paper, accent);
    if (value < 2.2) problems.push(`${label}：accent 对 paper 只有 ${value.toFixed(2)}:1（按钮/描边会看不见）`);
    else if (value < 3) notes.push(`${label}：accent 对 paper ${value.toFixed(2)}:1，偏弱`);
  }
  if (paper && surface) {
    const value = contrast(paper, surface);
    if (value > 1.3) notes.push(`${label}：surface 和 paper 差太多（${value.toFixed(2)}:1），卡片会显突兀`);
  }

  const source = sources.get(theme.id);
  if (!source) { problems.push(`${label}：art-sources.json 里没有它的 path`); continue; }
  const absolute = path.isAbsolute(source) ? source : path.resolve(root, source);
  if (!existsSync(absolute)) { problems.push(`${label}：找不到图片 ${source}`); continue; }
  const bytes = readFileSync(absolute);
  const size = pngSize(bytes);
  if (!size) { problems.push(`${label}：${source} 不是真正的 PNG`); continue; }
  const [width, height] = size;
  const ratio = width / height;
  if (Math.abs(ratio - 16 / 9) > 0.08) problems.push(`${label}：${width}×${height} 比例 ${ratio.toFixed(3)}，要求 16:9（1.778），否则卡片和背景都会被裁`);
  if (width < 1920) notes.push(`${label}：宽 ${width} 偏小，高分屏会糊（建议 2560 以上）`);
  if (bytes.length > 4 * 1024 * 1024) notes.push(`${label}：${(bytes.length / 1048576).toFixed(1)} MB，建议压到 4 MB 以内`);
  const digest = createHash('sha256').update(bytes).digest('hex');
  built.add(digest + '.png');
  if (!existsSync(path.join(root, 'assets', digest + '.png'))) notes.push(`${label}：图片还没 build，跑一次 node scripts/build.mjs`);
}

const assetsDir = path.join(root, 'assets');
if (existsSync(assetsDir)) {
  for (const name of readdirSync(assetsDir)) {
    if (/^[a-f0-9]{64}\.png$/.test(name) && !built.has(name)) notes.push(`assets/${name.slice(0, 12)}… 没有被任何主题引用（下次 build 会删掉）`);
  }
}

for (const note of notes) console.log('提示  ' + note);
for (const problem of problems) console.log('错误  ' + problem);
console.log(`\n共 ${definitions.length} 套主题：${problems.length} 个错误，${notes.length} 条提示。`);
process.exit(problems.length ? 1 : 0);
