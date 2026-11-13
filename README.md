# Maternal Disaster — Katalog RAG Web & WhatsApp

Website katalog tugas praktikum yang menggunakan **290 produk hasil scraping Maternal Disaster Official Shop di Shopee**. Satu sumber data dipakai oleh:

- website katalog publik;
- chatbot RAG berbasis Groq;
- gateway WhatsApp lokal berbasis `whatsapp-web.js`.

Lapak sumber: <https://shopee.co.id/maternaldisasterofficial>

## Struktur data

- `data/shopee-raw.csv` — hasil scraping asli.
- `data/products.json` — katalog normal yang dibaca website dan RAG.
- `data/products.csv` — versi CSV dengan nama kolom yang sudah dirapikan.
- `scripts/import-shopee.js` — mengulang proses normalisasi jika CSV sumber diperbarui.

Untuk mengimpor ulang data:

```bash
npm run import:shopee
```

## Menjalankan secara lokal

1. Salin `.env.example` menjadi `.env`, lalu isi API key dan konfigurasi yang diperlukan.
2. Pasang dependency dengan `npm install`.
3. Jalankan `npm run dev` atau `npm start`.
4. Buka:
   - website: <http://localhost:3001>
   - console WhatsApp: <http://localhost:3001/admin.html>

Isi `PUBLIC_WHATSAPP_NUMBER` dengan nomor gateway dalam format internasional tanpa `+`, misalnya `6281234567890`. Tombol WhatsApp pada kartu produk baru ditampilkan jika nomor ini tersedia.

## Environment Vercel

Tambahkan variabel berikut pada **Project Settings → Environment Variables**:

- `GROQ_API_KEY`
- `GROQ_MODEL`
- `GROQ_FALLBACK_MODELS` (opsional)
- `GROQ_MAX_TOKENS`
- `GROQ_TEMPERATURE`
- `RAG_TOP_K`
- `PUBLIC_WHATSAPP_NUMBER`
- `PUBLIC_SITE_URL`

Jangan mengunggah `.env` ke repository. File tersebut sudah masuk `.gitignore` dan `.vercelignore`.

## Deploy Vercel

1. Buat repository GitHub dan push project ini.
2. Di Vercel pilih **Add New Project**, lalu import repository.
3. Biarkan Framework Preset pada deteksi otomatis dan jangan isi Build Command.
4. Tambahkan environment di atas.
5. Klik **Deploy**.

Folder `api/` berisi entry point Vercel Functions yang meneruskan request ke aplikasi Express di `app.js`. Folder `public/` disajikan sebagai aset statis CDN. Dependency WhatsApp dibuat opsional dan dikeluarkan dari instalasi Vercel agar Chromium tidak masuk ke serverless function.

Gateway WhatsApp tetap dijalankan dari `server-v2.js` pada komputer lokal karena memerlukan sesi browser yang hidup terus. Website Vercel dan gateway lokal tetap memakai `data/products.json` yang sama.

## Pengujian

```bash
npm test
```

Skenario minimum:

- `halo`
- `ada jaket di bawah 700 ribu?`
- `aksesori termurah`
- `berapa harga acc flair?`
- pertanyaan lanjutan `berapa harganya?`

Untuk laporan, sertakan screenshot website Vercel, link lapak Shopee, hasil chat web, status gateway WhatsApp, dan percakapan WhatsApp dengan produk yang dapat diverifikasi pada lapak sumber.
