const express = require('express');
const http = require('http');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 3003;

app.use('/counsel', createProxyMiddleware({
  target: 'https://counsel-be.bookdialogues.com',
  changeOrigin: true,
}));

app.use(express.static(path.join(__dirname, 'public')));

http.createServer(app).listen(PORT, () => {
  console.log(`Counsel Web running at http://localhost:${PORT}`);
});
