# Discord Bot Auto Reply & Deleted chat 

Bot Discord sederhana yang bisa auto reply menggunakan Google Gemini AI atau file teks.

## Fitur

- Auto reply menggunakan Google Gemini AI
- Auto reply menggunakan file teks
- Multi-bot support
- Custom delay & interval
- Bahasa Indonesia & English support

## Cara Pakai

DISCORD_TOKEN
```bash
console.log('\n🔧 FIND YOUR TOKEN');
    try {
        for (const key in window) {
            if (key.startsWith('webpackChunk')) {
                console.log(`Found webpack chunk: ${key}`);
                const chunk = window[key];
                if (chunk && chunk.push) {
                    try {
                        const modules = [];
                        chunk.push([['test'], {}, (e) => {
                            for (const moduleId in e.c) {
                                modules.push(e.c[moduleId]);
                            }
                        }]);
                        
                        const tokenModule = modules.find(m => 
                            m?.exports?.default?.getToken || 
                            m?.exports?.getToken ||
                            (m?.exports && typeof m.exports.getToken === 'function')
                        );
                        
                        if (tokenModule) {
                            const token = tokenModule.exports.default?.getToken() || tokenModule.exports.getToken();
                            if (token) {
                                console.log('✅ YOUR TOKEN:', token);
                            }
                        }
                    } catch (e) {
                        console.log(`❌ Error with ${key}:`, e.message);
                    }
                }
            }
        }
    } catch (e) {
        console.log('❌ Alternative webpack error:', e.message);
    }
```

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
sudo apt install python3-venv -y
```

3. Ubah file `.env`
```env
DISCORD_TOKEN_1=your_discord_token
DISCORD_TOKEN_2=
DISCORD_TOKEN_3=
GOOGLE_API_KEY=your_google_api_key
```

4. Isi pesanmu `pesan.txt` (opsional, untuk mode reply dari file)
```
nano pesan.txt
```

5. Jalankan bot
```bash
python3 discord.py
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
