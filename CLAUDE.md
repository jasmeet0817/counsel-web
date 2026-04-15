# Counsel Web

## Script Load Order

In `public/index.html`, scripts must be loaded in dependency order — `app.js` last:

```html
<script src="recorder.js"></script>
<script src="history.js"></script>
<script src="app.js"></script>
```

`app.js` instantiates classes defined in the other files (`CounselRecorder`, etc.). Loading it first causes `ReferenceError` on `DOMContentLoaded`.

Never check another project except this one unless explicit permission is given