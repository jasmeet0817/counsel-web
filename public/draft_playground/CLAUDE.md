# Draft Playground

Two-pane UI: left is a .docx editor, right is an AI chat panel for clause rewrites.

## Script load order (index.html)

```html
<script src="js/docx-loader.js"></script>
<script src="js/docx-exporter.js"></script>
<script src="js/diff-view.js"></script>
<script src="js/autosave.js"></script>
<script src="js/editor.js"></script>
<script src="js/chat.js"></script>
<script src="js/app.js"></script>  <!-- must be last -->
```

## Files

**index.html** — Shell markup: left editor pane (dropzone + contenteditable) + right chat pane (messages + composer form).

**style.css** — All styles. Dark theme via CSS variables. `.dp-*` namespace throughout.

**js/app.js** — Bootstrap only. Wires `DocxLoader`, `DraftEditor`, `ChatPanel`, `AutoSave`, `DocxExporter` together on `DOMContentLoaded`. Owns the top-level event plumbing between modules.

**js/editor.js** — `DraftEditor` class. Wraps the contenteditable surface. Tracks selection + clauseId, manages the pending-diff lifecycle (show inline diff → accept/reject), emits `selectionchange`, `pendingstart`, `pendingend`, `documentchange`.

**js/chat.js** — `ChatPanel` class. Renders chat history, POSTs selected clause + user message to backend, emits `replacement` event with `modifiedClauses` + `why`. Disabled when no selection or a diff is pending.

**js/diff-view.js** — `DiffView` static class. Word-level diff rendering (`diffWordsWithSpace` via jsdiff), builds the floating Accept/Reject pill DOM node, positions it relative to the diff block.

**js/docx-loader.js** — `DocxLoader` class. Wires dropzone + file input, POSTs `.docx` to backend `/upload`, emits `load` `{ filename, clauses, documentId }` or `error`.

**js/docx-exporter.js** — `DocxExporter` static class. Converts editor HTML → `.docx` Blob via `html-docx-js` and triggers browser download.

**js/autosave.js** — `AutoSave` class. Persists editor HTML + filename to `localStorage` keyed by filename. Single slot per filename.
