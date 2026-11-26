#!/usr/bin/env node
// Captures the three required real 1440x900 PNGs through headless Chrome/CDP.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'screenshots');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function pngSize(file) {
  const b = readFileSync(file);
  return b.length > 24 && b.toString('ascii', 1, 4) === 'PNG'
    ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) } : null;
}
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
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (!m.id || !this.pending.has(m.id)) return;
      const p = this.pending.get(m.id); this.pending.delete(m.id);
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
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
const profile = mkdtempSync(join(tmpdir(), 'a11yclass-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--mute-audio', '--disable-extensions',
  '--disable-background-networking', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--window-size=1440,900', 'about:blank'
], { stdio: 'ignore' });
let cdp;
try {
  let port;
  for (let i = 0; i < 150 && !port; i++) {
    await sleep(100);
    try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch {}
  }
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  cdp = await CDP.connect(version.webSocketDebuggerUrl);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: sid } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sid);
  await cdp.send('Runtime.enable', {}, sid);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sid);
  const evaluate = async expression => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true }, sid)).result.value;
  const capture = async file => {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid);
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    const size = pngSize(file);
    if (!size || size.width !== 1440 || size.height !== 900) throw new Error(`${file} wrong dimensions`);
    console.log(`${file} ${size.width}x${size.height}`);
  };
  const open = async url => {
    await cdp.send('Page.navigate', { url }, sid);
    await sleep(1200);
  };

  await open(`${server.url}?sample=problem&run=0`);
  await evaluate(`scrollTo(0,0)`);
  await sleep(150);
  await capture(join(OUT, '01-input-1440x900.png'));

  await open(`${server.url}?sample=problem`);
  await evaluate(`document.querySelector('#results').scrollIntoView({block:'start'}); scrollBy(0,-18);`);
  await sleep(200);
  await capture(join(OUT, '02-report-1440x900.png'));

  await evaluate(`document.querySelector('#handoff').scrollIntoView({block:'start'}); scrollBy(0,-18);`);
  await sleep(200);
  await capture(join(OUT, '03-print-handoff-1440x900.png'));
} finally {
  try { cdp?.close(); } catch {}
  try { chrome.kill('SIGTERM'); } catch {}
  try { server.child.kill('SIGTERM'); } catch {}
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
}
