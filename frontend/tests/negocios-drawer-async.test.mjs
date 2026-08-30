import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function findBrowser() {
  for (const candidate of ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"]) {
    try { await access(candidate); return candidate; } catch { /* tenta o próximo navegador instalado */ }
  }
  throw new Error("Chrome ou Edge headless não encontrado.");
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return server.close(() => reject(new Error("PORT_UNAVAILABLE")));
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForServer(url, processHandle, output) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (processHandle.exitCode !== null) throw new Error(`Vite encerrou antes do teste.\n${output()}`);
    try { if ((await fetch(url)).ok) return; } catch { /* ainda iniciando */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Vite não respondeu a tempo.\n${output()}`);
}

test("drawer de Negócios ignora respostas obsoletas em deep link, fechamento e transição terminal", { timeout: 60000 }, async () => {
  const browser = await findBrowser();
  const port = await reservePort();
  const viteEntry = path.join(frontendDir, "node_modules", "vite", "bin", "vite.js");
  const baseUrl = `http://127.0.0.1:${port}/tests/fixtures/negocios-drawer-async.html`;
  let viteOutput = "";
  const vite = spawn(process.execPath, [viteEntry, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: frontendDir, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  vite.stdout.on("data", (chunk) => { viteOutput += chunk.toString(); });
  vite.stderr.on("data", (chunk) => { viteOutput += chunk.toString(); });

  try {
    await waitForServer(baseUrl, vite, () => viteOutput);
    for (const scenario of ["deep-link-race", "close-during-open", "close-during-terminal", "unmount-during-open"]) {
      const profile = await mkdtemp(path.join(tmpdir(), `crm-negocios-async-${scenario}-`));
      try {
        const { stdout, stderr } = await execFileAsync(browser, ["--headless=new", "--disable-background-networking", "--disable-extensions", "--disable-gpu", "--no-first-run", `--user-data-dir=${profile}`, "--virtual-time-budget=5000", "--dump-dom", `${baseUrl}?scenario=${scenario}`], { maxBuffer: 8 * 1024 * 1024, timeout: 30000, windowsHide: true });
        const bodyAttributes = stdout.match(/<body([^>]*)>/)?.[1] || "body-attrs-missing";
        assert.match(stdout, /data-status="passed"/, `Falha em ${scenario}: ${bodyAttributes}.\n${stderr}\n${stdout.slice(-5000)}`);
        assert.match(stdout, new RegExp(`data-scenario="${scenario}"`));
        assert.doesNotMatch(stdout, /data-status="failed"/);
      } finally {
        await rm(profile, { force: true, recursive: true });
      }
    }
  } finally {
    if (vite.exitCode === null) {
      vite.kill();
      await Promise.race([once(vite, "exit"), new Promise((resolve) => setTimeout(resolve, 2000))]);
    }
  }
});
