#!/usr/bin/env node
// Headless Chrome smoke check over CDP: no console errors, no external requests,
// real sample-button clicks, keyboard focus order and no horizontal overflow.
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

async function startServer() {
  const child = spawn(process.execPath, [join(ROOT, 'scripts', 'serve.mjs')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((res, rej) => {
    let buf = '';
    const timer = setTimeout(() => rej(new Error('server timeout')), 8000);
    child.stdout.on('data', d => {
      buf += d;
      const match = buf.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (match) { clearTimeout(timer); res({ child, url: match[0] }); }
    });
    child.on('exit', code => rej(new Error(`server exited ${code}`)));
  });
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [];
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
      } else if (m.method) this.events.push(m);
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
    return new CDP(ws);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  close() { try { this.ws.close(); } catch {} }
}

if (!existsSync(CHROME)) throw new Error(`Chrome missing at ${CHROME}`);
const server = await startServer();
const profile = mkdtempSync(join(tmpdir(), 'a11yclass-check-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--mute-audio', '--disable-extensions',
  '--disable-background-networking', '--window-size=1440,900', 'about:blank'
], { stdio: 'ignore' });
let cdp;
try {
  let port;
  for (let i = 0; i < 150 && !port; i++) {
    await sleep(100);
    try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch {}
  }
  if (!port) throw new Error('Chrome DevTools port missing');
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  cdp = await CDP.connect(version.webSocketDebuggerUrl);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: sid } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sid);
  await cdp.send('Runtime.enable', {}, sid);
  await cdp.send('Network.enable', {}, sid);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sid);
  await cdp.send('Page.navigate', { url: server.url }, sid);
  await sleep(1800);
  const evaluate = async expression => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sid);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const click = async selector => {
    const point = await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return null; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); const x=r.left+r.width/2,y=r.top+r.height/2; const hit=document.elementFromPoint(x,y); return {x,y,ok:hit&&(hit===e||e.contains(hit)||hit.contains(e))}; })()`);
    if (!point?.ok) throw new Error(`hit test failed for ${selector}`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 }, sid);
    }
  };

  check('audit rendered on load', await evaluate(`document.querySelectorAll('#check-table-body tr').length`) === 8);
  check('coverage visible', await evaluate(`document.querySelector('#coverage-value').textContent`) !== '--%');
  check('no horizontal overflow', await evaluate(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`));
  await click('[data-sample="repaired"]');
  await sleep(350);
  check('repaired sample click passes all checks', await evaluate(`document.querySelector('#coverage-value').textContent.trim()`) === '100%');
  await click('[data-sample="problem"]');
  await sleep(350);
  check('problem sample restores findings', await evaluate(`document.querySelectorAll('.evidence-card').length`) >= 10);
  check('print summary populated', await evaluate(`document.querySelector('#print-summary').textContent.includes('Fix these three first')`));
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sid);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sid);
  check('keyboard focus lands on a visible control', await evaluate(`(() => { const e=document.activeElement; if(!e) return false; const r=e.getBoundingClientRect(); return r.width>0 && r.height>0; })()`));
  await sleep(250);
  const origin = new URL(server.url).origin;
  const badEvents = cdp.events.filter(m => {
    if (m.sessionId !== sid) return false;
    if (m.method === 'Runtime.exceptionThrown') return true;
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') return true;
    if (m.method === 'Network.requestWillBeSent') {
      const url = m.params.request.url;
      return !url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:') && !url.startsWith('devtools://');
    }
    return false;
  });
  check('no console errors exceptions or external requests', badEvents.length === 0, badEvents.map(e => e.method).join(','));
} finally {
  try { cdp?.close(); } catch {}
  try { chrome.kill('SIGTERM'); } catch {}
  try { server.child.kill('SIGTERM'); } catch {}
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
}
if (failures.length) {
  console.error(`browser check failed: ${failures.join(', ')}`);
  process.exit(1);
}
