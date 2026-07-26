import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function verifyArchitecture({ root = repositoryRoot, overrides = {} } = {}) {
  const failures = [];

  function read(relativePath) {
    return Object.hasOwn(overrides, relativePath)
      ? overrides[relativePath]
      : fs.readFileSync(path.join(root, relativePath), "utf8");
  }

  function readJson(relativePath) {
    return JSON.parse(read(relativePath));
  }

  function check(condition, message) {
    if (!condition) failures.push(message);
  }

  const rootPackage = readJson("package.json");
  const backendPackage = readJson("backend/package.json");
  const railway = readJson("backend/railway.json");
  const vercel = readJson("vercel.json");
  const frontendVercel = readJson("frontend/vercel.json");
  const backendSchema = read("backend/prisma/schema.prisma");
  const architecture = read("docs/ARCHITECTURE.md");
  const deployment = read("docs/DEPLOYMENT.md");
  const legacy = read("docs/LEGACY_NEST.md");
  const readme = read("README.md");

  for (const scriptName of ["start", "dev", "build", "start:dev", "start:prod"]) {
    check(
      rootPackage.scripts?.[scriptName]?.includes("scripts/root-runtime-guard.mjs"),
      `O script raiz ${scriptName} deve falhar pelo root runtime guard.`,
    );
  }

  for (const scriptName of ["backend:dev", "backend:start", "backend:test"]) {
    check(rootPackage.scripts?.[scriptName]?.includes("--prefix backend"), `Script explicito ausente: ${scriptName}.`);
  }

  for (const scriptName of ["frontend:dev", "frontend:build", "frontend:lint", "frontend:test"]) {
    check(rootPackage.scripts?.[scriptName]?.includes("--prefix frontend"), `Script explicito ausente: ${scriptName}.`);
  }

  const activeRootScripts = Object.entries(rootPackage.scripts || {}).filter(([name]) => !name.startsWith("legacy:nest:"));
  for (const [name, command] of activeRootScripts) {
    check(!/\bnest\b|dist[\\/]main|prisma[\\/]seed\.ts/i.test(command), `Script raiz ativo aponta para Nest: ${name}.`);
  }

  check(rootPackage.scripts?.["legacy:nest:build"] === "nest build", "Build Nest deve existir somente sob legacy:nest:build.");
  check(rootPackage.scripts?.["legacy:nest:start"] === "nest start", "Start Nest deve existir somente sob legacy:nest:start.");
  check(rootPackage.scripts?.["verify:architecture"] === "node scripts/verify-architecture.mjs", "Guard arquitetural nao registrado.");

  const startupEntrypoint = nodeEntrypoint(backendPackage.scripts?.start);
  check(startupEntrypoint === "scripts/start-production.cjs", "Start oficial deve apontar para scripts/start-production.cjs.");
  check(backendPackage.main === "src/server.js", "Entrypoint declarado do pacote backend deve ser o Express.");
  check(backendPackage.scripts?.["start:production"] === backendPackage.scripts?.start, "Start de producao diverge do start oficial.");
  check(backendPackage.scripts?.["railway:start"] === "npm run start:production", "Alias Railway nao aponta para o start de producao.");
  if (startupEntrypoint) {
    const startupPath = path.posix.join("backend", startupEntrypoint.replaceAll("\\", "/"));
    const startupSource = read(startupPath);
    const startupFailures = verifyStartupComposition(startupSource);
    for (const failure of startupFailures) failures.push(failure);
  }

  for (const [name, command] of Object.entries(backendPackage.scripts || {})) {
    check(!/prisma\s+db\s+push/i.test(command), `Script Express usa prisma db push: ${name}.`);
    check(!/\bnest\b|src[\\/]main/i.test(command), `Script Express aponta para Nest: ${name}.`);
  }

  const railwayBuild = railway.build?.buildCommand || "";
  const railwayStart = railway.deploy?.startCommand || "";
  const railwayInstallsDependencies = /\b(?:npm\s+(?:ci|install)|yarn\s+install|pnpm\s+install)\b/i.test(railwayBuild);
  const railwayGeneratesPrisma = /^npx\s+prisma\s+generate$/i.test(railwayBuild.trim())
    || (!railwayBuild && /\bprisma\s+generate\b/i.test(backendPackage.scripts?.postinstall || ""));
  check(railway.build?.builder === "NIXPACKS", "Railway deve usar o builder Nixpacks declarado.");
  check(railwayStart === "npm run start:production", "Railway deve iniciar somente o Express em backend/.");
  check(railway.deploy?.healthcheckPath === "/health", "Railway deve verificar /health.");
  check(
    !railwayInstallsDependencies,
    "Railway buildCommand nao deve instalar dependencias: o builder ja executa a instalacao e duplica-la pode causar conflito em node_modules.",
  );
  check(railwayGeneratesPrisma, "Railway deve gerar o Prisma Client no build ou em lifecycle seguro de instalacao.");
  check(!/\.\.[\\/]prisma\b/i.test(railwayBuild), "Railway buildCommand nao pode referenciar o Prisma legado da raiz.");
  check(!/db\s+push|\bseed\b|\bnest\b/i.test(`${railwayBuild} ${railwayStart}`), "Railway contem comando destrutivo ou Nest.");

  const vercelConfig = JSON.stringify(vercel);
  const frontendVercelConfig = JSON.stringify(frontendVercel);
  check(vercel.installCommand === "npm install --prefix frontend", "Vercel raiz deve instalar somente frontend/.");
  check(vercel.buildCommand === "npm run build --prefix frontend", "Vercel raiz deve construir somente frontend/.");
  check(vercel.outputDirectory === "frontend/dist", "Vercel raiz deve publicar frontend/dist.");
  check(!/backend|prisma|\bnest\b/i.test(`${vercelConfig} ${frontendVercelConfig}`), "Vercel nao pode iniciar backend, Prisma ou Nest.");

  check(!fs.existsSync(path.join(root, "render.yaml")), "render.yaml ativo deve permanecer removido da raiz.");
  check(/provider\s*=\s*"sqlite"/.test(backendSchema), "Schema operacional deve ser o SQLite de backend/prisma.");
  check(/unico backend operacional/i.test(architecture), "ARCHITECTURE deve declarar um unico backend operacional.");
  check(/Root Directory.*backend/i.test(deployment), "DEPLOYMENT deve declarar backend/ como Root Directory do Railway.");
  check(/legado congelado/i.test(legacy), "LEGACY_NEST deve classificar o Nest como legado congelado.");
  check(/backend\/.*(?:unico|único) backend operacional/i.test(readme), "README deve apontar backend/ como unico backend operacional.");
  return failures;
}

function nodeEntrypoint(command) {
  const match = String(command || "").trim().match(/^node\s+([^\s]+)$/i);
  return match?.[1] || null;
}

export function verifyStartupComposition(source) {
  const failures = [];
  const startupStart = source.indexOf("async function runStartup");
  const startupEnd = source.indexOf("\nfunction isRailwayEnvironment", startupStart);
  const startup = startupStart >= 0 && startupEnd > startupStart ? source.slice(startupStart, startupEnd) : "";
  const validateIndex = startup.indexOf("validateRailwayEnvironment(");
  const migrateIndex = startup.indexOf("options.runMigration || runPrismaMigration");
  const serverIndex = startup.indexOf("options.startServer || startApiServer");
  if (!startup) failures.push("Entrypoint de producao nao declara runStartup.");
  if (validateIndex < 0) failures.push("Entrypoint de producao nao valida o ambiente antes da migration.");
  if (migrateIndex < 0) failures.push("Entrypoint de producao nao executa prisma migrate deploy.");
  if (serverIndex < 0) failures.push("Entrypoint de producao nao inicia a API.");
  if (validateIndex >= 0 && migrateIndex >= 0 && serverIndex >= 0 && !(validateIndex < migrateIndex && migrateIndex < serverIndex)) {
    failures.push("Ordem obrigatoria do startup deve ser validacao, migration e API.");
  }

  const migrationStart = source.indexOf("async function runPrismaMigration");
  const migrationEnd = source.indexOf("\nasync function startApiServer", migrationStart);
  const migration = migrationStart >= 0 && migrationEnd > migrationStart ? source.slice(migrationStart, migrationEnd) : "";
  if (!/"migrate",\s*"deploy"/.test(migration) || !/"--schema"/.test(migration) || !/shell:\s*false/.test(source)) {
    failures.push("Migration de startup deve executar prisma migrate deploy com schema explicito e sem shell.");
  }

  const serverStart = source.indexOf("async function startApiServer");
  const serverEnd = source.indexOf("\nfunction superviseServer", serverStart);
  const server = serverStart >= 0 && serverEnd > serverStart ? source.slice(serverStart, serverEnd) : "";
  const runtimeIndex = server.indexOf("VALIDATE_RUNTIME_PATH");
  const apiIndex = server.indexOf("SERVER_PATH");
  if (runtimeIndex < 0 || apiIndex < 0 || runtimeIndex >= apiIndex) {
    failures.push("API deve validar o runtime antes de iniciar src/server.js.");
  }
  return failures;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const failures = verifyArchitecture();
  if (failures.length > 0) {
    console.error("Verificacao arquitetural reprovada:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("Arquitetura verificada: frontend/ no Vercel, backend/ Express no Railway e Nest isolado como legado.");
  }
}
