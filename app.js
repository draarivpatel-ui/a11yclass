import { auditHtml } from './src/audit.js';
import { SAMPLES } from './src/samples.js';

const $ = selector => document.querySelector(selector);
const nodes = {
  source: $('#source-input'),
  count: $('#character-count'),
  run: $('#run-audit'),
  clear: $('#clear-input'),
  auditState: $('#audit-state'),
  coverageValue: $('#coverage-value'),
  coverageBar: $('#coverage-bar'),
  coverageExplanation: $('#coverage-explanation'),
  statusStrip: $('#status-strip'),
  topFixList: $('#top-fix-list'),
  resultsTitle: $('#results-title'),
  resultsNote: $('#results-note'),
  tableBody: $('#check-table-body'),
  evidenceList: $('#evidence-list'),
  printSummary: $('#print-summary'),
  printButton: $('#print-report'),
  copyButton: $('#copy-report'),
  downloadButton: $('#download-report'),
  copyStatus: $('#copy-status'),
  sampleButtons: [...document.querySelectorAll('.sample-button')]
};

const number = new Intl.NumberFormat('en-US');
let currentReport = null;
let currentSample = 'problem';

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function clear(node) {
  while (node.firstChild) node.firstChild.remove();
}

function updateCount() {
  nodes.count.textContent = `${number.format(nodes.source.value.length)} characters`;
}

function sampleById(id) {
  return SAMPLES.find(sample => sample.id === id) ?? SAMPLES[0];
}

function setPressed() {
  for (const button of nodes.sampleButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.sample === currentSample));
  }
}

function loadSample(id, run = true) {
  const sample = sampleById(id);
  currentSample = sample.id;
  nodes.source.value = sample.html;
  setPressed();
  updateCount();
  if (run) runAudit({ focusResults: false });
}

function resultBadge(status) {
  const label = status === 'pass' ? 'Pass' : status === 'border' ? 'Borderline' : status === 'fail' ? 'Fail' : 'Not applicable';
  return el('span', `result-badge ${status}`, label);
}

function severityPill(finding) {
  const label = `${finding.severity} ${finding.assessment === 'border' ? 'borderline' : 'issue'}`;
  return el('span', `severity-pill ${finding.severity}`, label);
}

function renderScore(report) {
  const percent = report.score.percent;
  nodes.coverageValue.textContent = percent === null ? '--%' : `${percent}%`;
  nodes.coverageBar.style.width = percent === null ? '0%' : `${Math.max(0, Math.min(100, percent))}%`;
  nodes.coverageExplanation.textContent = percent === null
    ? 'Coverage could not be calculated for this input.'
    : `${report.score.passed} passed, ${report.score.border} borderline and ${report.score.failed} failed out of ${report.score.total} checks. ${report.score.disclaimer}`;

  clear(nodes.statusStrip);
  for (const [key, label] of [['passed', 'passed'], ['border', 'borderline'], ['failed', 'failed']]) {
    const box = el('div', `status-total ${key === 'passed' ? 'pass' : key === 'border' ? 'border' : 'fail'}`);
    box.append(el('strong', '', String(report.score[key])), el('span', '', label));
    nodes.statusStrip.append(box);
  }
}

function renderTopFixes(report) {
  clear(nodes.topFixList);
  if (!report.topFixes.length) {
    nodes.topFixList.append(el('li', 'empty-state', 'No failing or borderline findings were reported in this static audit.'));
    return;
  }
  for (const [index, finding] of report.topFixes.entries()) {
    const item = el('li');
    item.append(el('span', 'fix-rank', String(index + 1)));
    const main = el('div', 'fix-main');
    main.append(el('strong', '', `${finding.checkName}: ${finding.fix}`));
    main.append(el('span', '', `${finding.element.reference} at line ${finding.element.line}, column ${finding.element.column}`));
    item.append(main);
    nodes.topFixList.append(item);
  }
}

function renderCheckTable(report) {
  clear(nodes.tableBody);
  for (const check of report.checks) {
    const row = document.createElement('tr');
    const checkCell = el('th', 'check-name', check.name);
    checkCell.scope = 'row';
    checkCell.append(el('span', 'check-description', check.description));
    row.append(checkCell);

    const statusCell = el('td');
    statusCell.append(resultBadge(check.status));
    row.append(statusCell);
    row.append(el('td', 'numeric-cell', String(check.findings.length)));
    row.append(el('td', 'numeric-cell', String(check.elementsExamined)));

    const fixCell = el('td', 'first-fix');
    if (check.findings.length) {
      fixCell.textContent = check.findings[0].fix;
    } else {
      fixCell.textContent = check.note || 'No finding in this static checklist area.';
    }
    row.append(fixCell);
    nodes.tableBody.append(row);
  }
  nodes.resultsNote.textContent = `${report.findings.length} total findings. Borderline results need human confirmation; failures are the first repair candidates.`;
}

function metricLine(finding) {
  if (typeof finding.ratio !== 'number') return null;
  return `Measured ${finding.ratio.toFixed(2)}:1 for ${finding.foreground} on ${finding.background}; threshold ${finding.threshold.toFixed(1)}:1.`;
}

function renderFinding(finding) {
  const card = el('article', `evidence-card ${finding.severity}`);
  const location = el('div', 'evidence-location');
  location.append(severityPill(finding));
  const title = el('strong', '', finding.message);
  location.append(title);
  location.append(el('span', 'element-path', `${finding.element.reference} · line ${finding.element.line}, column ${finding.element.column}`));
  location.append(el('code', 'element-snippet', finding.element.snippet));

  const details = el('div', 'evidence-details');
  const impact = el('p');
  impact.append(el('span', 'evidence-label', 'Learner impact'), document.createTextNode(finding.impact));
  details.append(impact);
  const metric = metricLine(finding);
  if (metric) {
    const metricNode = el('p');
    metricNode.append(el('span', 'evidence-label', 'Contrast'), document.createTextNode(metric));
    details.append(metricNode);
  }
  const fix = el('p');
  fix.append(el('span', 'evidence-label', 'Concrete fix'), document.createTextNode(finding.fix));
  details.append(fix);
  card.append(location, details);
  return card;
}

function renderEvidence(report) {
  clear(nodes.evidenceList);
  for (const check of report.checks) {
    const group = el('section', 'check-evidence');
    group.id = `evidence-${check.id}`;
    const header = el('div', 'check-evidence-header');
    header.append(el('h3', '', check.name), resultBadge(check.status));
    group.append(header);
    const grid = el('div', 'finding-grid');
    if (!check.findings.length) {
      grid.append(el('p', 'empty-state', `No findings in this checklist area. ${check.elementsExamined} element${check.elementsExamined === 1 ? '' : 's'} examined.`));
    } else {
      for (const finding of check.findings) grid.append(renderFinding(finding));
    }
    group.append(grid);
    nodes.evidenceList.append(group);
  }
}

function renderPrintSummary(report) {
  const model = report.printModel;
  const root = nodes.printSummary;
  clear(root);
  root.append(el('h2', '', model.title));
  root.append(el('p', '', `Generated at ${model.generatedAt}`));
  root.append(el('p', '', model.coverageText));
  root.append(el('p', '', model.disclaimer));

  root.append(el('h3', '', 'Fix these three first'));
  const list = el('ol');
  if (!model.topFixes.length) {
    list.append(el('li', '', 'No failing or borderline findings were reported in this static audit.'));
  }
  for (const item of model.topFixes) {
    const li = el('li');
    li.append(el('strong', '', `${item.check} (${item.severity}). `));
    li.append(document.createTextNode(`${item.problem} Element ${item.element}. Fix ${item.fix}`));
    list.append(li);
  }
  root.append(list);

  root.append(el('h3', '', 'Checklist coverage'));
  const table = el('table');
  const thead = el('thead');
  const headRow = el('tr');
  for (const label of ['Check', 'Result', 'Findings', 'Elements examined']) headRow.append(el('th', '', label));
  thead.append(headRow);
  table.append(thead);
  const tbody = el('tbody');
  for (const line of model.checkLines) {
    const row = el('tr');
    row.append(el('td', '', line.name), el('td', '', line.status), el('td', '', String(line.findings)), el('td', '', String(line.elementsExamined)));
    tbody.append(row);
  }
  table.append(tbody);
  root.append(table);

  root.append(el('h3', '', 'Audit assumptions and limits'));
  const assumptions = el('ul');
  for (const assumption of model.assumptions) assumptions.append(el('li', '', assumption));
  root.append(assumptions);
  root.append(el('p', '', model.footer));
}

function renderReport(report) {
  currentReport = report;
  const errorNote = report.input.parseErrorCount
    ? ` Parsed with ${report.input.parseErrorCount} malformed-input note${report.input.parseErrorCount === 1 ? '' : 's'}.`
    : '';
  nodes.auditState.textContent = `Audited ${number.format(report.input.length)} characters`;
  renderScore(report);
  renderTopFixes(report);
  renderCheckTable(report);
  renderEvidence(report);
  renderPrintSummary(report);
  if (errorNote) nodes.resultsNote.textContent += errorNote;
}

function runAudit({ focusResults = true } = {}) {
  try {
    nodes.copyStatus.textContent = '';
    const report = auditHtml(nodes.source.value);
    renderReport(report);
    if (focusResults) nodes.resultsTitle.focus({ preventScroll: false });
  } catch (error) {
    nodes.auditState.textContent = 'Audit error';
    nodes.coverageExplanation.textContent = `The audit could not run. ${error.message}`;
  }
}

async function copyReport() {
  if (!currentReport) return;
  const text = currentReport.summaryMarkdown;
  try {
    await navigator.clipboard.writeText(text);
    nodes.copyStatus.textContent = 'Copied.';
  } catch {
    const scratch = el('textarea');
    scratch.value = text;
    scratch.setAttribute('readonly', '');
    scratch.style.position = 'fixed';
    scratch.style.left = '-9999px';
    document.body.append(scratch);
    scratch.select();
    const ok = document.execCommand('copy');
    scratch.remove();
    nodes.copyStatus.textContent = ok ? 'Copied.' : 'Copy failed; select the print summary instead.';
  }
}

function downloadReport() {
  if (!currentReport) return;
  const blob = new Blob([currentReport.summaryMarkdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = el('a');
  link.href = url;
  link.download = 'a11yclass-audit-summary.md';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  nodes.copyStatus.textContent = 'Downloaded.';
}

for (const button of nodes.sampleButtons) {
  button.addEventListener('click', () => loadSample(button.dataset.sample, true));
}
nodes.run.addEventListener('click', () => runAudit());
nodes.clear.addEventListener('click', () => {
  nodes.source.value = '';
  updateCount();
  nodes.source.focus();
});
nodes.source.addEventListener('input', updateCount);
nodes.printButton.addEventListener('click', () => window.print());
nodes.copyButton.addEventListener('click', copyReport);
nodes.downloadButton.addEventListener('click', downloadReport);

const params = new URLSearchParams(location.search);
const requestedSample = params.get('sample');
loadSample(SAMPLES.some(sample => sample.id === requestedSample) ? requestedSample : 'problem', params.get('run') !== '0');
