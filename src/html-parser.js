// Dependency-free HTML source parser for audit fixtures. It deliberately does
// not create a DOM, execute scripts, fetch subresources, or implement the full
// HTML Living Standard recovery algorithm. It records malformed input and keeps
// enough tree, attribute and source-position data for deterministic source checks.

export const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr'
]);

const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title']);
const HEADING_OR_SECTIONING = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'dialog', 'div', 'dl',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'header', 'hgroup', 'hr', 'main', 'menu', 'nav', 'ol', 'p', 'pre',
  'section', 'table', 'ul'
]);

const OPTIONAL_CLOSE = new Map([
  ['p', HEADING_OR_SECTIONING],
  ['li', new Set(['li'])],
  ['dt', new Set(['dt', 'dd'])],
  ['dd', new Set(['dt', 'dd'])],
  ['option', new Set(['option', 'optgroup'])],
  ['thead', new Set(['tbody', 'tfoot'])],
  ['tbody', new Set(['tbody', 'tfoot'])],
  ['tr', new Set(['tr'])],
  ['td', new Set(['td', 'th', 'tr'])],
  ['th', new Set(['td', 'th', 'tr'])]
]);

const ENTITY_RE = /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi;

export function decodeEntities(value) {
  return String(value ?? '').replace(ENTITY_RE, (all, body) => {
    const lower = body.toLowerCase();
    if (lower === 'amp') return '&';
    if (lower === 'lt') return '<';
    if (lower === 'gt') return '>';
    if (lower === 'quot') return '"';
    if (lower === 'apos') return "'";
    if (lower === 'nbsp') return '\u00a0';
    if (lower.startsWith('#x')) {
      const n = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
    }
    if (lower.startsWith('#')) {
      const n = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
    }
    return all;
  });
}

class LineIndex {
  constructor(source) {
    this.starts = [0];
    for (let i = 0; i < source.length; i++) {
      if (source.charCodeAt(i) === 10) this.starts.push(i + 1);
    }
  }
  locate(index) {
    const at = Math.max(0, Math.min(index, this.lengthForClamp ?? index));
    let lo = 0, hi = this.starts.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.starts[mid] <= at) lo = mid + 1;
      else hi = mid - 1;
    }
    const lineIndex = Math.max(0, hi);
    return { line: lineIndex + 1, column: at - this.starts[lineIndex] + 1 };
  }
}

function errorAt(errors, lines, code, message, index) {
  const pos = lines.locate(index);
  errors.push({ code, message, index, line: pos.line, column: pos.column });
}

function parseAttributes(input, start, elementName, errors, lines) {
  const attrs = [];
  const seen = new Set();
  let i = start;
  let closed = false;
  let selfClosing = false;

  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i])) i++;
    if (i >= input.length) break;
    if (input.startsWith('/>', i)) {
      closed = true;
      selfClosing = true;
      i += 2;
      break;
    }
    if (input[i] === '>') {
      closed = true;
      i++;
      break;
    }

    const attrStart = i;
    while (i < input.length && !/[\s=/>]/.test(input[i])) i++;
    if (i === attrStart) {
      errorAt(errors, lines, 'attribute-malformed', `Malformed attribute on <${elementName}>.`, i);
      i++;
      continue;
    }
    const rawName = input.slice(attrStart, i);
    const name = rawName.toLowerCase();
    while (i < input.length && /\s/.test(input[i])) i++;
    let value = '';
    if (input[i] === '=') {
      i++;
      while (i < input.length && /\s/.test(input[i])) i++;
      const quote = input[i];
      if (quote === '"' || quote === "'") {
        i++;
        const end = input.indexOf(quote, i);
        if (end === -1) {
          value = input.slice(i);
          errorAt(errors, lines, 'attribute-unclosed-quote', `Unclosed quoted attribute ${name} on <${elementName}>.`, attrStart);
          i = input.length;
        } else {
          value = input.slice(i, end);
          i = end + 1;
        }
      } else {
        const valueStart = i;
        while (i < input.length && !/[\s>]/.test(input[i])) i++;
        value = input.slice(valueStart, i);
      }
    }

    if (seen.has(name)) {
      errorAt(errors, lines, 'duplicate-attribute', `Duplicate attribute ${name} on <${elementName}>; the first value is kept.`, attrStart);
    } else {
      seen.add(name);
      const pos = lines.locate(attrStart);
      attrs.push({ name, value: decodeEntities(value), rawName, start: attrStart, line: pos.line, column: pos.column });
    }
  }

  return { attrs, end: i, closed, selfClosing };
}

function appendText(parent, raw, start, end) {
  if (!raw) return null;
  const node = {
    type: 'text', text: decodeEntities(raw), raw, start, end,
    parent, children: []
  };
  parent.children.push(node);
  return node;
}

function sourceSnippet(input, element, max = 180) {
  const openEnd = Math.min(element.openEnd ?? element.start + 1, input.length);
  let snippet = input.slice(element.start, openEnd).replace(/\s+/g, ' ').trim();
  if (!snippet.endsWith('>') && input[openEnd - 1] !== '>') snippet += ' …';
  if (snippet.length > max) snippet = snippet.slice(0, max - 1) + '…';
  return snippet;
}

export function parseHtml(source, { maxLength = 250000 } = {}) {
  if (typeof source !== 'string') throw new TypeError('parseHtml expects a string');
  const truncated = source.length > maxLength;
  const input = truncated ? source.slice(0, maxLength) : source;
  const lines = new LineIndex(input);
  const errors = [];
  if (truncated) {
    errorAt(errors, lines, 'input-truncated', `Input was truncated at ${maxLength} UTF-16 code units for a bounded static audit.`, maxLength);
  }

  const root = {
    type: 'root', tagName: '#document', attributes: [], children: [], parent: null,
    start: 0, end: input.length, openEnd: 0, line: 1, column: 1, index: -1
  };
  const elements = [];
  const stack = [root];
  let pos = 0;

  const current = () => stack[stack.length - 1];
  const closeElement = (node, end, mode) => {
    node.end = end;
    node.closeKind = mode;
    node.snippet = sourceSnippet(input, node);
  };
  const closeTopImplied = (end) => {
    const node = stack.pop();
    closeElement(node, end, 'implied');
  };

  while (pos < input.length) {
    const lt = input.indexOf('<', pos);
    if (lt === -1) {
      appendText(current(), input.slice(pos), pos, input.length);
      break;
    }
    if (lt > pos) appendText(current(), input.slice(pos, lt), pos, lt);

    if (input.startsWith('<!--', lt)) {
      const endComment = input.indexOf('-->', lt + 4);
      if (endComment === -1) {
        errorAt(errors, lines, 'unclosed-comment', 'Comment is not closed before end of input.', lt);
        pos = input.length;
      } else {
        pos = endComment + 3;
      }
      continue;
    }

    if (input.startsWith('<!', lt) || input.startsWith('<?', lt)) {
      const endMarkup = input.indexOf('>', lt + 2);
      if (endMarkup === -1) {
        errorAt(errors, lines, 'unclosed-markup-declaration', 'Markup declaration is not closed before end of input.', lt);
        pos = input.length;
      } else {
        pos = endMarkup + 1;
      }
      continue;
    }

    const closeMatch = /^<\/\s*([a-zA-Z][^\s/>]*)/.exec(input.slice(lt));
    if (closeMatch) {
      const tag = closeMatch[1].toLowerCase();
      const endClose = input.indexOf('>', lt + closeMatch[0].length);
      const closeEnd = endClose === -1 ? input.length : endClose + 1;
      if (endClose === -1) errorAt(errors, lines, 'unclosed-end-tag', `End tag </${tag}> is missing its closing bracket.`, lt);
      let found = -1;
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].tagName === tag) { found = s; break; }
      }
      if (found === -1) {
        errorAt(errors, lines, 'stray-end-tag', `End tag </${tag}> has no open start tag.`, lt);
      } else {
        if (found !== stack.length - 1) {
          errorAt(errors, lines, 'mismatched-end-tag', `End tag </${tag}> closes intervening unclosed elements.`, lt);
        }
        while (stack.length - 1 >= found) {
          const node = stack.pop();
          closeElement(node, closeEnd, node.tagName === tag ? 'explicit' : 'implicit-by-mismatch');
        }
      }
      pos = closeEnd;
      continue;
    }

    const openMatch = /^<([a-zA-Z][^\s/>]*)/.exec(input.slice(lt));
    if (!openMatch) {
      appendText(current(), '<', lt, lt + 1);
      pos = lt + 1;
      continue;
    }

    const tag = openMatch[1].toLowerCase();
    const openPosition = lines.locate(lt);

    while (stack.length > 1) {
      const top = current();
      const closesFor = OPTIONAL_CLOSE.get(top.tagName);
      if (!closesFor || !closesFor.has(tag)) break;
      closeTopImplied(lt);
    }

    const attrParsed = parseAttributes(input, lt + openMatch[0].length, tag, errors, lines);
    if (!attrParsed.closed) {
      errorAt(errors, lines, 'unclosed-start-tag', `Start tag <${tag}> is missing its closing bracket.`, lt);
    }
    const node = {
      type: 'element', tagName: tag, attributes: attrParsed.attrs, children: [],
      parent: current(), start: lt, openEnd: attrParsed.end, end: null,
      line: openPosition.line, column: openPosition.column,
      index: elements.length, selfClosing: attrParsed.selfClosing
    };
    node.snippet = sourceSnippet(input, node);
    current().children.push(node);
    elements.push(node);

    pos = attrParsed.end;
    const voidish = VOID_TAGS.has(tag) || attrParsed.selfClosing;
    if (!voidish && RAW_TEXT_TAGS.has(tag)) {
      const closeRe = new RegExp(`</${tag}\\s*>`, 'ig');
      closeRe.lastIndex = pos;
      const close = closeRe.exec(input);
      if (close) {
        appendText(node, input.slice(pos, close.index), pos, close.index);
        closeElement(node, close.index + close[0].length, 'explicit');
        pos = close.index + close[0].length;
      } else {
        errorAt(errors, lines, 'unclosed-raw-text-element', `<${tag}> is not closed before end of input.`, lt);
        appendText(node, input.slice(pos), pos, input.length);
        closeElement(node, input.length, 'eof');
        pos = input.length;
      }
    } else if (!voidish) {
      stack.push(node);
    } else {
      closeElement(node, attrParsed.end, attrParsed.selfClosing ? 'self-closing' : 'void');
    }
  }

  while (stack.length > 1) {
    const node = stack.pop();
    closeElement(node, input.length, 'eof');
    errorAt(errors, lines, 'unclosed-element', `<${node.tagName}> is not closed before end of input.`, node.start);
  }
  root.end = input.length;

  const first = tag => elements.find(el => el.tagName === tag) ?? null;
  return {
    type: 'document', root, input, originalLength: source.length, length: input.length,
    truncated, errors, elements,
    documentElement: first('html'), head: first('head'), body: first('body'), titleElement: first('title')
  };
}

export function getAttr(element, name) {
  if (!element || element.type !== 'element') return null;
  const lower = name.toLowerCase();
  return element.attributes.find(attr => attr.name === lower)?.value ?? null;
}

export function hasAttr(element, name) {
  return getAttr(element, name) !== null;
}

export function classList(element) {
  return String(getAttr(element, 'class') ?? '').split(/\s+/).filter(Boolean);
}

export function textContent(node) {
  if (!node) return '';
  if (node.type === 'text') return node.text;
  if (node.type === 'element' && (node.tagName === 'script' || node.tagName === 'style')) return '';
  return node.children.map(child => textContent(child)).join('');
}

export function directText(element) {
  if (!element || element.type !== 'element') return '';
  return element.children.filter(child => child.type === 'text').map(child => child.text).join('');
}

export function descendants(element, tagName = null) {
  const out = [];
  const visit = node => {
    for (const child of node.children ?? []) {
      if (child.type === 'element') {
        if (!tagName || child.tagName === tagName) out.push(child);
        visit(child);
      }
    }
  };
  visit(element);
  return out;
}

export function ancestors(element) {
  const out = [];
  let node = element?.parent;
  while (node && node.type === 'element') {
    out.push(node);
    node = node.parent;
  }
  return out;
}

export function insideTag(element, tagName) {
  return ancestors(element).some(node => node.tagName === tagName);
}

export function elementReference(element) {
  if (!element || element.type !== 'element') return 'document';
  if (element.tagName === 'html') return 'html';
  const parts = [];
  let node = element;
  while (node && node.type === 'element' && node.tagName !== 'html') {
    let part = node.tagName;
    const id = getAttr(node, 'id');
    if (id && /^[a-zA-Z][\w-]*$/.test(id)) {
      part += `#${id}`;
    } else if (node.parent) {
      const same = node.parent.children.filter(child => child.type === 'element' && child.tagName === node.tagName);
      const nth = same.indexOf(node) + 1;
      if (same.length > 1 || nth > 1) part += `:nth-of-type(${nth})`;
    }
    parts.unshift(part);
    node = node.parent;
  }
  return parts.join(' > ');
}
