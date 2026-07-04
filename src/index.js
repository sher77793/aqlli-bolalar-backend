const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Backend ishlaydi! ✅', db: 'Supabase connected' });
});

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email va password kerak' });
    }

    const crypto = require('crypto');
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

    const { data, error } = await supabase
      .from('users')
      .insert([{ email, password_hash: passwordHash, name: name || 'User' }])
      .select();

    if (error) return res.status(400).json({ error: error.message });

    res.status(201).json({
      message: 'Ro\'yxatdan muvaffaqiyatli o\'tdingiz',
      user: { id: data[0].id, email: data[0].email, name: data[0].name }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email va password kerak' });
    }

    const crypto = require('crypto');
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data || data.password_hash !== passwordHash) {
      return res.status(401).json({ error: 'Email yoki parol noto\'g\'ri' });
    }

    const token = Buffer.from(`${data.id}:${Date.now()}`).toString('base64');

    res.json({
      message: 'Muvaffaqiyatli kirdiniz',
      token,
      user: {
        id: data.id,
        email: data.email,
        name: data.name,
        subscription: data.subscription,
        xp: data.xp,
        level: data.level
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get puzzles
app.get('/api/puzzles/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { difficulty = 'oson' } = req.query;

    const { data, error } = await supabase
      .from('puzzles')
      .select('id, category, question, options, difficulty')
      .eq('category', category)
      .eq('difficulty', difficulty)
      .limit(5);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ puzzles: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit answer
app.post('/api/submit-answer', async (req, res) => {
  try {
    const { userId, puzzleId, answer } = req.body;

    const { data: puzzle, error: puzzleError } = await supabase
      .from('puzzles')
      .select('correct_answer')
      .eq('id', puzzleId)
      .single();

    if (puzzleError) return res.status(400).json({ error: 'Savol topilmadi' });

    const isCorrect = puzzle.correct_answer === answer;
    const xpEarned = isCorrect ? 10 : 0;

    await supabase
      .from('scores')
      .insert([{ user_id: userId, puzzle_id: puzzleId, correct: isCorrect, xp_earned: xpEarned }]);

    if (isCorrect) {
      const { data: userData } = await supabase
        .from('users')
        .select('xp, level')
        .eq('id', userId)
        .single();

      const newXp = (userData.xp || 0) + xpEarned;
      const newLevel = Math.floor(newXp / 100) + 1;

      await supabase
        .from('users')
        .update({ xp: newXp, level: newLevel })
        .eq('id', userId);
    }

    res.json({ correct: isCorrect, xpEarned, correctAnswer: puzzle.correct_answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User stats
app.get('/api/user/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError) return res.status(400).json({ error: 'Foydalanuvchi topilmadi' });

    const { data: scores } = await supabase
      .from('scores')
      .select('*')
      .eq('user_id', userId);

    const totalCorrect = scores.filter(s => s.correct).length;
    const totalAttempts = scores.length;

    res.json({
      user: { id: user.id, email: user.email, name: user.name, subscription: user.subscription, xp: user.xp, level: user.level },
      stats: { totalAttempts, totalCorrect, accuracy: totalAttempts > 0 ? ((totalCorrect / totalAttempts) * 100).toFixed(1) + '%' : '0%' }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Subscribe
app.post('/api/subscribe', async (req, res) => {
  try {
    const { userId, months = 1 } = req.body;

    const { data, error } = await supabase
      .from('subscriptions')
      .insert([{ user_id: userId, amount: 50000 * months, status: 'pending', months }])
      .select();

    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: 'To\'lov linki tayyar', subscriptionId: data[0].id, amount: data[0].amount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server ${PORT} portida ishlaydi`);
  console.log(`📦 Supabase connected: ${process.env.SUPABASE_URL}`);
});