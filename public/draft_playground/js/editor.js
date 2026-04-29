/**
 * DraftEditor — wraps the contenteditable surface, tracks selection,
 * and orchestrates the pending-diff lifecycle.
 *
 * Events:
 *   - 'selectionchange'  detail: { text, clauseId }  text is '' when selection is empty
 *   - 'pendingstart'                                   a diff is in flight
 *   - 'pendingend'                                     diff resolved (accept or reject)
 *   - 'documentchange'                                 document content changed
 */
class DraftEditor extends EventTarget {
  constructor(el, scrollContainer) {
    super();
    this.el = el;
    this.scrollContainer = scrollContainer || el;
    this._savedRange = null;
    this._savedText = '';
    this._selectedClauseId = null;
    this._pendingWrapper = null;
    this._pill = null;
    this._loaded = false;
    this._suspendSelectionEvents = false;
    this._companions = [];
    this._mousedownOnCompanion = false;
    this._highlightSupported = typeof window.Highlight !== 'undefined' && !!(CSS && CSS.highlights);

    document.addEventListener('mousedown', (e) => {
      this._mousedownOnCompanion = this._companions.some(c => c.contains(e.target));
      this._mousedownTarget = e.target;
    });
    document.addEventListener('selectionchange', () => this._onSelectionChange());
    el.addEventListener('input', () => {
      if (this._loaded) this.dispatchEvent(new CustomEvent('documentchange'));
    });
    this.scrollContainer.addEventListener('scroll', () => this._repositionPill());
    window.addEventListener('resize', () => this._repositionPill());
  }

  setHtml(html) {
    this.el.innerHTML = html;
    this.el.setAttribute('contenteditable', 'true');
    this._loaded = true;
  }

  setProcessing(isProcessing) {
    if (isProcessing) {
      this.el.innerHTML = '<div class="dp-processing">Processing document…</div>';
      this.el.setAttribute('contenteditable', 'false');
      this._loaded = false;
    }
  }

  getHtml() {
    if (!this._loaded) return '';
    if (this._pendingWrapper) {
      // Don't expose half-applied diffs — clone DOM and revert pending.
      const clone = this.el.cloneNode(true);
      const stale = clone.querySelector('.dp-diff-block');
      if (stale && stale.dataset.originalHtml) {
        stale.outerHTML = stale.dataset.originalHtml;
      }
      return clone.innerHTML;
    }
    return this.el.innerHTML;
  }

  addCompanion(el) { this._companions.push(el); }
  isLoaded() { return this._loaded; }
  hasSelection() { return !!this._savedRange && !this._pendingWrapper; }
  hasPending() { return !!this._pendingWrapper; }
  getSelectedText() { return this._savedText; }
  getSelectedClauseId() { return this._selectedClauseId; }

  _onSelectionChange() {
    if (this._suspendSelectionEvents || this._pendingWrapper) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      if (!this._mousedownOnCompanion) {
        this._clearSelection();
      } else if (this._savedRange) {
        const clickedFocusable = this._mousedownTarget &&
          this._mousedownTarget.closest('input, textarea, button, select, a[href], [tabindex]');
        if (clickedFocusable) {
          // Focus is moving to a focusable companion element (e.g. the chat
          // input). sel.addRange() would steal focus back to the editor, so
          // paint the selection via CSS Custom Highlight instead — purely
          // visual, no focus or DOM impact.
          this._setSavedHighlight();
        } else {
          // Non-focusable companion area — re-apply the native selection so
          // the user keeps seeing the highlight; focus stays on the editor.
          this._suspendSelectionEvents = true;
          try {
            sel.removeAllRanges();
            sel.addRange(this._savedRange.cloneRange());
          } catch (_) { /* range may be stale if DOM changed */ }
          this._suspendSelectionEvents = false;
        }
      }
      return;
    }
    const range = sel.getRangeAt(0);
    if (!this.el.contains(range.commonAncestorContainer)) {
      return;
    }
    const text = range.toString();
    if (!text.trim()) {
      this._clearSelection();
      return;
    }
    // Native selection is showing; drop any custom highlight from the prior state.
    this._clearSavedHighlight();
    this._savedRange = range.cloneRange();
    this._savedText = text;

    // Walk up to find the enclosing clause element
    this._selectedClauseId = null;
    let node = range.commonAncestorContainer;
    while (node && node !== this.el) {
      if (node.dataset && node.dataset.clauseId !== undefined) {
        this._selectedClauseId = node.dataset.clauseId;
        break;
      }
      node = node.parentNode;
    }

    this.dispatchEvent(new CustomEvent('selectionchange', {
      detail: { text, clauseId: this._selectedClauseId },
    }));
  }

  _clearSelection() {
    if (!this._savedRange && !this._savedText) return;
    this._clearSavedHighlight();
    this._savedRange = null;
    this._savedText = '';
    this._selectedClauseId = null;
    this.dispatchEvent(new CustomEvent('selectionchange', { detail: { text: '', clauseId: null } }));
  }

  _setSavedHighlight() {
    if (!this._highlightSupported || !this._savedRange) return;
    try {
      CSS.highlights.set('dp-saved-selection', new Highlight(this._savedRange));
    } catch (_) { /* range may be stale */ }
  }

  _clearSavedHighlight() {
    if (!this._highlightSupported) return;
    CSS.highlights.delete('dp-saved-selection');
  }

  /**
   * Wrap the saved selection in a pending span so we can later replace
   * its contents with a diff. Returns true on success.
   */
  beginPending() {
    if (!this._savedRange || this._pendingWrapper) return false;

    const range = this._savedRange;
    const wrapper = document.createElement('span');
    wrapper.className = 'dp-diff-block dp-pending';

    let fragment;
    try {
      fragment = range.extractContents();
    } catch (err) {
      console.error('extractContents failed', err);
      return false;
    }

    const tmp = document.createElement('div');
    tmp.appendChild(fragment.cloneNode(true));
    wrapper.dataset.originalHtml = tmp.innerHTML;
    wrapper.dataset.originalText = this._savedText;

    wrapper.appendChild(fragment);
    range.insertNode(wrapper);

    this._pendingWrapper = wrapper;
    this._clearSavedHighlight();
    this._suspendSelectionEvents = true;
    window.getSelection().removeAllRanges();
    this._suspendSelectionEvents = false;

    this.dispatchEvent(new CustomEvent('pendingstart'));
    return true;
  }

  /**
   * Replace the pending span contents with the inline diff and reveal
   * the Accept/Reject pill.
   */
  showDiff(newText) {
    if (!this._pendingWrapper) return;
    const w = this._pendingWrapper;
    const oldText = w.dataset.originalText || '';

    w.classList.remove('dp-pending');
    w.innerHTML = DiffView.renderInline(oldText, newText);
    w.dataset.newText = newText;

    this._mountPill();
  }

  /**
   * Apply the pending diff: replace the wrapper with the new plain text.
   */
  acceptPending() {
    if (!this._pendingWrapper) return;
    const w = this._pendingWrapper;
    const newText = w.dataset.newText || '';
    const textNode = document.createTextNode(newText);
    w.replaceWith(textNode);
    this._teardownPending();
    this.dispatchEvent(new CustomEvent('documentchange'));
  }

  /**
   * Drop the pending diff and restore the original selected content.
   */
  rejectPending() {
    if (!this._pendingWrapper) return;
    const w = this._pendingWrapper;
    const originalHtml = w.dataset.originalHtml || '';
    const slot = document.createElement('span');
    slot.innerHTML = originalHtml;
    const parent = w.parentNode;
    while (slot.firstChild) parent.insertBefore(slot.firstChild, w);
    parent.removeChild(w);
    this._teardownPending();
  }

  _teardownPending() {
    this._pendingWrapper = null;
    if (this._pill) {
      this._pill.remove();
      this._pill = null;
    }
    this._savedRange = null;
    this._savedText = '';
    this._selectedClauseId = null;
    this.dispatchEvent(new CustomEvent('pendingend'));
    this.dispatchEvent(new CustomEvent('selectionchange', { detail: { text: '', clauseId: null } }));
  }

  _mountPill() {
    if (this._pill) this._pill.remove();
    this._pill = DiffView.buildPill({
      onAccept: () => this.acceptPending(),
      onReject: () => this.rejectPending(),
    });
    document.body.appendChild(this._pill);
    this._repositionPill();
  }

  _repositionPill() {
    if (!this._pill || !this._pendingWrapper) return;
    DiffView.positionPill(this._pill, this._pendingWrapper);
  }
}

window.DraftEditor = DraftEditor;
