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
    try {
      const res = await fetch('/counsel/check_jamabandi_ownership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_name: name, nakal }),
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (_) { /* non-json */ }
      if (!res.ok) {
        const msg = (data && (data.error || data.message)) || text || `HTTP ${res.status}`;
        showOwnerResult(`Error: ${msg}`, true);
        return;
      }
      showOwnerResult(data || (text || 'OK'), false);
    } catch (err) {
      showOwnerResult(`Network error: ${err.message || err}`, true);
    } finally {
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
