# ClipMeet

ClipMeet adalah aplikasi web untuk melakukan recording dan clipping video dengan fitur real-time. Project ini menggunakan React (Vite) untuk frontend dan Node.js (Express & Socket.IO) untuk backend.

## Struktur Folder

```text
clipmeet/
├── client/     # Frontend aplikasi (React + Vite)
├── server/     # Backend aplikasi (Node.js + Express + Socket.IO)
├── uploads/    # Direktori untuk menyimpan file hasil recording (.webm)
├── clips/      # Direktori untuk menyimpan hasil clipping dari FFmpeg
└── README.md   # Deskripsi project dan dokumentasi
```

## Cara Menjalankan

### Persiapan
Pastikan Anda sudah menginstal **Node.js** di komputer Anda.

### Menjalankan Backend (Server)
1. Buka terminal dan masuk ke folder `server`:
   ```bash
   cd server
   ```
2. Instal dependensi:
   ```bash
   npm install
   ```
3. Jalankan server:
   ```bash
   node index.js
   ```
   *(Atau sesuaikan jika menggunakan nodemon / start script di package.json)*

### Menjalankan Frontend (Client)
1. Buka tab terminal baru dan masuk ke folder `client`:
   ```bash
   cd client
   ```
2. Instal dependensi:
   ```bash
   npm install
   ```
3. Jalankan development server:
   ```bash
   npm run dev
   ```
4. Buka URL yang diberikan oleh Vite (biasanya `http://localhost:5173`) di browser.
