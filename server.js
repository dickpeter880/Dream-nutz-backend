const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Post = require('./models/Post');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// ==================== AUTH ROUTES ====================

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const user = new User({ username, email, password });
    await user.save();
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: user._id, username, email } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, username: user.username, email } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ==================== POST ROUTES ====================

const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Access denied' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Create a post
app.post('/api/posts', auth, async (req, res) => {
  try {
    const { content, media } = req.body;
    const post = new Post({ author: req.userId, content, media });
    await post.save();
    await post.populate('author', 'username avatar');
    res.status(201).json(post);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get feed
app.get('/api/feed', auth, async (req, res) => {
  try {
    const posts = await Post.find().populate('author', 'username avatar').sort({ createdAt: -1 });
    res.json(posts);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Like a post
app.post('/api/posts/:id/like', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const index = post.likes.indexOf(req.userId);
    if (index > -1) {
      post.likes.splice(index, 1);
    } else {
      post.likes.push(req.userId);
    }
    await post.save();
    res.json({ likes: post.likes.length });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Comment on a post
app.post('/api/posts/:id/comment', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.comments.push({ user: req.userId, text: req.body.text });
    await post.save();
    await post.populate('comments.user', 'username avatar');
    res.json(post.comments);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ==================== LOCATION / MAP ====================

app.post('/api/location', auth, async (req, res) => {
  try {
    const { lng, lat } = req.body;
    await User.findByIdAndUpdate(req.userId, {
      location: { type: 'Point', coordinates: [lng, lat] }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/nearby', auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId);
    if (!currentUser.location || !currentUser.location.coordinates) {
      return res.json([]);
    }
    const users = await User.find({
      _id: { $ne: req.userId },
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: currentUser.location.coordinates },
          $maxDistance: 10000
        }
      }
    }).select('username avatar location');
    res.json(users);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'healthy' }));

app.get('/', (req, res) => res.json({ message: '⚡️ Dream Nutz API is running!' }));

app.listen(PORT, () => console.log(`⚡️ Dream Nutz running on port ${PORT}`));
