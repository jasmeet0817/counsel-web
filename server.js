const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3003;

app.use(express.static(path.join(__dirname, 'public')));

const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, 'localhost+2-key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'localhost+2.pem')),
};

https.createServer(sslOptions, app).listen(PORT, () => {
  console.log(`Counsel Web running at https://localhost:${PORT}`);
});
