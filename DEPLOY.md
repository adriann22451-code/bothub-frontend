# Cara Bikin BotHub Live (Frontend + Backend)

## Bagian A — Deploy Backend ke Railway

1. Push folder `bothub-backend` ke repo GitHub baru (bisa private)
2. Buka https://railway.app, login pakai GitHub
3. **New Project → Deploy from GitHub repo** → pilih repo `bothub-backend`
4. Railway otomatis detect Node.js dan jalanin `npm install` + `npm start`
5. Di tab **Variables**, tambahkan environment variables (isi sama seperti `.env`):
   - `BINANCE_TESTNET_API_KEY`
   - `BINANCE_TESTNET_API_SECRET`
   - `FRONTEND_ORIGIN` → nanti diisi URL Vercel kamu (langkah B), sementara boleh dikosongkan dulu
6. Setelah deploy sukses, Railway kasih URL publik, misal:
   `https://bothub-backend-production.up.railway.app`
7. Cek jalan atau nggak: buka `https://<url-railway-kamu>/status` di browser — harus muncul JSON berisi harga & sinyal

## Bagian B — Deploy Frontend ke Vercel

1. Push folder `bothub-frontend` ke repo GitHub baru
2. Buka https://vercel.com, login pakai GitHub
3. **Add New → Project** → pilih repo `bothub-frontend`
4. Framework preset otomatis kedetect "Vite" — biarkan default, klik **Deploy**
5. Setelah selesai, Vercel kasih URL publik, misal:
   `https://bothub-kamu.vercel.app`

## Bagian C — Sambungkan Keduanya

1. Balik ke Railway → Variables → isi `FRONTEND_ORIGIN` dengan URL Vercel kamu (dari langkah B5)
2. Redeploy backend (Railway otomatis restart setelah env var diubah)
3. Di frontend, nanti kode yang manggil backend (fetch ke `/status`, `/order/BUY`, dll — ini akan aku bantu sambungkan di langkah berikutnya) perlu pakai URL Railway, bukan `localhost:3001` lagi

## Yang masih perlu dikerjakan setelah ini live

Saat ini `BotHub.jsx` **belum** manggil backend sama sekali — tombol "Activate Bot" masih ubah state React doang. Supaya bot beneran jalan dari UI:
- Tombol Activate → `fetch(BACKEND_URL + "/auto-trade/on")`
- Panel sinyal di Home → ambil dari `fetch(BACKEND_URL + "/status")` tiap beberapa detik, bukan dari WebSocket langsung di browser lagi (biar konsisten sama yang dieksekusi backend)

Kabari kalau langkah A & B di atas sudah kelar dan kamu punya 2 URL (Railway + Vercel) — nanti aku bantu sambungkan bagian ini.

## Biaya

- **Vercel**: gratis untuk project personal/hobby
- **Railway**: ada free trial credit, setelah habis perlu langganan kecil (~$5/bulan) karena backend ini jalan terus-menerus (WebSocket), bukan cuma nyala pas ada request
