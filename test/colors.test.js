import assert from 'node:assert/strict';
import test from 'node:test';
import { contrastRatio, parseColor, resolveTypeStyle, stylesFromClasses } from '../src/colors.js';
import { descendants, parseHtml } from '../src/html-parser.js';

const near = (actual, expected, tolerance = 0.00001) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} not within ${tolerance} of ${expected}`);
};

test('black on white is exactly the WCAG 21 to 1 constant', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(contrastRatio('#fff', '#000'), 21);
});

test('contrast ratio is symmetric', () => {
  assert.equal(contrastRatio('#767676', '#ffffff'), contrastRatio('#ffffff', '#767676'));
});

test('known gray pairs use exact sRGB luminance math', () => {
  near(contrastRatio('#777777', '#ffffff'), 4.47809);
  near(contrastRatio('#767676', '#ffffff'), 4.54222);
  assert.ok(contrastRatio('#777777', '#ffffff') < 4.5);
  assert.ok(contrastRatio('#767676', '#ffffff') >= 4.5);
});

test('rgb and hsl color functions parse to usable colors', () => {
  near(contrastRatio('rgb(119, 119, 119)', 'white'), 4.47809);
  assert.ok(contrastRatio('hsl(0, 0%, 47%)', '#ffffff') > 4);
});

test('transparent colors are composited instead of crashing', () => {
  const rgba = parseColor('rgba(255, 0, 0, .5)');
  assert.equal(rgba.a, 0.5);
  assert.ok(contrastRatio('rgba(255,0,0,.5)', '#ffffff') < contrastRatio('#ff0000', '#ffffff'));
});

test('unparseable colors return null rather than a guessed ratio', () => {
  assert.equal(parseColor('not-a-color'), null);
  assert.equal(contrastRatio('not-a-color', '#fff'), null);
});

test('Tailwind color and background classes resolve known palette values', () => {
  const style = stylesFromClasses('text-red-500 bg-white font-bold text-lg');
  assert.equal(style.color.format, 'hex');
  assert.equal(style.fontWeight, 700);
  assert.equal(style.fontSizePx, 18);
  assert.ok(style.backgroundColor);
});

test('Tailwind arbitrary hex classes resolve', () => {
  const style = stylesFromClasses('text-[#123456] bg-[#ffffff]');
  assert.equal(style.color.r, 0x12);
  assert.equal(style.color.g, 0x34);
  assert.equal(style.color.b, 0x56);
});

test('state variant classes are not guessed as default styles', () => {
  const style = stylesFromClasses('hover:text-red-500 focus:bg-black');
  assert.equal(style.color, undefined);
  assert.equal(style.backgroundColor, undefined);
});

test('resolveTypeStyle inherits inline color and Tailwind background', () => {
  const doc = parseHtml('<div class="bg-white"><p style="color:#777777">gray text</p></div>');
  const p = descendants(doc.root, 'p')[0];
  const style = resolveTypeStyle(p);
  assert.equal(style.largeText, false);
  near(style.ratio, 4.47809);
  assert.equal(style.threshold, 4.5);
});

test('large bold text uses the lower 3 to 1 threshold', () => {
  const doc = parseHtml('<p class="text-xl font-bold text-gray-500 bg-white">large</p>');
  const style = resolveTypeStyle(descendants(doc.root, 'p')[0]);
  assert.equal(style.largeText, true);
  assert.equal(style.threshold, 3);
});
