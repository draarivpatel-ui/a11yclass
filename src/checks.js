// The eight named source checks. Each returns exact source evidence plus a
// concrete repair. A "border" result means the heuristic found a real risk or
// an ambiguous pattern a human should verify, not a proven WCAG failure.
import {
  accessibleName, auditableElements, directTextOf, elementEvidence,
  idIndex, isHidden, makeFinding, normSpace, severityCounts, statusFromFindings,
  textOf
} from './a11y-utils.js';
import { ancestors, descendants, getAttr, hasAttr } from './html-parser.js';
import { colorToHex, contrastRatio, resolveTypeStyle } from './colors.js';

const HIGH = 'high';
const MEDIUM = 'medium';
const LOW = 'low';
const FAIL = 'fail';
const BORDER = 'border';

function result(findings, elementsExamined, note = '') {
  return {
    findings,
    elementsExamined,
    note,
    status: statusFromFindings(findings, true),
    severityCounts: severityCounts(findings)
  };
}

function docEvidence(document) {
  return document.documentElement ?? document.root;
}

function suggestForeground(foreground, background, threshold) {
  const candidates = ['#000000', '#111827', '#1f2937', '#374151', '#4b5563', '#ffffff', '#f9fafb'];
  for (const candidate of candidates) {
    const ratio = contrastRatio(candidate, background);
    if (ratio !== null && ratio >= threshold && candidate.toLowerCase() !== colorToHex(foreground)) return candidate;
  }
  return null;
}

function checkLanguage(document) {
  const meta = CHECK_META_BY_ID['language-attribute'];
  const findings = [];
  const html = document.documentElement;
  if (!html) {
    findings.push(makeFinding(meta, docEvidence(document), {
      kind: 'missing-html-element', severity: LOW, assessment: BORDER,
      message: 'The pasted source is a fragment: no <html> element was found.',
      impact: 'A screen reader uses the host document language to choose pronunciation rules. A fragment cannot prove that language is correct.',
      fix: 'Verify the published page starts with a valid language, for example <html lang="en">.'
    }));
    return result(findings, 0, 'Fragments cannot prove the host page language.');
  }
  const lang = getAttr(html, 'lang');
  if (lang === null || normSpace(lang) === '') {
    findings.push(makeFinding(meta, html, {
      kind: 'missing-language', severity: HIGH, assessment: FAIL,
      message: 'The <html> element has no nonempty lang attribute.',
      impact: 'A screen reader can use the wrong speech engine and mispronounce the reading, assignment instructions and due dates.',
      fix: 'Set the page language, for example <html lang="en"> or <html lang="es">.'
    }));
  } else if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(normSpace(lang))) {
    findings.push(makeFinding(meta, html, {
      kind: 'invalid-language', severity: MEDIUM, assessment: BORDER,
      message: `The lang value "${normSpace(lang)}" does not match a normal BCP 47 language tag shape.`,
      impact: 'Assistive technology may ignore a malformed language tag and choose the wrong pronunciation rules.',
      fix: 'Use a valid primary language subtag, such as en, es, fr or en-US.'
    }));
  }
  return result(findings, 1);
}

function checkHeadings(document) {
  const meta = CHECK_META_BY_ID['heading-structure'];
  const findings = [];
  const headings = auditableElements(document, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  if (!headings.length) {
    findings.push(makeFinding(meta, docEvidence(document), {
      kind: 'no-headings', severity: HIGH, assessment: FAIL,
      message: 'No headings were found in the pasted page.',
      impact: 'Screen reader users often jump by heading to find the week, reading and assignment sections; this page gives them no map.',
      fix: 'Add one clear <h1> for the course or week, then nested section headings in order.'
    }));
    return result(findings, 0);
  }

  const h1s = headings.filter(el => el.tagName === 'h1');
  if (!h1s.length) {
    findings.push(makeFinding(meta, headings[0], {
      kind: 'missing-h1', severity: HIGH, assessment: FAIL,
      message: 'The page has headings but no <h1>.',
      impact: 'A student cannot quickly identify the main course or week heading when navigating by headings.',
      fix: `Promote the main page heading to one <h1>; do not use ${headings[0].tagName.toUpperCase()} as the top level.`
    }));
  }
  if (h1s.length > 1) {
    for (const h1 of h1s.slice(1)) {
      findings.push(makeFinding(meta, h1, {
        kind: 'multiple-h1', severity: MEDIUM, assessment: BORDER,
        message: 'More than one <h1> appears on the page.',
        impact: 'Multiple top-level headings can make the course structure ambiguous in a screen reader heading list.',
        fix: 'Keep one <h1> for the page and demote sibling topic headings to <h2>.'
      }));
    }
  }

  let previousLevel = null;
  for (const heading of headings) {
    const level = Number(heading.tagName[1]);
    if (!textOf(heading)) {
      findings.push(makeFinding(meta, heading, {
        kind: 'empty-heading', severity: HIGH, assessment: FAIL,
        message: `This <${heading.tagName}> contains no text.`,
        impact: 'A screen reader announces an empty heading, wasting navigation stops and hiding where the student is.',
        fix: 'Write meaningful heading text or remove the empty heading element.'
      }));
    }
    if (previousLevel !== null && level > previousLevel + 1) {
      findings.push(makeFinding(meta, heading, {
        kind: 'heading-level-skip', severity: MEDIUM, assessment: BORDER,
        message: `Heading level jumps from h${previousLevel} to h${level}.`,
        impact: 'The jump makes nested course sections look unrelated when a student navigates the heading tree.',
        fix: `Use an h${previousLevel + 1} here or restructure the surrounding headings without skipping levels.`
      }));
    }
    previousLevel = level;
  }
  return result(findings, headings.length);
}

function controlType(control) {
  return (getAttr(control, 'type') ?? 'text').toLowerCase();
}

function checkFormLabels(document) {
  const meta = CHECK_META_BY_ID['form-labels'];
  const findings = [];
  const ids = idIndex(document);
  const labels = auditableElements(document, 'label');
  const controls = auditableElements(document, ['input', 'select', 'textarea'])
    .filter(control => !['hidden', 'submit', 'button', 'reset'].includes(controlType(control)));

  for (const control of controls) {
    const id = normSpace(getAttr(control, 'id'));
    const wrapping = ancestors(control).some(node => node.tagName === 'label' && !isHidden(node));
    const explicit = id ? labels.some(label => normSpace(getAttr(label, 'for')) === id && textOf(label)) : false;
    const name = accessibleName(control, ids);
    const hasProgrammaticName = wrapping || explicit || Boolean(name);
    const placeholder = normSpace(getAttr(control, 'placeholder'));
    const title = normSpace(getAttr(control, 'title'));

    if (!hasProgrammaticName) {
      findings.push(makeFinding(meta, control, {
        kind: 'unlabeled-control', severity: HIGH, assessment: FAIL,
        message: `${control.tagName === 'input' ? `Input type "${controlType(control)}"` : `This ${control.tagName}`} has no programmatically associated label.`,
        impact: 'A screen reader can announce only a control type or a placeholder, so a student may not know what information to enter before submitting.',
        fix: id
          ? `Add a visible label such as <label for="${id}">Question response</label>, or wrap the control in a label.`
          : 'Give the control a stable id and add a visible <label for="that-id"> with its purpose.'
      }));
    } else if (!wrapping && !explicit && !normSpace(getAttr(control, 'aria-label')) && !normSpace(getAttr(control, 'aria-labelledby')) && title) {
      findings.push(makeFinding(meta, control, {
        kind: 'title-only-label', severity: MEDIUM, assessment: BORDER,
        message: 'This control appears to rely on a title attribute for its accessible name.',
        impact: 'Title-only names are easy to miss visually and are not exposed consistently across input methods.',
        fix: 'Replace the title-only naming with a visible label element.'
      }));
    }

    if (placeholder && !hasProgrammaticName) {
      findings.push(makeFinding(meta, control, {
        kind: 'placeholder-not-label', severity: MEDIUM, assessment: BORDER,
        message: 'A placeholder is present but does not replace a persistent label.',
        impact: 'The hint disappears or becomes hard to connect once the student types, and placeholder exposure varies across screen readers.',
        fix: 'Keep the placeholder as an example if useful, but add a persistent visible label.'
      }));
    }

    if (id && (ids.get(id)?.length ?? 0) > 1) {
      findings.push(makeFinding(meta, control, {
        kind: 'duplicate-control-id', severity: MEDIUM, assessment: BORDER,
        message: `The id "${id}" is used by more than one element.`,
        impact: 'A label or aria reference can attach to the wrong element when duplicate ids make the target ambiguous.',
        fix: 'Make every id unique, then update each label for and aria-labelledby reference.'
      }));
    }
  }

  for (const label of labels) {
    const target = normSpace(getAttr(label, 'for'));
    if (!target) continue;
    const matchingControl = controls.some(control => normSpace(getAttr(control, 'id')) === target);
    if (!matchingControl) {
      findings.push(makeFinding(meta, label, {
        kind: 'orphan-label', severity: LOW, assessment: BORDER,
        message: `This label points at missing control id "${target}".`,
        impact: 'The visible label cannot be associated with the intended answer field, so the repair the teacher expected does not happen.',
        fix: `Point the for attribute at the correct control id or remove the unused label.`
      }));
    }
  }
  return result(findings, controls.length);
}

function altProblem(alt) {
  const text = normSpace(alt);
  const lower = text.toLowerCase().replace(/[.!]+$/g, '');
  if (!text) return null;
  if (/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(text) || /^(img|image|photo|picture)[-_ ]?\d+/i.test(text)) {
    return ['filename-alt', 'The alternative text looks like a file name rather than the image meaning.'];
  }
  if (['image', 'photo', 'picture', 'graphic', 'icon', 'logo', 'thumbnail'].includes(lower)) {
    return ['generic-alt', 'The alternative text is too generic to explain the image.'];
  }
  if (/^(image|picture|photo|graphic)\s+(of|showing)\b/i.test(text)) {
    return ['redundant-alt', 'The alternative text starts with redundant words such as "image of".'];
  }
  if (text.length > 160) return ['long-alt', 'The alternative text is very long for a short text alternative.'];
  return null;
}

function checkImageAlternatives(document) {
  const meta = CHECK_META_BY_ID['image-alternatives'];
  const findings = [];
  const images = [
    ...auditableElements(document, 'img'),
    ...auditableElements(document, 'input').filter(input => controlType(input) === 'image')
  ];
  for (const image of images) {
    const alt = getAttr(image, 'alt');
    if (alt === null) {
      findings.push(makeFinding(meta, image, {
        kind: 'missing-alt', severity: HIGH, assessment: FAIL,
        message: `<${image.tagName}> has no alt attribute.`,
        impact: 'A screen reader may announce the file name or silence, so the student can miss the reading diagram, instructions or submit control.',
        fix: image.tagName === 'input'
          ? 'Add alt text that names the submit action, or use a real <button type="submit">.'
          : 'Add alt text that states the image meaning. Use alt="" only after confirming the image is decorative.'
      }));
      continue;
    }
    if (!normSpace(alt)) {
      findings.push(makeFinding(meta, image, {
        kind: 'empty-alt-needs-review', severity: LOW, assessment: BORDER,
        message: 'The image has empty alt text, which marks it as decorative only if that was intentional.',
        impact: 'If the image carries course meaning, a screen reader user receives nothing at all.',
        fix: 'Confirm the image is decorative. If it conveys content, replace alt="" with a concise meaningful description.'
      }));
      continue;
    }
    const problem = altProblem(alt);
    if (problem) {
      const [kind, message] = problem;
      findings.push(makeFinding(meta, image, {
        kind, severity: kind === 'long-alt' ? LOW : MEDIUM, assessment: BORDER,
        message,
        impact: 'Weak alternative text costs time or hides the point of a course image even though an alt attribute exists.',
        fix: 'Rewrite the alt text as the information a student needs, without the file name or the words "image of".'
      }));
    }
  }
  return result(findings, images.length);
}

const GENERIC_LINK_TEXT = new Set([
  'click here', 'here', 'read more', 'learn more', 'more', 'this', 'link', 'this link',
  'click', 'go', 'open', 'download', 'continue'
]);

function checkLinkText(document) {
  const meta = CHECK_META_BY_ID['link-text-quality'];
  const findings = [];
  const ids = idIndex(document);
  const links = auditableElements(document, 'a').filter(link => getAttr(link, 'href') !== null);
  const seenTextTargets = new Map();
  for (const link of links) {
    const href = normSpace(getAttr(link, 'href'));
    const name = accessibleName(link, ids);
    const normalized = normSpace(name).toLowerCase().replace(/[.!?]+$/g, '');
    if (!name) {
      findings.push(makeFinding(meta, link, {
        kind: 'empty-link-name', severity: HIGH, assessment: FAIL,
        message: 'This link has no accessible text.',
        impact: 'A screen reader can announce only "link" or a raw URL, so the student cannot tell whether it opens the reading or submission form.',
        fix: 'Write visible link text that names the destination, such as "Week 6 reading PDF".'
      }));
    } else if (GENERIC_LINK_TEXT.has(normalized)) {
      findings.push(makeFinding(meta, link, {
        kind: 'generic-link-text', severity: MEDIUM, assessment: BORDER,
        message: `Link text "${name}" does not name its destination.`,
        impact: 'Students scanning a links list hear repeated vague links and cannot choose the right reading or assignment without extra context.',
        fix: 'Rewrite the link as a specific destination, such as "Read chapter 4" or "Submit the reflection assignment".'
      }));
    }
    if (/^javascript:/i.test(href)) {
      findings.push(makeFinding(meta, link, {
        kind: 'javascript-link', severity: MEDIUM, assessment: FAIL,
        message: 'This link uses a javascript: URL instead of a real destination.',
        impact: 'Keyboard, screen reader and browser-open-in-new-tab behavior become unpredictable when a link is not a real link.',
        fix: 'Use a real URL for navigation or a <button> for an in-page action, with keyboard support.'
      }));
    }
    if (name) {
      const key = normalized;
      if (seenTextTargets.has(key) && seenTextTargets.get(key) !== href && !GENERIC_LINK_TEXT.has(key)) {
        findings.push(makeFinding(meta, link, {
          kind: 'same-text-different-destination', severity: LOW, assessment: BORDER,
          message: `The repeated link text "${name}" points to a different destination elsewhere on the page.`,
          impact: 'A links list can contain two identical names for different materials, forcing a student to open both to tell them apart.',
          fix: 'Add the week, format or assignment name so repeated link text becomes unique.'
        }));
      } else if (!seenTextTargets.has(key)) {
        seenTextTargets.set(key, href);
      }
    }
  }
  return result(findings, links.length);
}

function textBearingElements(document) {
  const skip = new Set(['html', 'head', 'body', 'script', 'style', 'title', 'meta', 'link', 'noscript', 'template', 'input', 'select', 'textarea']);
  return document.elements.filter(el => {
    if (skip.has(el.tagName) || isHidden(el)) return false;
    return Boolean(directTextOf(el));
  });
}

function checkContrast(document) {
  const meta = CHECK_META_BY_ID['color-contrast'];
  const findings = [];
  const textElements = textBearingElements(document);
  for (const element of textElements.slice(0, 500)) {
    const style = resolveTypeStyle(element);
    if (style.ratio === null) continue;
    const fg = colorToHex(style.color);
    const bg = colorToHex(style.backgroundColor);
    const details = `computed ${style.ratio.toFixed(2)}:1 for ${fg} on ${bg}; threshold ${style.threshold.toFixed(1)}:1 (${style.largeText ? 'large text' : 'normal text'})`;
    const fallbackNote = [style.sources.color, style.sources.backgroundColor].some(source => source.startsWith('fallback'))
      ? ' Undeclared colors fell back to black text on a white background; external CSS can change the real result.'
      : '';
    if (style.ratio + 1e-9 < style.threshold) {
      const suggestion = suggestForeground(style.color, style.backgroundColor, style.threshold);
      findings.push(makeFinding(meta, element, {
        kind: 'insufficient-contrast', severity: style.ratio < Math.max(2.4, style.threshold * 0.68) ? HIGH : MEDIUM,
        assessment: FAIL,
        message: `Text contrast is below the WCAG AA threshold: ${details}.${fallbackNote}`,
        impact: 'Low-vision students and students reading in bright light can lose instructions, due dates or submission controls.',
        fix: suggestion
          ? `Change the foreground toward ${suggestion} or darken/lighten the background until the measured ratio reaches at least ${style.threshold.toFixed(1)}:1.`
          : `Adjust the foreground or background until the measured ratio reaches at least ${style.threshold.toFixed(1)}:1.`,
        ratio: style.ratio, threshold: style.threshold, foreground: fg, background: bg,
        largeText: style.largeText, colorSource: style.sources.color, backgroundSource: style.sources.backgroundColor
      }));
    } else if (style.ratio < style.threshold + 0.3) {
      findings.push(makeFinding(meta, element, {
        kind: 'near-threshold-contrast', severity: LOW, assessment: BORDER,
        message: `Text contrast passes but sits near the boundary: ${details}.${fallbackNote}`,
        impact: 'Small rendering differences, font smoothing or a later theme change can push this text below the readable threshold.',
        fix: `Add more contrast margin instead of staying within 0.3 of the ${style.threshold.toFixed(1)}:1 threshold.`,
        ratio: style.ratio, threshold: style.threshold, foreground: fg, background: bg,
        largeText: style.largeText, colorSource: style.sources.color, backgroundSource: style.sources.backgroundColor
      }));
    }
  }
  const truncated = textElements.length > 500;
  return result(findings, Math.min(textElements.length, 500), truncated ? 'Only the first 500 direct text runs were measured.' : 'Contrast uses inline styles and unprefixed Tailwind-ish color classes. Missing declarations fall back to #111111 text on #ffffff.');
}

const NATIVE_INTERACTIVE = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary']);
const INTERACTIVE_ROLES = new Set(['button', 'link', 'checkbox', 'menuitem', 'option', 'radio', 'switch', 'tab']);

function keyboardHandlerPresent(element) {
  return ['onkeydown', 'onkeyup', 'onkeypress'].some(name => hasAttr(element, name));
}

function checkFocusHazards(document) {
  const meta = CHECK_META_BY_ID['focus-order-hazards'];
  const findings = [];
  let examined = 0;
  for (const element of document.elements) {
    if (isHidden(element)) continue;
    const tabindexRaw = getAttr(element, 'tabindex');
    const tabindex = tabindexRaw === null ? null : Number.parseInt(tabindexRaw, 10);
    const nativeInteractive = NATIVE_INTERACTIVE.has(element.tagName) && (element.tagName !== 'a' || getAttr(element, 'href') !== null);
    const role = normSpace(getAttr(element, 'role')).toLowerCase();
    const roleInteractive = INTERACTIVE_ROLES.has(role);
    const clickOnly = hasAttr(element, 'onclick');
    if (tabindexRaw !== null || clickOnly || roleInteractive || element.tagName === 'a' || nativeInteractive) examined++;

    if (tabindexRaw !== null && Number.isFinite(tabindex) && tabindex > 0) {
      findings.push(makeFinding(meta, element, {
        kind: 'positive-tabindex', severity: MEDIUM, assessment: BORDER,
        message: `tabindex="${tabindex}" forces this element ahead of the natural focus order.`,
        impact: 'Keyboard-only students can be jumped past the reading or assignment controls in an order that does not match the page.',
        fix: 'Remove the positive tabindex and arrange the DOM in the order students should tab through it. Use tabindex="0" only when a custom control truly needs it.'
      }));
    }
    if (tabindexRaw !== null && !/^-?\d+$/.test(normSpace(tabindexRaw))) {
      findings.push(makeFinding(meta, element, {
        kind: 'invalid-tabindex', severity: LOW, assessment: BORDER,
        message: `tabindex value "${normSpace(tabindexRaw)}" is not an integer.`,
        impact: 'Browsers can ignore malformed focus ordering, leaving a custom control unreachable or unpredictable.',
        fix: 'Use 0, -1, or remove tabindex; never use positive values to repair source order.'
      }));
    }

    const fakeInteractive = clickOnly || roleInteractive;
    if (fakeInteractive && !nativeInteractive) {
      if (tabindex === null || (Number.isFinite(tabindex) && tabindex < 0)) {
        findings.push(makeFinding(meta, element, {
          kind: 'click-only-control', severity: HIGH, assessment: FAIL,
          message: `<${element.tagName}> ${clickOnly ? 'has an onclick handler' : `has role="${role}"`} but is not focusable.`,
          impact: 'A keyboard-only or screen reader student cannot reach the control at all, so submission or navigation can be impossible.',
          fix: element.tagName === 'div' || element.tagName === 'span'
            ? 'Replace the clickable element with a real <button> or <a href>; native elements provide focus and keyboard activation.'
            : 'Use a native interactive element, or add correct role, tabindex="0" and Enter/Space keyboard handling.'
        }));
      } else if (!keyboardHandlerPresent(element)) {
        findings.push(makeFinding(meta, element, {
          kind: 'custom-control-keyboard-unproven', severity: MEDIUM, assessment: BORDER,
          message: 'This custom interactive element is focusable but has no inline keyboard handler evidence.',
          impact: 'A mouse click may work while Enter or Space does nothing, blocking keyboard-only submission.',
          fix: 'Prefer a native button or link. If a custom control is unavoidable, implement and test Enter/Space activation and visible focus.'
        }));
      }
    }

    if (nativeInteractive && tabindex !== null && Number.isFinite(tabindex) && tabindex < 0) {
      findings.push(makeFinding(meta, element, {
        kind: 'interactive-removed-from-tab-order', severity: HIGH, assessment: FAIL,
        message: `A native interactive <${element.tagName}> is removed from keyboard tab order with tabindex="${tabindex}".`,
        impact: 'The control can look available but be unreachable to a student who never uses a pointer.',
        fix: 'Remove the negative tabindex unless there is a separate keyboard-accessible path, and test the real task with Tab alone.'
      }));
    }

    if (element.tagName === 'a' && getAttr(element, 'href') === null && textOf(element) && !hasAttr(element, 'id') && !hasAttr(element, 'name')) {
      findings.push(makeFinding(meta, element, {
        kind: 'anchor-without-href', severity: MEDIUM, assessment: BORDER,
        message: 'This anchor has text but no href, so it is not a keyboard-focusable link.',
        impact: 'A student tabbing through course materials skips it even though it visually appears to be a link.',
        fix: 'Add a real href, or use a button if it performs an in-page action.'
      }));
    }
  }
  return result(findings, examined);
}

function checkTableHeaders(document) {
  const meta = CHECK_META_BY_ID['table-header-association'];
  const findings = [];
  const ids = idIndex(document);
  const tables = auditableElements(document, 'table')
    .filter(table => normSpace(getAttr(table, 'role')).toLowerCase() !== 'presentation');
  for (const table of tables) {
    const rows = descendants(table, 'tr');
    const cells = descendants(table, 'td');
    const headers = descendants(table, 'th');
    const dataLike = rows.length >= 2 && (cells.length + headers.length) >= 4;
    if (!dataLike) {
      findings.push(makeFinding(meta, table, {
        kind: 'table-shape-unclear', severity: LOW, assessment: BORDER,
        message: 'This table is too small for the static audit to classify confidently.',
        impact: 'A small layout or data table can still be hard to interpret when read cell by cell.',
        fix: 'If this is data, add row or column headers. If it is layout-only, replace it with ordinary flow markup or role="presentation".'
      }));
      continue;
    }
    if (!headers.length) {
      findings.push(makeFinding(meta, table, {
        kind: 'data-table-without-headers', severity: HIGH, assessment: FAIL,
        message: 'This data-shaped table has no <th> header cells.',
        impact: 'A screen reader reads isolated cells without the assignment, due date or submission column meaning.',
        fix: 'Mark the header row or column with <th scope="col"> or <th scope="row"> so every data cell inherits its context.'
      }));
    } else {
      for (const th of headers.filter(th => !normSpace(getAttr(th, 'scope')) && !normSpace(getAttr(th, 'id')))) {
        findings.push(makeFinding(meta, th, {
          kind: 'th-without-scope', severity: MEDIUM, assessment: BORDER,
          message: 'This header cell has no scope attribute.',
          impact: 'Some screen readers can infer the direction incorrectly in complex tables, especially when both row and column headers exist.',
          fix: 'Add scope="col" or scope="row" to the header cell.'
        }));
      }
    }

    for (const cell of [...cells, ...headers]) {
      const refs = normSpace(getAttr(cell, 'headers'));
      if (!refs) continue;
      const missing = refs.split(/\s+/).filter(ref => !ids.has(ref));
      if (missing.length) {
        findings.push(makeFinding(meta, cell, {
          kind: 'headers-reference-missing', severity: HIGH, assessment: FAIL,
          message: `The headers attribute references missing id${missing.length > 1 ? 's' : ''} ${missing.map(id => `"${id}"`).join(', ')}.`,
          impact: 'The explicit cell-to-header relationship never reaches a screen reader, so the table is still read without context.',
          fix: 'Give the intended <th> elements stable unique ids and update the headers attribute to reference them.'
        }));
      }
    }

    const labelled = normSpace(getAttr(table, 'aria-label')) || normSpace(getAttr(table, 'aria-labelledby'));
    const caption = table.children.find(child => child.type === 'element' && child.tagName === 'caption' && textOf(child));
    if (!labelled && !caption) {
      findings.push(makeFinding(meta, table, {
        kind: 'table-without-caption', severity: LOW, assessment: BORDER,
        message: 'The table has no caption or accessible label.',
        impact: 'Students jumping directly to the table may not know whether it lists readings, office hours or submission requirements.',
        fix: 'Add a concise <caption> naming what the table contains.'
      }));
    }
  }
  return result(findings, tables.length);
}

export const CHECKS = [
  {
    id: 'language-attribute', name: 'Language attribute',
    learnerTask: 'Hear course content pronounced in the right language.',
    description: 'Checks that the root document declares a plausible primary language.',
    run: checkLanguage
  },
  {
    id: 'heading-structure', name: 'Heading order and single H1',
    learnerTask: 'Jump directly to the week, reading and assignment sections.',
    description: 'Checks for one meaningful H1, nonempty headings and no skipped heading levels.',
    run: checkHeadings
  },
  {
    id: 'form-labels', name: 'Form labels bound to inputs',
    learnerTask: 'Understand every answer field before submitting work.',
    description: 'Checks visible/programmatic labels for input, select and textarea controls.',
    run: checkFormLabels
  },
  {
    id: 'image-alternatives', name: 'Alt text presence and usefulness',
    learnerTask: 'Receive the meaning of instructional images and image buttons.',
    description: 'Checks missing alt plus filename, generic, redundant, empty and very long alternatives.',
    run: checkImageAlternatives
  },
  {
    id: 'link-text-quality', name: 'Link text quality',
    learnerTask: 'Choose the correct reading or submission link from a links list.',
    description: 'Checks empty names, vague text such as "click here", javascript URLs and repeated ambiguous names.',
    run: checkLinkText
  },
  {
    id: 'color-contrast', name: 'Colour contrast from source hints',
    learnerTask: 'Read instructions and due dates in ordinary and bright viewing conditions.',
    description: 'Computes sRGB contrast from inline styles and unprefixed Tailwind-ish color hints, with declared fallbacks.',
    run: checkContrast
  },
  {
    id: 'focus-order-hazards', name: 'Focus-order and keyboard hazards',
    learnerTask: 'Reach every reading link and submission control with Tab, Enter and Space.',
    description: 'Checks positive tabindex, click-only elements, missing keyboard evidence, negative tabindex and anchor-without-href patterns.',
    run: checkFocusHazards
  },
  {
    id: 'table-header-association', name: 'Table header association',
    learnerTask: 'Understand which column or row each schedule and assignment cell belongs to.',
    description: 'Checks data-shaped tables for headers, scope, valid headers references and a caption signal.',
    run: checkTableHeaders
  }
];

export const CHECK_META_BY_ID = Object.fromEntries(CHECKS.map(check => [check.id, check]));

export function runChecks(document) {
  return CHECKS.map((check, index) => {
    const out = check.run(document);
    return {
      id: check.id,
      name: check.name,
      learnerTask: check.learnerTask,
      description: check.description,
      order: index,
      status: out.status,
      findings: out.findings,
      elementsExamined: out.elementsExamined,
      severityCounts: out.severityCounts,
      note: out.note
    };
  });
}
