import express from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const upload = multer({ dest: 'public/videos/' });

// Create folders if missing
if (!fs.existsSync('public/videos')) fs.mkdirSync('public/videos', { recursive: true });
if (!fs.existsSync('data')) fs.mkdirSync('data', { recursive: true });

app.use(express.json());
app.use(express.static('public'));

// Simple in-memory + file storage (persists on Railway volume)
let users = {};
try { users = JSON.parse(fs.readFileSync('data/users.json', 'utf8')); } catch(e) {}

// Register
app.post('/api/register', (req, res) => {
  const { username } = req.body;
  if (users[username]) return res.status(400).json({ error: "Taken" });
  users[username] = { inbox: [] };
  fs.writeFileSync('data/users.json', JSON.stringify(users));
  res.json({ success: true, username });
});

// Receive drop
app.post('/api/receive/:username', upload.single('video'), (req, res) => {
  const { username } = req.params;
  if (!users[username]) return res.status(404).json({ error: "Not found" });

  const videoUrl = `/videos/${req.file.filename}.webm`;
  const { transcript } = req.body;

  users[username].inbox.push({
    videoUrl,
    transcript: transcript || "",
    date: new Date().toISOString()
  });
  fs.writeFileSync('data/users.json', JSON.stringify(users));
  res.json({ success: true });
});

// Get inbox
app.get('/api/inbox/:username', (req, res) => {
  const { username } = req.params;
  res.json(users[username]?.inbox || []);
});

// Catch-all: serve index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(process.env.PORT || 3000, () => console.log("VoxDrop LIVE – no DB!"));
