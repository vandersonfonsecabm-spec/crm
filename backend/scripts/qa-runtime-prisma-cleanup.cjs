const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const rootParent = path.resolve(os.tmpdir(), "crm-prisma-tests");
const target = path.resolve(String(process.argv[2] || ""));

function isAllowed(root) {
  const relative = path.relative(rootParent, root);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative) && path.basename(root).toLowerCase().startsWith("postgres-prisma-");
}

if (!isAllowed(target)) process.exit(2);

let attempt = 0;
function remove() {
  attempt += 1;
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {}
  if (!fs.existsSync(target) || attempt >= 30) process.exit(fs.existsSync(target) ? 1 : 0);
  setTimeout(remove, Math.min(250 * attempt, 2000));
}

remove();
