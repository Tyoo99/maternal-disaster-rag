const express = require("express");
const ChatbotService = require("./lib/chatbot");
const registerApi = require("./lib/register-api");

const app = express();
const chatbot = new ChatbotService();

app.set("trust proxy", 1);
app.use(express.json({ limit: "20kb" }));
registerApi(app, chatbot);
app.get("/api/health", (_req, res) => res.json({ ok: true, products: chatbot.rag.products.length }));
app.use((error, _req, res, _next) => {
  console.error("[HTTP]", error);
  const malformedJson = error?.type === "entity.parse.failed";
  res.status(malformedJson ? 400 : 500).json({ error: malformedJson ? "Format JSON tidak valid." : "Terjadi kesalahan pada server." });
});

module.exports = app;
