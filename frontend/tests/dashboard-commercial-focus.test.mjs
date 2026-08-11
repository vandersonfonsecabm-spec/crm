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
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Tenta o navegador já instalado seguinte, sem instalar dependências.
    }
  }
  throw new Error("Chrome ou Edge headless não encontrado para o teste DOM comportamental.");
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Não foi possível reservar uma porta local para o teste."));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForServer(url, serverProcess, output) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (serverProcess.exitCode !== null) throw new Error(`Vite encerrou antes do teste.\n${output()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // O processo ainda está subindo.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Vite não respondeu a tempo.\n${output()}`);
}

test("não restaura o fallback da fila anterior ao fechar um drawer aberto pela Agenda", { timeout: 45000 }, async () => {
  const browser = await findBrowser();
  const port = await reservePort();
  const viteEntry = path.join(frontendDir, "node_modules", "vite", "bin", "vite.js");
  const fixtureUrl = `http://127.0.0.1:${port}/tests/fixtures/dashboard-commercial-focus.html`;
  const browserProfile = await mkdtemp(path.join(tmpdir(), "crm-commercial-focus-"));
  let viteOutput = "";
  const vite = spawn(process.execPath, [viteEntry, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: frontendDir,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  vite.stdout.on("data", (chunk) => { viteOutput += chunk.toString(); });
  vite.stderr.on("data", (chunk) => { viteOutput += chunk.toString(); });

  try {
    await waitForServer(fixtureUrl, vite, () => viteOutput);
    const { stdout, stderr } = await execFileAsync(browser, [
      "--headless=new",
      "--disable-background-networking",
      "--disable-extensions",
      "--disable-gpu",
      "--no-first-run",
      `--user-data-dir=${browserProfile}`,
      "--virtual-time-budget=8000",
      "--dump-dom",
      fixtureUrl,
    ], { maxBuffer: 8 * 1024 * 1024, timeout: 30000, windowsHide: true });

    assert.match(stdout, /data-status="passed"/, `Falha no cenário DOM.\n${stderr}\n${stdout.slice(-4000)}`);
    assert.doesNotMatch(stdout, /data-status="failed"/);
    for (const stage of [
      "fila-presente:",
      "agenda-escape-double-close:",
      "agenda-cancel:",
      "troca-interna:",
      "agenda-fallback-removido:",
      "validacao-de-alvos",
      "rota-invalida:",
      "unmount-invalido:",
    ]) assert.match(stdout, new RegExp(stage));
  } finally {
    if (vite.exitCode === null) {
      vite.kill();
      await Promise.race([once(vite, "exit"), new Promise((resolve) => setTimeout(resolve, 2000))]);
    }
    await rm(browserProfile, { force: true, recursive: true });
  }
});
