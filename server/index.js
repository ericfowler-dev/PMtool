const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { initialize } = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Health check (no DB required)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/equipment', require('./routes/equipment'));
app.use('/api/pricelists', require('./routes/pricelists'));
app.use('/api/fleet', require('./routes/fleet'));
app.use('/api/maintenance', require('./routes/maintenance'));
app.use('/api/analysis', require('./routes/analysis'));
app.use('/api/scenarios', require('./routes/scenarios'));

// Serve React app in production
if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

// Initialize database with retry, then start server
async function startServer() {
  const maxRetries = 10;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await initialize();
      console.log('Database initialized successfully.');
      break;
    } catch (err) {
      console.error(`Database init attempt ${attempt}/${maxRetries} failed:`, err.message);
      if (attempt === maxRetries) {
        console.error('Could not initialize database. Starting server anyway (API will fail gracefully).');
        break;
      }
      const delay = 2000 * Math.min(attempt, 5);
      console.log(`Retrying in ${delay / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  app.listen(PORT, () => {
    console.log(`PMtool server running on port ${PORT}`);
  });
}

startServer();

module.exports = app;
