const MAX_E164_DIGITS = 15;
const MIN_PHONE_DIGITS = 8;

function normalizePhone(value, options = {}) {
  const raw = String(value === undefined || value === null ? "" : value).trim();
  if (!raw) throw validationError("Telefone obrigatorio.");

  const defaultCountryCode = cleanCountryCode(options.defaultCountryCode);
  const hasPlus = raw.startsWith("+");
  let text = raw.replace(/[\s().-]/g, "");
  if (hasPlus) text = text.slice(1);
  if (text.includes("+")) throw validationError("O sinal de + so pode aparecer no inicio.");
  text = text.replace(/[\/\\_]/g, "");

  if (!/^\d+$/.test(text)) {
    throw validationError("Telefone deve conter apenas digitos apos normalizacao.");
  }
  if (!hasPlus && defaultCountryCode) text = defaultCountryCode + text;
  if (!hasPlus && !defaultCountryCode) {
    throw validationError("Informe o codigo do pais explicitamente.");
  }
  if (text.length < MIN_PHONE_DIGITS) throw validationError("Telefone muito curto.");
  if (text.length > MAX_E164_DIGITS) throw validationError("Telefone excede o limite E.164.");
  return `+${text}`;
}

function cleanCountryCode(value) {
  if (value === undefined || value === null || value === "") return null;
  let text = String(value).trim();
  if (text.startsWith("+")) text = text.slice(1);
  text = text.replace(/[\s().-]/g, "");
  if (!/^\d+$/.test(text)) throw validationError("Codigo de pais invalido.");
  if (!text || text.length > 3) throw validationError("Codigo de pais invalido.");
  return text;
}

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  error.codigo = "CHANNEL_PHONE_INVALID";
  return error;
}

module.exports = { normalizePhone, MAX_E164_DIGITS, MIN_PHONE_DIGITS };
