// Shared static accessibility helpers. These are conservative approximations
// for pasted source; they are not the browser accessible-name algorithm.
import {
  ancestors, classList, descendants, directText, elementReference, getAttr,
  hasAttr, insideTag, textContent
} from './html-parser.js';

export const normSpace = value => String(value ?? '').replace(/\s+/g, ' ').trim();

export function inlineStyleMap(element) {
  const raw = getAttr(element, 'style');
  const out = new Map();
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const name = part.slice(0, colon).trim().toLowerCase();
    const value = part.slice(colon + 1).trim();
    if (name) out.set(name, value);
  }
  return out;
}

export function isHidden(element) {
  if (!element || element.type !== 'element') return false;
  if (insideTag(element, 'template')) return true;
  for (const node of [element, ...ancestors(element)]) {
    if (hasAttr(node, 'hidden')) return true;
    const ariaHidden = normSpace(getAttr(node, 'aria-hidden')).toLowerCase();
    if (ariaHidden === 'true') return true;
    const style = inlineStyleMap(node);
    const display = normSpace(style.get('display')).toLowerCase();
    const visibility = normSpace(style.get('visibility')).toLowerCase();
    if (display === 'none' || visibility === 'hidden' || visibility === 'collapse') return true;
    if (classList(node).includes('hidden')) return true;
  }
  return false;
}

export function auditableElements(document, tagNames = null) {
  const wanted = tagNames ? new Set(Array.isArray(tagNames) ? tagNames : [tagNames]) : null;
  return document.elements.filter(el => (!wanted || wanted.has(el.tagName)) && !isHidden(el));
}

export function idIndex(document) {
  const map = new Map();
  for (const el of document.elements) {
    const id = getAttr(el, 'id');
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(el);
  }
  return map;
}

function textWithImageAlternatives(element) {
  let out = '';
  const visit = node => {
    if (node.type === 'text') {
      out += node.text;
      return;
    }
    if (node.type !== 'element') return;
    if (node.tagName === 'script' || node.tagName === 'style') return;
    if (node.tagName === 'img') {
      out += ` ${getAttr(node, 'alt') ?? ''} `;
      return;
    }
    for (const child of node.children) visit(child);
  };
  visit(element);
  return normSpace(out);
}

export function labelledByText(element, ids) {
  const raw = normSpace(getAttr(element, 'aria-labelledby'));
  if (!raw) return '';
  const pieces = [];
  for (const id of raw.split(/\s+/)) {
    const target = ids.get(id)?.[0];
    if (!target) return '';
    pieces.push(target.tagName === 'img' ? (getAttr(target, 'alt') ?? '') : textWithImageAlternatives(target));
  }
  return normSpace(pieces.join(' '));
}

export function accessibleName(element, ids = null) {
  const idMap = ids ?? new Map();
  const labelled = labelledByText(element, idMap);
  if (labelled) return labelled;
  const aria = normSpace(getAttr(element, 'aria-label'));
  if (aria) return aria;
  if (element.tagName === 'img') return normSpace(getAttr(element, 'alt'));
  if (element.tagName === 'input') {
    const type = (getAttr(element, 'type') ?? 'text').toLowerCase();
    if (type === 'image') return normSpace(getAttr(element, 'alt'));
    if (['button', 'submit', 'reset'].includes(type)) return normSpace(getAttr(element, 'value'));
  }
  const text = textWithImageAlternatives(element);
  if (text) return text;
  return normSpace(getAttr(element, 'title'));
}

export function elementEvidence(element) {
  if (!element) {
    return { reference: 'document', line: 1, column: 1, snippet: '(document)', tag: '#document', index: -1 };
  }
  return {
    reference: elementReference(element),
    line: element.line ?? 1,
    column: element.column ?? 1,
    snippet: element.snippet ?? '(document)',
    tag: element.tagName ?? '#document',
    index: element.index ?? -1
  };
}

export function makeFinding(check, element, {
  severity = 'medium', assessment = 'fail', message, impact, fix, ...extra
}) {
  return {
    id: `${check.id}/${extra.kind ?? 'finding'}`,
    kind: extra.kind ?? 'finding',
    checkId: check.id,
    checkName: check.name,
    severity,
    assessment,
    message,
    impact,
    fix,
    element: elementEvidence(element),
    ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'kind'))
  };
}

export function statusFromFindings(findings, applicable = true) {
  if (!applicable) return 'not-applicable';
  if (findings.some(finding => finding.assessment === 'fail')) return 'fail';
  if (findings.some(finding => finding.assessment === 'border')) return 'border';
  return 'pass';
}

export function severityCounts(findings) {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const finding of findings) counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
  return counts;
}

export function firstElementsByTag(document, tagNames) {
  const wanted = new Set(tagNames);
  return document.elements.filter(el => wanted.has(el.tagName));
}

export function textOf(element) {
  return normSpace(textContent(element));
}

export function directTextOf(element) {
  return normSpace(directText(element));
}

export function childElements(element, tagName = null) {
  return (element?.children ?? []).filter(child => child.type === 'element' && (!tagName || child.tagName === tagName));
}

export function descendantElements(element, tagName = null) {
  return descendants(element, tagName).filter(el => !isHidden(el));
}
