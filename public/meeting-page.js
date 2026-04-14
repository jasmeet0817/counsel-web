'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  initMeetingSidebar();
  const recording = await initPlayer();
  initSummary(recording);
});

/* ── Sidebar (mobile hamburger) ─────────────────────── */
function initMeetingSidebar() {
  const hamburgerBtn   = document.getElementById('hamburgerBtn');
  const sidebar        = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  function open()  {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('visible');
    hamburgerBtn.classList.add('open');
    hamburgerBtn.setAttribute('aria-expanded', 'true');
  }
  function close() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('visible');
    hamburgerBtn.classList.remove('open');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
  }

  hamburgerBtn.addEventListener('click', () =>
    sidebar.classList.contains('open') ? close() : open()
  );
  sidebarOverlay.addEventListener('click', close);
}

/* ── Player ─────────────────────────────────────────── */
async function initPlayer() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (!id) {
    document.getElementById('playerCard').innerHTML =
      '<p class="player-error">No recording specified.</p>';
    return;
  }

  // Try sessionStorage cache first
  let recording = null;
  try {
    const cached = sessionStorage.getItem('counsel_meetings');
    if (cached) {
      const list = JSON.parse(cached);
      recording = list.find(r => r.id === id) || null;
    }
  } catch { /* ignore */ }

  // Fall back to single-meeting API
  if (!recording) {
    try {
      const res = await fetch(`${COUNSEL_API_BASE}/counsel/meetings/${id}/`);
      const data = await res.json();
      if (data.success && data.meeting) {
        recording = data.meeting;
      }
    } catch { /* handled below */ }
  }

  if (!recording) {
    document.getElementById('playerCard').innerHTML =
      '<p class="player-error">Recording not found.</p>';
    return;
  }

  const audioSrc = recording.audio_url;
  const company  = recording.company_name || 'Unnamed recording';
  const timeStr  = recording.created_at || '';

  // Populate header
  document.getElementById('meetingCompany').textContent = company;
  document.title = `${company} — Counsel`;

  if (timeStr) {
    const d = new Date(timeStr);
    if (!isNaN(d)) {
      document.getElementById('meetingDate').textContent =
        d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) +
        ' · ' +
        d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
  }

  if (!audioSrc) {
    document.getElementById('playerCard').innerHTML =
      '<p class="player-error">No audio source found.</p>';
    return;
  }

  const audio      = document.getElementById('audioEl');
  const playBtn    = document.getElementById('playBtn');
  const iconPlay   = playBtn.querySelector('.icon-play');
  const iconPause  = playBtn.querySelector('.icon-pause');
  const backBtn    = document.getElementById('backBtn');
  const fwdBtn     = document.getElementById('fwdBtn');
  const seekRange  = document.getElementById('seekRange');
  const seekFill   = document.getElementById('seekFill');
  const currentEl  = document.getElementById('currentTime');
  const totalEl    = document.getElementById('totalTime');
  const speedOpts  = document.getElementById('speedOptions');

  audio.src = audioSrc;

  /* helpers */
  function fmt(secs) {
    if (!isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function syncSeek() {
    if (seeking) return;
    const pct = audio.duration && isFinite(audio.duration) ? (audio.currentTime / audio.duration) * 100 : 0;
    seekRange.value = pct;
    seekFill.style.width = pct + '%';
    currentEl.textContent = fmt(audio.currentTime);
  }

  function setPlaying(playing) {
    iconPlay.style.display  = playing ? 'none'  : '';
    iconPause.style.display = playing ? ''      : 'none';
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }

  function showError() {
    document.getElementById('playerCard').innerHTML =
      '<p class="player-error">Unable to load audio. The file may be unavailable.</p>';
  }

  /* events */
  function updateDuration() {
    if (isFinite(audio.duration)) totalEl.textContent = fmt(audio.duration);
  }
  audio.addEventListener('loadedmetadata', updateDuration);
  audio.addEventListener('durationchange', updateDuration);

  audio.addEventListener('timeupdate', syncSeek);

  audio.addEventListener('play',  () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('ended', () => setPlaying(false));

  audio.addEventListener('error', showError);

  playBtn.addEventListener('click', () => {
    const promise = audio.paused ? audio.play() : (audio.pause(), null);
    if (promise) promise.catch(() => {});
  });

  backBtn.addEventListener('click', () => {
    audio.currentTime = Math.max(0, audio.currentTime - 10);
  });

  fwdBtn.addEventListener('click', () => {
    audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
  });

  /* seek bar */
  let seeking = false;

  seekRange.addEventListener('mousedown', () => { seeking = true; });
  seekRange.addEventListener('touchstart', () => { seeking = true; }, { passive: true });

  seekRange.addEventListener('input', () => {
    const pct = seekRange.value;
    seekFill.style.width = pct + '%';
    currentEl.textContent = fmt((pct / 100) * (audio.duration || 0));
  });

  seekRange.addEventListener('change', () => {
    audio.currentTime = (seekRange.value / 100) * (audio.duration || 0);
    seeking = false;
  });

  /* speed */
  speedOpts.addEventListener('click', e => {
    const btn = e.target.closest('.speed-btn');
    if (!btn) return;
    speedOpts.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    audio.playbackRate = parseFloat(btn.dataset.rate);
  });

  /* ── Transcription ───────────────────────────────── */
  // Expose meeting id for initSummary()
  window._counselMeetingId = id;

  /* keyboard shortcuts */
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      const promise = audio.paused ? audio.play() : (audio.pause(), null);
      if (promise) promise.catch(() => {});
    } else if (e.code === 'ArrowLeft') {
      audio.currentTime = Math.max(0, audio.currentTime - 10);
    } else if (e.code === 'ArrowRight') {
      audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
    }
  });

  return recording;
}

/* ── Transcription ───────────────────────────────── */
function initSummary(recording) {
  const btn        = document.getElementById('summaryBtn');
  const statusEl   = document.getElementById('transcriptionStatus');
  const statusText = document.getElementById('transcriptionStatusText');
  const resultEl   = document.getElementById('transcriptionResult');
  const bodyEl     = document.getElementById('transcriptionBody');
  const errorEl    = document.getElementById('transcriptionError');
  const errorText  = document.getElementById('transcriptionErrorText');
  const retryBtn   = document.getElementById('transcriptionRetryBtn');

  const toggleBtn = document.getElementById('transcriptionToggle');

  let pollTimer = null;

  btn.addEventListener('click', triggerSummary);
  retryBtn.addEventListener('click', triggerSummary);

  toggleBtn.addEventListener('click', () => {
    const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
    toggleBtn.setAttribute('aria-expanded', String(!expanded));
    bodyEl.hidden = expanded;
  });

  console.log('[counsel] initSummary recording:', recording);

  if (recording && recording.transcription) {
    showResult(recording.transcription);
    return;
  }
  if (recording && recording.summarize_status === 'in_progress') {
    showStatus('Generating transcription…');
    startPolling(window._counselMeetingId);
    return;
  }

  btn.hidden = false;

  function showStatus(msg) {
    btn.hidden       = true;
    statusEl.hidden  = false;
    resultEl.hidden  = true;
    errorEl.hidden   = true;
    statusText.textContent = msg || 'Generating transcription…';
  }

  function showResult(text) {
    clearPoll();
    btn.hidden      = true;
    statusEl.hidden = true;
    errorEl.hidden  = true;
    resultEl.hidden = false;
    bodyEl.textContent = text;
    bodyEl.hidden = true;
    toggleBtn.setAttribute('aria-expanded', 'false');
  }

  function showError(msg) {
    clearPoll();
    btn.hidden      = true;
    statusEl.hidden = true;
    resultEl.hidden = true;
    errorEl.hidden  = false;
    errorText.textContent = msg || 'An error occurred. Please try again.';
  }

  function clearPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function triggerSummary() {
    const id = window._counselMeetingId;
    if (!id) { showError('Meeting ID not found.'); return; }

    showStatus('Generating transcription…');

    let res, data;
    try {
      res  = await fetch(`${COUNSEL_API_BASE}/counsel/meetings/${id}/summarize-create`, { method: 'POST' });
      data = await res.json();
    } catch (err) {
      console.error('Error triggering summary:', err);
      showError('Network error. Please try again.');
      return;
    }

    if (data.status === 'completed' && data.transcription) {
      showResult(data.transcription);
    } else if (data.status === 'in_progress') {
      startPolling(id);
    } else if (data.status === 'failed') {
      console.error('Transcription failed:', data);
      showError('Transcription failed. Please try again.');
    } else {
      console.error('Unexpected response:', data);
      showError('Unexpected response from server.');
    }
  }

  function startPolling(id) {
    showStatus('Generating transcription…');
    pollTimer = setInterval(() => pollStatus(id), 5000);
  }

  async function pollStatus(id) {
    let res, data;
    try {
      res  = await fetch(`${COUNSEL_API_BASE}/counsel/meetings/${id}/summarize-status`);
      data = await res.json();
    } catch {
      showError('Network error while checking status.');
      return;
    }

    if (data.status === 'completed' && data.transcription) {
      showResult(data.transcription);
    } else if (data.status === 'failed') {
      showError('Transcription failed. Please try again.');
    } else if (data.status === 'not_started') {
      showError('Transcription was not started. Please try again.');
    }
    // 'in_progress' → keep polling
  }
}
