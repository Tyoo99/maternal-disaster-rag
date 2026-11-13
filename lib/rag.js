const fs = require("node:fs");
const path = require("node:path");
const config = require("./config");

const CATEGORY_ALIASES = new Map([
  ["t-shirt", ["t-shirt", "tshirt", "kaos", "baju"]],
  ["button-up", ["button-up", "buttonup", "buttonups", "kemeja"]],
  ["sweatshirt", ["sweatshirt", "sweater"]],
  ["underwear", ["underwear", "pakaian dalam"]],
  ["headwear", ["headwear", "topi", "cap", "kupluk"]],
  ["footwear", ["footwear", "sepatu", "sandal"]],
  ["jacket", ["jacket", "jaket"]],
  ["pants", ["pants", "celana"]],
  ["bags", ["bags", "bag", "tas"]],
  ["accessories", ["accessories", "accessory", "aksesoris", "aksesori", "acc"]]
]);

const STOP_WORDS = new Set([
  "ada", "apa", "aja", "saja", "yang", "dan", "atau", "dari", "untuk", "dengan", "dong", "kak",
  "produk", "barang", "koleksi", "maternal", "disaster", "harga", "berapa", "carikan", "tampilkan",
  "rekomendasi", "rekomendasikan", "paling", "lebih", "kurang", "dibawah", "diatas", "bawah", "atas"
]);

function normalize(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmount(raw, unit = "") {
  const value = Number.parseFloat(String(raw).replace(",", "."));
  if (!Number.isFinite(value)) return null;
  if (/^(jt|juta)$/i.test(unit)) return Math.round(value * 1_000_000);
  if (/^(rb|ribu)$/i.test(unit)) return Math.round(value * 1_000);
  return value < 10_000 ? Math.round(value * 1_000) : Math.round(value);
}

class RAGEngine {
  constructor(dataPath, options = {}) {
    this.dataPath = dataPath || path.join(__dirname, "../data/products.json");
    this.topK = options.topK || config.rag.topK;
    this.store = {};
    this.products = [];
    this.loadData();
  }

  loadData() {
    try {
      const data = JSON.parse(fs.readFileSync(this.dataPath, "utf8"));
      this.store = data.store || {};
      this.products = Array.isArray(data.products) ? data.products : [];
      console.log(`[RAG] Berhasil memuat ${this.products.length} produk ${this.store.name || ""}`.trim());
    } catch (error) {
      console.error(`[RAG] Gagal memuat katalog: ${error.message}`);
      this.store = {};
      this.products = [];
    }
  }

  formatCurrency(value) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(Number(value) || 0);
  }

  isGreetingQuery(query = "") {
    const value = normalize(query);
    const exact = ["halo", "hai", "hi", "hey", "hello", "p", "ping", "test", "pagi", "siang", "sore", "malam", "permisi", "assalamualaikum"];
    if (exact.includes(value)) return true;
    if (!/^(halo|hai|hi|hey|hello|selamat (pagi|siang|sore|malam)|assalamualaikum)\b/.test(value)) return false;
    return !["produk", "harga", "katalog", "jual", "beli", "kaos", "jaket", "tas", "sepatu"].some((word) => value.includes(word));
  }

  findCategory(query = "") {
    const value = normalize(query);
    for (const [category, aliases] of CATEGORY_ALIASES) {
      if (aliases.some((alias) => new RegExp(`(?:^|\\s)${alias.replace("-", "[- ]?")}(?:$|\\s)`).test(value))) {
        return category;
      }
    }
    return null;
  }

  parsePriceFilter(query = "") {
    const value = normalize(query);
    if (!/(harga|rp|ribu|rb|juta|jt|budget|dibawah|di bawah|diatas|di atas|maksimal|minimal)/.test(value)) return {};
    const amounts = [...value.matchAll(/(\d+(?:[.,]\d+)?)\s*(juta|jt|ribu|rb)?/g)]
      .map((match) => parseAmount(match[1], match[2]))
      .filter(Number.isFinite);
    if (!amounts.length) return {};
    if (/(dibawah|di bawah|kurang dari|maksimal|max)\b/.test(value)) return { maxPrice: amounts[0] };
    if (/(diatas|di atas|lebih dari|minimal|min)\b/.test(value)) return { minPrice: amounts[0] };
    if (amounts.length > 1 && /(antara|sampai|hingga|-)/.test(value)) {
      return { minPrice: Math.min(...amounts), maxPrice: Math.max(...amounts) };
    }
    return {};
  }

  search(query, k = this.topK) {
    if (!query || !this.products.length || this.isGreetingQuery(query)) return [];
    const value = normalize(query);
    const category = this.findCategory(value);
    const { minPrice, maxPrice } = this.parsePriceFilter(value);
    const tokens = value.split(" ").filter((token) => token.length > 2 && !STOP_WORDS.has(token) && !/^\d+$/.test(token));

    const candidates = this.products.filter((product) => {
      if (category && normalize(product.category) !== category) return false;
      if (minPrice && product.price < minPrice) return false;
      if (maxPrice && product.price > maxPrice) return false;
      return true;
    });

    const ranked = candidates.map((product) => {
      const name = normalize(product.name);
      const searchable = normalize([product.category, product.badge, ...(product.highlights || [])].join(" "));
      let score = category ? 12 : 0;
      for (const token of tokens) {
        if (name.includes(token)) score += 9;
        if (searchable.includes(token)) score += 4;
      }
      if (value.includes(name)) score += 20;
      return { product, score };
    });

    if (/termurah|murah/.test(value)) {
      ranked.sort((a, b) => a.product.price - b.product.price || b.score - a.score);
    } else if (/termahal|mahal/.test(value)) {
      ranked.sort((a, b) => b.product.price - a.product.price || b.score - a.score);
    } else if (/rating|terbaik|best/.test(value)) {
      ranked.sort((a, b) => (b.product.rating || 0) - (a.product.rating || 0) || b.score - a.score);
    } else {
      ranked.sort((a, b) => b.score - a.score || (b.product.rating || 0) - (a.product.rating || 0));
    }

    const hasIntent = category || minPrice || maxPrice || /katalog|semua|rekomendasi|murah|mahal|rating|produk/.test(value);
    return ranked
      .filter((item) => item.score > 0 || hasIntent)
      .slice(0, Math.max(1, k))
      .map(({ product }) => product);
  }

  buildContext(query) {
    const products = this.search(query);
    if (!products.length) return "";
    const lines = [
      `SUMBER KATALOG: ${this.store.name} di ${this.store.marketplace}.`,
      `TOTAL DATA HASIL SCRAPING: ${this.products.length} produk.`,
      "PRODUK RELEVAN:"
    ];
    for (const product of products) {
      lines.push([
        `- ${product.name}`,
        `kategori ${product.category}`,
        `harga ${this.formatCurrency(product.price)}`,
        product.rating ? `rating ${product.rating}` : "rating tidak tersedia",
        product.badge || null,
        product.highlights?.length ? `highlight: ${product.highlights.join(", ")}` : null,
        `tautan: ${product.productUrl}`
      ].filter(Boolean).join("; "));
    }
    return lines.join("\n");
  }

  categories() {
    const counts = new Map();
    for (const product of this.products) counts.set(product.category, (counts.get(product.category) || 0) + 1);
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
}

module.exports = RAGEngine;
