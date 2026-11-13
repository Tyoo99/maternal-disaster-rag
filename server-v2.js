const path = require("node:path");
const express = require("express");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const config = require("./lib/config");
const ChatbotService = require("./lib/chatbot");
const registerApi = require("./lib/register-api");

const app = express();
const chatbot = new ChatbotService();
const port = config.server.port;

let client = null;
let qrCode = null;
let isReady = false;
let isInitializing = false;
let botNumber = null;

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

function createClient() {
  const wa = new Client({
    authStrategy: new LocalAuth({ clientId: config.whatsapp.clientId }),
    puppeteer: {
      headless: config.whatsapp.headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
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
    client = null;
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
  try {
    await client.initialize();
  } catch (error) {
    client = null;
    isInitializing = false;
    console.error("[WA] Inisialisasi gagal:", error.message);
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

app.get("/api/bot/status", (_req, res) => res.json({ isReady, isInitializing, hasQRCode: Boolean(qrCode), botNumber }));
app.get("/api/bot/qr", (_req, res) => res.json({ qr: qrCode }));
app.post("/api/bot/start", async (_req, res) => {
  try {
    await startBot();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/bot/stop", async (_req, res) => {
  await stopBot();
  res.json({ success: true });
});
app.post("/api/bot/reset", async (_req, res) => {
  try {
    if (client) await client.logout().catch(() => {});
    await stopBot();
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
