/**
 * Draft Playground — bootstrap. Wires together DocxLoader, DraftEditor,
 * ChatPanel, AutoSave, DocxExporter on DOMContentLoaded.
 *
 * NOTE: must load AFTER the module classes (per CLAUDE.md script order).
 */
document.addEventListener('DOMContentLoaded', () => {
  const dropzone = document.getElementById('dp-dropzone');
  const fileInput = document.getElementById('dp-file-input');
  const openBtn = document.getElementById('dp-open-file');
  const downloadBtn = document.getElementById('dp-download');
  const filenameEl = document.getElementById('dp-filename');
  const editorEl = document.getElementById('dp-editor');
  const editorWrap = document.getElementById('dp-editor-wrap');

  const chatForm = document.getElementById('dp-chat-form');
  const chatInput = document.getElementById('dp-chat-input');
  const chatSend = document.getElementById('dp-chat-send');
  const chatMessages = document.getElementById('dp-chat-messages');
  const chatHint = document.getElementById('dp-chat-hint');
  const crossClauseBanner = document.getElementById('dp-cross-clause-banner');
  const selectionStatus = document.getElementById('dp-selection-status');

  const API_BASE = '';

  const chatPane = document.getElementById('dp-right');

  const loader = new window.DocxLoader({ dropzone, fileInput, openButton: openBtn, apiBase: API_BASE });
  const editor = new window.DraftEditor(editorEl, editorWrap);
  editor.addCompanion(chatPane);
  const chat = new window.ChatPanel({
    form: chatForm,
    input: chatInput,
    sendButton: chatSend,
    messagesEl: chatMessages,
    hintEl: chatHint,
    statusEl: selectionStatus,
    crossClauseBannerEl: crossClauseBanner,
    apiBase: API_BASE,
  });
  const autosave = new window.AutoSave();

  let currentFilename = '';
  let currentDocumentId = '';
  let _pendingDiffCount = 0;

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderClausesHtml(clauses) {
    if (!Array.isArray(clauses) || clauses.length === 0) {
      return '<p><em>No clauses returned.</em></p>';
    }
    return clauses
      .map((c, i) => {
        const title = escapeHtml(c && c.title);
        const desc = escapeHtml(c && c.description);
        return (
          `<section class="dp-clause" data-clause-index="${i}" data-clause-id="${escapeHtml(String(c && c.id))}">` +
          `<h3 class="dp-clause__title">${title}</h3>` +
          `<p class="dp-clause__desc">${desc}</p>` +
          `</section>`
        );
      })
      .join('');
  }

  function setDocumentIdInUrl(id) {
    const url = new URL(window.location.href);
    if (id) {
      url.searchParams.set('doc', id);
    } else {
      url.searchParams.delete('doc');
    }
    window.history.replaceState({}, '', url);
  }

  function applyDocument({ filename, clauses, documentId }) {
    currentFilename = filename || '';
    currentDocumentId = documentId || '';
    if (filename) filenameEl.textContent = filename;

    const html = renderClausesHtml(clauses);
    const saved = filename ? autosave.load(filename) : null;
    if (saved && saved.html) {
      editor.setHtml(saved.html);
    } else {
      editor.setHtml(html);
    }

    chat.setContext(documentId, null);
    dropzone.classList.add('is-hidden');
    downloadBtn.disabled = false;
  }

  function applyClauseDiffs(modifiedClauses) {
    const applicable = [];
    for (const { id, text: newText } of modifiedClauses) {
      const section = editorEl.querySelector(`[data-clause-id="${CSS.escape(String(id))}"]`);
      if (!section) continue;
      const descEl = section.querySelector('.dp-clause__desc');
      if (!descEl) continue;
      applicable.push({ descEl, newText, clauseId: id });
    }

    _pendingDiffCount = applicable.length;
    if (_pendingDiffCount === 0) {
      chat.setPending(false);
      return;
    }

    chat.setPending(true);

    for (const { descEl, newText, clauseId } of applicable) {
      const originalText = descEl.textContent;
      descEl.innerHTML = window.DiffView.renderInline(originalText, newText);

      const pill = window.DiffView.buildPill({
        onAccept: () => {
          descEl.textContent = newText;
          pill.remove();
          _pendingDiffCount--;
          if (_pendingDiffCount === 0) {
            chat.setPending(false);
            if (currentFilename) autosave.save(currentFilename, editor.getHtml());
          }
          if (currentDocumentId) {
            fetch(`${API_BASE}/counsel/draft-playground/document/${encodeURIComponent(currentDocumentId)}/clause/${encodeURIComponent(clauseId)}/`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: newText }),
            }).catch((err) => console.error('Failed to save clause to backend:', err));
          }
        },
        onReject: () => {
          descEl.textContent = originalText;
          pill.remove();
          _pendingDiffCount--;
          if (_pendingDiffCount === 0) {
            chat.setPending(false);
          }
        },
      });
      document.body.appendChild(pill);
      window.DiffView.positionPill(pill, descEl);
    }
  }

  // ── DocxLoader → processing + load lifecycle ──
  loader.addEventListener('processing', () => {
    dropzone.classList.add('is-hidden');
    editor.setProcessing(true);
    downloadBtn.disabled = true;
  });

  loader.addEventListener('load', (e) => {
    applyDocument(e.detail);
    setDocumentIdInUrl(e.detail.documentId);
  });

  loader.addEventListener('error', (e) => {
    dropzone.classList.remove('is-hidden');
    editor.setHtml('');
    window.alert(e.detail.message || 'Could not load file.');
  });

  // ── Editor selection → Chat enable/disable ──
  editor.addEventListener('selectionchange', (e) => {
    chat.setSelection(e.detail.text, e.detail.clauseId);
    chat.setContext(currentDocumentId, e.detail.clauseId);
  });
  editor.addEventListener('documentchange', () => {
    if (currentFilename) autosave.save(currentFilename, editor.getHtml());
  });

  // ── Chat → clause diff lifecycle ──
  chat.addEventListener('requeststart', () => {
    // Spinner + cycling messages shown in chat panel; no editor DOM change needed.
  });

  chat.addEventListener('replacement', (e) => {
    applyClauseDiffs(e.detail.modifiedClauses);
  });

  chat.addEventListener('requesterror', () => {
    chat.setPending(false);
  });

  // ── Download ──
  downloadBtn.addEventListener('click', () => {
    if (!editor.isLoaded()) return;
    try {
      window.DocxExporter.download(editor.getHtml(), currentFilename || 'draft.docx');
    } catch (err) {
      console.error('Download failed', err);
      window.alert('Could not export as .docx.');
    }
  });

  // ── Hydrate from ?doc=<id> on load ──
  (async function hydrateFromUrl() {
    const docId = new URL(window.location.href).searchParams.get('doc');
    if (!docId) return;

    dropzone.classList.add('is-hidden');
    editor.setProcessing(true);

    try {
      const res = await fetch(
        `${API_BASE}/counsel/draft-playground/document/${encodeURIComponent(docId)}/`
      );
      const data = await res.json().catch(() => null);

      if (!res.ok || !data || data.success === false) {
        throw new Error((data && data.error) || `Could not load document (${res.status}).`);
      }

      applyDocument({
        filename: data.filename,
        clauses: data.clauses,
        documentId: data.document_id || docId,
      });
    } catch (err) {
      console.error('Hydrate failed', err);
      setDocumentIdInUrl(null);
      editor.setHtml('');
      dropzone.classList.remove('is-hidden');
      window.alert(err.message || 'Could not load saved document.');
    }
  })();
});
