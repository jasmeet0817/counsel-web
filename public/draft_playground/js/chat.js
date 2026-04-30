/**
 * ChatPanel — renders chat history, sends messages to the backend, and
 * surfaces the LLM's `why` explanation. Stays disabled until the editor
 * reports a non-empty selection. Disabled again while diffs are pending.
 *
 * Events emitted:
 *   - 'replacement' detail: { modifiedClauses, why }  when backend returns
 *   - 'requeststart'                                   on send
 *   - 'requesterror' detail: { message }
 */
class ChatPanel extends EventTarget {
  constructor({ form, input, sendButton, messagesEl, hintEl, statusEl, crossClauseBannerEl, apiBase = '' }) {
    super();
    this.form = form;
    this.input = input;
    this.sendButton = sendButton;
    this.messagesEl = messagesEl;
    this.hintEl = hintEl;
    this.statusEl = statusEl;
    this.crossClauseBannerEl = crossClauseBannerEl || null;
    this.apiBase = apiBase;

    this._currentSelection = '';
    this._clauseId = null;
    this._documentId = null;
    this._crossClause = false;
    this._inFlight = false;
    this._pending = false;
    this._cycleInterval = null;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this._send();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._send();
      }
    });

    this._updateEnabled();
  }

  setSelection(text, clauseId) {
    this._currentSelection = text || '';
    this._clauseId = clauseId || null;
    this._crossClause = !!text && clauseId === null;

    if (this.statusEl) {
      if (this._crossClause) {
        this.statusEl.textContent = 'Multi-clause selection';
        this.statusEl.classList.remove('dp-status--active');
      } else if (this._currentSelection) {
        this.statusEl.textContent = `${this._currentSelection.split(/\s+/).filter(Boolean).length} words selected`;
        this.statusEl.classList.add('dp-status--active');
      } else {
        this.statusEl.textContent = 'No selection';
        this.statusEl.classList.remove('dp-status--active');
      }
    }

    if (this.crossClauseBannerEl) {
      this.crossClauseBannerEl.classList.toggle('is-hidden', !this._crossClause);
    }

    this._updateEnabled();
  }

  setContext(documentId, clauseId) {
    this._documentId = documentId || null;
    this._clauseId = clauseId || null;
  }

  setPending(isPending) {
    this._pending = isPending;
    this._updateEnabled();
  }

  _updateEnabled() {
    const enabled = !!this._currentSelection && !this._crossClause && !this._inFlight && !this._pending;
    this.input.disabled = !enabled;
    this.sendButton.disabled = !enabled;
    if (this._inFlight) {
      this.input.placeholder = 'Waiting for response…';
    } else if (this._pending) {
      this.input.placeholder = 'Accept or reject the pending changes first.';
    } else if (this._crossClause) {
      this.input.placeholder = 'Select text within a single clause to chat.';
    } else if (this._currentSelection) {
      this.input.placeholder = 'Ask Gemini to rewrite the selected text…';
    } else {
      this.input.placeholder = 'Select text in the document to start chatting…';
    }
  }

  async _send() {
    const query = this.input.value.trim();
    if (!query || !this._currentSelection || this._inFlight || this._pending) return;

    const selectedText = this._currentSelection;
    const clauseId = this._clauseId;
    const documentId = this._documentId;
    this.input.value = '';
    this._inFlight = true;
    this._updateEnabled();
    this._hideHint();

    this._addMessage('user', query);
    const thinkingNode = this._addMessage('assistant', 'Thinking…', { thinking: true });
    this._startCycling(thinkingNode);

    this.dispatchEvent(new CustomEvent('requeststart'));

    try {
      const res = await fetch(`${this.apiBase}/counsel/draft-playground/chat/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_query: query,
          selected_text: selectedText,
          clause_id: clauseId,
          document_id: documentId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success || !data.chat_id) {
        const msg =
          (data.errors && JSON.stringify(data.errors)) ||
          `Request failed (${res.status})`;
        this._stopCycling();
        this._replaceWithError(thinkingNode, msg);
        this.dispatchEvent(new CustomEvent('requesterror', { detail: { message: msg } }));
        return;
      }

      const result = await this._pollChatStatus(data.chat_id);
      if (!result) {
        this._stopCycling();
        this._replaceWithError(thinkingNode, 'Chat request failed.');
        this.dispatchEvent(new CustomEvent('requesterror', { detail: { message: 'Chat failed' } }));
        return;
      }

      const modifiedClauses = result.modified_clauses || [];
      const why = result.why || '(No explanation provided.)';
      this._stopCycling();
      this._replaceWithAssistant(thinkingNode, why);

      this.dispatchEvent(
        new CustomEvent('replacement', { detail: { modifiedClauses, why } })
      );
    } catch (err) {
      console.error('Chat request failed', err);
      this._stopCycling();
      this._replaceWithError(thinkingNode, 'Network error. Please try again.');
      this.dispatchEvent(
        new CustomEvent('requesterror', { detail: { message: 'Network error' } })
      );
    } finally {
      this._inFlight = false;
      this._updateEnabled();
    }
  }

  async _pollChatStatus(chatId, { intervalMs = 1500, maxAttempts = 120 } = {}) {
    const url = `${this.apiBase}/counsel/draft-playground/chat/${encodeURIComponent(chatId)}/`;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      try {
        const res = await fetch(url);
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) continue;

        if (data.status === 'completed') return data;
        if (data.status === 'failed') return null;
      } catch (err) {
        console.error('Poll chat status failed', err);
      }
    }
    return null;
  }

  _startCycling(node) {
    const messages = ['Thinking…', 'Lawyering…', 'Understanding requirements…', 'Drafting…'];
    let idx = 0;
    this._cycleInterval = setInterval(() => {
      idx = (idx + 1) % messages.length;
      node.textContent = messages[idx];
    }, 4000);
  }

  _stopCycling() {
    if (this._cycleInterval) {
      clearInterval(this._cycleInterval);
      this._cycleInterval = null;
    }
  }

  _addMessage(role, text, opts = {}) {
    const node = document.createElement('div');
    node.className = `dp-msg dp-msg--${role}`;
    if (opts.thinking) node.classList.add('dp-msg--thinking');
    node.textContent = text;
    this.messagesEl.appendChild(node);
    this._scrollToBottom();
    return node;
  }

  _replaceWithAssistant(node, text) {
    node.classList.remove('dp-msg--thinking');
    node.textContent = text;
    this._scrollToBottom();
  }

  _replaceWithError(node, message) {
    node.className = 'dp-msg dp-msg--error';
    node.textContent = message;
    this._scrollToBottom();
  }

  _hideHint() {
    if (this.hintEl) this.hintEl.classList.add('is-hidden');
  }

  _scrollToBottom() {
    const parent = this.messagesEl.parentElement;
    if (parent) parent.scrollTop = parent.scrollHeight;
  }
}

window.ChatPanel = ChatPanel;
