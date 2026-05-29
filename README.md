# MyMobility Assistant (Prototype)

Aplikasi web prototaip pengangkutan awam Lembah Klang dengan **data langsung** daripada sumber rasmi.

## Sumber data

| Data | Sumber |
|------|--------|
| Stesen, laluan rel & bas | [api.data.gov.my](https://api.data.gov.my) — GTFS Prasarana |
| Kedudukan bas feeder MRT (live) | GTFS Realtime `rapid-bus-mrtfeeder` |
| Berita gangguan | **Threads** (Meta API, jika token diset) + Google News RSS |
| Geocoding perancang laluan | OpenStreetMap Nominatim |
| Tambang (anggaran) | Jarak antara stesen GTFS + kadar MyRapid |

> **Nota:** MRT/LRT belum ada feed masa nyata yang stabil di data.gov.my (2026). Laluan rel menunjukkan data GTFS statik; bas feeder menunjukkan kedudukan live.

## Cara jalankan

```bash
cd MyMobility
npm install
npm start
```

Buka **http://localhost:3000** dalam pelayar.

### Pasang sebagai PWA (aplikasi telefon)

1. Jalankan `npm start` dan buka laman pada telefon (sama Wi‑Fi: `http://<IP-komputer>:3000`).
2. **Android (Chrome):** menu ⋮ → *Install app* / *Add to Home screen*, atau tekan **Pasang** pada bar bawah.
3. **iPhone (Safari):** Share → *Add to Home Screen*.

Fail PWA: `manifest.webmanifest`, `sw.js`, `icons/`. Mod *standalone* memaparkan app penuh skrin tanpa bar pelayar.

> PWA memerlukan **HTTPS** (atau `localhost`) untuk service worker. Untuk production, hoskan dengan SSL.

## Deploy ke awam (dapatkan link public)

Aplikasi ini ialah pelayan Node.js — perlu hos yang sokong Node + HTTPS (bukan GitHub Pages).

### Render (percuma, paling mudah)

Repo ini sudah ada `render.yaml` (Blueprint), jadi tetapan auto-isi:

1. Buka **https://render.com** → log masuk dengan **GitHub**.
2. **New +** → **Blueprint** → pilih repo `MyMobility` → **Apply**.
3. Tunggu ~2 minit. Render beri **link public**, cth `https://mymobility.onrender.com`.
4. Link itu kelihatan di papan pemuka Render (atas, sebelah nama servis).

> Tier percuma: servis "tidur" selepas 15 minit tiada lawatan; lawatan seterusnya ambil ~50 saat untuk bangun.

Alternatif: **Railway** (railway.app — sambung GitHub, auto-detect Node) atau **Fly.io**.

### Threads (pilihan)

Rapid KL **tidak** menyiarkan gangguan secara rasmi di Threads seperti di X/Facebook. Prototaip ini mengambil:

- Carian kata kunci (`Rapid KL gangguan`, dll.) melalui [Threads API](https://developers.facebook.com/docs/threads/keyword-search)
- Siaran awam berkaitan transit

```bash
cp .env.example .env
# Dapatkan token di Meta for Developers → Threads API → Access Token
# Skop: threads_keyword_search, threads_basic, threads_read
echo "THREADS_ACCESS_TOKEN=your_token_here" >> .env
npm start
```

Tanpa token, berita masih dimuatkan daripada **Google News** sahaja.

Tanpa pelayan (`file://`), UI asal dipaparkan tetapi data langsung tidak dimuatkan.

## API tempatan

- `GET /api/dashboard` — ringkasan utama
- `GET /api/gtfs/rapid-rail-kl` — data GTFS rel
- `GET /api/gtfs/rapid-bus-kl` — data GTFS bas
- `GET /api/vehicles/rapid-bus-mrtfeeder` — bas live
- `GET /api/alerts` — berita gangguan
- `GET /api/fare?from=KJ10&to=KG20` — anggaran tambang
- `GET /api/ktm/fares` — matriks tambang rasmi KTM Komuter (KTMB 2015, tanpa tunai)
- `GET /api/journey?from=Puchong&to=KLCC` — perancang laluan (hingga 3 cadangan)
- `GET /api/journey?from_stop=KJ15&to_stop=KJ10` — laluan ikut ID stesen GTFS
- `GET /api/stops/search?q=klcc` — carian stesen rel
- `GET /api/stops/nearby?lat=3.15&lon=101.7` — stesen terdekat

## Struktur

- `index.html` — UI prototaip
- `server.js` — API & cache
- `js/live-data.js` — kemas kini UI dari API
