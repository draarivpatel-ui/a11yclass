import assert from 'node:assert/strict';
import test from 'node:test';
import { auditHtml, rankFindings, summarizeCoverage } from '../src/audit.js';

const FIXED = '2026-01-02T03:04:05.000Z';
const audit = html => auditHtml(html, { generatedAt: FIXED });
const problem = '<html><body><h2>Week</h2><input placeholder="answer"><img src="x.png"><div onclick="go()">Go</div></body></html>';

test('coverage score counts pass as one border as half and fail as zero', () => {
  const score = summarizeCoverage([
    { status: 'pass' }, { status: 'pass' }, { status: 'border' }, { status: 'fail' }
  ]);
  assert.equal(score.units, 2.5);
  assert.equal(score.percent, 62.5);
  assert.equal(score.total, 4);
  assert.equal(score.disclaimer.includes('not WCAG conformance'), true);
});

test('coverage score is null when every check is not applicable', () => {
  const score = summarizeCoverage([{ status: 'not-applicable' }]);
  assert.equal(score.percent, null);
  assert.equal(score.applicable, 0);
});

test('ranking puts high failing learner blockers before low borderline items', () => {
  const base = {
    checkId: 'link-text-quality', checkName: 'x', severity: 'low', assessment: 'border',
    element: { index: 2 }, message: 'm', impact: 'i', fix: 'f'
  };
  const high = {
    ...base, checkId: 'form-labels', severity: 'high', assessment: 'fail', element: { index: 9 }, kind: 'high'
  };
  const ranked = rankFindings([base, high]);
  assert.equal(ranked[0].kind, 'high');
  assert.equal(ranked[0].rank, 1);
  assert.ok(ranked[0].rankScore > ranked[1].rankScore);
});

test('ranking ties are deterministic by source order', () => {
  const one = {
    checkId: 'heading-structure', checkName: 'h', severity: 'high', assessment: 'fail',
    element: { index: 5 }, message: 'm', impact: 'i', fix: 'f', kind: 'one'
  };
  const two = { ...one, element: { index: 3 }, kind: 'two' };
  const ranked = rankFindings([one, two]);
  assert.deepEqual(ranked.map(item => item.kind), ['two', 'one']);
  assert.deepEqual(rankFindings([two, one]).map(item => item.kind), ['two', 'one']);
});

test('audit report has the required stable shape', () => {
  const report = audit(problem);
  for (const key of ['version', 'tool', 'generatedAt', 'input', 'parseErrors', 'score', 'checks', 'findings', 'topFixes', 'scoreFormula', 'printModel', 'summaryMarkdown']) {
    assert.ok(Object.hasOwn(report, key), key);
  }
  assert.equal(report.tool, 'A11yClass');
  assert.equal(report.generatedAt, FIXED);
  assert.equal(report.checks.length, 8);
  assert.ok(report.input.length > 0);
});

test('every finding carries exact element evidence severity impact and concrete fix', () => {
  const report = audit(problem);
  assert.ok(report.findings.length > 0);
  for (const finding of report.findings) {
    assert.ok(finding.element.reference);
    assert.equal(typeof finding.element.line, 'number');
    assert.equal(typeof finding.element.column, 'number');
    assert.ok(['high', 'medium', 'low'].includes(finding.severity));
    assert.ok(finding.impact.length > 10);
    assert.ok(finding.fix.length > 10);
  }
});

test('top fixes contain at most three items with contiguous ranks', () => {
  const report = audit(problem);
  assert.ok(report.topFixes.length <= 3);
  assert.deepEqual(report.topFixes.map(item => item.rank), report.topFixes.map((_, index) => index + 1));
});

test('print model names coverage disclaimer assumptions and three repairs', () => {
  const report = audit(problem);
  assert.match(report.printModel.coverageText, /Coverage/);
  assert.match(report.printModel.disclaimer, /not WCAG conformance/);
  assert.ok(report.printModel.assumptions.length >= 4);
  assert.ok(report.printModel.topFixes.length <= 3);
});

test('markdown summary is printable standalone evidence', () => {
  const report = audit(problem);
  assert.match(report.summaryMarkdown, /A11yClass course-page accessibility audit/);
  assert.match(report.summaryMarkdown, /Fix these three first/);
  assert.match(report.summaryMarkdown, /Checklist coverage/);
  assert.match(report.summaryMarkdown, /not WCAG conformance/);
});

test('malformed HTML still returns a report with parse error evidence', () => {
  const report = audit('<html><body><div><p>broken</body></html>');
  assert.ok(report.input.parseErrorCount > 0);
  assert.ok(report.parseErrors.every(error => error.line >= 1 && error.column >= 1));
  assert.equal(report.checks.length, 8);
});

test('empty input is deterministic and explicitly marked', () => {
  const first = audit('');
  const second = audit('');
  assert.equal(first.parseErrors[0].code, 'empty-input');
  assert.deepEqual(first.checks.map(check => check.status), second.checks.map(check => check.status));
});

test('non-string input is rejected as a programming error', () => {
  assert.throws(() => auditHtml(null), TypeError);
});

test('audit reports JSON serialize without DOM nodes or circular references', () => {
  const report = audit(problem);
  const encoded = JSON.stringify(report);
  assert.ok(encoded.length > 1000);
  const decoded = JSON.parse(encoded);
  assert.equal(decoded.generatedAt, FIXED);
  assert.equal(decoded.checks.length, 8);
});
