const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const qrcode = require("qrcode-terminal");
const { Client } = require("whatsapp-web.js");
const config = require("./lib/config");
const ChatbotService = require("./lib/chatbot");
const ResilientLocalAuth = require("./lib/resilient-local-auth");
const registerApi = require("./lib/register-api");

const app = express();
const chatbot = new ChatbotService();
const port = config.server.port;

let client = null;
let qrCode = null;
let isReady = false;
let isInitializing = false;
let isResetting = false;
let botNumber = null;

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

function createClient() {
  console.log("[WA] Memuat WhatsApp Web terbaru tanpa cache HTML.");
  const wa = new Client({
    authStrategy: new ResilientLocalAuth({ clientId: config.whatsapp.clientId, rmMaxRetries: 10 }),
    authTimeoutMs: config.whatsapp.authTimeoutMs,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    webVersionCache: { type: "none" },
    puppeteer: {
      headless: config.whatsapp.headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    }
  });

  wa.on("qr", (value) => {
    qrCode = value;
    isInitializing = false;
    qrcode.generate(value, { small: true });
    console.log("[WA] Pindai QR melalui /admin.html atau terminal.");
  });
  wa.on("ready", () => {
    isReady = true;
    isInitializing = false;
    qrCode = null;
    botNumber = wa.info?.wid?.user || null;
    console.log(`[WA] Bot siap${botNumber ? `: ${botNumber}` : ""}`);
  });
  wa.on("authenticated", () => console.log("[WA] Autentikasi berhasil."));
  wa.on("auth_failure", (message) => {
    isReady = false;
    isInitializing = false;
    console.error("[WA] Autentikasi gagal:", message);
  });
  wa.on("disconnected", (reason) => {
    isReady = false;
    isInitializing = false;
    qrCode = null;
    if (!isResetting) client = null;
    console.warn("[WA] Terputus:", reason);
  });
  wa.on("message", async (incoming) => {
    if (incoming.fromMe || incoming.from.endsWith("@g.us") || incoming.from === "status@broadcast") return;
    try {
      await incoming.reply(await chatbot.replyFor(incoming.from, incoming.body));
    } catch (error) {
      console.error("[WA] Gagal memproses pesan:", error);
    }
  });
  return wa;
}

async function startBot() {
  if (client || isInitializing || isReady) return;
  isInitializing = true;
  qrCode = null;
  client = createClient();
  const initializingClient = client;
  try {
    await initializingClient.initialize();
  } catch (error) {
    if (client === initializingClient) client = null;
    isInitializing = false;
    console.error("[WA] Inisialisasi gagal:", error.message);
    await initializingClient.destroy().catch((destroyError) => {
      console.warn("[WA] Cleanup setelah inisialisasi gagal:", destroyError.message);
    });
    throw error;
  }
}

async function stopBot() {
  const current = client;
  client = null;
  isReady = false;
  isInitializing = false;
  qrCode = null;
  botNumber = null;
  if (current) await current.destroy().catch((error) => console.warn("[WA] Destroy:", error.message));
}

async function resetBotSession() {
  isResetting = true;
  const current = client;
  client = null;
  isReady = false;
  isInitializing = false;
  qrCode = null;
  botNumber = null;

  try {
    if (current) {
      await current.destroy().catch((error) => console.warn("[WA] Destroy saat reset:", error.message));
    }

    const authRoot = path.resolve(__dirname, ".wwebjs_auth");
    const sessionDir = path.resolve(authRoot, `session-${config.whatsapp.clientId}`);
    if (!sessionDir.startsWith(`${authRoot}${path.sep}`)) {
      throw new Error("Path sesi WhatsApp tidak valid.");
    }

    await fs.promises.rm(sessionDir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 250
    });
  } finally {
    isResetting = false;
  }
}

app.get("/api/bot/status", (_req, res) => res.json({ isReady, isInitializing, hasQRCode: Boolean(qrCode), botNumber }));
app.get("/api/bot/qr", (_req, res) => res.json({ qr: qrCode }));
app.post("/api/bot/start", (_req, res) => {
  startBot().catch(() => {});
  res.status(202).json({ success: true, message: "Inisialisasi WhatsApp dimulai." });
});
app.post("/api/bot/stop", async (_req, res) => {
  await stopBot();
  res.json({ success: true });
});
app.post("/api/bot/reset", async (_req, res) => {
  try {
    await resetBotSession();
    res.json({ success: true, message: "Sesi WhatsApp dikeluarkan. Mulai bot untuk memindai QR baru." });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

registerApi(app, chatbot);
app.use((error, _req, res, _next) => {
  console.error("[HTTP]", error);
  const malformedJson = error?.type === "entity.parse.failed";
  res.status(malformedJson ? 400 : 500).json({ error: malformedJson ? "Format JSON tidak valid." : "Terjadi kesalahan pada server." });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Website: http://localhost:${port}`);
    console.log(`Console WhatsApp: http://localhost:${port}/admin.html`);
    if (config.whatsapp.autoStart) startBot().catch(() => {});
  });
}

module.exports = { app, chatbot, startBot, stopBot };
