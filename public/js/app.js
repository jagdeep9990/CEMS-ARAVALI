/* CEMS Aravali - public site */
(() => {
  const $ = id => document.getElementById(id);
  const ICONS = { Technical: '💻', Cultural: '🎭', Sports: '🏆', Workshop: '🛠️', Career: '🎯', Other: '✨' };

  let events = [];
  let activeCat = 'All';
  let query = '';
  let countdownTarget = null;

  /* ---------- helpers ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fmtDate = iso => new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });

  async function api(url, opts = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) {
      const err = new Error(data.error || 'Request failed');
      err.data = data;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  let toastTimer;
  function toast(msg, isError) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, 3200);
  }

  /* ---------- modal helpers ---------- */
  function openModal(id) { $(id).classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeModals() {
    document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open'));
    document.body.style.overflow = '';
  }
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModals));
  document.querySelectorAll('.modal-bg').forEach(bg =>
    bg.addEventListener('click', e => { if (e.target === bg) closeModals(); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });

  /* ---------- loading ---------- */
  async function loadMeta() {
    const meta = await api('/api/meta');
    $('fBranch').innerHTML = meta.branches.map(b => `<option>${esc(b)}</option>`).join('');
    const cats = ['All', ...meta.categories];
    $('chips').innerHTML = cats.map(c =>
      `<button type="button" class="chip${c === activeCat ? ' active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`
    ).join('');
  }

  async function loadEvents() {
    try {
      events = await api('/api/events');
    } catch (e) {
      $('eventGrid').innerHTML = '<div class="empty">Could not load events. Is the server running?</div>';
      return;
    }
    renderStats();
    renderEvents();
    renderSelect();
    setupCountdown();
  }

  function renderStats() {
    const upcoming = events.filter(e => !e.isPast);
    $('statEvents').textContent = upcoming.length;
    $('statRegs').textContent = events.reduce((n, e) => n + e.registered, 0);
    $('statSeats').textContent = upcoming.reduce((n, e) => n + e.seatsLeft, 0);
  }

  function renderEvents() {
    const q = query.toLowerCase();
    const list = events.filter(e =>
      (activeCat === 'All' || e.category === activeCat) &&
      (!q || (e.title + ' ' + e.venue + ' ' + e.description + ' ' + e.organizer).toLowerCase().includes(q))
    );
    if (!list.length) {
      $('eventGrid').innerHTML = '<div class="empty">No events match your search.</div>';
      return;
    }
    $('eventGrid').innerHTML = list.map(e => {
      const d = new Date(e.date);
      const pct = Math.min(100, Math.round((e.registered / e.capacity) * 100));
      const full = e.seatsLeft === 0;
      const hot = pct >= 80;
      const bg = e.imageUrl ? `style="background-image:url('${esc(e.imageUrl)}')"` : '';
      let action;
      if (e.isPast) action = '<button class="btn" disabled>Event ended</button>';
      else if (full) action = '<button class="btn" disabled>Fully booked</button>';
      else action = `<button class="btn" data-join="${e.id}">Join Event</button>`;
      return `
      <article class="event-card${e.isPast ? ' past' : ''}">
        <div class="event-img cat-${esc(e.category)}" ${bg}>
          <div class="date-badge"><b>${d.getDate()}</b><small>${d.toLocaleString('en-IN', { month: 'short' })}</small></div>
          ${e.featured && !e.isPast ? '<span class="flag">★ FEATURED</span>' : ''}
          ${e.imageUrl ? '' : ICONS[e.category] || ICONS.Other}
        </div>
        <div class="event-details">
          <span class="event-tag">${esc(e.category)}</span>
          <h3>${esc(e.title)}</h3>
          <p class="event-info">🗓️ ${esc(fmtDate(e.date))}<br>📍 ${esc(e.venue)}${e.organizer ? ' · ' + esc(e.organizer) : ''}</p>
          <p class="event-desc">${esc(e.description)}</p>
          <div class="seats">
            <div class="seats-top"><span>${e.registered} registered</span><span>${full ? 'Full' : e.seatsLeft + ' seats left'}</span></div>
            <div class="bar"><i class="${hot ? 'hot' : ''}" style="width:${pct}%"></i></div>
          </div>
          ${action}
        </div>
      </article>`;
    }).join('');
  }

  function renderSelect(keep) {
    const open = events.filter(e => !e.isPast && e.seatsLeft > 0);
    const sel = $('fEvent');
    const prev = keep || sel.value;
    sel.innerHTML = open.length
      ? open.map(e => `<option value="${e.id}">${esc(e.title)} — ${esc(new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }))}</option>`).join('')
      : '<option value="">No events open for registration</option>';
    if (prev && open.some(e => String(e.id) === String(prev))) sel.value = prev;
    $('regBtn').disabled = !open.length;
  }

  /* ---------- countdown ---------- */
  function setupCountdown() {
    const next = events.filter(e => !e.isPast).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    if (!next) { $('countdownWrap').hidden = true; countdownTarget = null; return; }
    countdownTarget = new Date(next.date).getTime();
    $('cdLabel').textContent = 'Next up: ' + next.title;
    $('countdownWrap').hidden = false;
    tick();
  }
  function tick() {
    if (!countdownTarget) return;
    let diff = Math.max(0, countdownTarget - Date.now());
    const d = Math.floor(diff / 86400000); diff -= d * 86400000;
    const h = Math.floor(diff / 3600000); diff -= h * 3600000;
    const m = Math.floor(diff / 60000); diff -= m * 60000;
    const s = Math.floor(diff / 1000);
    $('cdD').textContent = d;
    $('cdH').textContent = String(h).padStart(2, '0');
    $('cdM').textContent = String(m).padStart(2, '0');
    $('cdS').textContent = String(s).padStart(2, '0');
  }
  setInterval(tick, 1000);

  /* ---------- events: filters, join ---------- */
  $('chips').addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    activeCat = b.dataset.cat;
    document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === b));
    renderEvents();
  });
  $('search').addEventListener('input', e => { query = e.target.value.trim(); renderEvents(); });

  $('eventGrid').addEventListener('click', e => {
    const b = e.target.closest('[data-join]');
    if (!b) return;
    renderSelect(b.dataset.join);
    $('fEvent').value = b.dataset.join;
    $('register').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => $('fName').focus({ preventScroll: true }), 600);
  });

  /* ---------- ticket ---------- */
  function ticketHtml(reg, ev) {
    return `
      <div class="ticket" id="ticketPrint">
        <div class="ok">✔ Registration confirmed</div>
        <h4>${esc(ev ? ev.title : 'Event')}</h4>
        <div class="meta">${ev ? '🗓️ ' + esc(fmtDate(ev.date)) + '<br>📍 ' + esc(ev.venue) : ''}</div>
        <div><strong>${esc(reg.name)}</strong><br><small>${esc(reg.rollNo)} · ${esc(reg.branch)} · ${esc(reg.year)} year</small></div>
        <div class="code">${esc(reg.ticketCode)}</div>
        <div class="qr" id="qrBox"></div>
        <small>Show this ticket at the venue entrance.</small>
      </div>`;
  }

  function showTicket(reg, ev) {
    $('ticketBody').innerHTML = ticketHtml(reg, ev);
    if (window.QRCode) {
      try {
        new QRCode($('qrBox'), { text: reg.ticketCode, width: 140, height: 140 });
      } catch (e) { /* QR is optional */ }
    }
    openModal('ticketModal');
  }

  $('printTicket').addEventListener('click', () => {
    const el = $('ticketPrint');
    if (!el) return;
    const w = window.open('', '_blank', 'width=480,height=640');
    if (!w) { toast('Allow pop-ups to print your ticket', true); return; }
    w.document.write(`<html><head><title>Ticket</title><link rel="stylesheet" href="/css/style.css"></head>
      <body style="background:#fff;padding:20px">${el.outerHTML}</body></html>`);
    w.document.close();
    w.onload = () => { w.print(); };
  });

  /* ---------- registration ---------- */
  $('regForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('regError');
    err.classList.remove('show');
    const payload = {
      eventId: $('fEvent').value,
      name: $('fName').value,
      rollNo: $('fRoll').value,
      email: $('fEmail').value,
      phone: $('fPhone').value,
      branch: $('fBranch').value,
      year: $('fYear').value
    };
    const btn = $('regBtn');
    btn.disabled = true;
    btn.textContent = 'Booking…';
    try {
      const out = await api('/api/register', { method: 'POST', body: payload });
      showTicket(out.registration, out.event);
      $('regForm').reset();
      toast('You are in! Ticket ' + out.registration.ticketCode);
      localStorage.setItem('cems_email', payload.email);
      await loadEvents();
    } catch (ex) {
      err.textContent = ex.message + (ex.data && ex.data.ticketCode ? ' (Ticket: ' + ex.data.ticketCode + ')' : '');
      err.classList.add('show');
      if (ex.status === 409) await loadEvents();
    } finally {
      btn.textContent = 'Get my ticket';
      btn.disabled = !$('fEvent').value;
    }
  });

  /* ---------- my tickets ---------- */
  $('myTicketsBtn').addEventListener('click', () => {
    openModal('myModal');
    const saved = localStorage.getItem('cems_email');
    if (saved && !$('lookupEmail').value) {
      $('lookupEmail').value = saved;
      lookup(saved);
    }
  });

  async function lookup(email) {
    $('myList').innerHTML = '<p style="color:#6b7280">Searching…</p>';
    try {
      const regs = await api('/api/my-registrations?email=' + encodeURIComponent(email));
      if (!regs.length) { $('myList').innerHTML = '<p style="color:#6b7280">No registrations found for this email.</p>'; return; }
      $('myList').innerHTML = regs.map(r => `
        <div class="my-item">
          <div>
            <strong>${esc(r.event ? r.event.title : 'Event removed')}</strong>
            <small>${r.event ? esc(fmtDate(r.event.date)) : ''}</small>
            <small>${esc(r.ticketCode)}
              <span class="badge ${r.status === 'cancelled' ? 'cancelled' : r.checkedIn ? 'in' : ''}">
                ${r.status === 'cancelled' ? 'Cancelled' : r.checkedIn ? 'Checked in' : 'Confirmed'}</span></small>
          </div>
          <div style="display:flex;gap:.4rem;flex-direction:column">
            ${r.status === 'confirmed' ? `<button class="btn btn-ghost btn-sm" data-view="${esc(r.ticketCode)}">View</button>
            ${r.checkedIn ? '' : `<button class="btn btn-danger btn-sm" data-cancel="${esc(r.ticketCode)}" data-email="${esc(r.email)}">Cancel</button>`}` : ''}
          </div>
        </div>`).join('');
      $('myList')._regs = regs;
    } catch (ex) {
      $('myList').innerHTML = `<p style="color:#dc2626">${esc(ex.message)}</p>`;
    }
  }

  $('lookupForm').addEventListener('submit', e => {
    e.preventDefault();
    const email = $('lookupEmail').value.trim();
    localStorage.setItem('cems_email', email);
    lookup(email);
  });

  $('myList').addEventListener('click', async e => {
    const v = e.target.closest('[data-view]');
    const c = e.target.closest('[data-cancel]');
    const regs = $('myList')._regs || [];
    if (v) {
      const r = regs.find(x => x.ticketCode === v.dataset.view);
      if (r) { closeModals(); showTicket(r, r.event); }
    }
    if (c && confirm('Cancel this registration? Your seat will be released.')) {
      try {
        await api('/api/cancel', { method: 'POST', body: { ticketCode: c.dataset.cancel, email: c.dataset.email } });
        toast('Registration cancelled');
        lookup(c.dataset.email);
        loadEvents();
      } catch (ex) { toast(ex.message, true); }
    }
  });

  /* ---------- init ---------- */
  $('yr').textContent = new Date().getFullYear();
  loadMeta().then(loadEvents);
  setInterval(loadEvents, 60000); // keep seat counts fresh
})();
