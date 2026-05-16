function stripWhatsappFormatting(value) {
  return String(value || "").replace(/[\s\-()+]/g, "").trim();
}

function normalizeWhatsapp(value, { defaultCountryCode = "55" } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const compact = stripWhatsappFormatting(raw);
  if (!/^\d+$/.test(compact)) {
    throw new Error("WhatsApp deve conter somente números; espaços, traços, parênteses e + são removidos automaticamente.");
  }

  const country = String(defaultCountryCode || "55").replace(/\D/g, "") || "55";
  let phone = compact;
  if (!phone.startsWith(country) && /^\d{10,11}$/.test(phone)) {
    phone = `${country}${phone}`;
  }

  if (!phone.startsWith(country)) {
    throw new Error(`WhatsApp deve ser salvo no formato ${country}DDDNÚMERO.`);
  }
  if (!/^\d{12,13}$/.test(phone)) {
    throw new Error("WhatsApp deve ter entre 12 e 13 dígitos no formato 55DDDNÚMERO.");
  }

  return phone;
}

function isMissingBrazilMobileNinthDigit(phone) {
  const normalized = normalizeWhatsapp(phone);
  return !!normalized && normalized.startsWith("55") && normalized.length === 12;
}

module.exports = {
  normalizeWhatsapp,
  isMissingBrazilMobileNinthDigit,
};
