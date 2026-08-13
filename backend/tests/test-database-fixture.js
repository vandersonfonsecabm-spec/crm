const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..", "..");
const protectedDatabase = path.join(repositoryRoot, "backend", "prisma", "dev.db");

function requiredRunDirectory() {
  const value = String(process.env.CRM_PRISMA_TEST_RUN_DIR || "").trim();
  if (!value || !path.isAbsolute(value)) throw new Error("CRM_PRISMA_TEST_RUN_DIR absoluto e obrigatorio.");
  const resolved = canonicalSandboxPath(value, "CRM_PRISMA_TEST_RUN_DIR");
  assertTempPath(resolved, "CRM_PRISMA_TEST_RUN_DIR");
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function requiredBaseDatabase() {
  const value = String(process.env.CRM_TEST_BASE_DATABASE_PATH || "").trim();
  if (!value || !path.isAbsolute(value)) throw new Error("CRM_TEST_BASE_DATABASE_PATH absoluto e obrigatorio.");
  const resolved = canonicalSandboxPath(value, "CRM_TEST_BASE_DATABASE_PATH");
  const runDirectory = requiredRunDirectory();
  assertInside(resolved, runDirectory, "CRM_TEST_BASE_DATABASE_PATH");
  assertSafeExistingFile(resolved, "CRM_TEST_BASE_DATABASE_PATH");
  return resolved;
}

function createTestDatabase(name = `test-${process.pid}.db`) {
  const directory = path.join(requiredRunDirectory(), "legacy-fixtures");
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, name);
  assertSafeNewPath(target);
  fs.copyFileSync(requiredBaseDatabase(), target, fs.constants.COPYFILE_EXCL);
  return target;
}

function createEmptyTestDatabase(name = `empty-${process.pid}.db`) {
  const directory = path.join(requiredRunDirectory(), "legacy-fixtures");
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, name);
  assertSafeNewPath(target);
  fs.writeFileSync(target, "", { flag: "wx" });
  return target;
}

function databaseUrl(file) {
  const resolved = canonicalSandboxPath(file, "SQLite sandbox");
  assertInside(resolved, requiredRunDirectory(), "SQLite sandbox");
  assertNotProtected(resolved);
  return `file:${resolved.replace(/\\/g, "/")}`;
}

function removeDatabase(file) {
  const resolved = canonicalSandboxPath(file, "SQLite sandbox");
  assertInside(resolved, requiredRunDirectory(), "SQLite sandbox");
  assertNotProtected(resolved);
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const target = `${resolved}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
}

function assertSafeExistingFile(file, label) {
  assertNotProtected(file);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} deve ser arquivo regular sem symlink.`);
  const real = fs.realpathSync.native(file);
  if (path.resolve(real).toLowerCase() !== path.resolve(file).toLowerCase()) {
    throw new Error(`${label} nao pode resolver por junction/symlink.`);
  }
}

function assertSafeNewPath(file) {
  const resolved = canonicalSandboxPath(file, "SQLite sandbox");
  assertInside(resolved, requiredRunDirectory(), "SQLite sandbox");
  assertNotProtected(resolved);
  if (fs.existsSync(resolved)) throw new Error(`Destino de teste ja existe: ${resolved}`);
  let current = path.dirname(resolved);
  while (current && current !== path.dirname(current)) {
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || path.resolve(fs.realpathSync.native(current)).toLowerCase() !== path.resolve(current).toLowerCase()) {
        throw new Error("Diretorio de teste nao pode conter symlink/junction.");
      }
    }
    current = path.dirname(current);
  }
}

function assertTempPath(file, label) {
  const tempRoot = path.resolve(os.tmpdir());
  assertInside(path.resolve(file), tempRoot, label);
  assertNotProtected(file);
}

function canonicalSandboxPath(file, label) {
  const resolved = path.resolve(file);
  let current = resolved;
  while (current && current !== path.dirname(current)) {
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || path.resolve(fs.realpathSync.native(current)).toLowerCase() !== path.resolve(current).toLowerCase()) {
        throw new Error(`${label} nao pode resolver por symlink/junction.`);
      }
    }
    current = path.dirname(current);
  }
  return resolved;
}

function assertInside(candidate, parent, label) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} deve permanecer na sandbox TEMP.`);
  }
}

function assertNotProtected(file) {
  const resolved = path.resolve(file);
  const protectedResolved = path.resolve(protectedDatabase);
  if (resolved.toLowerCase() === protectedResolved.toLowerCase()) throw new Error("CRM_TEST_DATABASE_PATH_PROTECTED");
  if (fs.existsSync(resolved)) {
    const real = path.resolve(fs.realpathSync.native(resolved));
    if (real.toLowerCase() === protectedResolved.toLowerCase()) throw new Error("CRM_TEST_DATABASE_PATH_PROTECTED");
  }
}

module.exports = {
  createEmptyTestDatabase,
  createTestDatabase,
  databaseUrl,
  removeDatabase,
  requiredBaseDatabase,
  requiredRunDirectory,
};
