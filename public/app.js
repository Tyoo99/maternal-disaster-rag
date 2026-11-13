const state = { store: null, page: 1, category: "", query: "", sort: "", hasMore: false, loading: false };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Permintaan gagal.");
  return data;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderHero(products) {
  const gallery = $("#heroGallery");
  gallery.replaceChildren();
  products.slice(0, 3).forEach((product) => {
    const tile = element("a", "hero-tile");
    tile.href = product.productUrl;
    tile.target = "_blank";
    tile.rel = "noreferrer";
    const image = element("img");
    image.src = product.imageUrl;
    image.alt = product.name;
    image.referrerPolicy = "no-referrer";
    const label = element("span", "", product.category);
    tile.append(image, label);
    gallery.append(tile);
  });
}

function renderCategories() {
  const container = $("#categoryFilters");
  container.replaceChildren();
  const all = [{ name: "Semua", count: state.store.productCount }, ...state.store.categories];
  all.forEach((category) => {
    const button = element("button", category.name === "Semua" ? "active" : "", `${category.name} · ${category.count}`);
    button.type = "button";
    button.dataset.category = category.name === "Semua" ? "" : category.name;
    button.addEventListener("click", () => {
      state.category = button.dataset.category;
      $$("#categoryFilters button").forEach((item) => item.classList.toggle("active", item === button));
      loadProducts(true);
    });
    container.append(button);
  });
}

function productCard(product) {
  const card = element("article", "product-card");
  const media = element("a", "product-image");
  media.href = product.productUrl;
  media.target = "_blank";
  media.rel = "noreferrer";
  const image = element("img");
  image.src = product.imageUrl;
  image.alt = product.name;
  image.loading = "lazy";
  image.referrerPolicy = "no-referrer";
  media.append(image);
  if (product.badge) media.append(element("span", "product-badge", product.badge));

  const info = element("div", "product-info");
  const meta = element("div", "product-meta");
  meta.append(element("span", "", product.category), element("span", "", product.rating ? `★ ${product.rating}` : "Belum dinilai"));
  const name = element("h3", "", product.name.replace(/^Maternal Disaster\s*-\s*/i, ""));
  const highlights = element("p", "product-highlights", product.highlights?.join(" · ") || "Koleksi resmi Maternal Disaster");
  const price = element("p", "product-price", currency.format(product.price));
  const actions = element("div", "product-actions");
  const shopee = element("a", "", "Lihat di Shopee ↗");
  shopee.href = product.productUrl;
  shopee.target = "_blank";
  shopee.rel = "noreferrer";
  actions.append(shopee);

  if (state.store.whatsappNumber) {
    const wa = element("a", "wa-link", "WA");
    const message = `Halo, saya tertarik dengan ${product.name}. Apakah masih tersedia? ${product.productUrl}`;
    wa.href = `https://wa.me/${state.store.whatsappNumber}?text=${encodeURIComponent(message)}`;
    wa.target = "_blank";
    wa.rel = "noreferrer";
    wa.title = "Tanyakan produk melalui WhatsApp";
    actions.append(wa);
  }
  info.append(meta, name, highlights, price, actions);
  card.append(media, info);
  return card;
}

async function loadProducts(reset = false) {
  if (state.loading) return;
  state.loading = true;
  if (reset) state.page = 1;
  const params = new URLSearchParams({ page: String(state.page), limit: "12" });
  if (state.category) params.set("category", state.category);
  if (state.query) params.set("q", state.query);
  if (state.sort) params.set("sort", state.sort);
  try {
    const data = await request(`/api/products?${params}`);
    const grid = $("#productGrid");
    if (reset) grid.replaceChildren();
    data.products.forEach((product) => grid.append(productCard(product)));
    state.hasMore = data.hasMore;
    $("#resultSummary").textContent = `${data.total} produk ditemukan`;
    $("#emptyState").classList.toggle("hidden", data.total !== 0);
    $("#loadMoreBtn").classList.toggle("hidden", !data.hasMore);
    if (!reset && data.products.length) state.page += 1;
    if (reset) state.page = 2;
    return data.products;
  } catch (error) {
    $("#resultSummary").textContent = "Katalog gagal dimuat";
    $("#emptyState").classList.remove("hidden");
    $("#emptyState p").textContent = error.message;
    return [];
  } finally {
    state.loading = false;
  }
}

function setupChat() {
  const panel = $("#chatPanel");
  const setOpen = (open) => {
    panel.classList.toggle("open", open);
    panel.setAttribute("aria-hidden", String(!open));
    if (open) $("#chatInput").focus();
  };
  $$('[data-open-chat]').forEach((button) => button.addEventListener("click", () => setOpen(true)));
  $("#closeChatBtn").addEventListener("click", () => setOpen(false));
  $$(".quick-prompts button").forEach((button) => button.addEventListener("click", () => {
    $("#chatInput").value = button.textContent;
    $("#chatForm").requestSubmit();
  }));

  $("#chatForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("#chatInput");
    const message = input.value.trim();
    if (!message) return;
    const messages = $("#chatMessages");
    messages.append(element("div", "message user", message));
    input.value = "";
    const loading = element("div", "message bot loading", "Mencari di katalog…");
    messages.append(loading);
    messages.scrollTop = messages.scrollHeight;
    try {
      let userId = localStorage.getItem("md-chat-user");
      if (!userId) {
        userId = crypto.randomUUID?.() || `web-${Date.now()}`;
        localStorage.setItem("md-chat-user", userId);
      }
      const data = await request("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, userId })
      });
      loading.className = "message bot";
      loading.textContent = data.reply;
    } catch (error) {
      loading.className = "message bot";
      loading.textContent = error.message;
    }
    messages.scrollTop = messages.scrollHeight;
  });
}

function debounce(callback, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}

async function initialize() {
  setupChat();
  state.store = await request("/api/store");
  $("#productStat").textContent = state.store.productCount;
  $("#categoryStat").textContent = state.store.categories.length;
  $(".data-number").firstChild.textContent = state.store.productCount;
  $("#shopNavLink").href = state.store.shopUrl;
  $("#shopDataLink").href = state.store.shopUrl;
  renderCategories();
  const products = await loadProducts(true);
  renderHero(products.slice(0, 3));

  $("#loadMoreBtn").addEventListener("click", () => loadProducts(false));
  $("#searchInput").addEventListener("input", debounce((event) => {
    state.query = event.target.value.trim();
    loadProducts(true);
  }));
  $("#sortSelect").addEventListener("change", (event) => {
    state.sort = event.target.value;
    loadProducts(true);
  });
}

initialize().catch((error) => {
  $("#resultSummary").textContent = `Gagal memuat website: ${error.message}`;
});
