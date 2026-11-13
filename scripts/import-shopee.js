const fs = require("node:fs");
const path = require("node:path");

const inputPath = path.resolve(process.argv[2] || path.join(__dirname, "../data/shopee-raw.csv"));
const outputJson = path.join(__dirname, "../data/products.json");
const outputCsv = path.join(__dirname, "../data/products.csv");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  const headers = rows.shift().map((header) => header.trim());
  return rows
    .filter((values) => values.some(Boolean))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

const categories = [
  ["tshirt", "T-Shirt"],
  ["buttonups", "Button-Up"],
  ["sweatshirt", "Sweatshirt"],
  ["underwear", "Underwear"],
  ["headwear", "Headwear"],
  ["footwear", "Footwear"],
  ["jacket", "Jacket"],
  ["pants", "Pants"],
  ["bags", "Bags"],
  ["bag", "Bags"],
  ["acc", "Accessories"]
];

function inferCategory(name) {
  const normalized = name.toLowerCase();
  const match = categories.find(([keyword]) => new RegExp(`(?:^|[\\s-])${keyword}(?:[\\s-]|$)`, "i").test(normalized));
  return match?.[1] || "Lainnya";
}

function cleanProductUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value;
  }
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

if (!fs.existsSync(inputPath)) {
  throw new Error(`CSV sumber tidak ditemukan: ${inputPath}`);
}

const sourceRows = parseCsv(fs.readFileSync(inputPath, "utf8"));
const seen = new Set();
const products = [];

for (const row of sourceRows) {
  const url = cleanProductUrl(row["contents href"]?.trim());
  const name = row["whitespace-normal"]?.trim();
  const productId = url.match(/-i\.\d+\.(\d+)/)?.[1] || String(products.length + 1);
  if (!url || !name || seen.has(productId)) continue;
  seen.add(productId);

  const highlights = [row["min-w-0"], row["min-w-0 2"]]
    .map((value) => value?.trim())
    .filter((value, index, all) => value && all.indexOf(value) === index);
  const ratingText = row["inline-block"] || "";
  const rating = Number.parseFloat(ratingText.match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(",", ".")) || null;

  products.push({
    id: productId,
    name,
    category: inferCategory(name),
    price: Number.parseInt(String(row["font-medium 2"] || "").replace(/\D/g, ""), 10) || 0,
    imageUrl: row["_image_yazkc_11 src"]?.trim() || "",
    productUrl: url,
    rating,
    badge: row.truncate?.trim() || "",
    highlights
  });
}

const store = {
  name: "Maternal Disaster Official Shop",
  shortName: "Maternal Disaster",
  marketplace: "Shopee Indonesia",
  shopUrl: "https://shopee.co.id/maternaldisasterofficial",
  shopId: "66992496",
  location: "Kota Bandung",
  description: "Katalog produk Maternal Disaster berdasarkan hasil scraping lapak resmi di Shopee.",
  operationalHours: "Senin–Jumat 10.00–17.00; Sabtu–Minggu 12.00–17.00 WIB",
  sourceFile: path.basename(inputPath),
  importedAt: new Date().toISOString(),
  productCount: products.length
};

fs.mkdirSync(path.dirname(outputJson), { recursive: true });
fs.writeFileSync(outputJson, `${JSON.stringify({ store, products }, null, 2)}\n`, "utf8");

const headers = ["id", "name", "category", "price", "rating", "badge", "highlights", "imageUrl", "productUrl"];
const csv = [headers.map(csvCell).join(",")]
  .concat(products.map((product) => headers.map((header) => csvCell(product[header])).join(",")))
  .join("\n");
fs.writeFileSync(outputCsv, `${csv}\n`, "utf8");

console.log(`Berhasil mengimpor ${products.length} produk ke ${path.relative(process.cwd(), outputJson)} dan ${path.relative(process.cwd(), outputCsv)}.`);
