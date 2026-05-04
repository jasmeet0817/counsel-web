const express = require('express');
const http = require('http');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { runJamabandiLookup } = require('./jamabandi/automation');

const app = express();
const PORT = 3003;

app.use(createProxyMiddleware({
  pathFilter: '/counsel',
  target: 'https://counsel-be.bookdialogues.com',
  changeOrigin: true,
}));

const sseClients = new Map();

app.get('/jamabandi/find/stream', (req, res) => {
  const sid = String(req.query.sid || '');
  if (!sid) {
    res.status(400).end('missing sid');
    return;
  }
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(`event: open\ndata: ${JSON.stringify({ sid })}\n\n`);
  sseClients.set(sid, res);
  req.on('close', () => {
    if (sseClients.get(sid) === res) sseClients.delete(sid);
  });
});

function pushEvent(sid, payload) {
  const res = sseClients.get(sid);
  if (!res) return;
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

app.post('/jamabandi/find', express.json(), async (req, res) => {
  const sid = String((req.query && req.query.sid) || (req.body && req.body.sid) || '');
  if (!sid) { res.status(400).json({ error: 'missing sid' }); return; }

  res.json({ ok: true, sid });

  // Wait briefly so the client has time to open the EventSource
  setTimeout(async () => {
    try {
      const onStatus = (s) => pushEvent(sid, s);
      const { text } = await runJamabandiLookup({ onStatus });
      pushEvent(sid, { phase: 'done', text });
    } catch (err) {
      console.error('[jamabandi] error:', err);
      pushEvent(sid, { phase: 'error', message: err.message || String(err) });
    } finally {
      const r = sseClients.get(sid);
      if (r) {
        try { r.end(); } catch (_) { /* swallow */ }
        sseClients.delete(sid);
      }
    }
  }, 250);
});

app.get('/*.html', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', req.path));
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
