const assert = require("node:assert/strict");
const { test } = require("node:test");
const { conversationCursorWhere, followUpCursorWhere } = require("../src/notifications/service");

test("cursores de fontes preservam ordem temporal e desempate por id", () => {
  const followUpAt = new Date("2026-08-27T09:00:00.000Z");
  const messageAt = new Date("2026-08-27T09:30:00.000Z");
  assert.deepEqual(followUpCursorWhere({ dataHora: followUpAt, id: 41 }), {
    OR: [
      { dataHora: { gt: followUpAt } },
      { dataHora: followUpAt, id: { gt: 41 } },
    ],
  });
  assert.deepEqual(conversationCursorWhere({ ultimaMensagemEm: messageAt, id: 52 }), {
    OR: [
      { ultimaMensagemEm: { gt: messageAt } },
      { ultimaMensagemEm: messageAt, id: { gt: 52 } },
    ],
  });
  assert.deepEqual(followUpCursorWhere(null), {});
  assert.deepEqual(conversationCursorWhere(null), {});
});
