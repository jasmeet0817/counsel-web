'use strict';

class CounselUploader {
  constructor() {
    this.companyNameEl = document.getElementById('uploadCompanyName');
    this.companyUrlEl  = document.getElementById('uploadCompanyUrl');
    this.meetingDateEl = document.getElementById('uploadMeetingDate');
    this.fileInput     = document.getElementById('uploadFile');
    this.fileLabelEl   = document.getElementById('uploadFileLabel');
    this.statusEl      = document.getElementById('uploadStatus');
    this.meetingLinkEl = document.getElementById('uploadMeetingLink');
    this.submitBtn     = document.getElementById('uploadSubmitBtn');
    this.uploadZone    = document.getElementById('uploadZone');

    this.selectedFile = null;
    this._initListeners();
  }

  _initListeners() {
    this.fileInput.addEventListener('change', e => this._onFileSelected(e.target.files[0]));

    this.uploadZone.addEventListener('dragover', e => {
      e.preventDefault();
      this.uploadZone.classList.add('drag-over');
    });
    this.uploadZone.addEventListener('dragleave', () => {
      this.uploadZone.classList.remove('drag-over');
    });
    this.uploadZone.addEventListener('drop', e => {
      e.preventDefault();
      this.uploadZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) this._onFileSelected(e.dataTransfer.files[0]);
    });

    this.submitBtn.addEventListener('click', () => this._submit());
  }

  _onFileSelected(file) {
    if (!file) return;
    this.selectedFile = file;
    this.fileLabelEl.textContent = file.name;
    this.uploadZone.classList.add('file-selected');
    this._setStatus('', '');
  }

  async _submit() {
    const companyName = this.companyNameEl.value.trim();
    const companyUrl  = this.companyUrlEl.value.trim();
    const meetingDate = this.meetingDateEl.value;

    if (!companyName) { this._setStatus('Company name is required.', 'error'); return; }
    if (!this.selectedFile) { this._setStatus('Please select an audio file.', 'error'); return; }
    this._setStatus('Uploading\u2026', '');
    this.submitBtn.disabled = true;

    try {
      const base64 = await this._fileToBase64(this.selectedFile);
      const createDate = meetingDate ? new Date(meetingDate).toISOString() : null;

      const res = await fetch(`${COUNSEL_API_BASE}/counsel/meetings/store/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName,
          company_url:  companyUrl,
          audio_bytes:  base64,
          create_date:  createDate,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        this._setStatus('Recording uploaded successfully.', 'success');
        console.log('Upload response:', data);
        const meetingId = data && (data.id || (data.meeting && data.meeting.id));
        if (meetingId) {
          this.meetingLinkEl.href = `meeting-page.html?id=${encodeURIComponent(meetingId)}`;
          this.meetingLinkEl.removeAttribute('hidden');
        }
        this._reset();
      } else {
        this._setStatus(`Upload failed (${res.status}).`, 'error');
      }
    } catch (_err) {
      this._setStatus('Upload failed. Check your connection.', 'error');
    } finally {
      this.submitBtn.disabled = false;
    }
  }

  _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  _setStatus(msg, type) {
    this.statusEl.textContent = msg;
    this.statusEl.className = `upload-status${type ? ' ' + type : ''}`;
  }

  _reset() {
    this.companyNameEl.value = '';
    this.companyUrlEl.value  = '';
    this.meetingDateEl.value = '';
    this.fileInput.value     = '';
    this.selectedFile        = null;
    this.fileLabelEl.textContent = 'Choose or drag an audio / video file';
    this.uploadZone.classList.remove('file-selected');
    // keep the meeting link visible after reset so user can still navigate
  }
}
