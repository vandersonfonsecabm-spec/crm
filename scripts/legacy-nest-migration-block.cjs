const errorCode = "LEGACY_NEST_MIGRATION_DISABLED_USE_BACKEND_GATE";
console.error(JSON.stringify({
  event: "legacy_migration_blocked",
  safe: false,
  error: errorCode,
}));
process.exitCode = 1;
