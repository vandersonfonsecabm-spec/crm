"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

test("Railway backend root observa o archive real e preserva startup seguro", () => {
  const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "railway.json"), "utf8"));
  assert.deepEqual(config.build?.watchPatterns, ["**"]);
  assert.equal(config.build?.builder, "NIXPACKS");
  assert.equal(config.build?.buildCommand, "npm run prisma:generate:runtime");
  assert.equal(config.deploy?.startCommand, "npm run start:production");
  assert.equal(config.deploy?.healthcheckPath, "/health");
});
