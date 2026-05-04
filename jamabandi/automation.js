const puppeteer = require('puppeteer');
const captcha = require('./captcha');

const URL = 'https://jamabandi.nic.in/land%20records/NakalRecord';

const DEFAULTS = {
  district: 'अम्बाला',
  tehsil: 'अम्बालाछावनी',
  village: 'नगल',
  year: '2017-2018',
  kharsa: '13//26/3/13',
};

const SEL = {
  byKharsa: '#ctl00_ContentPlaceHolder1_RdobtnKhasra',
  district: '#ctl00_ContentPlaceHolder1_ddldname',
  tehsil:   '#ctl00_ContentPlaceHolder1_ddltname',
  village:  '#ctl00_ContentPlaceHolder1_ddlvname',
  year:     '#ctl00_ContentPlaceHolder1_ddlPeriod',
  kharsaInput: '#ctl00_ContentPlaceHolder1_ddlkhasra',
  kharsaViewBtn: '#ctl00_ContentPlaceHolder1_btnKView',
  captchaImg: '#ctl00_ContentPlaceHolder1_imgKhasraCaptcha',
  captchaInput: '#ctl00_ContentPlaceHolder1_txtKhasraCaptcha',
};

const SUCCESS_HEADER_HINTS = ['Khewat', 'Khatoni', 'मालिक', 'खेवट', 'खतौनी'];

const FIELD_DELAY_MS = 2000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function selectByVisibleText(page, selector, wantedText, log) {
  await page.waitForSelector(selector, { timeout: 30000 });
  const value = await page.$$eval(
    `${selector} option`,
    (opts, want) => {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const target = norm(want);
      const match = opts.find((o) => norm(o.textContent) === target)
        || opts.find((o) => norm(o.textContent).includes(target));
      return match ? match.value : null;
    },
    wantedText,
  );
  if (!value) {
    const available = await page.$$eval(`${selector} option`, (opts) =>
      opts.map((o) => `[${o.value}] ${o.textContent}`).slice(0, 50));
    throw new Error(
      `Could not find option "${wantedText}" in ${selector}. Available: ${available.join(' | ')}`,
    );
  }
  log(`  → ${selector} = "${wantedText}" (value=${value})`);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
    page.select(selector, value),
  ]);
}

async function classifyResult(page) {
  return page.evaluate((hints) => {
    if (document.querySelector('#notfound')) return { kind: 'error_page' };
    const captchaInput = document.querySelector('#ctl00_ContentPlaceHolder1_txtKhasraCaptcha');
    const text = document.body.innerText || '';
    const hitHint = hints.some((h) => text.includes(h));
    if (!captchaInput && hitHint) return { kind: 'success', textLength: text.length };
    if (captchaInput) return { kind: 'wrong_captcha' };
    if (hitHint) return { kind: 'success', textLength: text.length };
    return { kind: 'unknown', textLength: text.length };
  }, SUCCESS_HEADER_HINTS);
}

async function runFormFlow(page, opts, log) {
  log('Loading Jamabandi NakalRecord page…');
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 90000 });

  log('Selecting "By Khasra/Survey No." search type…');
  await page.waitForSelector(SEL.byKharsa, { timeout: 30000 });
  const isChecked = await page.$eval(SEL.byKharsa, (el) => el.checked);
  if (!isChecked) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => null),
      page.click(SEL.byKharsa),
    ]);
  }
  await sleep(FIELD_DELAY_MS);

  log(`Selecting district "${opts.district}"…`);
  await selectByVisibleText(page, SEL.district, opts.district, log);
  await sleep(FIELD_DELAY_MS);

  log(`Selecting tehsil "${opts.tehsil}"…`);
  await selectByVisibleText(page, SEL.tehsil, opts.tehsil, log);
  await sleep(FIELD_DELAY_MS);

  log(`Selecting village "${opts.village}"…`);
  await selectByVisibleText(page, SEL.village, opts.village, log);
  await sleep(FIELD_DELAY_MS);

  log(`Selecting year "${opts.year}"…`);
  await selectByVisibleText(page, SEL.year, opts.year, log);
  await sleep(FIELD_DELAY_MS);

  log(`Entering Kharsa "${opts.kharsa}"…`);
  await page.waitForSelector(SEL.kharsaInput, { timeout: 30000 });
  const isSelect = await page.$eval(SEL.kharsaInput, (el) => el.tagName.toLowerCase() === 'select');
  if (isSelect) {
    await selectByVisibleText(page, SEL.kharsaInput, opts.kharsa, log);
  } else {
    await page.click(SEL.kharsaInput, { clickCount: 3 });
    await page.type(SEL.kharsaInput, opts.kharsa, { delay: 20 });
  }
  await sleep(FIELD_DELAY_MS);

  const viewBtn = await page.$(SEL.kharsaViewBtn);
  if (viewBtn) {
    log('Clicking View button…');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => null),
      viewBtn.click(),
    ]);
  }

  await page.waitForSelector(SEL.captchaImg, { timeout: 30000 });
}

async function attemptCaptchaAndNakal(browser, page, log, dialogState) {
  const imgEl = await page.waitForSelector(SEL.captchaImg, { timeout: 30000 });
  const buf = await imgEl.screenshot({ type: 'png' });
  const { text: ocr, confidence } = await captcha.solve(buf);
  log(`  OCR: "${ocr}" (confidence=${Math.round(confidence)})`);

  await page.click(SEL.captchaInput, { clickCount: 3 });
  await page.type(SEL.captchaInput, ocr, { delay: 25 });

  dialogState.lastMessage = null;

  let onTarget;
  const popupPromise = new Promise((resolve) => {
    onTarget = async (target) => {
      if (target.type() !== 'page') return;
      browser.off('targetcreated', onTarget);
      try {
        resolve(await target.page());
      } catch (_) {
        resolve(null);
      }
    };
    browser.on('targetcreated', onTarget);
  });
  const detachListener = () => browser.off('targetcreated', onTarget);

  log('  Clicking Nakal…');
  await page.evaluate(() => {
    // eslint-disable-next-line no-undef
    __doPostBack('ctl00$ContentPlaceHolder1$GridView1', 'Select$0');
  });

  const POPUP_TIMEOUT_MS = 8000;
  const dialogPromise = (async () => {
    const start = Date.now();
    while (Date.now() - start < POPUP_TIMEOUT_MS) {
      if (dialogState.lastMessage && /invalid\s*captcha/i.test(dialogState.lastMessage)) {
        return 'invalid_captcha';
      }
      await sleep(100);
    }
    return null;
  })();
  const timeoutPromise = sleep(POPUP_TIMEOUT_MS).then(() => 'timeout');

  const winner = await Promise.race([
    popupPromise.then((p) => ({ kind: 'popup', page: p })),
    dialogPromise.then((d) => (d ? { kind: 'dialog' } : { kind: 'pending_dialog' })),
    timeoutPromise.then(() => ({ kind: 'timeout' })),
  ]);

  if (winner.kind === 'popup' && winner.page) {
    const nakalPage = winner.page;
    log('  Nakal popup detected; waiting for content…');
    await nakalPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => null);
    await nakalPage
      .waitForFunction(() => document.body && document.body.innerText.length > 200, { timeout: 30000 })
      .catch(() => null);
    const text = (await nakalPage.evaluate(() => document.body.innerText)).trim();
    await nakalPage.close().catch(() => null);
    return { kind: 'success', text };
  }

  detachListener();

  if (winner.kind === 'dialog'
      || (dialogState.lastMessage && /invalid\s*captcha/i.test(dialogState.lastMessage))) {
    log('  Dialog dismissed: Invalid CAPTCHA — retrying');
    return { kind: 'wrong_captcha', via: 'dialog' };
  }

  return classifyResult(page);
}

async function runJamabandiLookup({ onStatus = () => {}, options = {} } = {}) {
  const opts = { ...DEFAULTS, ...options };
  const log = (message, phase = 'info') => {
    onStatus({ phase, message });
    console.log(`[jamabandi] ${message}`);
  };

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized'],
  });

  try {
    const page = (await browser.pages())[0] || (await browser.newPage());

    const dialogState = { lastMessage: null };
    page.on('dialog', async (dialog) => {
      dialogState.lastMessage = dialog.message();
      log(`  Dismissed dialog: "${dialog.message()}"`);
      try { await dialog.accept(); } catch (_) { /* swallow */ }
    });

    const MAX_OUTER = 3;
    const MAX_INNER = 4;

    for (let outer = 1; outer <= MAX_OUTER; outer++) {
      onStatus({ phase: 'restart', message: outer === 1 ? 'Starting…' : `Restart attempt ${outer}` });
      try {
        await runFormFlow(page, opts, log);
      } catch (err) {
        log(`Form-flow error: ${err.message}`);
        if (outer === MAX_OUTER) throw err;
        continue;
      }

      let outerShouldRestart = false;
      for (let inner = 1; inner <= MAX_INNER; inner++) {
        onStatus({ phase: 'captcha', message: `Captcha attempt ${inner} (outer ${outer})` });
        const result = await attemptCaptchaAndNakal(browser, page, log, dialogState);
        log(`  Result: ${result.kind}`);

        if (result.kind === 'success') {
          onStatus({ phase: 'nakal', message: 'Reached Nakal page, scraping…' });
          return { text: result.text };
        }
        if (result.kind === 'error_page') {
          outerShouldRestart = true;
          break;
        }
        // wrong_captcha or unknown → loop again, captcha will have refreshed
      }

      if (!outerShouldRestart) {
        log(`  Inner captcha loop exhausted on outer ${outer}; doing a full reload.`);
      }
    }

    throw new Error('Could not retrieve Nakal after retries');
  } finally {
    try { await browser.close(); } catch (_) { /* swallow */ }
  }
}

module.exports = { runJamabandiLookup, DEFAULTS };
