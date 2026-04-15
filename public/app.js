'use strict';

const COUNSEL_API_BASE = '';

document.addEventListener('DOMContentLoaded', () => {
  new CounselRecorder();
  new CounselUploader();
  initNav();
});

/* ── Navigation ──────────────────────────────────── */

function initNav() {
  const hamburgerBtn   = document.getElementById('hamburgerBtn');
  const sidebar        = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const navLinks       = document.querySelectorAll('.nav-link');

  function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('visible');
    hamburgerBtn.classList.add('open');
    hamburgerBtn.setAttribute('aria-expanded', 'true');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('visible');
    hamburgerBtn.classList.remove('open');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
  }

  hamburgerBtn.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });

  sidebarOverlay.addEventListener('click', closeSidebar);

  navLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(link.dataset.page);
      closeSidebar();
    });
  });

  // Navigate based on URL hash on load
  let initial = 'recorder';
  if (window.location.hash === '#history') initial = 'history';
  else if (window.location.hash === '#upload') initial = 'upload';
  navigateTo(initial);
}

function navigateTo(page) {
  const recorderPage = document.getElementById('recorderPage');
  const historyPage  = document.getElementById('historyPage');
  const uploadPage   = document.getElementById('uploadPage');
  const navLinks     = document.querySelectorAll('.nav-link');

  navLinks.forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });

  recorderPage.classList.add('page-hidden');
  historyPage.classList.add('page-hidden');
  uploadPage.classList.add('page-hidden');

  if (page === 'history') {
    historyPage.classList.remove('page-hidden');
    loadHistory();
    window.history.replaceState(null, '', '#history');
  } else if (page === 'upload') {
    uploadPage.classList.remove('page-hidden');
    window.history.replaceState(null, '', '#upload');
  } else {
    recorderPage.classList.remove('page-hidden');
    window.history.replaceState(null, '', '#recorder');
  }
}
