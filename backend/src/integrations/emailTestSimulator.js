const crypto = require("node:crypto");
const { emailError, normalizeEmailAddress } = require("./emailFoundation");

function createEmailTestSimulator({ processor, env = process.env } = {}) {
  if (!processor || typeof processor.ingestRawEmail !== "function") throw new Error("Processor de E-mail obrigatorio.");
  assertSimulatorEnabled(env);
  const sessionNonce = crypto.randomBytes(24);
  let sequence = 0;

  return Object.freeze({
    async deliver(fixture = {}) {
      sequence += 1;
      const mailboxAddress = syntheticAddress(fixture.mailboxAddress || "inbox@tenant.example.test");
      const fromAddress = syntheticAddress(fixture.fromAddress || "sender@contact.example.test");
      const messageId = fixture.messageId || `<${stableSyntheticId(sessionNonce, sequence)}@events.example.test>`;
      const raw = fixture.raw === undefined
        ? buildRawEmailFixture({ ...fixture, mailboxAddress, fromAddress, messageId })
        : fixture.raw;
      return processor.ingestRawEmail({
        raw,
        mailboxAddress,
        providerType: "GENERIC",
        providerMessageId: fixture.providerMessageId || null,
        providerThreadId: fixture.providerThreadId || null,
        receivedAt: fixture.receivedAt || new Date(),
      });
    },
  });
}

function buildRawEmailFixture({
  mailboxAddress = "inbox@tenant.example.test",
  fromAddress = "sender@contact.example.test",
  fromName = "Synthetic Sender",
  messageId = "<synthetic-message@events.example.test>",
  subject = "Synthetic inbound message",
  text = "Synthetic inbound body",
  html = null,
  inReplyTo = null,
  references = [],
  autoSubmitted = null,
  precedence = null,
  bounce = false,
  attachment = null,
  date = new Date("2026-01-01T12:00:00.000Z"),
} = {}) {
  const mailbox = syntheticAddress(mailboxAddress);
  const sender = bounce ? "mailer-daemon@system.example.test" : syntheticAddress(fromAddress);
  const boundary = `crm-email-${crypto.createHash("sha256").update(String(messageId)).digest("hex").slice(0, 24)}`;
  const alternativeBoundary = `${boundary}-alternative`;
  const headers = [
    `From: ${sanitizeHeader(fromName)} <${sender}>`,
    `To: <${mailbox}>`,
    `Date: ${new Date(date).toUTCString()}`,
    `Message-ID: ${sanitizeHeader(messageId)}`,
    `Subject: ${sanitizeHeader(subject)}`,
    "MIME-Version: 1.0",
  ];
  if (inReplyTo) headers.push(`In-Reply-To: ${sanitizeHeader(inReplyTo)}`);
  if (references.length) headers.push(`References: ${references.map(sanitizeHeader).join(" ")}`);
  if (autoSubmitted) headers.push(`Auto-Submitted: ${sanitizeHeader(autoSubmitted)}`);
  if (precedence) headers.push(`Precedence: ${sanitizeHeader(precedence)}`);
  if (bounce) headers.push("Return-Path: <>");

  const parts = [];
  if (attachment) {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    if (html !== null) {
      parts.push(
        `--${boundary}`,
        `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
        "",
        `--${alternativeBoundary}`,
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        String(text || ""),
        `--${alternativeBoundary}`,
        "Content-Type: text/html; charset=utf-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        String(html),
        `--${alternativeBoundary}--`,
        "",
      );
    } else {
      parts.push(
        `--${boundary}`,
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        String(text || ""),
      );
    }
    const filename = sanitizeHeader(attachment.filename || "fixture.txt");
    const content = Buffer.from(String(attachment.content || "synthetic attachment"), "utf8").toString("base64");
    parts.push(
      `--${boundary}`,
      `Content-Type: ${sanitizeHeader(attachment.contentType || "text/plain")}; name="${filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      content,
    );
    parts.push(`--${boundary}--`, "");
  } else if (html !== null) {
    headers.push(`Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`);
    parts.push(
      `--${alternativeBoundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      String(text || ""),
      `--${alternativeBoundary}`,
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      String(html),
      `--${alternativeBoundary}--`,
      "",
    );
  } else {
    headers.push("Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: 8bit");
    parts.push(String(text || ""));
  }
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`, "utf8");
}

function assertSimulatorEnabled(env) {
  if (env.NODE_ENV === "production" || !["test", "development"].includes(env.NODE_ENV) || env.EMAIL_SYNTHETIC_SIMULATOR_ENABLED !== "true") {
    throw emailError(404, "EMAIL_SIMULATOR_UNAVAILABLE", "Simulador de E-mail indisponivel.");
  }
}

function syntheticAddress(value) {
  const address = normalizeEmailAddress(value);
  if (!address.endsWith(".example.test") && !address.endsWith("@example.test")) {
    throw emailError(422, "EMAIL_SIMULATOR_IDENTITY_INVALID", "Identidade sintetica de E-mail invalida.");
  }
  return address;
}

function sanitizeHeader(value) {
  const text = String(value || "").replace(/[\r\n\u0000-\u001f\u007f]/g, " ").trim();
  if (!text || text.length > 500) throw emailError(422, "EMAIL_SIMULATOR_FIXTURE_INVALID", "Fixture sintetica de E-mail invalida.");
  return text;
}

function stableSyntheticId(secret, sequence) {
  return crypto.createHmac("sha256", secret).update(String(sequence)).digest("hex").slice(0, 32);
}

module.exports = { buildRawEmailFixture, createEmailTestSimulator };
