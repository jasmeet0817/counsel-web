(() => {
  const findBtn = document.getElementById('findBtn');
  const copyBtn = document.getElementById('copyBtn');
  const statusRow = document.getElementById('statusRow');
  const statusText = document.getElementById('statusText');
  const result = document.getElementById('result');
  const ownerBlock = document.getElementById('ownerBlock');
  const ownerName = document.getElementById('ownerName');
  const checkOwnerBtn = document.getElementById('checkOwnerBtn');
  const ownerResult = document.getElementById('ownerResult');
  const ownerThinking = document.getElementById('ownerThinking');

  function showOwnerResult(content, isError) {
    ownerResult.innerHTML = '';
    if (typeof content === 'string') {
      ownerResult.textContent = content;
    } else {
      const row = (label, value) => {
        const p = document.createElement('p');
        p.className = 'owner-field';
        const b = document.createElement('b');
        b.textContent = label + ': ';
        p.appendChild(b);
        p.appendChild(document.createTextNode(value));
        return p;
      };
      const isOwner = content.is_owner === true || content.is_owner === 'true';
      ownerResult.appendChild(row('Is Owner', isOwner ? 'Yes' : 'No'));
      if (isOwner) {
        if (content.share_owner) ownerResult.appendChild(row('Share Owner', content.share_owner));
        if (content.measuring_owner) ownerResult.appendChild(row('Measuring Owner', content.measuring_owner));
      }
    }
    ownerResult.classList.toggle('error', !!isError);
    ownerResult.classList.add('visible');
  }
  function hideOwnerResult() {
    ownerResult.classList.remove('visible', 'error');
    ownerResult.innerHTML = '';
  }

  function setStatus(text, mode) {
    statusText.textContent = text;
    statusRow.classList.remove('running', 'done', 'error');
    if (mode) statusRow.classList.add(mode);
  }

  function newSid() {
    return 'jb-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
  }

  findBtn.addEventListener('click', async () => {
    findBtn.disabled = true;
    result.value = '';
    ownerBlock.classList.remove('visible');
    hideOwnerResult();
    setStatus('Connecting…', 'running');

    const sid = newSid();
    const es = new EventSource(`/jamabandi/find/stream?sid=${encodeURIComponent(sid)}`);

    let opened = false;
    const openedPromise = new Promise((resolve) => {
      es.addEventListener('open', () => {
        opened = true;
        resolve();
      }, { once: true });
      es.addEventListener('error', () => {
        if (!opened) resolve();
      }, { once: true });
    });

    es.addEventListener('message', (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.phase === 'done') {
          result.value = data.text || '';
          setStatus('Done', 'done');
          findBtn.disabled = false;
          if (result.value.trim()) {
            ownerBlock.classList.add('visible');
            ownerName.focus();
          }
          es.close();
          return;
        }
        if (data.phase === 'error') {
          setStatus(`Error: ${data.message || 'unknown'}`, 'error');
          findBtn.disabled = false;
          es.close();
          return;
        }
        const label = data.message || data.phase || '';
        setStatus(label, 'running');
      } catch (e) {
        // ignore parse errors
      }
    });

    es.addEventListener('error', () => {
      if (findBtn.disabled === false) return;
      // EventSource may auto-reconnect; if the request is still going we keep waiting.
      // If we never got `done`, surface a soft warning.
    });

    await openedPromise;

    try {
      const r = await fetch(`/jamabandi/find?sid=${encodeURIComponent(sid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid }),
      });
      if (!r.ok) {
        const t = await r.text();
        setStatus(`Server error: ${t || r.status}`, 'error');
        findBtn.disabled = false;
        es.close();
      }
    } catch (err) {
      setStatus(`Network error: ${err.message || err}`, 'error');
      findBtn.disabled = false;
      es.close();
    }
  });

  async function parseJsonResponse(res) {
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { /* non-json */ }
    return { text, data };
  }

  function extractError(data, text, status) {
    if (data) {
      if (data.message) return data.message;
      if (data.error) return data.error;
      if (data.errors) {
        const parts = [];
        for (const k of Object.keys(data.errors)) {
          const v = data.errors[k];
          parts.push(Array.isArray(v) ? v.join(', ') : String(v));
        }
        if (parts.length) return parts.join('; ');
      }
    }
    return text || `HTTP ${status}`;
  }

  async function pollOwnerCheck(checkId) {
    const intervalMs = 1500;
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      const res = await fetch(`/counsel/check_jamabandi_ownership/${encodeURIComponent(checkId)}`);
      const { text, data } = await parseJsonResponse(res);
      if (!res.ok) {
        throw new Error(extractError(data, text, res.status));
      }
      if (!data) throw new Error('Empty response from server.');
      if (data.status === 'completed' || data.status === 'failed') {
        return data;
      }
      // in_progress / not_started → keep polling
    }
  }

  async function runOwnerCheck() {
    const name = ownerName.value.trim();
    const nakal = result.value;
    if (!name) {
      showOwnerResult('Please enter an owner name.', true);
      ownerName.focus();
      return;
    }
    if (!nakal.trim()) {
      showOwnerResult('No Nakal text available.', true);
      return;
    }
    checkOwnerBtn.disabled = true;
    const prevLabel = checkOwnerBtn.textContent;
    checkOwnerBtn.textContent = 'Checking…';
    hideOwnerResult();
    ownerThinking.classList.add('visible');
    try {
      const res = await fetch('/counsel/check_jamabandi_ownership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_name: name, nakal }),
      });
      const { text, data } = await parseJsonResponse(res);
      if (!res.ok) {
        showOwnerResult(`Error: ${extractError(data, text, res.status)}`, true);
        return;
      }
      const checkId = data && data.check_id;
      if (!checkId) {
        showOwnerResult('Server did not return a check id.', true);
        return;
      }
      const finalData = await pollOwnerCheck(checkId);
      if (finalData.status === 'completed') {
        showOwnerResult(finalData, false);
      } else {
        showOwnerResult(`Error: ${finalData.message || 'Check failed.'}`, true);
      }
    } catch (err) {
      showOwnerResult(`Network error: ${err.message || err}`, true);
    } finally {
      ownerThinking.classList.remove('visible');
      checkOwnerBtn.disabled = false;
      checkOwnerBtn.textContent = prevLabel;
    }
  }

  checkOwnerBtn.addEventListener('click', runOwnerCheck);
  ownerName.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      runOwnerCheck();
    }
  });

  copyBtn.addEventListener('click', async () => {
    if (!result.value) return;
    try {
      await navigator.clipboard.writeText(result.value);
      const prev = copyBtn.textContent;
      copyBtn.textContent = 'Copied';
      setTimeout(() => { copyBtn.textContent = prev; }, 1200);
    } catch (_) {
      result.select();
      document.execCommand('copy');
    }
  });
})();
