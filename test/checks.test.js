import assert from 'node:assert/strict';
import test from 'node:test';
import { auditHtml } from '../src/audit.js';
import { SAMPLES } from '../src/samples.js';

const FIXED = '2026-01-02T03:04:05.000Z';
const report = html => auditHtml(html, { generatedAt: FIXED });
const check = (html, id) => report(html).checks.find(item => item.id === id);
const page = body => `<html lang="en"><body>${body}</body></html>`;

function assertEvidence(finding) {
  assert.ok(finding.element.reference, 'finding has an exact element reference');
  assert.equal(typeof finding.element.line, 'number');
  assert.equal(typeof finding.element.column, 'number');
  assert.ok(finding.severity, 'finding has severity');
  assert.ok(finding.fix, 'finding has a concrete fix');
}

test('language check passes a valid lang attribute', () => {
  const result = check('<html lang="en-US"><body><h1>x</h1></body></html>', 'language-attribute');
  assert.equal(result.status, 'pass');
  assert.equal(result.findings.length, 0);
});

test('language check fails when lang is missing', () => {
  const result = check('<html><body>x</body></html>', 'language-attribute');
  assert.equal(result.status, 'fail');
  assert.equal(result.findings[0].kind, 'missing-language');
  assertEvidence(result.findings[0]);
});

test('language check is borderline for malformed or fragment input', () => {
  assert.equal(check('<html lang="english-us"><body>x</body></html>', 'language-attribute').status, 'border');
  assert.equal(check('<main><p>x</p></main>', 'language-attribute').status, 'border');
});

test('heading check passes one ordered nonempty h1 hierarchy', () => {
  const result = check(page('<h1>Course</h1><h2>Reading</h2><h3>Chapter</h3><h2>Submit</h2>'), 'heading-structure');
  assert.equal(result.status, 'pass');
  assert.equal(result.elementsExamined, 4);
});

test('heading check fails with no h1 or empty headings', () => {
  assert.equal(check(page('<h2>Week</h2>'), 'heading-structure').status, 'fail');
  const empty = check(page('<h1></h1>'), 'heading-structure');
  assert.equal(empty.status, 'fail');
  assert.equal(empty.findings[0].kind, 'empty-heading');
});

test('heading check is borderline for skipped levels and repeated h1', () => {
  assert.equal(check(page('<h1>Course</h1><h3>Skip</h3>'), 'heading-structure').status, 'border');
  assert.equal(check(page('<h1>One</h1><h1>Two</h1>'), 'heading-structure').status, 'border');
});

test('form label check passes explicit and wrapping labels', () => {
  const result = check(page('<label for="a">Answer</label><input id="a"><label>Notes<textarea></textarea></label>'), 'form-labels');
  assert.equal(result.status, 'pass');
  assert.equal(result.elementsExamined, 2);
});

test('form label check fails an unlabeled input even with a placeholder', () => {
  const result = check(page('<input id="answer" placeholder="Answer here">'), 'form-labels');
  assert.equal(result.status, 'fail');
  assert.ok(result.findings.some(finding => finding.kind === 'unlabeled-control'));
  assertEvidence(result.findings[0]);
});

test('form label check is borderline for duplicate ids or orphan labels', () => {
  const duplicate = check(page('<label for="x">One</label><input id="x"><span id="x">copy</span>'), 'form-labels');
  assert.equal(duplicate.status, 'border');
  const orphan = check(page('<label for="missing">Missing</label><input id="other" aria-label="Other">'), 'form-labels');
  assert.equal(orphan.status, 'border');
});

test('image alternative check passes concise meaningful alt text', () => {
  const result = check(page('<img src="loop.png" alt="Thermostat feedback loop diagram">'), 'image-alternatives');
  assert.equal(result.status, 'pass');
  assert.equal(result.elementsExamined, 1);
});

test('image alternative check fails a missing alt attribute', () => {
  const result = check(page('<img src="food-web.png">'), 'image-alternatives');
  assert.equal(result.status, 'fail');
  assert.equal(result.findings[0].kind, 'missing-alt');
  assertEvidence(result.findings[0]);
});

test('image alternative check is borderline for empty generic filename redundant or long alt', () => {
  for (const html of [
    '<img src="decorative.png" alt="">',
    '<img src="x.png" alt="image">',
    '<img src="x.png" alt="diagram-final.png">',
    '<img src="x.png" alt="image of a food web">',
    `<img src="x.png" alt="${'long '.repeat(50)}">`
  ]) {
    assert.equal(check(page(html), 'image-alternatives').status, 'border', html);
  }
});

test('link quality passes a specific destination name', () => {
  const result = check(page('<a href="chapter.pdf">Read chapter 6 PDF</a>'), 'link-text-quality');
  assert.equal(result.status, 'pass');
});

test('link quality fails empty links and javascript URLs', () => {
  assert.equal(check(page('<a href="x.pdf"></a>'), 'link-text-quality').status, 'fail');
  assert.equal(check(page('<a href="javascript:go()">Open reading</a>'), 'link-text-quality').status, 'fail');
});

test('link quality is borderline for click here and repeated ambiguous text', () => {
  assert.equal(check(page('<a href="chapter.pdf">click here</a>'), 'link-text-quality').status, 'border');
  const repeated = check(page('<a href="a.pdf">Week reading</a><a href="b.pdf">Week reading</a>'), 'link-text-quality');
  assert.equal(repeated.status, 'border');
});

test('contrast check passes strong inline contrast', () => {
  const result = check(page('<p style="color:#111111;background-color:#ffffff">clear</p>'), 'color-contrast');
  assert.equal(result.status, 'pass');
  assert.equal(result.elementsExamined, 1);
});

test('contrast check fails known low contrast inline colors', () => {
  const result = check(page('<p style="color:#777777;background-color:#ffffff">dim</p>'), 'color-contrast');
  assert.equal(result.status, 'fail');
  assert.equal(result.findings[0].kind, 'insufficient-contrast');
  assert.ok(result.findings[0].ratio < 4.5);
  assertEvidence(result.findings[0]);
});

test('contrast check fails a Tailwind low contrast pair and is borderline near threshold', () => {
  const tailwind = check(page('<p class="text-red-500 bg-white">dim</p>'), 'color-contrast');
  assert.equal(tailwind.status, 'fail');
  const near = check(page('<p style="color:#767676;background-color:#ffffff">edge</p>'), 'color-contrast');
  assert.equal(near.status, 'border');
  assert.equal(near.findings[0].kind, 'near-threshold-contrast');
});

test('focus check passes native links and buttons without hazards', () => {
  const result = check(page('<a href="reading.pdf">Reading</a><button type="submit">Submit</button>'), 'focus-order-hazards');
  assert.equal(result.status, 'pass');
});

test('focus check fails click-only unfocusable divs and negative native tabindex', () => {
  const div = check(page('<div onclick="submit()">Submit</div>'), 'focus-order-hazards');
  assert.equal(div.status, 'fail');
  assert.equal(div.findings[0].kind, 'click-only-control');
  const negative = check(page('<button tabindex="-1">Submit</button>'), 'focus-order-hazards');
  assert.equal(negative.status, 'fail');
});

test('focus check is borderline for positive tabindex custom keyboard evidence and anchor without href', () => {
  assert.equal(check(page('<a href="x" tabindex="2">Late</a>'), 'focus-order-hazards').status, 'border');
  assert.equal(check(page('<div role="button" tabindex="0" onclick="go()">Go</div>'), 'focus-order-hazards').status, 'border');
  assert.equal(check(page('<a>Looks like a link</a>'), 'focus-order-hazards').status, 'border');
});

test('table check passes scoped headers with a caption', () => {
  const result = check(page('<table><caption>Schedule</caption><tr><th scope="col">Day</th><th scope="col">Task</th></tr><tr><td>Mon</td><td>Read</td></tr></table>'), 'table-header-association');
  assert.equal(result.status, 'pass');
});

test('table check fails data tables without headers or with missing headers references', () => {
  const missingHeaders = check(page('<table><tr><td>Day</td><td>Task</td></tr><tr><td>Mon</td><td>Read</td></tr></table>'), 'table-header-association');
  assert.equal(missingHeaders.status, 'fail');
  assert.ok(missingHeaders.findings.some(finding => finding.kind === 'data-table-without-headers'));
  const badReference = check(page('<table><caption>x</caption><tr><th scope="col">A</th><th scope="col">B</th></tr><tr><td headers="missing">1</td><td>2</td></tr></table>'), 'table-header-association');
  assert.equal(badReference.status, 'fail');
  assert.ok(badReference.findings.some(finding => finding.kind === 'headers-reference-missing'));
});

test('table check is borderline for th cells without scope or missing caption', () => {
  const noScope = check(page('<table><caption>Schedule</caption><tr><th>Day</th><th>Task</th></tr><tr><td>Mon</td><td>Read</td></tr></table>'), 'table-header-association');
  assert.equal(noScope.status, 'border');
  const noCaption = check(page('<table><tr><th scope="col">Day</th><th scope="col">Task</th></tr><tr><td>Mon</td><td>Read</td></tr></table>'), 'table-header-association');
  assert.equal(noCaption.status, 'border');
});

test('the repaired synthetic sample passes all eight checks', () => {
  const sample = SAMPLES.find(item => item.id === 'repaired');
  const result = report(sample.html);
  assert.equal(result.score.percent, 100);
  assert.deepEqual(result.checks.map(item => item.status), Array(8).fill('pass'));
});

test('the problem synthetic sample fails material checks and ranks a first three', () => {
  const sample = SAMPLES.find(item => item.id === 'problem');
  const result = report(sample.html);
  assert.ok(result.score.failed >= 5);
  assert.equal(result.topFixes.length, 3);
  assert.ok(result.findings.length >= 10);
});

test('the borderline synthetic sample produces borderline results without material failures', () => {
  const sample = SAMPLES.find(item => item.id === 'borderline');
  const result = report(sample.html);
  assert.equal(result.score.failed, 0);
  assert.ok(result.score.border >= 6);
  assert.equal(result.score.percent, 50);
});
