import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const prisma = new PrismaClient();
const upload = multer({ dest: 'public/videos/' });

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

const JWT_SECRET = process.env.JWT_SECRET;

// Auth middleware
const authenticate = async (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!req.user) return res.status(401).json({ error: 'User not found' });
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Register
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return res.status(400).json({ error: 'Username taken' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, email, password: hashed }
    });
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
    res.json({ success: true, username: user.username });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// Inbox
app.get('/api/inbox', authenticate, async (req, res) => {
  const messages = await prisma.message.findMany({
    where: { toUserId: req.user.id },
    orderBy: { createdAt: 'desc' }
  });
  res.json(messages);
});

// Receive message
app.post('/api/receive/:username', upload.single('video'), async (req, res) => {
  const { username } = req.params;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const videoUrl = `${req.protocol}://${req.get('host')}/videos/${req.file.filename}.webm`;
  const { transcript, character, voice } = req.body;

  await prisma.message.create({
    data: {
      toUserId: user.id,
      videoUrl,
      transcript,
      character: parseInt(character),
      voice,
      senderIp: req.ip
    }
  });

  res.json({ success: true });
});

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/inbox', authenticate, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/@:username', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`VoxDrop on port ${port}`));
