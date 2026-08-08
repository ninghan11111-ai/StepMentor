import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the StepMentor workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>StepMentor \| 多模态苏格拉底学习教练<\/title>/i);
  assert.match(html, /StepMentor/);
  assert.match(html, /一步一步推出来/);
  assert.match(html, /学习状态/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("server-renders the digital mentor classroom", async () => {
  const response = await render("/live");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /StepMentor 实时课堂/);
  assert.match(html, /双工语音陪练/);
  assert.match(html, /digital-mentor-lin\.jpg/);
  assert.match(html, /学习场景实时画面/);
  assert.match(html, />AEC</);
  await access(new URL("public/digital-mentor-lin.jpg", root));
  await access(new URL("vendor/talkinghead/LICENSE", root));
});

test("removes starter-only assets and metadata", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);

  assert.match(page, /多模态苏格拉底学习教练/);
  assert.match(layout, /lang="zh-CN"/);
  assert.match(packageJson, /"lucide-react"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("app\/_sites-preview", root)));
});
