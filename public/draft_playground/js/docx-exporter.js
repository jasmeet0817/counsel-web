/**
 * DocxExporter — converts editor HTML back to a .docx Blob and triggers
 * a browser download. Wraps html-docx-js (window.htmlDocx).
 */
class DocxExporter {
  static download(html, filename) {
    if (!window.htmlDocx || typeof window.htmlDocx.asBlob !== 'function') {
      throw new Error('html-docx-js is not loaded');
    }

    const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${DocxExporter._escapeHtml(filename)}</title></head>
<body>${html}</body></html>`;

    const blob = window.htmlDocx.asBlob(fullHtml);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = DocxExporter._ensureDocxExt(filename);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  static _ensureDocxExt(name) {
    if (!name) return 'draft.docx';
    return name.toLowerCase().endsWith('.docx') ? name : `${name}.docx`;
  }

  static _escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
}

window.DocxExporter = DocxExporter;
