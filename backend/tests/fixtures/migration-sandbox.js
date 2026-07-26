const fs = require("node:fs");
const path = require("node:path");

function copyMigrationsBefore({ backendDir, migrationsDir, migrationName }) {
  const source = path.join(backendDir, "prisma", "migrations");
  fs.mkdirSync(migrationsDir, { recursive: true });
  const lockFile = path.join(source, "migration_lock.toml");
  if (fs.existsSync(lockFile)) fs.copyFileSync(lockFile, path.join(migrationsDir, "migration_lock.toml"));
  for (const entry of fs.readdirSync(source, { withFileTypes: true })
    .filter((item) => item.isDirectory() && item.name < migrationName)
    .sort((left, right) => left.name.localeCompare(right.name))) {
    fs.cpSync(path.join(source, entry.name), path.join(migrationsDir, entry.name), { recursive: true });
  }
}

function copyTargetMigration({ backendDir, migrationsDir, migrationName }) {
  fs.cpSync(
    path.join(backendDir, "prisma", "migrations", migrationName),
    path.join(migrationsDir, migrationName),
    { recursive: true },
  );
}

module.exports = { copyMigrationsBefore, copyTargetMigration };
