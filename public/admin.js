const $ = (id) => document.getElementById(id);
let currentQR = null;

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Permintaan gagal");
  return data;
}

async function status() {
  try {
    const data = await request("/api/bot/status");
    $("statusDot").className = data.isReady ? "connected" : (data.hasQRCode || data.isInitializing) ? "waiting" : "";
    $("statusText").textContent = data.isReady ? `Bot Connected${data.botNumber ? ` (${data.botNumber})` : ""}` : data.hasQRCode ? "Menunggu QR Scan" : data.isInitializing ? "Menginisialisasi…" : "Bot Offline";
    $("startBtn").classList.toggle("hidden", data.isReady || data.isInitializing || data.hasQRCode);
    $("stopBtn").classList.toggle("hidden", !(data.isReady || data.isInitializing || data.hasQRCode));
    $("readySection").classList.toggle("hidden", !data.isReady);
    $("qrSection").classList.toggle("hidden", !data.hasQRCode && !data.isInitializing);
    $("botNumberText").textContent = data.botNumber || "Terhubung";
    if (data.hasQRCode) loadQR();
    if (!data.hasQRCode) currentQR = null;
  } catch {
    $("statusText").textContent = "Gateway hanya tersedia di server lokal";
    $("statusDot").className = "";
  }
}

async function loadQR() {
  const data = await request("/api/bot/qr");
  if (!data.qr || data.qr === currentQR) return;
  currentQR = data.qr;
  const image = document.createElement("img");
  image.alt = "QR WhatsApp";
  image.src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(data.qr)}`;
  $("qrcode").replaceChildren(image);
}

async function command(action, button) {
  button.disabled = true;
  try { await request(`/api/bot/${action}`, { method: "POST" }); }
  catch (error) { alert(error.message); }
  finally { button.disabled = false; status(); }
}

$("startBtn").onclick = () => command("start", $("startBtn"));
$("stopBtn").onclick = () => command("stop", $("stopBtn"));
$("resetBtn").onclick = () => {
  if (confirm("Keluarkan sesi WhatsApp? Anda perlu scan QR ulang.")) command("reset", $("resetBtn"));
};

async function loadProducts() {
  const data = await request("/api/products?limit=20");
  $("catalogCount").textContent = `${data.total} produk`;
  $("productsBody").replaceChildren(...data.products.map((product) => {
    const row = document.createElement("tr");
    [product.name, product.category, new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(product.price), product.rating || "-"].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    return row;
  }));
}

async function loadKnowledge() {
  const data = await request("/api/knowledge");
  $("knowledgeList").replaceChildren(...Object.keys(data.responses || {}).map((key) => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = key;
    return tag;
  }));
}

async function loadQuota() {
  const data = await request("/api/groq/quota");
  $("groqModelName").textContent = data.configured ? data.model : "Belum dikonfigurasi";
  $("groqReqRemaining").textContent = data.remainingRequests ?? "Menunggu pemakaian";
  $("groqTokenRemaining").textContent = data.remainingTokens ?? "Menunggu pemakaian";
  $("groqLastChecked").textContent = data.lastChecked ? `Pembaruan: ${new Date(data.lastChecked).toLocaleString("id-ID")}` : "Belum ada pemakaian API";
}

$("refreshQuotaBtn").onclick = loadQuota;
$("chatForm").onsubmit = async (event) => {
  event.preventDefault();
  const input = $("chatInput");
  const message = input.value.trim();
  if (!message) return;
  const user = document.createElement("p"); user.className = "user"; user.textContent = message;
  $("messages").append(user); input.value = "";
  try {
    const data = await request("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, userId: "admin-playground" }) });
    const bot = document.createElement("p"); bot.className = "bot"; bot.textContent = data.reply; $("messages").append(bot);
  } catch (error) { alert(error.message); }
  $("messages").scrollTop = $("messages").scrollHeight;
  loadQuota();
};

Promise.allSettled([status(), loadProducts(), loadKnowledge(), loadQuota()]);
setInterval(status, 5000);
