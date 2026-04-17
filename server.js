const express = require('express');
const http = require('http');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 3003;

app.use(createProxyMiddleware({
  pathFilter: '/counsel',
  target: 'https://counsel-be.bookdialogues.com',
  changeOrigin: true,
}));

app.get(['/', '/*.html'], (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', req.path === '/' ? 'index.html' : req.path));
});

app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  lastModified: true,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-cache');
  }
}));

http.createServer(app).listen(PORT, () => {
  console.log(`Counsel Web running at http://localhost:${PORT}`);
});
