import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/videos/');
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.random().toString(36).substring(7);
    cb(null, uniqueName + '.webm');
  }
});
const upload = multer({ storage });

// Create folders if missing
if (!fs.existsSync('public/videos')) {
  fs.mkdirSync('public/videos', { recursive: true });
  console.log('✓ Created public/videos directory');
}
if (!fs.existsSync('data')) {
  fs.mkdirSync('data', { recursive: true });
  console.log('✓ Created data directory');
}

app.use(express.json());
app.use(express.static('public'));

// Load users database
let users = {};
const usersFile = 'data/users.json';

function loadUsers() {
  try {
    if (fs.existsSync(usersFile)) {
      const data = fs.readFileSync(usersFile, 'utf8');
      users = JSON.parse(data);
      console.log(`✓ Loaded ${Object.keys(users).length} users from database`);
    } else {
      console.log('ℹ No existing users database, starting fresh');
      saveUsers();
    }
  } catch (e) {
    console.error('Error loading users:', e);
    users = {};
    saveUsers();
  }
}

function saveUsers() {
  try {
    // Ensure data directory exists
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data', { recursive: true });
    }
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), 'utf8');
    console.log('✓ Saved users to database');
    return true;
  } catch (e) {
    console.error('❌ Error saving users:', e.message);
    return false;
  }
}

loadUsers();

function hashPassword(pass) {
  return crypto.createHash('sha256').update(pass).digest('hex');
}

// Register new user
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  
  // Clean username
  const cleanUsername = username.trim().toLowerCase();
  
  if (cleanUsername.length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters" });
  }
  
  if (users[cleanUsername]) {
    return res.status(400).json({ error: "Username already taken" });
  }
  
  users[cleanUsername] = { 
    password: hashPassword(password),
    inbox: [],
    createdAt: new Date().toISOString()
  };
  
  const saved = saveUsers();
  if (!saved) {
    return res.status(500).json({ error: "Failed to save user. Check server logs." });
  }
  
  console.log(`✓ New user registered: ${cleanUsername}`);
  res.json({ success: true, username: cleanUsername });
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  
  const cleanUsername = username.trim().toLowerCase();
  const user = users[cleanUsername];
  
  if (!user || user.password !== hashPassword(password)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  
  console.log(`✓ User logged in: ${cleanUsername}`);
  res.json({ success: true, username: cleanUsername });
});

// Auto-create user if visiting their link (for receiving messages)
function ensureUserExists(username) {
  const cleanUsername = username.trim().toLowerCase();
  
  if (!users[cleanUsername]) {
    console.log(`ℹ Auto-creating user: ${cleanUsername}`);
    users[cleanUsername] = {
      password: hashPassword('auto-' + Math.random().toString(36)),
      inbox: [],
      createdAt: new Date().toISOString(),
      autoCreated: true
    };
    saveUsers();
  }
  
  return cleanUsername;
}

// Receive a voice drop
app.post('/api/receive/:username', upload.single('video'), (req, res) => {
  const { username } = req.params;
  const cleanUsername = ensureUserExists(username);
  
  console.log(`📬 Receiving drop for: ${cleanUsername}`);
  
  if (!req.file) {
    console.error('❌ No video file in request');
    return res.status(400).json({ error: "No video file uploaded" });
  }

  const videoUrl = `/videos/${req.file.filename}`;
  const { transcript } = req.body;

  users[cleanUsername].inbox.push({
    videoUrl,
    transcript: transcript || "",
    date: new Date().toISOString(),
    fileSize: req.file.size
  });
  
  saveUsers();
  console.log(`✓ Drop saved for ${cleanUsername} (${req.file.size} bytes)`);
  res.json({ success: true, message: "Drop delivered!" });
});

// Get user's inbox
app.get('/api/inbox/:username', (req, res) => {
  const { username } = req.params;
  const cleanUsername = username.trim().toLowerCase();
  
  if (!users[cleanUsername]) {
    console.log(`⚠ Inbox request for non-existent user: ${cleanUsername}`);
    return res.json([]);
  }
  
  const inbox = users[cleanUsername].inbox || [];
  console.log(`📥 Fetched ${inbox.length} messages for ${cleanUsername}`);
  res.json(inbox);
});

// Check if username is available
app.get('/api/check/:username', (req, res) => {
  const { username } = req.params;
  const cleanUsername = username.trim().toLowerCase();
  const available = !users[cleanUsername];
  res.json({ available, username: cleanUsername });
});

// Get user stats (optional - for debugging)
app.get('/api/stats', (req, res) => {
  const stats = {
    totalUsers: Object.keys(users).length,
    users: Object.keys(users),
    totalMessages: Object.values(users).reduce((sum, u) => sum + (u.inbox?.length || 0), 0)
  };
  res.json(stats);
});

// Catch-all for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║                                        ║
║       🎤 VoxDrop Server LIVE! 🎤       ║
║                                        ║
║   Port: ${PORT}                           ║
║   Users: ${Object.keys(users).length}                             ║
║   Status: Ready to receive drops       ║
║                                        ║
╚════════════════════════════════════════╝
  `);
});
