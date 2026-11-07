/**
 * verify-pages.mjs — 用真实浏览器证明「部署到 GitHub Pages 项目站点（子路径）后不是白屏」。
 *
 * 为什么必须单独验：本地 dev 与 Docker 都把站点挂在根路径 "/"，而 Pages 的项目站点挂在
 * "/moonlight-fighter/"。此时 BrowserRouter 若没跟随部署路径设置 basename，Route "/" 就永远
 * 匹配不上——HTTP 200、HTML 完整、控制台零报错，用户看到的却是一片空白。这种缺陷只有真的
 * 从子路径打开一次才暴露，所以 CI 里把本脚本当作发布门禁。
 *
 * 用法：npm run build && node scripts/verify-pages.mjs [--prefix=/moonlight-fighter/]
 * 前缀也可用环境变量 PAGES_PREFIX 指定；默认取本仓库名的 Pages 路径。
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
// 后端接入后产物会落到 dist/public/，纯前端模板是 dist/（与 verify-game.mjs 保持一致）。
const DIST = existsSync(join(ROOT, "dist/public/index.html"))
  ? join(ROOT, "dist/public")
  : join(ROOT, "dist");
if (!existsSync(join(DIST, "index.html"))) {
  console.error(`VERIFY FAIL: no build output at ${DIST} — run \`npm run build\` first`);
  process.exit(1);
}

const argPrefix = process.argv.find((a) => a.startsWith("--prefix="))?.slice("--prefix=".length);
const prefix = (() => {
  const raw = argPrefix || process.env.PAGES_PREFIX || "/moonlight-fighter/";
  const withLead = raw.startsWith("/") ? raw : `/${raw}`;
  return withLead.endsWith("/") ? withLead : `${withLead}/`;
})();

const SHOTS = join(ROOT, "verification-shots");
mkdirSync(SHOTS, { recursive: true });

const CANVAS_ID = "game-canvas";
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary", ".wasm": "application/wasm", ".woff2": "font/woff2", ".txt": "text/plain",
};

// Simulate a Pages *project* site: only ${prefix}** exists, the domain root does not serve this repo.
const server = createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];
  if (!url.startsWith(prefix)) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not part of this project site");
    return;
  }
  let path;
  try {
    path = decodeURIComponent(url.slice(prefix.length - 1));
  } catch {
    path = url.slice(prefix.length - 1);
  }
  if (path === "/" || path === "") path = "/index.html";
  const file = resolve(DIST, "." + path);
  if (file !== DIST && !file.startsWith(DIST + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});

const checks = [];
const ok = (name, detail = "") => { checks.push({ name, pass: true }); console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`); };
const fail = (msg) => {
  checks.push({ name: msg, pass: false });
  console.error(`VERIFY FAIL: ${msg}`);
  process.exitCode = 1;
};

await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const target = `http://127.0.0.1:${port}${prefix}`;

// Prefer the playwright-bundled browser, then system Chrome (CHROMIUM_PATH overrides).
const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  "/opt/gchrome/opt/google/chrome/chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean);
let browser;
for (const exe of [null, ...CANDIDATES]) {
  try {
    browser = await chromium.launch(exe
      ? { executablePath: exe, args: ["--no-sandbox", "--disable-gpu-sandbox", "--use-gl=swiftshader"] }
      : {});
    break;
  } catch { /* try the next one */ }
}
if (!browser) {
  console.error("VERIFY FAIL: no usable browser found (playwright bundled/chrome/chromium all unavailable)");
  process.exit(1);
}

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

const response = await page.goto(target, { waitUntil: "networkidle" });
if (response?.status() === 200) ok("子路径返回 200", target);
else fail(`子路径 ${target} 返回 ${response?.status()} — Pages 上会直接 404`);

// 路由是否真的匹配上了：basename 错了这里就是 0 个子节点。
await page.waitForFunction(() => (document.getElementById("root")?.childElementCount ?? 0) > 0, null, { timeout: 8000 })
  .then(() => ok("React 外壳挂载", "route 已匹配 basename"))
  .catch(() => fail(
    `"${prefix}" 下 root 没有任何子节点：BrowserRouter 的 basename 没有跟随部署子路径，` +
    `Route "/" 匹配不上（HTTP 200 + 控制台干净 + 白屏）。检查 src/main.tsx 的 basename 推导。`
  ));

await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 10000 })
  .then(() => ok("游戏首帧就绪", "window.__GAME_READY__ === true"))
  .catch(() => console.warn("WARN: window.__GAME_READY__ 未变 true，回退固定等待（软件渲染较慢时属正常）"));
await page.waitForTimeout(1200);

const canvas = await page.evaluate((id) => {
  const el = document.getElementById(id);
  if (!el) return { kind: "missing" };
  if (!(el instanceof HTMLCanvasElement)) return { kind: "not-canvas" };
  const samples = [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75]];
  const gl = el.getContext("webgl2") || el.getContext("webgl");
  if (gl) {
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    if (!w || !h) return { kind: "empty" };
    const px = new Uint8Array(4);
    let lit = 0;
    for (const [fx, fy] of samples) {
      gl.readPixels((w * fx) | 0, (h * fy) | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      if (px[3] > 0 && px[0] + px[1] + px[2] > 8) lit++;
    }
    return { kind: "webgl", lit, total: samples.length };
  }
  return { kind: "no-context" };
}, CANVAS_ID);

if (canvas.kind === "missing") {
  fail(`#${CANVAS_ID} 不在页面上——游戏没有挂载，或 Home.tsx 的 canvas id 改了。`);
} else if (canvas.kind === "no-context") {
  fail(`#${CANVAS_ID} 既没有 WebGL 也没有 2D 上下文。`);
} else if (canvas.kind === "empty") {
  fail(`#${CANVAS_ID} 的绘制缓冲区尺寸为 0。`);
} else if (canvas.lit >= 2) {
  ok("画面真的画出来了", `${canvas.lit}/${canvas.total} 采样点有颜色`);
} else {
  fail(`#${CANVAS_ID} 是黑屏：只有 ${canvas.lit}/${canvas.total} 个采样点有颜色。`);
}

if (errors.length === 0) ok("控制台零报错");
else fail(`控制台报错 ${errors.length} 条：\n  - ${errors.join("\n  - ")}`);

const pathname = await page.evaluate(() => location.pathname);
if (pathname.startsWith(prefix)) ok("页面地址保持在子路径下", pathname);
else fail(`地址栏是 ${pathname}，不在 ${prefix} 之下——说明发生了非预期的跳转。`);

await page.screenshot({ path: join(SHOTS, "pages-subpath.png") });
await browser.close();
server.close();

if (process.exitCode) {
  console.error(`VERIFY FAIL: ${checks.filter((c) => !c.pass).length} 项未通过（截图见 verification-shots/）`);
} else {
  console.log(`\nVERIFY OK: ${checks.length} 项全通过 — ${prefix} 下可正常游玩（截图见 verification-shots/pages-subpath.png）`);
}
