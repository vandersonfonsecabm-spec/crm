"use strict";

// Kept as a focused entrypoint so future provider work cannot accidentally
// replace the deterministic, network-free mock connection.
const { MockCommerceAIConnection, DECISION_SCHEMA_VERSION } = require("./connection");

module.exports = { MockCommerceAIConnection, DECISION_SCHEMA_VERSION };
