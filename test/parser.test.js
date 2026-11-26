import assert from 'node:assert/strict';
import test from 'node:test';
import { descendants, getAttr, parseHtml, textContent } from '../src/html-parser.js';

test('parser builds a nested tree with decoded attributes and text', () => {
  const doc = parseHtml('<!doctype html><html lang="en"><body><h1 class="x">Week &amp; Reading</h1><input id="answer" aria-label="Answer"></body></html>');
  assert.equal(doc.errors.length, 0);
  assert.equal(doc.documentElement.tagName, 'html');
  assert.equal(descendants(doc.root, 'h1').length, 1);
  assert.equal(textContent(descendants(doc.root, 'h1')[0]), 'Week & Reading');
  const input = descendants(doc.root, 'input')[0];
  assert.equal(getAttr(input, 'aria-label'), 'Answer');
  assert.equal(getAttr(input, 'id'), 'answer');
});

test('parser keeps source line and column positions', () => {
  const doc = parseHtml('<html>\n<body>\n  <p>Hello</p>\n</body>\n</html>');
  const p = descendants(doc.root, 'p')[0];
  assert.equal(p.line, 3);
  assert.equal(p.column, 3);
  assert.match(p.snippet, /^<p>/);
});

test('parser implies common optional end tags for lists and table cells', () => {
  const doc = parseHtml('<ul><li>one<li>two</ul><table><tr><td>A<td>B</tr></table>');
  assert.equal(descendants(doc.root, 'li').length, 2);
  assert.equal(descendants(doc.root, 'td').length, 2);
  assert.equal(textContent(descendants(doc.root, 'li')[0]), 'one');
});

test('raw script text is not parsed as elements or executed markup', () => {
  const doc = parseHtml('<html><body><script>if (x) { document.write("<img src=x>") }</script><p>safe</p></body></html>');
  assert.equal(descendants(doc.root, 'img').length, 0);
  assert.equal(descendants(doc.root, 'script').length, 1);
  assert.match(descendants(doc.root, 'script')[0].children[0].text, /document\.write/);
});

test('malformed mismatched and unclosed input produces parse errors without throwing', () => {
  const doc = parseHtml('<html><body><div><p>open</body><span>stray</span></html>');
  assert.ok(doc.errors.some(error => error.code === 'mismatched-end-tag' || error.code === 'unclosed-element'));
  assert.ok(doc.errors.length >= 1);
  assert.equal(descendants(doc.root, 'p').length, 1);
});

test('stray end tags are reported and ignored', () => {
  const doc = parseHtml('<p>x</p></section>');
  assert.ok(doc.errors.some(error => error.code === 'stray-end-tag'));
});

test('duplicate attributes keep the first value and record an error', () => {
  const doc = parseHtml('<input id="first" id="second">');
  const input = descendants(doc.root, 'input')[0];
  assert.equal(getAttr(input, 'id'), 'first');
  assert.ok(doc.errors.some(error => error.code === 'duplicate-attribute'));
});

test('input over the configured maximum is truncated deterministically', () => {
  const doc = parseHtml('<p>' + 'x'.repeat(100) + '</p>', { maxLength: 20 });
  assert.equal(doc.truncated, true);
  assert.equal(doc.length, 20);
  assert.equal(doc.originalLength, 107);
  assert.ok(doc.errors.some(error => error.code === 'input-truncated'));
});

test('bare text and a lone less-than sign do not crash the parser', () => {
  const doc = parseHtml('hello < world');
  assert.equal(doc.errors.length, 0);
  assert.match(textContent(doc.root), /hello < world/);
});
