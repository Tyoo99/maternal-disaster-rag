const config = require("./config");

function normalize(value = "") {
  return String(value).toLowerCase().trim();
}

function registerApi(app, chatbot) {
  const requests = new Map();

  app.get("/api/store", (_req, res) => {
    res.json({
      ...chatbot.rag.store,
      whatsappNumber: config.public.whatsappNumber || null,
      categories: chatbot.rag.categories()
    });
  });

  app.get("/api/products", (req, res) => {
    const query = normalize(req.query.q);
    const category = normalize(req.query.category);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(48, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));
    const sort = normalize(req.query.sort);
    let products = chatbot.rag.products.filter((product) => {
      if (category && normalize(product.category) !== category) return false;
      if (!query) return true;
      const searchable = normalize([product.name, product.category, product.badge, ...(product.highlights || [])].join(" "));
      return query.split(/\s+/).every((token) => searchable.includes(token));
    });

    if (sort === "price-asc") products.sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") products.sort((a, b) => b.price - a.price);
    else if (sort === "rating") products.sort((a, b) => (b.rating || 0) - (a.rating || 0));

    const total = products.length;
    const start = (page - 1) * limit;
    res.json({ products: products.slice(start, start + limit), total, page, limit, hasMore: start + limit < total });
  });

  app.get("/api/knowledge", (_req, res) => res.json(chatbot.knowledge));
  app.get("/api/groq/quota", (_req, res) => res.json({
    configured: chatbot.configured,
    model: config.groq.primaryModel || null,
    fallbackModels: config.groq.models.slice(1),
    ...chatbot.quota
  }));

  app.post("/api/chat", async (req, res) => {
    const message = String(req.body?.message || "").trim();
    const userId = String(req.body?.userId || req.ip || "website").slice(0, 100);
    if (!message) return res.status(400).json({ error: "Pesan wajib diisi." });
    if (message.length > 500) return res.status(400).json({ error: "Pesan maksimal 500 karakter." });

    const key = req.ip || "local";
    const now = Date.now();
    const recent = (requests.get(key) || []).filter((time) => now - time < 60_000);
    if (recent.length >= 20) return res.status(429).json({ error: "Terlalu banyak pesan. Coba lagi dalam satu menit." });
    recent.push(now);
    requests.set(key, recent);

    try {
      return res.json({ reply: await chatbot.replyFor(userId, message) });
    } catch (error) {
      console.error("[API Chat]", error);
      return res.status(500).json({ error: "Chatbot gagal memproses pesan." });
    }
  });
}

module.exports = registerApi;
