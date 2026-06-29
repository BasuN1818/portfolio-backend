import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

// Resolve __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env relative to this script
dotenv.config({ path: path.resolve(__dirname, '.env') });

const CONTACTS_FILE_PATH = path.resolve(__dirname, 'contacts.json');

async function run() {
  console.clear();
  console.log("=============================================");
  console.log("   PORTFOLIO DATABASE CONTACT MESSAGES VIEWER ");
  console.log("=============================================\n");

  // --- Contacts ---
  console.log("--- Contact Messages ---\n");
  try {
    const data = await fs.readFile(CONTACTS_FILE_PATH, 'utf-8');
    const contacts = JSON.parse(data);

    if (contacts.length === 0) {
      console.log("No contact messages found yet.\n");
    } else {
      console.log(`Found ${contacts.length} message(s).\n`);
      console.table(contacts.map(item => ({
        ID: item.id,
        Name: item.name,
        Email: item.email,
        Message: item.message.length > 50 ? item.message.substring(0, 47) + "..." : item.message,
        'Sent At': new Date(item.created_at).toLocaleString()
      })));
    }
  } catch {
    console.log("No contacts file found yet. No messages saved.\n");
  }

  console.log("=============================================");
}

run();
