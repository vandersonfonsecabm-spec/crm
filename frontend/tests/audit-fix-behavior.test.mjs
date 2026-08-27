import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.has(key) ? this.#values.get(key) : null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }

  clear() {
    this.#values.clear();
  }
}

globalThis.localStorage = new MemoryStorage();
const api = await import("../src/services/crmApi.ts");

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function seedToken() {
  localStorage.clear();
  api.setAuthToken("token-de-teste");
}

test("sessao só é invalidada por 401 e sobrevive a 403, 5xx e rede", async () => {
  for (const status of [403, 500]) {
    seedToken();
    globalThis.fetch = async () => jsonResponse({ erro: "Falha controlada", codigo: `HTTP_${status}` }, status);
    await assert.rejects(api.fetchAuthMe, (error) => {
      assert.equal(error.status, status);
      assert.equal(api.shouldInvalidateAuthSession(error), false);
      return true;
    });
    assert.equal(api.getAuthToken(), "token-de-teste");
  }

  seedToken();
  globalThis.fetch = async () => {
    throw new TypeError("network down");
  };
  await assert.rejects(api.fetchAuthMe, (error) => {
    assert.equal(error.status, 0);
    assert.equal(api.shouldInvalidateAuthSession(error), false);
    return true;
  });
  assert.equal(api.getAuthToken(), "token-de-teste");

  seedToken();
  globalThis.fetch = async () => jsonResponse({ erro: "Sessao invalida", codigo: "AUTH_INVALID" }, 401);
  await assert.rejects(api.fetchAuthMe, (error) => {
    assert.equal(api.shouldInvalidateAuthSession(error), true);
    return true;
  });
  assert.equal(api.getAuthToken(), null);
});

test("retry de autenticação recupera a sessão sem limpar contexto em falha transitória", async () => {
  seedToken();
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) return jsonResponse({ erro: "Indisponivel" }, 503);
    return jsonResponse({
      usuario: { id: 1, nome: "Admin QA", email: "admin@example.test", papel: "ADMIN", empresaId: 1 },
      empresa: { id: 1, nome: "Empresa QA", slug: "empresa-qa" },
      papel: "ADMIN",
      capabilities: { leadsCommunication: true, siteLeadCapture: true, negociosKanban: true },
    });
  };

  await assert.rejects(api.fetchAuthMe, (error) => error.status === 503);
  assert.equal(api.getAuthToken(), "token-de-teste");
  const session = await api.fetchAuthMe();
  assert.equal(session.usuario.nome, "Admin QA");
  assert.equal(session.empresa.slug, "empresa-qa");
  assert.equal(attempts, 2);
});

test("login envia contexto de empresa somente quando informado", async () => {
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return jsonResponse({
      access_token: "novo-token",
      usuario: { id: 1, nome: "Admin", email: "duplicado@example.test", papel: "ADMIN", empresaId: 1 },
      empresa: { id: 1, nome: "Empresa", slug: "empresa-correta" },
      papel: "ADMIN",
    });
  };

  await api.loginWithBackend("duplicado@example.test", "senha");
  await api.loginWithBackend("duplicado@example.test", "senha", "empresa-correta");
  assert.deepEqual(bodies[0], { email: "duplicado@example.test", senha: "senha" });
  assert.deepEqual(bodies[1], {
    email: "duplicado@example.test",
    senha: "senha",
    empresaSlug: "empresa-correta",
  });
});

test("clientes usam paginação e filtros no servidor", async () => {
  seedToken();
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return jsonResponse({
      data: [{
        id: 150,
        nome: "Cliente global",
        status: "Proposta",
        valor: 5000,
        origem: "Teste",
        favorito: false,
        quente: true,
        ultimoContato: 2,
        proximoFollowUp: "Hoje",
        tags: ["global"],
      }],
      pagination: { page: 3, limit: 20, total: 150, totalPages: 8 },
    });
  };

  const result = await api.fetchClientesFromBackend({
    page: 3,
    limit: 20,
    search: "global",
    status: "Proposta",
    quente: true,
    sortBy: "value",
  });
  assert.equal(result.data.length, 1);
  assert.equal(result.pagination.total, 150);
  assert.match(urls[0], /page=3/);
  assert.match(urls[0], /limit=20/);
  assert.match(urls[0], /search=global/);
  assert.match(urls[0], /status=Proposta/);
  assert.match(urls[0], /quente=true/);
  assert.match(urls[0], /sortBy=value/);
});

test("criação de cliente invalida o resumo pelo write central sem callback duplicado", async () => {
  const [source, apiSource] = await Promise.all([
    readFile(new URL("../src/hooks/useDashboardActions.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/services/crmApi.ts", import.meta.url), "utf8"),
  ]);

  assert.match(source, /import \{ useRef, useState \} from "react"/);
  assert.doesNotMatch(source, /onClientListChanged/);
  assert.match(apiSource, /async function requestCliente[\s\S]*notifyDashboardDataChanged\(\)/);
  assert.doesNotMatch(source, /setClients\(\(current\) => \[syncedClient, \.\.\.current\]\)/);
});

test("login valida a sessão completa antes de montar o Dashboard", async () => {
  const [login, app] = await Promise.all([
    readFile(new URL("../src/pages/Login.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(login, /onLogin: \(\) => void \| Promise<void>/);
  assert.match(login, /await onLogin\(\);/);
  assert.match(app, /const session = await fetchAuthMe\(\{ allowRefresh: false \}\);/);
  assert.match(app, /setValidatedSession\(session\);/);
});

test("contexto da Agenda possui limite previsível de duas chamadas", async () => {
  seedToken();
  const urls = [];
  globalThis.fetch = async (url) => {
    const text = String(url);
    urls.push(text);
    if (text.includes("/resumo")) {
      return jsonResponse({
        indicadores: { total: 240, pendentes: 200, paraHoje: 20, atrasados: 10, criticos: 2, concluidosPeriodo: 40 },
        proximos: [],
        porTipo: [],
      });
    }
    return jsonResponse({
      data: [{ id: 1, titulo: "Próximo compromisso" }],
      pagination: { page: 1, limit: 1, total: 240, totalPages: 240 },
    });
  };

  const result = await api.fetchAgendaDashboardContext({
    dataInicial: "2026-07-20T00:00:00.000Z",
    dataFinal: "2026-07-26T23:59:59.999Z",
  });
  assert.equal(urls.length, 2);
  assert.equal(urls.filter((url) => url.includes("/acompanhamentos/resumo")).length, 1);
  assert.equal(urls.filter((url) => url.includes("limit=1")).length, 1);
  assert.equal(urls.some((url) => /page=(2|3|4|5)/.test(url)), false);
  assert.equal(result.summary.indicadores.total, 240);
  assert.equal(result.next.titulo, "Próximo compromisso");
});
