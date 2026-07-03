import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import mongoose from 'mongoose';

// Resolve __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env relative to this file
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();

// Custom CORS configuration to allow mobile devices on the local network (DHCP) dynamically
const allowedOrigins = ['http://localhost:5173', 'https://bn18portfolio.netlify.app'];
const isLocalIp = (origin) => {
  if (!origin) return true;
  // Match localhost, 127.0.0.1, or local network IPs (e.g. 192.168.x.x, 10.x.x.x, 172.16-31.x.x) with any port
  const localIpRegex = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;
  return localIpRegex.test(origin);
};

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || isLocalIp(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

const CONTACTS_FILE_PATH = path.resolve(__dirname, 'contacts.json');
const ADMINS_FILE_PATH = path.resolve(__dirname, 'admins.json');

// Mongoose Schemas & Models
const ContactSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  message: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

const AdminSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String, default: '' },
  bio: { type: String, default: '' },
  role: { type: String, required: true },
  status: { type: String, default: 'active' },
  avatar: { type: String, default: null },
  permissions: { type: [String], default: [] },
  lastLogin: { type: Date },
  joinedAt: { type: Date, default: Date.now }
});

const ContactModel = mongoose.models.Contact || mongoose.model('Contact', ContactSchema);
const AdminModel = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);

let isMongo = false;

// Connect to MongoDB Atlas if MONGODB_URI is provided in .env
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('[Database] Connected to MongoDB Atlas successfully.');
    isMongo = true;
  } catch (err) {
    console.error('[Database] MongoDB connection failed. Falling back to local JSON files:', err);
  }
} else {
  console.log('[Database] No MONGODB_URI found. Running with local JSON file storage.');
}

// Auto-migration helper functions
async function readContactsFromFile() {
  try {
    const data = await fs.readFile(CONTACTS_FILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function readAdminsFromFile() {
  try {
    const data = await fs.readFile(ADMINS_FILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function migrateJsonToMongo() {
  if (!isMongo) return;
  try {
    const mongoAdminCount = await AdminModel.countDocuments();
    if (mongoAdminCount === 0) {
      console.log('[Migration] MongoDB admin collection is empty. Checking local admins.json...');
      const localAdmins = await readAdminsFromFile();
      if (localAdmins.length > 0) {
        await AdminModel.insertMany(localAdmins);
        console.log(`[Migration] Successfully migrated ${localAdmins.length} admin accounts to MongoDB.`);
      }
    }

    const mongoContactCount = await ContactModel.countDocuments();
    if (mongoContactCount === 0) {
      console.log('[Migration] MongoDB contact collection is empty. Checking local contacts.json...');
      const localContacts = await readContactsFromFile();
      if (localContacts.length > 0) {
        await ContactModel.insertMany(localContacts);
        console.log(`[Migration] Successfully migrated ${localContacts.length} contacts to MongoDB.`);
      }
    }
  } catch (err) {
    console.error('[Migration] Failed to migrate JSON data to MongoDB:', err);
  }
}

if (isMongo) {
  await migrateJsonToMongo();
}

// Unified Helper: read contacts
async function readContacts() {
  if (isMongo) {
    try {
      const docs = await ContactModel.find().sort({ created_at: -1 });
      return docs.map(d => d.toObject());
    } catch (err) {
      console.error('Error fetching contacts from MongoDB, falling back to local file:', err);
    }
  }
  return readContactsFromFile();
}

// Unified Helper: write contacts (JSON write fallback)
async function writeContacts(contacts) {
  await fs.writeFile(CONTACTS_FILE_PATH, JSON.stringify(contacts, null, 2), 'utf-8');
}

// Unified Helper: save contact
async function saveContact(contactData) {
  if (isMongo) {
    const lastDoc = await ContactModel.findOne().sort({ id: -1 });
    const nextId = lastDoc ? lastDoc.id + 1 : 1;
    const newDoc = new ContactModel({
      id: nextId,
      name: contactData.name,
      email: contactData.email,
      message: contactData.message,
      created_at: new Date().toISOString()
    });
    await newDoc.save();
    return newDoc.toObject();
  } else {
    const contacts = await readContacts();
    const nextId = contacts.length > 0 ? Math.max(...contacts.map(c => c.id)) + 1 : 1;
    const newContact = {
      id: nextId,
      name: contactData.name,
      email: contactData.email,
      message: contactData.message,
      created_at: new Date().toISOString()
    };
    contacts.push(newContact);
    await writeContacts(contacts);
    return newContact;
  }
}

// Unified Helper: delete contact
async function deleteContact(id) {
  if (isMongo) {
    const res = await ContactModel.deleteOne({ id });
    return res.deletedCount > 0;
  } else {
    let contacts = await readContacts();
    const initialLength = contacts.length;
    contacts = contacts.filter(c => c.id !== id);
    if (contacts.length === initialLength) {
      return false;
    }
    await writeContacts(contacts);
    return true;
  }
}

// Unified Helper: read admins
async function readAdmins() {
  if (isMongo) {
    try {
      const docs = await AdminModel.find();
      return docs.map(d => d.toObject());
    } catch (err) {
      console.error('Error fetching admins from MongoDB, falling back to local file:', err);
    }
  }
  return readAdminsFromFile();
}

// Unified Helper: write admins (JSON write fallback)
async function writeAdmins(admins) {
  await fs.writeFile(ADMINS_FILE_PATH, JSON.stringify(admins, null, 2), 'utf-8');
}

// Unified Helper: save admin
async function saveAdmin(adminData) {
  if (isMongo) {
    const lastDoc = await AdminModel.findOne().sort({ id: -1 });
    const nextId = lastDoc ? lastDoc.id + 1 : 1;
    const newDoc = new AdminModel({
      id: nextId,
      name: adminData.name,
      email: adminData.email,
      password: adminData.password || 'admin123',
      phone: adminData.phone || '',
      bio: adminData.bio || '',
      role: adminData.role,
      status: 'active',
      avatar: adminData.avatar || null,
      permissions: adminData.permissions || [],
      joinedAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    });
    await newDoc.save();
    return newDoc.toObject();
  } else {
    const admins = await readAdmins();
    const nextId = admins.length > 0 ? Math.max(...admins.map(a => a.id)) + 1 : 1;
    const newAdmin = {
      id: nextId,
      name: adminData.name,
      email: adminData.email,
      password: adminData.password || 'admin123',
      phone: adminData.phone || '',
      bio: adminData.bio || '',
      role: adminData.role,
      status: 'active',
      avatar: adminData.avatar || null,
      permissions: adminData.permissions || [],
      joinedAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    };
    admins.push(newAdmin);
    await writeAdmins(admins);
    return newAdmin;
  }
}

// Unified Helper: update admin
async function updateAdmin(id, updates) {
  if (isMongo) {
    const admin = await AdminModel.findOne({ id });
    if (!admin) return null;

    if (updates.newPassword) {
      if (admin.password !== updates.currentPassword) {
        throw new Error('Current password is incorrect.');
      }
      admin.password = updates.newPassword;
    }

    const { currentPassword, newPassword, ...otherUpdates } = updates;
    Object.assign(admin, otherUpdates);
    await admin.save();
    return admin.toObject();
  } else {
    const admins = await readAdmins();
    const adminIndex = admins.findIndex(a => a.id === id);
    if (adminIndex === -1) return null;

    const original = admins[adminIndex];
    if (updates.newPassword) {
      if (original.password !== updates.currentPassword) {
        throw new Error('Current password is incorrect.');
      }
      original.password = updates.newPassword;
    }

    const { currentPassword, newPassword, ...otherUpdates } = updates;
    admins[adminIndex] = {
      ...original,
      ...otherUpdates,
      id
    };
    await writeAdmins(admins);
    return admins[adminIndex];
  }
}

// Unified Helper: delete admin
async function deleteAdmin(id) {
  if (isMongo) {
    const res = await AdminModel.deleteOne({ id });
    return res.deletedCount > 0;
  } else {
    let admins = await readAdmins();
    const initialLength = admins.length;
    admins = admins.filter(a => a.id !== id);
    if (admins.length === initialLength) {
      return false;
    }
    await writeAdmins(admins);
    return true;
  }
}

// POST /api/contact — save a new contact message
app.post('/api/contact', async (req, res) => {
  try {
    const { user_name, user_email, message } = req.body;

    if (!user_name || !user_email || !message) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const newContact = await saveContact({ name: user_name, email: user_email, message });

    res.status(201).json({ success: true, message: 'Contact saved successfully!', id: newContact.id });
  } catch (error) {
    console.error('Error saving contact:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/contacts — retrieve all contact messages
app.get('/api/contacts', async (req, res) => {
  try {
    const contacts = await readContacts();
    res.json(contacts);
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// DELETE /api/contacts/:id — delete a contact by id
app.delete('/api/contacts/:id', async (req, res) => {
  try {
    const contactId = parseInt(req.params.id, 10);
    const deleted = await deleteContact(contactId);

    if (!deleted) {
      return res.status(404).json({ error: 'Contact not found.' });
    }

    res.json({ success: true, message: 'Contact deleted successfully.' });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// --- ADMIN ENDPOINTS ---

// POST /api/admin/login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const admins = await readAdmins();
    const admin = admins.find(a => a.email.toLowerCase() === email.trim().toLowerCase());

    if (!admin) {
      return res.status(401).json({ error: 'No admin account found with this email.' });
    }

    if (admin.password !== password) {
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    if (admin.status === 'inactive') {
      return res.status(403).json({ error: 'This account has been suspended.' });
    }

    // Update lastLogin timestamp
    if (isMongo) {
      await AdminModel.updateOne({ id: admin.id }, { lastLogin: new Date().toISOString() });
    } else {
      admin.lastLogin = new Date().toISOString();
      await writeAdmins(admins);
    }

    // Return session details without returning the password
    const { password: _, ...adminSession } = admin;
    res.json({ success: true, admin: adminSession });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/admins
app.get('/api/admins', async (req, res) => {
  try {
    const admins = await readAdmins();
    const secureAdmins = admins.map(({ password, ...a }) => a);
    res.json(secureAdmins);
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// POST /api/admins
app.post('/api/admins', async (req, res) => {
  try {
    const newAdminData = req.body;
    if (!newAdminData.email || !newAdminData.name || !newAdminData.role) {
      return res.status(400).json({ error: 'Name, email, and role are required.' });
    }

    const admins = await readAdmins();

    // Check if email already exists
    if (admins.some(a => a.email.toLowerCase() === newAdminData.email.toLowerCase())) {
      return res.status(400).json({ error: 'An admin with this email already exists.' });
    }

    const newAdmin = await saveAdmin(newAdminData);

    const { password: _, ...secureAdmin } = newAdmin;
    res.status(201).json({ success: true, admin: secureAdmin });
  } catch (error) {
    console.error('Error creating admin:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// PUT /api/admins/:id
app.put('/api/admins/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const updates = req.body;
    const admins = await readAdmins();

    if (updates.email && admins.some(a => a.id !== id && a.email.toLowerCase() === updates.email.toLowerCase())) {
      return res.status(400).json({ error: 'An admin with this email already exists.' });
    }

    const updated = await updateAdmin(id, updates);
    if (!updated) {
      return res.status(404).json({ error: 'Admin not found.' });
    }

    const { password: _, ...secureAdmin } = updated;
    res.json({ success: true, admin: secureAdmin });
  } catch (error) {
    console.error('Error updating admin:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// DELETE /api/admins/:id
app.delete('/api/admins/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = await deleteAdmin(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Admin not found.' });
    }

    res.json({ success: true, message: 'Admin deleted successfully.' });
  } catch (error) {
    console.error('Error deleting admin:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Seed default admin if none exist
async function seedDefaultAdmin() {
  try {
    const admins = await readAdmins();
    if (admins.length === 0) {
      const defaultAdmin = [
        {
          id: 1,
          name: "Basanagoud N.",
          email: "basanagoudnaduvinamani@admin.com",
          password: "NANDINI18",
          phone: "+91 9035242718",
          bio: "Full-stack developer and system architect. Manages all platform operations.",
          role: "Super Admin",
          status: "active",
          avatar: null,
          permissions: ["users", "content", "settings", "analytics", "billing"],
          joinedAt: new Date().toISOString(),
          lastLogin: new Date().toISOString()
        },
        {
          id: 2,
          name: "Basanagoud N. (Backup)",
          email: "basanagoud@admin.com",
          password: "NANDINI18",
          phone: "+91 9035242718",
          bio: "Backup Super Admin account for easy login.",
          role: "Super Admin",
          status: "active",
          avatar: null,
          permissions: ["users", "content", "settings", "analytics", "billing"],
          joinedAt: new Date().toISOString(),
          lastLogin: new Date().toISOString()
        }
      ];
      if (isMongo) {
        await AdminModel.insertMany(defaultAdmin);
      } else {
        await writeAdmins(defaultAdmin);
      }
      console.log('  [Seed] Default admin accounts created successfully.');
    }
  } catch (error) {
    console.error('  [Seed] Failed to seed default admin:', error);
  }
}

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, async () => {
  console.log('=============================================');
  console.log('  NB Studio Portfolio Backend');
  console.log(`  Storage: ${isMongo ? 'MongoDB Atlas Cloud Database' : 'JSON file-based'}`);
  console.log(`  Server running on http://localhost:${PORT}`);
  console.log('=============================================');
  await seedDefaultAdmin();
});

server.on('error', async (err) => {
  const errorMsg = `[${new Date().toISOString()}] Server error: ${err.message}\nStack: ${err.stack}\n\n`;
  try {
    await fs.appendFile(path.resolve(__dirname, 'backend_error.log'), errorMsg, 'utf-8');
  } catch (e) { }

  if (err.code === 'EADDRINUSE') {
    console.error(`ERROR: Port ${PORT} is already in use!`);
    console.error('Another server may be running. Close it first or change PORT in .env');
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

process.on('uncaughtException', async (err) => {
  const errorMsg = `[${new Date().toISOString()}] Uncaught Exception: ${err.message}\nStack: ${err.stack}\n\n`;
  try {
    await fs.appendFile(path.resolve(__dirname, 'backend_error.log'), errorMsg, 'utf-8');
  } catch (e) { }
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  const errorMsg = `[${new Date().toISOString()}] Unhandled Rejection: ${reason}\n\n`;
  try {
    await fs.appendFile(path.resolve(__dirname, 'backend_error.log'), errorMsg, 'utf-8');
  } catch (e) { }
  console.error('Unhandled Rejection:', reason);
});
