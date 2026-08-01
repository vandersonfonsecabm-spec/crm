const crypto = require("node:crypto");
const { simpleParser } = require("mailparser");
const sanitizeHtml = require("sanitize-html");
const {
  emailError,
  normalizeEmailAddress,
  normalizeProviderType,
  normalizeOptionalText,
  stableHash,
} = require("./emailFoundation");

const EMAIL_LIMITS = Object.freeze({
  rawBytes: 10 * 1024 * 1024,
  headerBytes: 64 * 1024,
  headerLines: 200,
  recipients: 100,
  attachments: 20,
  mimeParts: 50,
  multipartContainers: 10,
  normalizedBodyChars: 512 * 1024,
});

const SINGLETON_HEADERS = new Set([
  "auto-submitted",
  "content-transfer-encoding",
  "content-type",
  "date",
  "from",
  "in-reply-to",
  "message-id",
  "mime-version",
  "reply-to",
  "return-path",
  "sender",
  "subject",
]);

const EMAIL_EVENT_TYPES = Object.freeze({
  TEXT: "EMAIL_TEXT",
  AUTO_REPLY: "EMAIL_AUTO_REPLY",
  BOUNCE: "EMAIL_BOUNCE",
  ATTACHMENT_ONLY: "EMAIL_ATTACHMENT_ONLY",
  IGNORED: "EMAIL_IGNORED",
});

function createEmailProviderAdapter({ providerType = "GENERIC" } = {}) {
  const normalizedProvider = normalizeProviderType(providerType);
  return {
    providerType: normalizedProvider,
    normalizeMailboxIdentity: normalizeEmailAddress,
    validateConfiguration({ env = process.env } = {}) {
      if (String(env.EMAIL_PROVIDER_TYPE || "").trim().toUpperCase() !== normalizedProvider) {
        throw emailError(503, "EMAIL_PROVIDER_CONFIGURATION_INVALID", "Provider de E-mail indisponivel.");
      }
      return { ready: true };
    },
    normalizeInboundMessage(input) {
      return normalizeInboundMessage({ ...input, providerType: normalizedProvider });
    },
    async acknowledge() {
      throw emailError(501, "EMAIL_PROVIDER_ACK_UNAVAILABLE", "Confirmacao do provider ainda nao implementada.");
    },
  };
}

async function normalizeInboundMessage({ raw, mailboxAddress, providerType, providerMessageId, providerThreadId, receivedAt }) {
  const buffer = toBuffer(raw);
  preflightRawMessage(buffer);
  const mailbox = normalizeEmailAddress(mailboxAddress);
  let parsed;
  try {
    parsed = await simpleParser(buffer, {
      skipTextToHtml: true,
      maxHtmlLengthToParse: EMAIL_LIMITS.normalizedBodyChars,
    });
  } catch {
    throw emailError(422, "EMAIL_MIME_INVALID", "Mensagem de E-mail invalida.");
  }

  const from = addressList(parsed.from);
  if (from.length !== 1) throw emailError(422, "EMAIL_SENDER_INVALID", "Remetente de E-mail invalido.");
  const to = addressList(parsed.to);
  const cc = addressList(parsed.cc);
  const bcc = addressList(parsed.bcc);
  if (to.length + cc.length + bcc.length > EMAIL_LIMITS.recipients) {
    throw emailError(413, "EMAIL_RECIPIENT_LIMIT_EXCEEDED", "Limite de destinatarios excedido.");
  }
  if (parsed.attachments.length > EMAIL_LIMITS.attachments) {
    throw emailError(413, "EMAIL_ATTACHMENT_LIMIT_EXCEEDED", "Limite de anexos excedido.");
  }

  const htmlSanitized = sanitizeBodyHtml(parsed.html);
  const text = normalizeBodyText(parsed.text || htmlToText(htmlSanitized));
  const messageId = normalizeOpaque(parsed.messageId, 512);
  const normalizedProviderMessageId = normalizeOpaque(providerMessageId, 512);
  const normalizedProviderThreadId = normalizeOpaque(providerThreadId, 512);
  const inReplyTo = normalizeOpaque(parsed.inReplyTo, 512);
  const references = normalizeReferences(parsed.references);
  const eventType = classifyMessage(parsed, text);
  const subject = normalizeOptionalText(parsed.subject, "subject", 500);
  const replyTo = addressList(parsed.replyTo)[0]?.address || null;
  const attachments = parsed.attachments.map(attachmentMetadata);
  const externalSeed = normalizedProviderMessageId
    || messageId
    || `envelope:${normalizedEnvelopeHash({ parsed, mailbox, from: from[0], to, cc, bccCount: bcc.length, replyTo, subject, text, htmlSanitized, attachments })}`;
  const externalEventId = `email:${stableHash(`${mailbox}\u0000${externalSeed}`)}`;
  const messageReceivedAt = normalizeDate(parsed.date || receivedAt || new Date());

  return {
    schemaVersion: 1,
    provider: `EMAIL_${providerType}`,
    providerType,
    mailboxAddress: mailbox,
    externalEventId,
    eventType,
    messageId,
    providerMessageId: normalizedProviderMessageId,
    providerThreadId: normalizedProviderThreadId,
    inReplyTo,
    references,
    from: from[0],
    to,
    cc,
    bccCount: bcc.length,
    replyTo,
    subject,
    text,
    htmlSanitized,
    attachments,
    rawSize: buffer.length,
    receivedAt: messageReceivedAt.toISOString(),
  };
}

function normalizedEnvelopeHash({ parsed, mailbox, from, to, cc, bccCount, replyTo, subject, text, htmlSanitized, attachments }) {
  const headerDate = parsed.date instanceof Date && !Number.isNaN(parsed.date.getTime())
    ? parsed.date.toISOString()
    : null;
  const attachmentSeeds = attachments.map((metadata, index) => ({
    ...metadata,
    contentHash: Buffer.isBuffer(parsed.attachments[index]?.content)
      ? crypto.createHash("sha256").update(parsed.attachments[index].content).digest("hex")
      : null,
  }));
  return stableHash(JSON.stringify({
    mailbox,
    from: from.address,
    to: to.map(({ address }) => address).sort(),
    cc: cc.map(({ address }) => address).sort(),
    bccCount,
    replyTo,
    subject,
    headerDate,
    text,
    htmlSanitized,
    attachments: attachmentSeeds,
  }));
}

function preflightRawMessage(buffer) {
  if (!buffer.length) throw emailError(422, "EMAIL_MIME_EMPTY", "Mensagem de E-mail vazia.");
  if (buffer.length > EMAIL_LIMITS.rawBytes) throw emailError(413, "EMAIL_BODY_LIMIT_EXCEEDED", "Limite da mensagem de E-mail excedido.");
  const separator = headerBoundary(buffer);
  if (separator < 0 || separator > EMAIL_LIMITS.headerBytes) throw emailError(413, "EMAIL_HEADER_LIMIT_EXCEEDED", "Cabecalhos de E-mail excedem o limite.");
  const headerLines = buffer.subarray(0, separator).toString("latin1").split(/\r?\n/);
  if (headerLines.length > EMAIL_LIMITS.headerLines) throw emailError(413, "EMAIL_HEADER_LIMIT_EXCEEDED", "Quantidade de cabecalhos excedida.");
  assertSingletonHeaders(headerLines);
  assertMimeStructure(buffer.toString("latin1"));
}

function assertSingletonHeaders(lines) {
  const counts = new Map();
  let current = null;
  for (const line of lines) {
    if (/^[ \t]/.test(line)) {
      if (!current) throw emailError(422, "EMAIL_HEADER_INVALID", "Cabecalho de E-mail invalido.");
      continue;
    }
    const match = line.match(/^([A-Za-z0-9-]+):/);
    if (!match) throw emailError(422, "EMAIL_HEADER_INVALID", "Cabecalho de E-mail invalido.");
    current = match[1].toLowerCase();
    counts.set(current, (counts.get(current) || 0) + 1);
  }
  if ([...SINGLETON_HEADERS].some((name) => (counts.get(name) || 0) > 1)) {
    throw emailError(422, "EMAIL_HEADER_AMBIGUOUS", "Cabecalho de E-mail ambiguo.");
  }
}

function assertMimeStructure(rawText) {
  const declarations = [...rawText.matchAll(/(?:^|\r?\n)Content-Type:[^\r\n]*(?:\r?\n[ \t][^\r\n]*)*/gi)]
    .map((match) => match[0].replace(/^\r?\n/, ""))
    .filter((value) => /Content-Type:\s*multipart\//i.test(value));
  if (declarations.length > EMAIL_LIMITS.multipartContainers) {
    throw emailError(413, "EMAIL_MIME_STRUCTURE_LIMIT_EXCEEDED", "Estrutura MIME excede o limite.");
  }
  const boundaries = declarations.map((value) => {
    const match = value.match(/boundary\s*=\s*(?:"([^"\r\n]{1,200})"|([^;\s\r\n]{1,200}))/i);
    if (!match) throw emailError(422, "EMAIL_MIME_INVALID", "Mensagem de E-mail invalida.");
    return match[1] || match[2];
  });
  if (new Set(boundaries).size !== boundaries.length) throw emailError(422, "EMAIL_MIME_INVALID", "Mensagem de E-mail invalida.");
  let parts = 0;
  for (const boundary of boundaries) {
    const delimiter = new RegExp(`(?:^|\\r?\\n)--${escapeRegExp(boundary)}(?!--)[ \\t]*(?=\\r?$)`, "gm");
    parts += [...rawText.matchAll(delimiter)].length;
  }
  if (parts > EMAIL_LIMITS.mimeParts) throw emailError(413, "EMAIL_MIME_STRUCTURE_LIMIT_EXCEEDED", "Estrutura MIME excede o limite.");
}

function headerBoundary(buffer) {
  const crlf = buffer.indexOf(Buffer.from("\r\n\r\n"));
  if (crlf >= 0) return crlf;
  return buffer.indexOf(Buffer.from("\n\n"));
}

function addressList(value) {
  const items = Array.isArray(value?.value) ? value.value : [];
  return items.map((item) => ({
    address: normalizeEmailAddress(item.address),
    name: normalizeOptionalText(item.name, "addressName", 160),
  }));
}

function normalizeReferences(value) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\s+/) : [];
  return [...new Set(source.map((item) => normalizeOpaque(item, 512)).filter(Boolean))].slice(-100);
}

function normalizeOpaque(value, maxLength) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!text || text.length > maxLength) throw emailError(422, "EMAIL_IDENTIFIER_INVALID", "Identificador de E-mail invalido.");
  return text;
}

function normalizeBodyText(value) {
  const text = String(value || "").replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
  if (text.length > EMAIL_LIMITS.normalizedBodyChars) throw emailError(413, "EMAIL_CONTENT_LIMIT_EXCEEDED", "Conteudo de E-mail excede o limite.");
  return text || null;
}

function sanitizeBodyHtml(value) {
  if (!value) return null;
  const clean = sanitizeHtml(String(value), {
    allowedTags: ["p", "br", "div", "span", "strong", "b", "em", "i", "u", "ul", "ol", "li", "blockquote", "pre", "code", "a"],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
  }).trim();
  if (clean.length > EMAIL_LIMITS.normalizedBodyChars) throw emailError(413, "EMAIL_CONTENT_LIMIT_EXCEEDED", "Conteudo de E-mail excede o limite.");
  return clean || null;
}

function htmlToText(value) {
  if (!value) return "";
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} });
}

function classifyMessage(parsed, text) {
  const autoSubmitted = headerText(parsed, "auto-submitted").toLowerCase();
  const precedence = headerText(parsed, "precedence").toLowerCase();
  const autoResponseSuppress = headerText(parsed, "x-auto-response-suppress").toLowerCase();
  const returnPath = headerText(parsed, "return-path").replace(/\s/g, "");
  const contentType = headerText(parsed, "content-type").toLowerCase();
  const sender = addressList(parsed.from)[0]?.address || "";
  const deliveryStatus = parsed.attachments.some((item) => String(item.contentType || "").toLowerCase() === "message/delivery-status");
  if (returnPath === "<>" || contentType.includes("multipart/report") || contentType.includes("report-type=delivery-status") || deliveryStatus || /(^|[._-])(mailer-daemon|postmaster)(@|$)/i.test(sender)) return EMAIL_EVENT_TYPES.BOUNCE;
  if ((autoSubmitted && autoSubmitted !== "no") || ["bulk", "junk", "list"].includes(precedence) || (autoResponseSuppress && autoResponseSuppress !== "none")) return EMAIL_EVENT_TYPES.AUTO_REPLY;
  if (text) return EMAIL_EVENT_TYPES.TEXT;
  if (parsed.attachments.length) return EMAIL_EVENT_TYPES.ATTACHMENT_ONLY;
  return EMAIL_EVENT_TYPES.IGNORED;
}

function headerText(parsed, name) {
  const value = parsed.headers?.get(name);
  if (Array.isArray(value)) return value.join(" ");
  if (value && typeof value === "object" && "value" in value) return String(value.value || "");
  return String(value || "");
}

function attachmentMetadata(item) {
  return {
    filename: safeAttachmentFilename(item.filename),
    contentType: normalizeOptionalText(item.contentType, "attachmentContentType", 160),
    contentDisposition: normalizeOptionalText(item.contentDisposition, "attachmentDisposition", 40),
    contentId: normalizeOpaque(item.cid, 255),
    size: Number.isSafeInteger(item.size) && item.size >= 0 ? item.size : Buffer.isBuffer(item.content) ? item.content.length : 0,
  };
}

function safeAttachmentFilename(value) {
  if (value === undefined || value === null || value === "") return null;
  const basename = String(value).split(/[\\/]/).pop().replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/gi, "");
  return normalizeOptionalText(basename, "attachmentFilename", 255);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw emailError(422, "EMAIL_RECEIVED_AT_INVALID", "Data de recebimento invalida.");
  return date;
}

function toBuffer(raw) {
  if (Buffer.isBuffer(raw)) return raw;
  if (typeof raw === "string") return Buffer.from(raw, "utf8");
  throw emailError(422, "EMAIL_MIME_INVALID", "Mensagem de E-mail invalida.");
}

module.exports = {
  EMAIL_EVENT_TYPES,
  EMAIL_LIMITS,
  createEmailProviderAdapter,
  normalizeInboundMessage,
};
