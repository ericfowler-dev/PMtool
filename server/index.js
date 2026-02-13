const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { initialize } = require('./database');

// Configuration
const config = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'combined',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  apiPrefix: process.env.API_PREFIX || '/api',
  uploadLimit: process.env.UPLOAD_LIMIT || '10mb',
};

const app = express();

// Development features: Basic logging
if (config.nodeEnv === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });
}

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: config.uploadLimit }));
app.use(express.urlencoded({ extended: true, limit: config.uploadLimit }));

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

  app.listen(config.port, () => {
    console.log(`PMtool server running on port ${config.port} (${config.nodeEnv} mode)`);
    console.log(`API available at ${config.apiPrefix}`);
    if (config.nodeEnv === 'development') {
      console.log('Development features enabled: enhanced logging, CORS for all origins');
    }
  });
}

startServer();

module.exports = app;
