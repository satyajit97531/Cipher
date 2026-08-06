// backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const User = require('./models/User');
const Chat = require('./models/Chat');

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('❌ MongoDB error:', err));

// --- AUTHENTICATION MIDDLEWARE ---
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(403).json({ error: 'No badge (token) provided.' });
  try {
    const decoded = jwt.verify(token.split(" ")[1], process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Forged badge. Unauthorized.' });
  }
};

// --- AUTH ROUTES ---
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.json({ message: 'Detective registered successfully.' });
  } catch (err) {
    res.status(400).json({ error: 'Codename already taken.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'Detective not found.' });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ error: 'Incorrect password.' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username: user.username });
  } catch (err) {
    console.error("LOGIN CRASH REPORT:", err); // 👈 ADD THIS LINE
    res.status(500).json({ error: 'Server error.' });
  }
});

// --- CHAT ROUTES ---
const SYSTEM_PROMPT = `You are Cipher, a gritty noir detective AI. Speak like a 1940s private eye.`;

// Get all past chat cases for the user
app.get('/api/chats', verifyToken, async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve case files.' });
  }
});

// Get a specific chat session
app.get('/api/chats/:chatId', verifyToken, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (chat.userId.toString() !== req.userId) return res.status(403).send('Unauthorized');
    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: 'Failed to open case file.' });
  }
});

// Continue a chat and get AI response
app.post('/api/chats/:chatId', verifyToken, async (req, res) => {
  // 1. Accept message AND image from the frontend
  const { message, image } = req.body; 
  const { chatId } = req.params;

  try {
    let chat;
    if (chatId === 'new') {
      chat = new Chat({ 
        userId: req.userId, 
        title: message ? message.substring(0, 20) + '...' : 'Photo Evidence', 
        messages: [] 
      });
    } else {
      chat = await Chat.findById(chatId);
    }

    // 2. Save the message to MongoDB (mark it if it has an image)
    const userText = image ? `[Attached Photo] ${message || ''}` : message;
    chat.messages.push({ text: userText, sender: 'user' });
    
    // 3. Build the payload for Ollama. 
    // We use 'llava' because it handles both text-only AND images perfectly.
    const ollamaPayload = {
      model: 'llava',
      prompt: message || "Describe this image in detail.",
      system: "You are Cipher, a gritty 1940s noir detective chatbot. Speak like a private eye, and provide detailed analysis of any evidence presented. do not make up information. If you don't know, say so. Don't shy away from asking for more details or evidence.",
      stream: false,
    };

    // 4. If an image was uploaded, extract the raw Base64 data for Ollama
    if (image) {
      ollamaPayload.images = [image.split(',')[1]];
    }

    // 5. Send to your local Ollama instance
    const aiResponse = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaPayload),
    });
    
    const aiData = await aiResponse.json();
    
    // Save AI response to DB
    chat.messages.push({ text: aiData.response, sender: 'cipher' });
    chat.updatedAt = Date.now();
    await chat.save();

    res.json({ reply: aiData.response, chatId: chat._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to communicate with the vision model.' });
  }
});

app.listen(process.env.PORT || 5000, () => console.log(`🚀 HQ Server running`));