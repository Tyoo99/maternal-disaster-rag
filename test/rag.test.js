const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const RAGEngine = require("../lib/rag");

const rag = new RAGEngine(path.join(__dirname, "../data/products.json"));

test("memuat seluruh produk hasil scraping", () => {
  assert.equal(rag.products.length, 290);
  assert.equal(rag.store.shopId, "66992496");
});

test("sapaan tidak mengambil produk", () => assert.deepEqual(rag.search("halo kak"), []));

test("alias kategori Bahasa Indonesia mengambil kategori yang benar", () => {
  assert.ok(rag.search("ada jaket apa saja?").every((product) => product.category === "Jacket"));
  assert.ok(rag.search("rekomendasi kaos").every((product) => product.category === "T-Shirt"));
});

test("filter budget membatasi harga hasil retrieval", () => {
  const products = rag.search("ada jaket di bawah 700 ribu?");
  assert.ok(products.length > 0);
  assert.ok(products.every((product) => product.category === "Jacket" && product.price <= 700_000));
});

test("produk spesifik berada di hasil teratas", () => {
  assert.match(rag.search("berapa harga acc flair")[0].name, /Flair/i);
});

test("permintaan termurah diurutkan berdasarkan harga", () => {
  const products = rag.search("aksesori termurah");
  assert.equal(products[0].price, Math.min(...products.map((product) => product.price)));
});

test("konteks menyertakan sumber dan tautan produk", () => {
  const context = rag.buildContext("headwear jabbor");
  assert.match(context, /Maternal Disaster Official Shop/);
  assert.match(context, /shopee\.co\.id/);
});
