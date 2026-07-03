import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import mongoose from 'mongoose';

// Resolve __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env relative to this script
dotenv.config({ path: path.resolve(__dirname, '.env') });

const CONTACTS_FILE_PATH = path.resolve(__dirname, 'contacts.json');

// Mongoose Schema (must match server.js)
const ContactSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  message: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

const ContactModel = mongoose.models.Contact || mongoose.model('Contact', ContactSchema);

async function run() {
  console.clear();
  console.log("=============================================");
  console.log("   PORTFOLIO DATABASE CONTACT MESSAGES VIEWER ");
  console.log("=============================================\n");

  let contacts = [];
  let source = 'Local JSON file';

  const MONGODB_URI = process.env.MONGODB_URI;
  if (MONGODB_URI) {
    try {
      await mongoose.connect(MONGODB_URI);
      contacts = await ContactModel.find().sort({ created_at: -1 }).lean();
      source = 'MongoDB Atlas';
      await mongoose.disconnect();
    } catch (err) {
      console.warn("Could not connect to MongoDB, falling back to local file:", err.message);
    }
  }

  // Fallback to local file if MongoDB wasn't used or failed
  if (contacts.length === 0 && source === 'Local JSON file') {
    try {
      const data = await fs.readFile(CONTACTS_FILE_PATH, 'utf-8');
      contacts = JSON.parse(data);
    } catch {
      // No file found
    }
  }

  console.log(`--- Contact Messages (Source: ${source}) ---\n`);

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

  console.log("=============================================");
}

run();
