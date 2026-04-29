/**
 * AutoSave — persists editor HTML + filename to localStorage.
 * Single-slot for now; keyed by filename so reloading the same doc restores it.
 */
class AutoSave {
  constructor(prefix = 'draft_playground.') {
    this.prefix = prefix;
  }

  _key(filename) {
    return `${this.prefix}${filename || '__untitled__'}`;
  }

  save(filename, html) {
    try {
      localStorage.setItem(
        this._key(filename),
        JSON.stringify({ filename, html, savedAt: Date.now() })
      );
    } catch (err) {
      console.warn('AutoSave: failed to persist', err);
    }
  }

  load(filename) {
    try {
      const raw = localStorage.getItem(this._key(filename));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn('AutoSave: failed to load', err);
      return null;
    }
  }

  clear(filename) {
    try {
      localStorage.removeItem(this._key(filename));
    } catch (err) { /* ignore */ }
  }
}

window.AutoSave = AutoSave;
