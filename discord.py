import json
import time
import threading
import os
import random
import requests
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

# Ambil token dari .env
discord_tokens = [
    os.getenv('DISCORD_TOKEN_1'),
    os.getenv('DISCORD_TOKEN_2'),
    os.getenv('DISCORD_TOKEN_3'),
    os.getenv('DISCORD_TOKEN_4'),
    os.getenv('DISCORD_TOKEN_5'),
]

channel_id = os.getenv('CHANNEL_ID')

# Validasi CHANNEL_ID
if not channel_id:
    print("⚠️ ERROR: CHANNEL_ID tidak ditemukan di .env")
    exit()

print(f"✅ Bot akan berjalan di Channel ID: {channel_id}")

# Validasi token bot
if not all(discord_tokens):
    print("⚠️ ERROR: Salah satu token bot tidak ditemukan di .env")
    exit()

# Pilihan untuk menggunakan auto-reply atau tidak
use_auto_reply = input("Gunakan auto-reply? (y/n): ").lower() == 'y'

# Dictionary untuk menyimpan last_message_id per bot
last_message_ids = {}

# Dictionary untuk menyimpan user ID masing-masing bot
bot_user_ids = {}

# Pengaturan delay per bot
bot_settings = [
    {"read_delay": random.randint(121, 125), "reply_delay": random.randint(2, 6)},
    {"read_delay": random.randint(124, 130), "reply_delay": random.randint(2, 6)},
    {"read_delay": random.randint(128, 135), "reply_delay": random.randint(2, 6)},
    {"read_delay": random.randint(3, 7), "reply_delay": random.randint(2, 6)},
    {"read_delay": random.randint(3, 7), "reply_delay": random.randint(2, 6)},
]

def log_message(message):
    """Log aktivitas bot"""
    print(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} - {message}")

def get_random_message():
    """Mengambil pesan acak dari file pesan.txt"""
    try:
        with open('pesan.txt', 'r', encoding='utf-8') as file:
            lines = file.readlines()
            if lines:
                return random.choice(lines).strip()  
            else:
                log_message("⚠️ File pesan.txt kosong.")
                return "Aku kehabisan kata-kata, hehe~"
    except FileNotFoundError:
        log_message("⚠️ File pesan.txt tidak ditemukan.")
        return "File pesan.txt tidak ada, coba cek dulu ya~"

def send_message(bot_token, message_text, reply_to=None):
    """Mengirim pesan ke channel dengan atau tanpa reply"""
    headers = {
        'Authorization': f'Bot {bot_token}',
        'Content-Type': 'application/json'
    }
    
    payload = {'content': message_text}

    if reply_to:
        payload['message_reference'] = {'message_id': reply_to}

    log_message(f"📤 Bot mencoba mengirim pesan: {message_text}")

    try:
        response = requests.post(f"https://discord.com/api/v9/channels/{channel_id}/messages", json=payload, headers=headers)
        response.raise_for_status()
        if response.status_code == 201:
            log_message(f"✅ Bot berhasil membalas pesan: {message_text}")
    except requests.exceptions.RequestException as e:
        log_message(f"⚠️ Gagal mengirim pesan: {e}")

def auto_reply(bot_token, bot_index):
    """Bot auto-reply dengan fitur balas pesan"""
    headers = {'Authorization': f'Bot {bot_token}'}

    try:
        bot_info_response = requests.get('https://discord.com/api/v9/users/@me', headers=headers)
        bot_info_response.raise_for_status()
        bot_user_id = bot_info_response.json().get('id')
        bot_user_ids[bot_index] = bot_user_id
        log_message(f"✅ Bot {bot_index} berhasil login dengan ID {bot_user_id}")
    except requests.exceptions.RequestException as e:
        log_message(f"⚠️ Bot {bot_index} gagal mendapatkan ID: {e}")
        return

    read_delay = bot_settings[bot_index]["read_delay"]
    reply_delay = bot_settings[bot_index]["reply_delay"]

    if bot_index not in last_message_ids:
        last_message_ids[bot_index] = None

    while True:
        try:
            log_message(f"🔄 Bot {bot_index} mengecek pesan di channel {channel_id}...")
            response = requests.get(f'https://discord.com/api/v9/channels/{channel_id}/messages', headers=headers)
            response.raise_for_status()

            messages = response.json()
            if messages:
                most_recent_message = messages[0]
                message_id = most_recent_message.get('id')
                author_id = most_recent_message.get('author', {}).get('id')
                user_message = most_recent_message.get('content', '')

                if (last_message_ids[bot_index] is None or int(message_id) > int(last_message_ids[bot_index])) and author_id not in bot_user_ids.values():
                    response_text = get_random_message()
                    time.sleep(reply_delay)
                    send_message(bot_token, response_text, reply_to=message_id)
                    last_message_ids[bot_index] = message_id

            time.sleep(read_delay)

        except requests.exceptions.RequestException as e:
            log_message(f"⚠️ Bot {bot_index} error membaca pesan: {e}")
            time.sleep(read_delay)

def send_random_message(bot_token):
    """Mode bot hanya mengirim pesan secara acak, tanpa auto-reply"""
    while True:
        message_text = get_random_message()
        send_message(bot_token, message_text)
        delay = random.randint(30, 90)  # Delay antar pesan
        log_message(f"⏳ Bot menunggu {delay} detik sebelum mengirim pesan berikutnya...")
        time.sleep(delay)

# Menjalankan bot sesuai dengan mode yang dipilih
threads = []
for i, token in enumerate(discord_tokens):
    if use_auto_reply:
        t = threading.Thread(target=auto_reply, args=(token, i))
    else:
        t = threading.Thread(target=send_random_message, args=(token,))
    threads.append(t)
    t.start()

for t in threads:
    t.join()
