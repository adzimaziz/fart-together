# 💨 Fart Together

Game party co-op 3D untuk **1–4 pemain**. Semua orang duduk atas satu rakit bulat yang hanyut di sungai.
Setiap watak boleh pusing badan dan **kentut**. Kentut tolak rakit ke arah watak tu pandang,
dan buat rakit berpusing sebab tolakan datang dari tempat duduk masing-masing.
Bekerjasama untuk elak palang berduri yang berpusing, blok berduri yang bergerak dan dinding berduri,
lepasi checkpoint, dan sampai ke garisan FINISH secepat mungkin.

## Cara main

| Mod | Cara |
| --- | --- |
| **Online** (setiap orang guna telefon/PC sendiri) | Seorang tekan **Cipta Bilik Online** dan kongsi kod 4 huruf / link. Kawan tekan **Sertai**. Host tekan **Mula!** |
| **Satu peranti** (sampai 4 orang, satu keyboard + gamepad) | Tekan **Main Satu Peranti** dan pilih bilangan pemain. |

Kawalan:

- Online: `A`/`D` atau `←`/`→` pusing badan, `W` / `↑` / `Space` kentut. Di telefon ada butang ⟲ ⟳ 💨 kat skrin.
- Satu peranti: P1 `A D W`, P2 `← → ↑`, P3 `J L I`, P4 `F H T` (atau numpad `4 6 8`). Gamepad 1–4 pun boleh (stik/D-pad pusing, butang A kentut).

Kena duri = rakit pecah, mula balik dari checkpoint terakhir. Skor = masa + berapa kali pecah.

## Run

```bash
npm install
npm start          # http://localhost:3000
npm test           # ujian simulasi
```

Nak main online dengan kawan di tempat lain, deploy ke mana-mana host Node.js yang sokong WebSocket
(contoh Render, Railway, Fly.io). Server guna `PORT` dari environment.

## Struktur

- `shared/track.js` – laluan sungai, dinding berduri, halangan, checkpoint.
- `shared/sim.js` – fizik rakit & kentut (dipakai oleh server dan mod satu peranti).
- `server.js` – Express + WebSocket, bilik maksimum 4 orang, simulasi 60Hz, hantar state 20Hz.
- `public/` – client three.js: `render.js` (grafik 3D), `main.js` (menu/lobi/HUD), `input.js`, `audio.js` (bunyi kentut disintesis).
