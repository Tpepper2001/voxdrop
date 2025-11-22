import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const upload = multer({ dest: 'public/videos/' });

// Create folders if missing
if (!fs.existsSync('public/videos')) fs.mkdirSync('public/videos', { recursive: true });
if (!fs.existsSync('data')) fs.mkdirSync('data', { recursive: true });

app.use(express.json());
app.use(express.static('public'));

// Load users (with passwords and inbox)
let users = {};
try { 
  users = JSON.parse(fs.readFileSync('data/users.json', 'utf8')); 
} catch(e) {}

function hashPassword(pass) {
  return crypto.createHash('sha256').update(pass).digest('hex');
}

// Register
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  if (users[username]) return res.status(400).json({ error: "Username taken" });
  
  users[username] = { 
    password: hashPassword(password),
    inbox: [] 
  };
  fs.writeFileSync('data/users.json', JSON.stringify(users, null, 2));
  res.json({ success: true });
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  
  const user = users[username];
  if (!user || user.password !== hashPassword(password)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  
  res.json({ success: true, username });
});

// Receive drop
app.post('/api/receive/:username', upload.single('video'), (req, res) => {
  const { username } = req.params;
  console.log('Receive request for:', username);
  console.log('Available users:', Object.keys(users));
  
  if (!users[username]) {
    return res.status(404).json({ error: `User ${username} not found. Available: ${Object.keys(users).join(', ')}` });
  }

  if (!req.file) {
    return res.status(400).json({ error: "No video file" });
  }

  const videoUrl = `/videos/${req.file.filename}.webm`;
  const { transcript } = req.body;

  users[username].inbox.push({
    videoUrl,
    transcript: transcript || "",
    date: new Date().toISOString()
  });
  fs.writeFileSync('data/users.json', JSON.stringify(users, null, 2));
  console.log('Drop saved for', username);
  res.json({ success: true });
});

// Get inbox
app.get('/api/inbox/:username', (req, res) => {
  const { username } = req.params;
  res.json(users[username]?.inbox || []);
});

// Catch-all for client routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(process.env.PORT || 3000, () => console.log("VoxDrop LIVE – Professional Edition"));
