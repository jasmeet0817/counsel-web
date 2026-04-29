/**
 * DocxLoader — wires a dropzone + file input to a backend upload that
 * kicks off async clause extraction (Gemini), then polls until clauses
 * are ready.
 *
 * Events:
 *   'processing'  — upload started; UI should show a loading state
 *   'load'        — detail: { filename, clauses, documentId }
 *   'error'       — detail: { message }
 */
class DocxLoader extends EventTarget {
  constructor({ dropzone, fileInput, openButton, apiBase = '' }) {
    super();
    this.dropzone = dropzone;
    this.fileInput = fileInput;
    this.openButton = openButton;
    this.apiBase = apiBase;

    this._wireDropzone();
    this._wireFileInput();
    if (openButton) {
      openButton.addEventListener('click', () => this.fileInput.click());
    }
  }

  _wireDropzone() {
    const dz = this.dropzone;
    dz.addEventListener('click', () => this.fileInput.click());

    ['dragenter', 'dragover'].forEach((evt) => {
      dz.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.add('is-dragover');
      });
    });

    ['dragleave', 'drop'].forEach((evt) => {
      dz.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.remove('is-dragover');
      });
    });

    dz.addEventListener('drop', (e) => {
      const file = e.dataTransfer && e.dataTransfer.files[0];
      if (file) this._handleFile(file);
    });
  }

  _wireFileInput() {
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files && this.fileInput.files[0];
      if (file) this._handleFile(file);
      this.fileInput.value = '';
    });
  }

  async _handleFile(file) {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      this._emitError('Only .docx files are supported.');
      return;
    }

    this.dispatchEvent(new CustomEvent('processing', { detail: { filename: file.name } }));

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${this.apiBase}/counsel/draft-playground/upload/`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data || data.success === false || !data.document_id) {
        const msg = (data && data.error) || `Upload failed (${res.status}).`;
        this._emitError(msg);
        return;
      }

      const documentId = data.document_id;
      const filename = data.filename || file.name;

      const result = await this._pollUploadStatus(documentId);
      if (!result) return;

      this.dispatchEvent(
        new CustomEvent('load', {
          detail: {
            filename,
            clauses: Array.isArray(result.clauses) ? result.clauses : [],
            documentId,
          },
        })
      );
    } catch (err) {
      console.error('DocxLoader upload failed', err);
      this._emitError('Could not upload .docx file.');
    }
  }

  async _pollUploadStatus(documentId, { intervalMs = 1500, maxAttempts = 120 } = {}) {
    const url = `${this.apiBase}/counsel/draft-playground/document/${encodeURIComponent(documentId)}/upload-status/`;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      try {
        const res = await fetch(url);
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) continue;

        if (data.status === 'completed') return data;
        if (data.status === 'failed') {
          this._emitError(data.message || 'Clause extraction failed.');
          return null;
        }
      } catch (err) {
        console.error('Poll upload-status failed', err);
      }
    }
    this._emitError('Timed out waiting for clause extraction.');
    return null;
  }

  _emitError(message) {
    this.dispatchEvent(new CustomEvent('error', { detail: { message } }));
  }
}

window.DocxLoader = DocxLoader;
