const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

function numberFromEnv(name, fallback, { min = -Infinity, max = Infinity } = {}) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function booleanFromEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

function listFromEnv(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

const primaryModel = process.env.GROQ_MODEL;
const fallbackModels = listFromEnv("GROQ_FALLBACK_MODELS");

function whatsappNumber(value = "") {
  return String(value).replace(/\D/g, "").replace(/^0/, "62");
}

module.exports = Object.freeze({
  server: {
    port: numberFromEnv("PORT", 3001, { min: 1, max: 65535 })
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY || "",
    primaryModel,
    models: [...new Set([primaryModel, ...fallbackModels].filter(Boolean))],
    maxTokens: numberFromEnv("GROQ_MAX_TOKENS", 1500, { min: 1 }),
    temperature: numberFromEnv("GROQ_TEMPERATURE", 0.35, { min: 0, max: 2 }),
    historyInputMessages: numberFromEnv("GROQ_HISTORY_INPUT_MESSAGES", 8, { min: 0 }),
    historyStoredMessages: numberFromEnv("GROQ_HISTORY_STORED_MESSAGES", 10, { min: 0 })
  },
  rag: {
    topK: numberFromEnv("RAG_TOP_K", 8, { min: 1 })
  },
  public: {
    whatsappNumber: whatsappNumber(process.env.PUBLIC_WHATSAPP_NUMBER),
    siteUrl: process.env.PUBLIC_SITE_URL || ""
  },
  whatsapp: {
    autoStart: booleanFromEnv("AUTO_START_BOT"),
    clientId: process.env.WA_CLIENT_ID || "aura-jewelry-bot",
    headless: booleanFromEnv("WA_HEADLESS", true)
  }
});
