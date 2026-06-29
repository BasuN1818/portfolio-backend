import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

// Resolve __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env relative to this file
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json());

const CONTACTS_FILE_PATH = path.resolve(__dirname, 'contacts.json');

// Helper: read contacts from JSON file
async function readContacts() {
  try {
    const data = await fs.readFile(CONTACTS_FILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    // File doesn't exist or is invalid; return empty list
    return [];
  }
}

// Helper: write contacts to JSON file
async function writeContacts(contacts) {
  await fs.writeFile(CONTACTS_FILE_PATH, JSON.stringify(contacts, null, 2), 'utf-8');
}

const ADMINS_FILE_PATH = path.resolve(__dirname, 'admins.json');

// Helper: read admins from JSON file
async function readAdmins() {
  try {
    const data = await fs.readFile(ADMINS_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(data);
    console.log(`[Database] Read ${parsed.length} admin accounts.`);
    return parsed;
  } catch (err) {
    console.error('Error reading admins database:', err);
    return [];
  }
}

// Helper: write admins to JSON file
async function writeAdmins(admins) {
  await fs.writeFile(ADMINS_FILE_PATH, JSON.stringify(admins, null, 2), 'utf-8');
}



// POST /api/contact — save a new contact message
app.post('/api/contact', async (req, res) => {
  try {
    const { user_name, user_email, message } = req.body;

    if (!user_name || !user_email || !message) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const contacts = await readContacts();

    const newContact = {
      id: contacts.length > 0 ? Math.max(...contacts.map(c => c.id)) + 1 : 1,
      name: user_name,
      email: user_email,
      message,
      created_at: new Date().toISOString()
    };

    contacts.push(newContact);
    await writeContacts(contacts);

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
    // Return newest first
    res.json(contacts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});



// DELETE /api/contacts/:id — delete a contact by id
app.delete('/api/contacts/:id', async (req, res) => {
  try {
    const contactId = parseInt(req.params.id, 10);
    let contacts = await readContacts();
    const initialLength = contacts.length;
    contacts = contacts.filter(c => c.id !== contactId);

    if (contacts.length === initialLength) {
      return res.status(404).json({ error: 'Contact not found.' });
    }

    await writeContacts(contacts);
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
    admin.lastLogin = new Date().toISOString();
    await writeAdmins(admins);

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
    // Return all admins (for security in dashboard lists we can omit password unless editing)
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

    const nextId = admins.length > 0 ? Math.max(...admins.map(a => a.id)) + 1 : 1;
    const newAdmin = {
      id: nextId,
      name: newAdminData.name,
      email: newAdminData.email,
      password: newAdminData.password || 'admin123',
      phone: newAdminData.phone || '',
      bio: newAdminData.bio || '',
      role: newAdminData.role,
      status: 'active',
      avatar: newAdminData.avatar || null,
      permissions: newAdminData.permissions || [],
      lastLogin: new Date().toISOString(),
      joinedAt: new Date().toISOString()
    };

    admins.push(newAdmin);
    await writeAdmins(admins);

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
    const adminIndex = admins.findIndex(a => a.id === id);

    if (adminIndex === -1) {
      return res.status(404).json({ error: 'Admin not found.' });
    }

    // Check if email update conflicts with another admin
    if (updates.email && admins.some(a => a.id !== id && a.email.toLowerCase() === updates.email.toLowerCase())) {
      return res.status(400).json({ error: 'An admin with this email already exists.' });
    }

    const original = admins[adminIndex];

    // Password change validation
    if (updates.newPassword) {
      if (original.password !== updates.currentPassword) {
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
      original.password = updates.newPassword;
    }

    // Extract password update fields so they aren't merged directly into other fields
    const { currentPassword: _unusedCurrent, newPassword: _unusedNew, ...otherUpdates } = updates;

    // Update details
    admins[adminIndex] = {
      ...original,
      ...otherUpdates,
      id // Ensure ID does not change
    };

    await writeAdmins(admins);

    const { password: _, ...secureAdmin } = admins[adminIndex];
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
    let admins = await readAdmins();
    const initialLength = admins.length;
    admins = admins.filter(a => a.id !== id);

    if (admins.length === initialLength) {
      return res.status(404).json({ error: 'Admin not found.' });
    }

    await writeAdmins(admins);
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
      await writeAdmins(defaultAdmin);
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
  console.log('  Storage: JSON file-based (no database needed)');
  console.log(`  Server running on http://localhost:${PORT}`);
  console.log('=============================================');
  await seedDefaultAdmin();
});

server.on('error', async (err) => {
  const errorMsg = `[${new Date().toISOString()}] Server error: ${err.message}\nStack: ${err.stack}\n\n`;
  try {
    await fs.appendFile(path.resolve(__dirname, 'backend_error.log'), errorMsg, 'utf-8');
  } catch (e) {}
  
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
  } catch (e) {}
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  const errorMsg = `[${new Date().toISOString()}] Unhandled Rejection: ${reason}\n\n`;
  try {
    await fs.appendFile(path.resolve(__dirname, 'backend_error.log'), errorMsg, 'utf-8');
  } catch (e) {}
  console.error('Unhandled Rejection:', reason);
});
