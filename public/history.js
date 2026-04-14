'use strict';

async function loadHistory() {
  const content = document.getElementById('historyContent');

  // Simple 30-second client cache
  if (loadHistory._lastFetch && Date.now() - loadHistory._lastFetch < 30_000) return;

  content.innerHTML = '<p class="history-state">Loading recordings…</p>';

  try {
    const res  = await fetch(`${COUNSEL_API_BASE}/counsel/meetings/`);
    const data = await res.json();

    if (!data.success || !data.meetings || !data.meetings.length) {
      content.innerHTML = '<p class="history-state">No recordings yet.</p>';
      return;
    }

    const grouped = groupByDate(data.meetings);
    content.innerHTML = '';
    content.appendChild(renderGroups(grouped));
    loadHistory._lastFetch = Date.now();
    sessionStorage.setItem('counsel_meetings', JSON.stringify(data.meetings));
  } catch {
    content.innerHTML = '<p class="history-state">Failed to load recordings.</p>';
  }
}

function groupByDate(recordings) {
  const groups = new Map();

  recordings.forEach(rec => {
    const date = rec.created_at ? new Date(rec.created_at) : null;
    const key  = date
      ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
      : 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...rec, _date: date });
  });

  // Sort groups newest-first; unknown last
  const sorted = [...groups.entries()].sort(([a], [b]) => {
    if (a === 'unknown') return 1;
    if (b === 'unknown') return -1;
    return b.localeCompare(a);
  });

  // Sort recordings within each group newest-first
  sorted.forEach(([, recs]) => recs.sort((a, b) => {
    if (!a._date) return 1;
    if (!b._date) return -1;
    return b._date - a._date;
  }));

  return sorted;
}

function renderGroups(grouped) {
  const frag = document.createDocumentFragment();

  grouped.forEach(([key, recordings]) => {
    const group = document.createElement('div');
    group.className = 'history-group';

    const label = document.createElement('p');
    label.className = 'history-group-label';
    label.textContent = key === 'unknown'
      ? 'Unknown date'
      : new Date(key + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    group.appendChild(label);

    recordings.forEach(rec => {
      const card = document.createElement('div');
      card.className = 'recording-card';

      const info = document.createElement('div');
      info.className = 'card-info';

      const company = document.createElement('span');
      company.className = 'card-company';
      company.textContent = rec.company_name || 'Unnamed recording';
      info.appendChild(company);

      if (rec._date) {
        const time = document.createElement('span');
        time.className = 'card-time';
        time.textContent = rec._date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        info.appendChild(time);
      }

      card.appendChild(info);

      const chevron = document.createElement('span');
      chevron.className = 'card-chevron';
      chevron.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
      card.appendChild(chevron);

      if (rec.id) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
          window.location.href = `meeting-page.html?id=${rec.id}`;
        });
      }

      group.appendChild(card);
    });

    frag.appendChild(group);
  });

  return frag;
}
