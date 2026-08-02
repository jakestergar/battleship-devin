// Headless visual/overflow check for the title screen and the screens that
// follow it. Not part of the deployed game.
//   node scripts/title-viewports.mjs [shots]
import { writeFileSync, mkdirSync } from "node:fs";

const CDP = "http://127.0.0.1:9236";
const BASE = "http://localhost:8906";
const SHOT_DIR = "/tmp/bs-title-shots";
mkdirSync(SHOT_DIR, { recursive: true });

async function findPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`${CDP}/json/list`)).json();
      const p = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (p) return p;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("no page target");
}
const page = await findPage();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const send = (method, params = {}) =>
  new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }))?.result?.result?.value;
const shot = async (name) => {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${SHOT_DIR}/${name}.png`, Buffer.from(r.result.data, "base64"));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Runtime.enable");

const viewports = [
  { name: '13" MacBook Air', width: 1440, height: 700 },
  { name: '14" MacBook Pro', width: 1512, height: 780 },
  { name: '16" MacBook Pro', width: 1728, height: 910 },
  { name: "1080p external", width: 1920, height: 940 },
  { name: "Shared-screen 720p", width: 1280, height: 620 },
];

const probe = `(() => {
  const d = document.documentElement;
  const vis = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return 'MISSING';
    if (el.hidden || el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return 'hidden';
    const r = el.getBoundingClientRect();
    return r.bottom <= window.innerHeight + 1 && r.top >= -1 ? 'visible' : 'CLIPPED (' + Math.round(r.bottom - window.innerHeight) + 'px)';
  };
  return JSON.stringify({
    overflowPx: d.scrollHeight - window.innerHeight,
    wordmark: vis('.title-wordmark'),
    stats: vis('.title-stats'),
    cta: vis('.title-cta'),
    secondary: vis('.title-secondary'),
    foot: vis('.title-foot'),
  });
})()`;

const battleProbe = `(() => {
  const d = document.documentElement;
  const vis = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return 'MISSING';
    const r = el.getBoundingClientRect();
    return r.bottom <= window.innerHeight + 1 ? 'visible' : 'BELOW FOLD (' + Math.round(r.bottom - window.innerHeight) + 'px)';
  };
  return JSON.stringify({
    overflowPx: d.scrollHeight - window.innerHeight,
    confidence: vis('#confidence-value'),
    explain: vis('#explain-panel'),
    shotCount: vis('#shot-count'),
    enemyRoster: vis('#enemy-fleet'),
  });
})()`;

let allOk = true;
for (const v of viewports) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: v.width, height: v.height, deviceScaleFactor: 1, mobile: false,
  });
  await send("Page.navigate", { url: `${BASE}/?cachebust=${Date.now()}` });
  await sleep(1800);

  const t = JSON.parse(await evaluate(probe));
  await shot(`title-${v.width}x${v.height}`);
  const tOk = t.overflowPx <= 0 && !/CLIPPED|MISSING/.test(JSON.stringify(t));
  allOk &&= tOk;
  console.log(`\n${tOk ? "PASS" : "FAIL"}  TITLE   ${v.name} (${v.width}x${v.height})`);
  console.log(`      overflow: ${t.overflowPx}px | wordmark: ${t.wordmark} | stats: ${t.stats} | cta: ${t.cta} | secondary: ${t.secondary} | foot: ${t.foot}`);

  // Title -> placement
  await evaluate(`document.querySelector('#title-start').click()`);
  await sleep(500);
  const p = JSON.parse(await evaluate(probe.replace("wordmark: vis('.title-wordmark')", "wordmark: 'n/a'")));
  await shot(`placement-${v.width}x${v.height}`);
  const pOk = p.overflowPx <= 0;
  allOk &&= pOk;
  console.log(`${pOk ? "PASS" : "FAIL"}  PLACE   overflow: ${p.overflowPx}px`);

  // Placement -> battle
  await evaluate(`document.querySelector('#randomize-fleet').click()`);
  await sleep(400);
  await evaluate(`document.querySelector('#start-battle').click()`);
  await sleep(1200);
  const b = JSON.parse(await evaluate(battleProbe));
  await shot(`battle-${v.width}x${v.height}`);
  const bOk = b.overflowPx <= 0;
  allOk &&= bOk;
  console.log(`${bOk ? "PASS" : "FAIL"}  BATTLE  overflow: ${b.overflowPx}px | confidence: ${b.confidence} | explain: ${b.explain} | shots: ${b.shotCount} | enemy roster: ${b.enemyRoster}`);
}

// Secondary entry points, once, at a mid viewport.
await send("Emulation.setDeviceMetricsOverride", { width: 1512, height: 780, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `${BASE}/?cachebust=${Date.now()}` });
await sleep(1500);
await evaluate(`document.querySelector('#title-arena').click()`);
await sleep(500);
const arenaOpen = await evaluate(
  `(() => { const o = document.querySelector('#title-arena-root .arena-overlay'); return !!o && !o.hidden && o.getBoundingClientRect().height > 100; })()`
);
await shot("title-arena-open");
console.log(`\n${arenaOpen ? "PASS" : "FAIL"}  Strategy Arena opens from title`);
await send("Page.navigate", { url: `${BASE}/?cachebust=${Date.now()}` });
await sleep(1500);
await evaluate(`document.querySelector('#title-exhibition').click()`);
await sleep(600);
const exhOpen = await evaluate(
  `(() => { const o = document.querySelector('.exh-overlay'); return !!o && !o.hidden && o.getBoundingClientRect().height > 100; })()`
);
await shot("title-exhibition-open");
console.log(`${exhOpen ? "PASS" : "FAIL"}  AI vs AI exhibition opens from title`);

console.log(`\n${allOk && arenaOpen && exhOpen ? "ALL PASS" : "SOME FAILURES"} — screenshots in ${SHOT_DIR}`);
ws.close();
process.exit(0);
