const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const DIST = path.join(__dirname, 'frontend', 'dist');

// Serve frontend static files
if (fs.existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST, {
    maxAge: '1y',
    immutable: true,
    setHeaders: (res, p) => {
      if (p.endsWith('index.html')) res.setHeader('Cache-Control', 'no-store');
    },
  }));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return;
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(DIST, 'index.html'));
  });
  console.log('✓ Serving frontend from:', DIST);
} else {
  console.log('⚠️  frontend/dist not found - run npm run build in frontend/');
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'CVForge', version: '2.0.0' });
});

// Auth endpoints (placeholder)
app.post('/api/auth/register', (req, res) => {
  res.json({ error: 'Auth not configured in standalone mode' });
});
app.post('/api/auth/login', (req, res) => {
  res.json({ error: 'Auth not configured in standalone mode' });
});

// Analyze endpoint
app.post('/api/analyze', (req, res) => {
  const { cvText, jdText } = req.body || {};
  if (!cvText || !jdText) {
    return res.status(400).json({ error: 'cvText and jdText are required' });
  }
  // Simple keyword-based scoring for demo
  const cvWords = cvText.toLowerCase().split(/\s+/);
  const jdWords = jdText.toLowerCase().split(/\s+/);
  const matched = jdWords.filter(w => cvText.toLowerCase().includes(w));
  const score = Math.round((matched.length / Math.max(jdWords.length, 1)) * 100);
  
  res.json({
    overall: Math.min(score + 20, 95),
    verdict: score > 70 ? 'Good match' : score > 40 ? 'Moderate match' : 'Low match',
    keyword_match: score,
    semantic_similarity: Math.min(score + 10, 95),
    skill_coverage: score,
    matched: matched.slice(0, 10),
    missing: jdWords.filter(w => !cvText.toLowerCase().includes(w)).slice(0, 10),
    sections: { contact: true, summary: true, experience: true, education: true, skills: true, projects: true, certifications: false },
  });
});

// Start server
const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`CVForge backend running on http://0.0.0.0:${PORT}`);
  console.log(`Public URL will be available via tunnel`);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
