'use strict';

class CounselRecorder {
  constructor() {
    this.isRecording   = false;
    this.mediaRecorder = null;
    this.chunks        = [];
    this.audioCtx      = null;
    this.analyserMic   = null;
    this.analyserSys   = null;
    this.animFrameId   = null;
    this.timerInterval = null;
    this.startTime     = null;
    this.recordedBlob  = null;
    this.micStream     = null;
    this.sysStream     = null;
    this.hasSysAudio   = false;

    // DOM refs
    this.recordBtn       = document.getElementById('recordBtn');
    this.wavesContainer  = document.getElementById('wavesContainer');
    this.statusEl        = document.getElementById('status');
    this.timerEl         = document.getElementById('timer');
    this.canvas          = document.getElementById('waveformCanvas');
    this.channelLabels   = document.getElementById('channelLabels');
    this.downloadSection = document.getElementById('downloadSection');
    this.downloadBtn     = document.getElementById('downloadBtn');
    this.recordingMeta   = document.getElementById('recordingMeta');

    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      if (!this.isRecording) this.drawIdleWaveform();
    });

    this.recordBtn.addEventListener('click', () => this.toggle());
    this.downloadBtn.addEventListener('click', () => this.download());

    this.drawIdleWaveform();
  }

  /* ── Canvas helpers ─────────────────────────────── */
  resizeCanvas() {
    const dpr  = window.devicePixelRatio || 1;
    const rect  = this.canvas.getBoundingClientRect();
    this.canvas.width  = rect.width  * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this._dpr = dpr;
  }

  get cw() { return this.canvas.width  / this._dpr; }
  get ch() { return this.canvas.height / this._dpr; }

  /* ── Toggle ─────────────────────────────────────── */
  async toggle() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  /* ── Start ──────────────────────────────────────── */
  async startRecording() {
    try {
      this.setStatus('Requesting microphone…');
      this.recordBtn.disabled = true;

      // 1. Microphone
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl:  false,
          sampleRate: 44100,
          channelCount: 1,
        },
        video: false,
      });

      // 2. System audio (Zoom participants) — optional
      this.hasSysAudio = false;
      try {
        this.setStatus('Select screen → enable "Share audio" for Zoom…');
        this.sysStream = await navigator.mediaDevices.getDisplayMedia({
          video: false,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl:  false,
            sampleRate: 44100,
          },
        });
        if (this.sysStream.getAudioTracks().length > 0) {
          this.hasSysAudio = true;
        }
      } catch (e) {
        // User cancelled or browser doesn't support — continue with mic only
        console.info('System audio skipped:', e.message);
        this.sysStream = null;
      }

      // 3. Web Audio graph
      this.audioCtx = new AudioContext({ sampleRate: 44100 });
      const dest    = this.audioCtx.createMediaStreamDestination();

      // Mic analyser
      this.analyserMic = this.audioCtx.createAnalyser();
      this.analyserMic.fftSize = 2048;
      this.analyserMic.smoothingTimeConstant = 0.82;
      const micSrc = this.audioCtx.createMediaStreamSource(this.micStream);
      micSrc.connect(this.analyserMic);
      micSrc.connect(dest);

      // System audio analyser
      this.analyserSys = null;
      if (this.hasSysAudio) {
        this.analyserSys = this.audioCtx.createAnalyser();
        this.analyserSys.fftSize = 2048;
        this.analyserSys.smoothingTimeConstant = 0.82;
        const sysSrc = this.audioCtx.createMediaStreamSource(this.sysStream);
        sysSrc.connect(this.analyserSys);
        sysSrc.connect(dest);
      }

      // 4. MediaRecorder on mixed stream
      const mimeType = this.bestMimeType();
      this.mediaRecorder = new MediaRecorder(dest.stream, mimeType ? { mimeType } : {});
      this.chunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => this.finalize();

      this.mediaRecorder.start(100); // collect every 100 ms

      // 5. UI state
      this.isRecording = true;
      this.recordBtn.disabled = false;
      this.wavesContainer.classList.add('recording');
      this.downloadSection.style.display = 'none';
      this.channelLabels.classList.toggle('visible', this.hasSysAudio);

      const mode = this.hasSysAudio ? 'Recording mic + meeting audio' : 'Recording microphone only';
      this.setStatus(mode, true);

      this.startTime     = Date.now();
      this.timerInterval = setInterval(() => this.updateTimer(), 500);
      this.drawWaveform();

    } catch (err) {
      console.error(err);
      this.setStatus(`Error: ${err.message}`);
      this.recordBtn.disabled = false;
      this.cleanup();
    }
  }

  /* ── Stop ───────────────────────────────────────── */
  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.cleanup();
    this.wavesContainer.classList.remove('recording');
    this.setStatus('Processing…');
    this.channelLabels.classList.remove('visible');
  }

  cleanup() {
    clearInterval(this.timerInterval);
    cancelAnimationFrame(this.animFrameId);
    this.animFrameId = null;

    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
    if (this.sysStream) {
      this.sysStream.getTracks().forEach(t => t.stop());
      this.sysStream = null;
    }
    this.isRecording = false;
  }

  /* ── Finalize blob ──────────────────────────────── */
  finalize() {
    const mimeType    = this.mediaRecorder?.mimeType || 'audio/webm';
    this.recordedBlob = new Blob(this.chunks, { type: mimeType });

    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    const m       = Math.floor(elapsed / 60);
    const s       = elapsed % 60;
    const sizeMB  = (this.recordedBlob.size / (1024 * 1024)).toFixed(2);
    const src     = this.hasSysAudio ? 'Mic + Meeting' : 'Mic only';

    this.recordingMeta.textContent =
      `${m}m ${s}s  ·  ${sizeMB} MB  ·  ${src}  ·  ${mimeType.split(';')[0]}`;

    this.downloadSection.style.display = 'flex';
    this.setStatus('Recording saved — ready to download');
    this.drawIdleWaveform();
  }

  /* ── Download ───────────────────────────────────── */
  download() {
    if (!this.recordedBlob) return;
    const url  = URL.createObjectURL(this.recordedBlob);
    const ext  = this.recordedBlob.type.includes('ogg')  ? 'ogg'
               : this.recordedBlob.type.includes('mp4')  ? 'mp4'
               : 'webm';
    const ts   = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const a    = Object.assign(document.createElement('a'), {
      href:     url,
      download: `counsel-recording-${ts}.${ext}`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /* ── Timer ──────────────────────────────────────── */
  updateTimer() {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    this.timerEl.textContent = `${m}:${s}`;
  }

  /* ── Waveform draw loop ──────────────────────────── */
  drawWaveform() {
    const bufLen  = this.analyserMic.frequencyBinCount; // 1024
    const micData = new Uint8Array(bufLen);
    const sysData = this.analyserSys ? new Uint8Array(bufLen) : null;

    const draw = () => {
      if (!this.isRecording) return;
      this.animFrameId = requestAnimationFrame(draw);

      this.analyserMic.getByteTimeDomainData(micData);
      if (this.analyserSys) this.analyserSys.getByteTimeDomainData(sysData);

      const { ctx } = this;
      const W = this.cw;
      const H = this.ch;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, W, H);

      if (sysData) {
        // Two tracks: top half = mic, bottom half = system
        this.drawTrack(ctx, micData, bufLen, 0,     H / 2, '#e53935', 'rgba(229,57,53,0.35)');
        this.drawTrack(ctx, sysData, bufLen, H / 2, H / 2, '#60a5fa', 'rgba(96,165,250,0.35)');

        // Divider
        ctx.strokeStyle = '#222';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(0, H / 2);
        ctx.lineTo(W, H / 2);
        ctx.stroke();
      } else {
        // Single mic track — full height
        this.drawTrack(ctx, micData, bufLen, 0, H, '#e53935', 'rgba(229,57,53,0.3)');
      }
    };

    draw();
  }

  drawTrack(ctx, data, bufLen, yOffset, trackH, strokeColor, glowColor) {
    const W      = this.cw;
    const midY   = yOffset + trackH / 2;
    const sliceW = W / bufLen;

    // Glow pass
    ctx.save();
    ctx.shadowBlur  = 12;
    ctx.shadowColor = glowColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();

    for (let i = 0; i < bufLen; i++) {
      const v = data[i] / 128.0;
      const y = midY + (v - 1) * (trackH * 0.45);
      i === 0 ? ctx.moveTo(0, y) : ctx.lineTo(i * sliceW, y);
    }
    ctx.stroke();
    ctx.restore();

    // Solid pass (crisper on top)
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth   = 1.5;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();

    for (let i = 0; i < bufLen; i++) {
      const v = data[i] / 128.0;
      const y = midY + (v - 1) * (trackH * 0.45);
      i === 0 ? ctx.moveTo(0, y) : ctx.lineTo(i * sliceW, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* ── Idle flat line ──────────────────────────────── */
  drawIdleWaveform() {
    const { ctx } = this;
    const W = this.cw;
    const H = this.ch;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
  }

  /* ── Helpers ─────────────────────────────────────── */
  setStatus(msg, active = false) {
    this.statusEl.textContent = msg;
    this.statusEl.classList.toggle('active', active);
  }

  bestMimeType() {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    return candidates.find(t => MediaRecorder.isTypeSupported(t)) || '';
  }
}

document.addEventListener('DOMContentLoaded', () => new CounselRecorder());
