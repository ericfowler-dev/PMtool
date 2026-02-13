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

// Initialize database then start server
initialize()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`PMtool server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Database initialization failed:', err);
    process.exit(1);
  });

module.exports = app;
