import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
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

for (const scriptName of ["frontend:dev", "frontend:build", "frontend:lint"]) {
  check(rootPackage.scripts?.[scriptName]?.includes("--prefix frontend"), `Script explicito ausente: ${scriptName}.`);
}

const activeRootScripts = Object.entries(rootPackage.scripts || {}).filter(([name]) => !name.startsWith("legacy:nest:"));
for (const [name, command] of activeRootScripts) {
  check(!/\bnest\b|dist[\\/]main|prisma[\\/]seed\.ts/i.test(command), `Script raiz ativo aponta para Nest: ${name}.`);
}

check(rootPackage.scripts?.["legacy:nest:build"] === "nest build", "Build Nest deve existir somente sob legacy:nest:build.");
check(rootPackage.scripts?.["legacy:nest:start"] === "nest start", "Start Nest deve existir somente sob legacy:nest:start.");
check(rootPackage.scripts?.["verify:architecture"] === "node scripts/verify-architecture.mjs", "Guard arquitetural nao registrado.");

check(backendPackage.scripts?.start?.includes("scripts/validate-runtime.js"), "Start Express nao valida a configuracao de runtime.");
check(backendPackage.scripts?.start?.includes("src/server.js"), "Start oficial nao aponta para o Express.");
check(backendPackage.main === "src/server.js", "Entrypoint declarado do pacote backend deve ser o Express.");
check(backendPackage.scripts?.["start:production"] === backendPackage.scripts?.start, "Start de producao diverge do start oficial.");
check(backendPackage.scripts?.["railway:start"] === "npm run start:production", "Alias Railway nao aponta para o start de producao.");

for (const [name, command] of Object.entries(backendPackage.scripts || {})) {
  check(!/prisma\s+db\s+push/i.test(command), `Script Express usa prisma db push: ${name}.`);
  if (/start|build|railway/i.test(name)) {
    check(!/\bseed\b|prisma\s+migrate/i.test(command), `Script automatico Express altera banco: ${name}.`);
  }
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
check(!/db\s+push|\bseed\b|prisma\s+migrate|\bnest\b/i.test(`${railwayBuild} ${railwayStart}`), "Railway contem comando destrutivo ou Nest.");

const vercelConfig = JSON.stringify(vercel);
const frontendVercelConfig = JSON.stringify(frontendVercel);
check(vercel.installCommand === "npm install --prefix frontend", "Vercel raiz deve instalar somente frontend/.");
check(vercel.buildCommand === "npm run build --prefix frontend", "Vercel raiz deve construir somente frontend/.");
check(vercel.outputDirectory === "frontend/dist", "Vercel raiz deve publicar frontend/dist.");
check(!/backend|prisma|\bnest\b/i.test(`${vercelConfig} ${frontendVercelConfig}`), "Vercel nao pode iniciar backend, Prisma ou Nest.");

check(!fs.existsSync(path.join(repositoryRoot, "render.yaml")), "render.yaml ativo deve permanecer removido da raiz.");
check(/provider\s*=\s*"sqlite"/.test(backendSchema), "Schema operacional deve ser o SQLite de backend/prisma.");
check(/unico backend operacional/i.test(architecture), "ARCHITECTURE deve declarar um unico backend operacional.");
check(/Root Directory.*backend/i.test(deployment), "DEPLOYMENT deve declarar backend/ como Root Directory do Railway.");
check(/legado congelado/i.test(legacy), "LEGACY_NEST deve classificar o Nest como legado congelado.");
check(/backend\/.*(?:unico|único) backend operacional/i.test(readme), "README deve apontar backend/ como unico backend operacional.");

if (failures.length > 0) {
  console.error("Verificacao arquitetural reprovada:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Arquitetura verificada: frontend/ no Vercel, backend/ Express no Railway e Nest isolado como legado.");
}
