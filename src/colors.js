// sRGB color parsing, Tailwind-ish class hints and WCAG contrast arithmetic.
// The parser intentionally covers common authored forms only; unsupported CSS
// remains unknown instead of being guessed.
import { ancestors, classList } from './html-parser.js';
import { inlineStyleMap, normSpace } from './a11y-utils.js';

const NAMED = new Map(Object.entries({
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff',
  yellow: '#ffff00', cyan: '#00ffff', aqua: '#00ffff', magenta: '#ff00ff', fuchsia: '#ff00ff',
  gray: '#808080', grey: '#808080', silver: '#c0c0c0', maroon: '#800000', olive: '#808000',
  purple: '#800080', teal: '#008080', navy: '#000080', orange: '#ffa500', lime: '#00ff00',
  rebeccapurple: '#663399', transparent: 'transparent'
}));

export const TAILWIND_COLORS = Object.freeze({
  slate: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a', 950: '#020617' },
  gray: { 50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db', 400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151', 800: '#1f2937', 900: '#111827', 950: '#030712' },
  zinc: { 50: '#fafafa', 100: '#f4f4f5', 200: '#e4e4e7', 300: '#d4d4d8', 400: '#a1a1aa', 500: '#71717a', 600: '#52525b', 700: '#3f3f46', 800: '#27272a', 900: '#18181b', 950: '#09090b' },
  neutral: { 50: '#fafafa', 100: '#f5f5f5', 200: '#e5e5e5', 300: '#d4d4d4', 400: '#a3a3a3', 500: '#737373', 600: '#525252', 700: '#404040', 800: '#262626', 900: '#171717', 950: '#0a0a0a' },
  stone: { 50: '#fafaf9', 100: '#f5f5f4', 200: '#e7e5e4', 300: '#d6d3d1', 400: '#a8a29e', 500: '#78716c', 600: '#57534e', 700: '#44403c', 800: '#292524', 900: '#1c1917', 950: '#0c0a09' },
  red: { 50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d', 950: '#450a0a' },
  orange: { 50: '#fff7ed', 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74', 400: '#fb923c', 500: '#f97316', 600: '#ea580c', 700: '#c2410c', 800: '#9a3412', 900: '#7c2d12', 950: '#431407' },
  amber: { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f', 950: '#451a03' },
  yellow: { 50: '#fefce8', 100: '#fef9c3', 200: '#fef08a', 300: '#fde047', 400: '#facc15', 500: '#eab308', 600: '#ca8a04', 700: '#a16207', 800: '#854d0e', 900: '#713f12', 950: '#422006' },
  lime: { 50: '#f7fee7', 100: '#ecfccb', 200: '#d9f99d', 300: '#bef264', 400: '#a3e635', 500: '#84cc16', 600: '#65a30d', 700: '#4d7c0f', 800: '#3f6212', 900: '#365314', 950: '#1a2e05' },
  green: { 50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d', 950: '#052e16' },
  emerald: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b', 950: '#022c22' },
  teal: { 50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a', 950: '#042f2e' },
  cyan: { 50: '#ecfeff', 100: '#cffafe', 200: '#a5f3fc', 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490', 800: '#155e75', 900: '#164e63', 950: '#083344' },
  sky: { 50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc', 400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1', 800: '#075985', 900: '#0c4a6e', 950: '#082f49' },
  blue: { 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a', 950: '#172554' },
  indigo: { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81', 950: '#1e1b4e' },
  violet: { 50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95', 950: '#2e1065' },
  purple: { 50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe', 400: '#c084fc', 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce', 800: '#6b21a8', 900: '#581c87', 950: '#3b0764' },
  fuchsia: { 50: '#fdf4ff', 100: '#fae8ff', 200: '#f5d0fe', 300: '#f0abfc', 400: '#e879f9', 500: '#d946ef', 600: '#c026d3', 700: '#a21caf', 800: '#86198f', 900: '#701a75', 950: '#4a044e' },
  pink: { 50: '#fdf2f8', 100: '#fce7f3', 200: '#fbcfe8', 300: '#f9a8d4', 400: '#f472b6', 500: '#ec4899', 600: '#db2777', 700: '#be185d', 800: '#9d174d', 900: '#831843', 950: '#500724' },
  rose: { 50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337', 950: '#4c0519' }
});

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function parseAlpha(raw) {
  if (raw == null || raw === '') return 1;
  const value = String(raw).trim();
  if (value.endsWith('%')) return clamp01(Number.parseFloat(value) / 100);
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? clamp01(n) : 1;
}

function parseRgbChannel(raw) {
  const value = String(raw).trim();
  if (value.endsWith('%')) return clamp01(Number.parseFloat(value) / 100) * 255;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(255, n)) : null;
}

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360 / 360;
  const sat = clamp01(s);
  const light = clamp01(l);
  if (sat === 0) {
    const v = light * 255;
    return [v, v, v];
  }
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  const conv = t0 => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [conv(hue + 1 / 3) * 255, conv(hue) * 255, conv(hue - 1 / 3) * 255];
}

function splitColorArgs(body) {
  let alpha = null;
  let main = body.trim();
  const slash = main.indexOf('/');
  if (slash !== -1) {
    alpha = main.slice(slash + 1).trim();
    main = main.slice(0, slash).trim();
  }
  const parts = main.includes(',')
    ? main.split(',').map(part => part.trim()).filter(Boolean)
    : main.split(/\s+/).filter(Boolean);
  if (parts.length === 4 && alpha === null) alpha = parts.pop();
  return { parts, alpha };
}

export function parseColor(input) {
  const raw = normSpace(input).toLowerCase();
  if (!raw) return null;
  if (raw === 'transparent') return { r: 0, g: 0, b: 0, a: 0, format: 'keyword', input: raw };
  const named = NAMED.get(raw);
  if (named && named !== 'transparent') return parseColor(named);

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(raw);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) digits = [...digits].map(ch => ch + ch).join('');
    const r = Number.parseInt(digits.slice(0, 2), 16);
    const g = Number.parseInt(digits.slice(2, 4), 16);
    const b = Number.parseInt(digits.slice(4, 6), 16);
    const a = digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a, format: 'hex', input: raw };
  }

  const rgb = /^rgba?\((.*)\)$/.exec(raw);
  if (rgb) {
    const { parts, alpha } = splitColorArgs(rgb[1]);
    if (parts.length !== 3) return null;
    const channels = parts.map(parseRgbChannel);
    if (channels.some(channel => channel === null)) return null;
    return { r: channels[0], g: channels[1], b: channels[2], a: parseAlpha(alpha), format: 'rgb', input: raw };
  }

  const hsl = /^hsla?\((.*)\)$/.exec(raw);
  if (hsl) {
    const { parts, alpha } = splitColorArgs(hsl[1]);
    if (parts.length !== 3) return null;
    const h = Number.parseFloat(parts[0]);
    const s = parts[1].endsWith('%') ? Number.parseFloat(parts[1]) / 100 : Number.NaN;
    const l = parts[2].endsWith('%') ? Number.parseFloat(parts[2]) / 100 : Number.NaN;
    if (![h, s, l].every(Number.isFinite)) return null;
    const [r, g, b] = hslToRgb(h, s, l);
    return { r, g, b, a: parseAlpha(alpha), format: 'hsl', input: raw };
  }
  return null;
}

export function compositeOver(foreground, background) {
  const fa = foreground.a ?? 1;
  const ba = background.a ?? 1;
  const a = fa + ba * (1 - fa);
  if (a <= 0) return { r: 255, g: 255, b: 255, a: 1 };
  return {
    r: (foreground.r * fa + background.r * ba * (1 - fa)) / a,
    g: (foreground.g * fa + background.g * ba * (1 - fa)) / a,
    b: (foreground.b * fa + background.b * ba * (1 - fa)) / a,
    a
  };
}

export function relativeLuminance(color) {
  const channel = value => {
    const c = Math.max(0, Math.min(255, value)) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

export function contrastRatio(foregroundInput, backgroundInput) {
  const fg0 = typeof foregroundInput === 'string' ? parseColor(foregroundInput) : foregroundInput;
  const bg0 = typeof backgroundInput === 'string' ? parseColor(backgroundInput) : backgroundInput;
  if (!fg0 || !bg0) return null;
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const bg = compositeOver(bg0, white);
  const fg = compositeOver(fg0, bg);
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return Math.round(ratio * 100000) / 100000;
}

const FONT_SIZE_CLASSES = new Map(Object.entries({
  xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30,
  '4xl': 36, '5xl': 48, '6xl': 60, '7xl': 72, '8xl': 96, '9xl': 128
}));

function parseFontSize(value) {
  const raw = normSpace(value).toLowerCase();
  const match = /^(-?\d+(?:\.\d+)?)(px|pt|rem|em)?$/.exec(raw);
  if (!match) return null;
  const n = Number.parseFloat(match[1]);
  const unit = match[2] ?? 'px';
  if (unit === 'px') return n;
  if (unit === 'pt') return n * 4 / 3;
  return n * 16;
}

function classColor(token, prefix) {
  const body = token.slice(prefix.length);
  const arbitrary = new RegExp(`^\\[(.+)\\](?:\\/(\\d{1,3}))?$`).exec(body);
  if (arbitrary) {
    const color = parseColor(arbitrary[1].replace(/_/g, ' '));
    if (!color) return null;
    if (arbitrary[2]) color.a *= Number(arbitrary[2]) / 100;
    return color;
  }
  if (body === 'white' || body === 'black') return parseColor(body);
  const match = /^([a-z]+)-(\d{2,3})(?:\/(\d{1,3}))?$/.exec(body);
  if (!match) return null;
  const colorValue = TAILWIND_COLORS[match[1]]?.[match[2]];
  if (!colorValue) return null;
  const color = parseColor(colorValue);
  if (match[3]) color.a *= Number(match[3]) / 100;
  return color;
}

export function stylesFromClasses(className) {
  const style = { hidden: false };
  for (const rawToken of String(className ?? '').split(/\s+/).filter(Boolean)) {
    const token = rawToken.replace(/^!/, '');
    // State and responsive variants are intentionally not guessed. The audit's
    // Tailwind-ish support covers unprefixed utility hints and arbitrary color values.
    if (token.includes(':')) continue;
    if (token === 'hidden') {
      style.hidden = true;
      continue;
    }
    if (FONT_SIZE_CLASSES.has(token.replace(/^text-/, '')) && token.startsWith('text-')) {
      style.fontSizePx = FONT_SIZE_CLASSES.get(token.replace(/^text-/, ''));
      continue;
    }
    if (/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(token)) {
      style.fontWeight = {
        thin: 100, extralight: 200, light: 300, normal: 400, medium: 500,
        semibold: 600, bold: 700, extrabold: 800, black: 900
      }[token.slice(5)];
      continue;
    }
    if (token.startsWith('text-')) {
      const color = classColor(token, 'text-');
      if (color) style.color = color;
      continue;
    }
    if (token.startsWith('bg-')) {
      const color = classColor(token, 'bg-');
      if (color) style.backgroundColor = color;
    }
  }
  return style;
}

function extractColorFromBackground(value) {
  const raw = normSpace(value).toLowerCase();
  const hex = /#[0-9a-f]{3,8}\b/i.exec(raw);
  if (hex) return hex[0];
  const fn = /(?:rgba?|hsla?)\([^)]*\)/i.exec(raw);
  if (fn) return fn[0];
  for (const name of NAMED.keys()) {
    if (new RegExp(`\\b${name}\\b`).test(raw)) return name;
  }
  return null;
}

function applyLayer(target, layer, source) {
  if (!layer) return;
  if (layer.color && layer.color.a !== 0) {
    target.color = layer.color;
    target.sources.color = source;
  }
  if (layer.backgroundColor && layer.backgroundColor.a !== 0) {
    target.backgroundColor = layer.backgroundColor;
    target.sources.backgroundColor = source;
  }
  if (typeof layer.fontSizePx === 'number') target.fontSizePx = layer.fontSizePx;
  if (typeof layer.fontWeight === 'number') target.fontWeight = layer.fontWeight;
}

function inlineLayer(element) {
  const map = inlineStyleMap(element);
  const layer = {};
  const color = parseColor(map.get('color'));
  if (color) layer.color = color;
  const bgValue = map.get('background-color') ?? extractColorFromBackground(map.get('background'));
  const bg = parseColor(bgValue);
  if (bg) layer.backgroundColor = bg;
  const size = parseFontSize(map.get('font-size'));
  if (size !== null) layer.fontSizePx = size;
  const weight = Number.parseInt(map.get('font-weight'), 10);
  if (Number.isFinite(weight)) layer.fontWeight = weight;
  else if (map.get('font-weight')?.toLowerCase() === 'bold') layer.fontWeight = 700;
  else if (map.get('font-weight')?.toLowerCase() === 'normal') layer.fontWeight = 400;
  return layer;
}

export function resolveTypeStyle(element) {
  const resolved = {
    color: parseColor('#111111'), backgroundColor: parseColor('#ffffff'),
    fontSizePx: 16, fontWeight: 400,
    sources: { color: 'fallback (#111111 foreground)', backgroundColor: 'fallback (#ffffff background)' },
    classHints: []
  };
  const chain = [...ancestors(element).reverse(), element];
  for (const node of chain) {
    const className = node.attributes.find(attr => attr.name === 'class')?.value ?? '';
    const classStyle = stylesFromClasses(className);
    if (classStyle.color || classStyle.backgroundColor) resolved.classHints.push({ reference: node.tagName, className });
    applyLayer(resolved, classStyle, 'Tailwind-ish class hint');
    applyLayer(resolved, inlineLayer(node), 'inline style');
  }
  const largeText = resolved.fontSizePx >= 24 || (resolved.fontSizePx >= 18.66 && resolved.fontWeight >= 700);
  return {
    ...resolved,
    largeText,
    threshold: largeText ? 3 : 4.5,
    ratio: contrastRatio(resolved.color, resolved.backgroundColor)
  };
}

export function colorToHex(color) {
  if (!color) return null;
  const part = value => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0');
  return `#${part(color.r)}${part(color.g)}${part(color.b)}`;
}
