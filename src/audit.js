// Audit orchestration, coverage scoring, deterministic ranking and the
// printable handoff model. No network, DOM, storage or external dependency is involved.
import { parseHtml } from './html-parser.js';
import { CHECKS, runChecks } from './checks.js';

export const SCORE_FORMULA = 'coverage = (passed checks + 0.5 × borderline checks) ÷ all eight checks, shown as a percentage';

const SEVERITY_RANK = { high: 100, medium: 60, low: 25 };
const CHECK_IMPACT = {
  'form-labels': 16,
  'focus-order-hazards': 16,
  'link-text-quality': 12,
  'heading-structure': 12,
  'image-alternatives': 10,
  'table-header-association': 9,
  'color-contrast': 8,
  'language-attribute': 5
};

export function rankFindings(findings) {
  return [...findings]
    .map((finding, index) => ({
      ...finding,
      rankScore: (SEVERITY_RANK[finding.severity] ?? 0)
        + (finding.assessment === 'fail' ? 35 : 5)
        + (CHECK_IMPACT[finding.checkId] ?? 0),
      originalIndex: index
    }))
    .sort((a, b) =>
      b.rankScore - a.rankScore
      || (a.assessment === b.assessment ? 0 : a.assessment === 'fail' ? -1 : 1)
      || (CHECKS.findIndex(check => check.id === a.checkId) - CHECKS.findIndex(check => check.id === b.checkId))
      || ((a.element?.index ?? -1) - (b.element?.index ?? -1))
      || (a.originalIndex - b.originalIndex)
    )
    .map(({ originalIndex, ...finding }, index) => ({ ...finding, rank: index + 1 }));
}

export function summarizeCoverage(checks) {
  const total = checks.length;
  const passed = checks.filter(check => check.status === 'pass').length;
  const border = checks.filter(check => check.status === 'border').length;
  const failed = checks.filter(check => check.status === 'fail').length;
  const notApplicable = checks.filter(check => check.status === 'not-applicable').length;
  const units = passed + border * 0.5;
  return {
    total,
    applicable: total - notApplicable,
    passed,
    border,
    failed,
    notApplicable,
    units,
    percent: total - notApplicable ? Math.round((units / (total - notApplicable)) * 1000) / 10 : null,
    formula: SCORE_FORMULA,
    disclaimer: 'This is a checklist-coverage number for triage only, not WCAG conformance or compliance certification.'
  };
}

function severityLabel(finding) {
  return `${finding.severity} ${finding.assessment === 'border' ? 'borderline' : 'issue'}`;
}

export function buildPrintModel(report) {
  const generated = report.generatedAt;
  return {
    title: 'A11yClass course-page accessibility audit',
    generatedAt: generated,
    coverageText: report.score.percent === null
      ? 'Coverage could not be calculated.'
      : `Coverage ${report.score.percent}% (${report.score.passed} passed, ${report.score.border} borderline, ${report.score.failed} failed out of ${report.score.total} checks).`,
    disclaimer: report.score.disclaimer,
    topFixes: report.topFixes.slice(0, 3).map((finding, index) => ({
      rank: index + 1,
      severity: severityLabel(finding),
      check: finding.checkName,
      element: `${finding.element.reference} at line ${finding.element.line}, column ${finding.element.column}`,
      problem: finding.message,
      fix: finding.fix
    })),
    checkLines: report.checks.map(check => ({
      name: check.name,
      status: check.status,
      findings: check.findings.length,
      elementsExamined: check.elementsExamined
    })),
    assumptions: [
      'Static source audit only. JavaScript behavior, external CSS, computed layout and live assistive-technology output were not measured.',
      'Colour contrast uses inline styles and unprefixed Tailwind-ish class hints. Missing foreground and background declarations fall back to #111111 on #ffffff, so external CSS can change the true result.',
      'An empty alt attribute is marked for human confirmation because the audit cannot prove whether the image is decorative.',
      'Custom controls need real keyboard and screen-reader testing even when no static hazard is found.'
    ],
    footer: 'Use this handoff to prioritize repairs, then retest with a browser, keyboard-only navigation and a real screen reader.'
  };
}

function mdEscapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
}

export function buildSummaryMarkdown(report) {
  const model = buildPrintModel(report);
  const lines = [];
  lines.push(`# ${model.title}`);
  lines.push('');
  lines.push(`Generated at ${model.generatedAt}`);
  lines.push('');
  lines.push(model.coverageText);
  lines.push('');
  lines.push(model.disclaimer);
  lines.push('');
  lines.push('## Fix these three first');
  lines.push('');
  if (!model.topFixes.length) {
    lines.push('No failing or borderline findings were reported in this static audit.');
  } else {
    for (const item of model.topFixes) {
      lines.push(`${item.rank}. **${item.check}** (${item.severity})`);
      lines.push(`   Element ${item.element}`);
      lines.push(`   Problem ${item.problem}`);
      lines.push(`   Fix ${item.fix}`);
    }
  }
  lines.push('');
  lines.push('## Checklist coverage');
  lines.push('');
  lines.push('| Check | Result | Findings | Elements examined |');
  lines.push('| --- | --- | ---: | ---: |');
  for (const line of model.checkLines) {
    lines.push(`| ${mdEscapeCell(line.name)} | ${line.status} | ${line.findings} | ${line.elementsExamined} |`);
  }
  lines.push('');
  lines.push('## Audit assumptions and limits');
  lines.push('');
  for (const assumption of model.assumptions) lines.push(`- ${assumption}`);
  lines.push('');
  lines.push(model.footer);
  return lines.join('\n');
}

export function auditHtml(source, options = {}) {
  if (typeof source !== 'string') throw new TypeError('auditHtml expects pasted HTML as a string');
  const document = parseHtml(source, { maxLength: options.maxLength ?? 250000 });
  if (!source.trim()) {
    document.errors.unshift({
      code: 'empty-input', message: 'No HTML source was pasted.', index: 0, line: 1, column: 1
    });
  }
  const checks = runChecks(document);
  const findings = rankFindings(checks.flatMap(check => check.findings));
  const score = summarizeCoverage(checks);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const report = {
    version: 1,
    tool: 'A11yClass',
    generatedAt,
    input: {
      length: document.length,
      originalLength: document.originalLength,
      truncated: document.truncated,
      parseErrorCount: document.errors.length
    },
    parseErrors: document.errors,
    score,
    checks,
    findings,
    topFixes: findings.slice(0, 3),
    scoreFormula: SCORE_FORMULA
  };
  report.printModel = buildPrintModel(report);
  report.summaryMarkdown = buildSummaryMarkdown(report);
  return report;
}
