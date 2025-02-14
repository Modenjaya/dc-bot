import json
import time
import os
import random
import requests
from dotenv import load_dotenv
from datetime import datetime
import threading

load_dotenv()

class DiscordBot:
    def __init__(self, token_name, channel_id, config):
        self.token = os.getenv(token_name)
        self.token_name = token_name
        self.channel_id = channel_id
        self.config = config
        self.last_message_id = None
        self.bot_user_id = None
        self.last_ai_response = None

    def log_message(self, message):
        print(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} - Bot {self.token_name} - {message}")

    def generate_reply(self, prompt):
        if self.config['use_file_reply']:
            self.log_message("💬 Menggunakan pesan dari file sebagai balasan.")
            return {"candidates": [{"content": {"parts": [{"text": self.get_random_message()}]}}]}

        if self.config['use_google_ai']:
            language = self.config['language']
            if language == "en":
                ai_prompt = f"{prompt}\n\nRespond with only one sentence in casual urban English, like a natural conversation, and do not use symbols."
            else:
                ai_prompt = f"{prompt}\n\nBerikan 1 kalimat saja dalam bahasa gaul daerah Jakarta seperti obrolan dan jangan gunakan simbol apapun."

            url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key={os.getenv("GOOGLE_API_KEY")}'
            headers = {'Content-Type': 'application/json'}
            data = {'contents': [{'parts': [{'text': ai_prompt}]}]}

            for attempt in range(3):
                try:
                    response = requests.post(url, headers=headers, json=data)
                    response.raise_for_status()
                    ai_response = response.json()
                    response_text = ai_response['candidates'][0]['content']['parts'][0]['text']

                    if response_text == self.last_ai_response:
                        self.log_message("⚠️ AI memberikan balasan yang sama, mencoba ulang...")
                        continue

                    self.last_ai_response = response_text
                    return ai_response

                except requests.exceptions.RequestException as e:
                    self.log_message(f"⚠️ Request failed: {e}")
                    return None

            return {"candidates": [{"content": {"parts": [{"text": self.last_ai_response or 'Maaf, tidak dapat membalas pesan.'}]}}]}

        return {"candidates": [{"content": {"parts": [{"text": self.get_random_message()}]}}]}

    def get_random_message(self):
        try:
            with open('pesan.txt', 'r') as file:
                lines = file.readlines()
                if lines:
                    return random.choice(lines).strip()
                else:
                    self.log_message("File pesan.txt kosong.")
                    return "Tidak ada pesan yang tersedia."
        except FileNotFoundError:
            self.log_message("File pesan.txt tidak ditemukan.")
            return "File pesan.txt tidak ditemukan."

    def delete_message(self, message_id):
        headers = {
            'Authorization': f'{self.token}',
        }
        try:
            response = requests.delete(
                f"https://discord.com/api/v9/channels/{self.channel_id}/messages/{message_id}",
                headers=headers
            )
            response.raise_for_status()
            self.log_message(f"🗑️ Deleted message: {message_id}")
        except requests.exceptions.RequestException as e:
            self.log_message(f"⚠️ Failed to delete message: {e}")

    def send_message(self, message_text, reply_to=None):
        headers = {
            'Authorization': f'{self.token}',
            'Content-Type': 'application/json'
        }

        payload = {'content': message_text}

        if self.config['reply_mode'] and reply_to:
            payload['message_reference'] = {'message_id': reply_to}

        try:
            response = requests.post(
                f"https://discord.com/api/v9/channels/{self.channel_id}/messages",
                json=payload,
                headers=headers
            )
            response.raise_for_status()

            if response.status_code == 201:
                self.log_message(f"✅ Sent message: {message_text}")
                message_id = response.json().get('id')
                
                # Start a thread to delete the message after the specified delay
                if self.config.get('auto_delete', False) and self.config.get('delete_delay', 0) > 0:
                    delete_thread = threading.Thread(
                        target=self._delayed_delete,
                        args=(message_id, self.config['delete_delay'])
                    )
                    delete_thread.start()
            else:
                self.log_message(f"✅ BERHASIL: {response.status_code}")
        except requests.exceptions.RequestException as e:
            self.log_message(f"⚠️ Request error: {e}")

    def _delayed_delete(self, message_id, delay):
        time.sleep(delay)
        self.delete_message(message_id)

    def auto_reply(self):
        headers = {'Authorization': f'{self.token}'}

        try:
            bot_info_response = requests.get('https://discord.com/api/v9/users/@me', headers=headers)
            bot_info_response.raise_for_status()
            self.bot_user_id = bot_info_response.json().get('id')
        except requests.exceptions.RequestException as e:
            self.log_message(f"⚠️ Failed to retrieve bot information: {e}")
            return

        while True:
            try:
                response = requests.get(
                    f'https://discord.com/api/v9/channels/{self.channel_id}/messages',
                    headers=headers
                )
                response.raise_for_status()

                if response.status_code == 200:
                    messages = response.json()
                    if len(messages) > 0:
                        most_recent_message = messages[0]
                        message_id = most_recent_message.get('id')
                        author_id = most_recent_message.get('author', {}).get('id')
                        message_type = most_recent_message.get('type', '')

                        if (self.last_message_id is None or int(message_id) > int(self.last_message_id)) and \
                           author_id != self.bot_user_id and message_type != 8:
                            user_message = most_recent_message.get('content', '')
                            self.log_message(f"💬 Received message: {user_message}")

                            result = self.generate_reply(user_message)
                            response_text = result['candidates'][0]['content']['parts'][0]['text'] if result else "Maaf, tidak dapat membalas pesan."

                            self.log_message(f"⏳ Waiting {self.config['reply_delay']} seconds before replying...")
                            time.sleep(self.config['reply_delay'])
                            self.send_message(response_text, reply_to=message_id)
                            self.last_message_id = message_id

                self.log_message(f"⏳ Waiting {self.config['read_delay']} seconds before checking for new messages...")
                time.sleep(self.config['read_delay'])
            except requests.exceptions.RequestException as e:
                self.log_message(f"⚠️ Request error: {e}")
                time.sleep(self.config['read_delay'])

    def run_random_messages(self):
        while True:
            message_text = self.get_random_message()
            self.send_message(message_text)
            self.log_message(f"⏳ Waiting {self.config['send_interval']} seconds before sending the next message...")
            time.sleep(self.config['send_interval'])

def load_config():
    try:
        with open('config.json', 'r') as file:
            return json.load(file)
    except FileNotFoundError:
        print("⚠️ File config.json tidak ditemukan. Membuat file baru...")
        return {}

def save_config(config):
    with open('config.json', 'w') as file:
        json.dump(config, file, indent=4)

def delete_config(token_name=None):
    try:
        if os.path.exists('config.json'):
            if token_name:
                config = load_config()
                if token_name in config:
                    del config[token_name]
                    save_config(config)
                    print(f"✅ Konfigurasi untuk {token_name} berhasil dihapus!")
                else:
                    print(f"⚠️ Konfigurasi untuk {token_name} tidak ditemukan!")
            else:
                os.remove('config.json')
                print("✅ Semua konfigurasi berhasil dihapus!")
        else:
            print("⚠️ File config.json tidak ditemukan!")
    except Exception as e:
        print(f"⚠️ Terjadi kesalahan: {str(e)}")

def main():
    config = load_config()
    
    while True:
        print("\n=== Menu Utama ===")
        print("1. Tambah Konfigurasi Bot")
        print("2. Jalankan Bot")
        print("3. Hapus Konfigurasi")
        print("4. Keluar")
        
        choice = input("Pilih menu (1-4): ")

        if choice == "1":
            token_name = input("Masukkan nama token dari .env (contoh: DISCORD_TOKEN_1): ")
            channel_id = input("Masukkan ID channel: ")
            
            bot_config = {
                "use_reply": input("Gunakan auto-reply? (y/n): ").lower() == 'y',
                "use_google_ai": input("Gunakan Google Gemini AI? (y/n): ").lower() == 'y',
                "use_file_reply": input("Gunakan pesan dari file? (y/n): ").lower() == 'y',
                "reply_mode": input("Mode reply? (y/n): ").lower() == 'y',
                "language": input("Bahasa (id/en): ").lower(),
                "read_delay": int(input("Delay membaca pesan (detik): ")),
                "reply_delay": int(input("Delay balas pesan (detik): ")),
                "send_interval": int(input("Interval kirim pesan acak (detik): ")),
                "auto_delete": input("Aktifkan auto-delete pesan? (y/n): ").lower() == 'y'
            }
            
            if bot_config["auto_delete"]:
                bot_config["delete_delay"] = int(input("Delay hapus pesan (detik): "))
            
            config[token_name] = {
                "channel_id": channel_id,
                "config": bot_config
            }
            
            save_config(config)
            print("✅ Konfigurasi berhasil disimpan!")

        elif choice == "2":
            if not config:
                print("⚠️ Tidak ada konfigurasi yang tersimpan. Tambahkan konfigurasi terlebih dahulu.")
                continue

            threads = []
            for token_name, bot_data in config.items():
                if not os.getenv(token_name):
                    print(f"⚠️ Token {token_name} tidak ditemukan di file .env")
                    continue
                    
                bot = DiscordBot(token_name, bot_data["channel_id"], bot_data["config"])
                
                if bot_data["config"]["use_reply"]:
                    thread = threading.Thread(target=bot.auto_reply)
                else:
                    thread = threading.Thread(target=bot.run_random_messages)
                
                threads.append(thread)
                thread.start()
                print(f"✅ Bot untuk {token_name} berhasil dijalankan!")

            for thread in threads:
                thread.join()

        elif choice == "3":
            if not config:
                print("⚠️ Tidak ada konfigurasi yang tersimpan.")
                continue
                
            print("\n=== Hapus Konfigurasi ===")
            print("Bot yang tersedia:")
            for token_name in config.keys():
                print(f"- {token_name}")
            print("\nPilihan:")
            print("1. Hapus semua konfigurasi")
            print("2. Hapus konfigurasi tertentu")
            print("3. Kembali ke menu utama")
            
            del_choice = input("Pilih menu (1-3): ")
            
            if del_choice == "1":
                confirm = input("⚠️ Anda yakin ingin menghapus SEMUA konfigurasi? (y/n): ")
                if confirm.lower() == 'y':
                    delete_config()
                    config = {}
            elif del_choice == "2":
                token_name = input("Masukkan nama token yang akan dihapus: ")
                confirm = input(f"⚠️ Anda yakin ingin menghapus konfigurasi untuk {token_name}? (y/n): ")
                if confirm.lower() == 'y':
                    delete_config(token_name)
                    config = load_config()
            elif del_choice == "3":
                continue
            else:
                print("⚠️ Pilihan tidak valid!")

        elif choice == "4":
            print("👋 Terima kasih telah menggunakan bot!")
            break

        else:
            print("⚠️ Pilihan tidak valid!")

if __name__ == "__main__":
    main()
