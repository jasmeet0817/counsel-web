const { createWorker } = require('tesseract.js');

let workerPromise;

function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const w = await createWorker('eng');
      await w.setParameters({
        tessedit_char_whitelist:
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
        tessedit_pageseg_mode: '7',
      });
      return w;
    })();
  }
  return workerPromise;
}

async function solve(buffer) {
  const w = await getWorker();
  const { data } = await w.recognize(buffer);
  return {
    text: data.text.replace(/\s+/g, ''),
    confidence: data.confidence,
  };
}

module.exports = { solve };
