import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

async function scrollModule() {
  return import(new URL("../src/navigation/dashboardScroll.ts", import.meta.url).href);
}

test("troca de página reseta o scroller .crm-content e só usa window como fallback", async () => {
  const { resetDashboardPageScroll } = await scrollModule();
  const contentCalls = [];
  const windowCalls = [];
  const content = {
    clientHeight: 420,
    scrollHeight: 960,
    scrollTo: (options) => contentCalls.push(options),
  };
  const windowTarget = {
    scrollTo: (options) => windowCalls.push(options),
  };

  assert.equal(resetDashboardPageScroll(content, windowTarget), "content");
  assert.deepEqual(contentCalls, [{ top: 0, left: 0, behavior: "auto" }]);
  assert.deepEqual(windowCalls, []);

  const nonScrollableContent = {
    clientHeight: 420,
    scrollHeight: 420,
    scrollTo: () => assert.fail("o contêiner sem overflow não deve receber scrollTo"),
  };
  assert.equal(resetDashboardPageScroll(nonScrollableContent, windowTarget), "window");
  assert.deepEqual(windowCalls, [{ top: 0, left: 0, behavior: "auto" }]);
});

test("Dashboard mantém o contrato de scroll desktop no main estável", async () => {
  const [dashboard, css] = await Promise.all([
    source("src/pages/Dashboard.tsx"),
    source("src/index.css"),
  ]);

  assert.match(dashboard, /const contentRef = useRef<HTMLElement \| null>\(null\);/);
  assert.match(dashboard, /resetDashboardPageScroll\(contentRef\.current, window\);/);
  assert.match(dashboard, /<main ref=\{contentRef\} className="crm-content /);
  assert.doesNotMatch(dashboard, /useEffect\(\(\) => \{\s*window\.scrollTo\(/);
  assert.match(css, /@media \(min-width: 1024px\) \{[\s\S]*?\.crm-content \{[^}]*overflow-y: auto;/);
});
