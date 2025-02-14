# Discord Bot Auto Reply

Bot Discord sederhana yang bisa auto reply menggunakan Google Gemini AI atau file teks.

## Fitur

- Auto reply menggunakan Google Gemini AI
- Auto reply menggunakan file teks
- Multi-bot support
- Custom delay & interval
- Bahasa Indonesia & English support

## Cara Pakai

1. Clone repository
```bash
git clone https://github.com/Modenjaya/dc-bot
```
```bash
cd dc-bot
```

2. Install dependencies
```bash
pip install python-dotenv requests
```

3. Ubah file `.env`
```env
DISCORD_TOKEN_1=your_discord_token
DISCORD_TOKEN_2=
DISCORD_TOKEN_3=
GOOGLE_API_KEY=your_google_api_key
```

4. Buat file `pesan.txt` (opsional, untuk mode reply dari file)
```
Pesan 1
Pesan 2
Pesan 3
```

5. Jalankan bot
```bash
python discord.py
```

## Menu

1. Tambah Konfigurasi Bot
2. Jalankan Bot
3. Hapus Konfigurasi
4. Keluar

## Pengaturan Bot

- Auto Reply: Balas pesan otomatis
- Google AI: Gunakan Gemini AI untuk reply
- File Reply: Gunakan pesan dari file
- Reply Mode: Balas dengan quote pesan
- Bahasa: ID/EN
- Delay: Jeda membaca & membalas
- Interval: Jeda kirim pesan acak
