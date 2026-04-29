/**
 * DiffView — pure helpers for rendering inline word-level diffs and the
 * floating Accept/Reject pill. Owned by DraftEditor.
 */
class DiffView {
  /**
   * Compute a word-level diff between oldText and newText and return an
   * HTML string of <del> + <ins> + plain spans for unchanged runs.
   */
  static renderInline(oldText, newText) {
    if (!window.Diff || typeof window.Diff.diffWordsWithSpace !== 'function') {
      // Fallback if jsdiff isn't loaded — just show full strikethrough + insert.
      return `<del class="dp-diff-del">${DiffView._esc(oldText)}</del><ins class="dp-diff-ins">${DiffView._esc(newText)}</ins>`;
    }
    const parts = window.Diff.diffWordsWithSpace(oldText, newText);
    return parts
      .map((p) => {
        const safe = DiffView._esc(p.value);
        if (p.added) return `<ins class="dp-diff-ins">${safe}</ins>`;
        if (p.removed) return `<del class="dp-diff-del">${safe}</del>`;
        return `<span>${safe}</span>`;
      })
      .join('');
  }

  /**
   * Build a floating pill (DOM node) with Accept and Reject buttons.
   * Caller is responsible for positioning + appending to a host element.
   */
  static buildPill({ onAccept, onReject }) {
    const pill = document.createElement('div');
    pill.className = 'dp-diff-pill';

    const acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.className = 'dp-diff-pill__accept';
    acceptBtn.textContent = 'Accept';
    acceptBtn.addEventListener('click', onAccept);

    const rejectBtn = document.createElement('button');
    rejectBtn.type = 'button';
    rejectBtn.className = 'dp-diff-pill__reject';
    rejectBtn.textContent = 'Reject';
    rejectBtn.addEventListener('click', onReject);

    pill.appendChild(acceptBtn);
    pill.appendChild(rejectBtn);
    return pill;
  }

  static positionPill(pill, anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    pill.style.position = 'fixed';
    pill.style.top = `${rect.bottom + 8}px`;
    pill.style.left = `${rect.left}px`;
  }

  static _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
}

window.DiffView = DiffView;
