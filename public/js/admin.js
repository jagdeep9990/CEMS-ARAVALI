/* CEMS Aravali - admin dashboard */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = iso => new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });

  let token = sessionStorage.getItem('cems_admin') || '';
  let events = [];
  let editingId = null;

  /* ---------- api ---------- */
  async function api(url, opts = {}) {
    const res = await fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {})
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (res.status === 401 && token) { logout(true); }
    if (!res.ok) {
      const err = new Error(data.error || 'Request failed');
      err.data = data;
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
    toastTimer = setTimeout(() => { t.className = ''; }, 3000);
  }

  /* ---------- auth ---------- */
  function showApp() {
    $('loginView').hidden = true;
    $('appView').hidden = false;
    refreshAll();
  }
  function logout(expired) {
    if (token && !expired) { fetch('/api/admin/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }); }
    token = '';
    sessionStorage.removeItem('cems_admin');
    $('appView').hidden = true;
    $('loginView').hidden = false;
    $('pw').value = '';
    if (expired) { $('loginError').textContent = 'Session expired. Please sign in again.'; $('loginError').classList.add('show'); }
  }

  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('loginError').classList.remove('show');
    try {
      const out = await api('/api/admin/login', { method: 'POST', body: { password: $('pw').value } });
      token = out.token;
      sessionStorage.setItem('cems_admin', token);
      showApp();
    } catch (ex) {
      $('loginError').textContent = ex.message;
      $('loginError').classList.add('show');
    }
  });
  $('logoutBtn').addEventListener('click', () => logout(false));

  /* ---------- tabs ---------- */
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'p-' + t.dataset.tab));
    if (t.dataset.tab === 'regs') loadRegs();
    if (t.dataset.tab === 'dash') loadStats();
  }));

  /* ---------- dashboard ---------- */
  function hbars(items, el) {
    if (!items.length) { el.innerHTML = '<p style="color:#6b7280">No data yet.</p>'; return; }
    el.innerHTML = items.map(i => {
      const pct = i.max ? Math.min(100, Math.round((i.value / i.max) * 100)) : 0;
      return `<div class="hbar"><div class="hbar-top"><span>${esc(i.label)}</span><span>${esc(i.right)}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div></div>`;
    }).join('');
  }

  async function loadStats() {
    const s = await api('/api/admin/stats');
    $('kEvents').textContent = s.totalEvents;
    $('kUpcoming').textContent = s.upcomingEvents;
    $('kRegs').textContent = s.totalRegistrations;
    $('kIn').textContent = s.checkedIn;

    hbars(s.byEvent.map(e => ({
      label: e.title, value: e.registered, max: e.capacity, right: e.registered + ' / ' + e.capacity
    })), $('chByEvent'));

    const branchMax = Math.max(1, ...Object.values(s.byBranch));
    hbars(Object.entries(s.byBranch).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
      label: k, value: v, max: branchMax, right: String(v)
    })), $('chByBranch'));

    const dayMax = Math.max(1, ...s.last7.map(d => d.count));
    $('chSpark').innerHTML = s.last7.map(d => {
      const label = new Date(d.day + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' });
      return `<div><em>${d.count}</em><i style="height:${Math.round((d.count / dayMax) * 90)}%"></i>${label}</div>`;
    }).join('');
  }

  /* ---------- events ---------- */
  async function loadEvents() {
    events = await api('/api/admin/events');
    $('evBody').innerHTML = events.length ? events.map(e => `
      <tr>
        <td class="wrap"><strong>${esc(e.title)}</strong>${e.featured ? ' ★' : ''}</td>
        <td>${esc(e.category)}</td>
        <td>${esc(fmt(e.date))}${e.isPast ? ' <small style="color:#9ca3af">(past)</small>' : ''}</td>
        <td>${esc(e.venue)}</td>
        <td>${e.registered} / ${e.capacity}</td>
        <td><div class="actions">
          <button class="btn btn-ghost btn-sm" data-edit="${e.id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-del="${e.id}">Delete</button>
        </div></td>
      </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:#6b7280">No events yet.</td></tr>';

    $('regFilter').innerHTML = '<option value="">All events</option>' +
      events.map(e => `<option value="${e.id}">${esc(e.title)}</option>`).join('');
  }

  // datetime-local wants local time "YYYY-MM-DDTHH:mm"
  function toLocalInput(iso) {
    const d = new Date(iso);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  function openEditor(ev) {
    editingId = ev ? ev.id : null;
    $('evModalTitle').textContent = ev ? 'Edit event' : 'New event';
    $('evError').classList.remove('show');
    $('eTitle').value = ev ? ev.title : '';
    $('eCat').value = ev ? ev.category : 'Technical';
    $('eCap').value = ev ? ev.capacity : 100;
    $('eDate').value = ev ? toLocalInput(ev.date) : '';
    $('eVenue').value = ev ? ev.venue : '';
    $('eOrg').value = ev ? ev.organizer : '';
    $('eDesc').value = ev ? ev.description : '';
    $('eImg').value = ev ? ev.imageUrl : '';
    $('eFeat').checked = ev ? !!ev.featured : false;
    $('evModal').classList.add('open');
  }
  function closeEditor() { $('evModal').classList.remove('open'); }

  $('newEventBtn').addEventListener('click', () => openEditor(null));
  $('evClose').addEventListener('click', closeEditor);
  $('evModal').addEventListener('click', e => { if (e.target === $('evModal')) closeEditor(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeEditor(); });

  $('evBody').addEventListener('click', async e => {
    const ed = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-del]');
    if (ed) openEditor(events.find(x => x.id === Number(ed.dataset.edit)));
    if (del) {
      const ev = events.find(x => x.id === Number(del.dataset.del));
      if (!ev || !confirm(`Delete "${ev.title}" and its ${ev.registered} registration(s)? This cannot be undone.`)) return;
      try {
        await api('/api/admin/events/' + ev.id, { method: 'DELETE' });
        toast('Event deleted');
        refreshAll();
      } catch (ex) { toast(ex.message, true); }
    }
  });

  $('evForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('evError').classList.remove('show');
    const body = {
      title: $('eTitle').value,
      category: $('eCat').value,
      capacity: $('eCap').value,
      date: $('eDate').value ? new Date($('eDate').value).toISOString() : '',
      venue: $('eVenue').value,
      organizer: $('eOrg').value,
      description: $('eDesc').value,
      imageUrl: $('eImg').value,
      featured: $('eFeat').checked
    };
    try {
      if (editingId) await api('/api/admin/events/' + editingId, { method: 'PUT', body });
      else await api('/api/admin/events', { method: 'POST', body });
      closeEditor();
      toast('Event saved');
      refreshAll();
    } catch (ex) {
      $('evError').textContent = ex.message;
      $('evError').classList.add('show');
    }
  });

  /* ---------- registrations ---------- */
  async function loadRegs() {
    const id = $('regFilter').value;
    const regs = await api('/api/admin/registrations' + (id ? '?eventId=' + id : ''));
    $('regBody').innerHTML = regs.length ? regs.map(r => `
      <tr>
        <td><code>${esc(r.ticketCode)}</code></td>
        <td class="wrap">${esc(r.eventTitle)}</td>
        <td>${esc(r.name)}</td>
        <td>${esc(r.rollNo)}</td>
        <td>${esc(r.branch)} ${esc(r.year)}</td>
        <td>${esc(r.email)}</td>
        <td>${esc(r.phone)}</td>
        <td><span class="badge ${r.status === 'cancelled' ? 'cancelled' : r.checkedIn ? 'in' : ''}">
          ${r.status === 'cancelled' ? 'Cancelled' : r.checkedIn ? 'Checked in' : 'Confirmed'}</span></td>
        <td><button class="btn btn-danger btn-sm" data-rdel="${r.id}">Remove</button></td>
      </tr>`).join('') : '<tr><td colspan="9" style="text-align:center;color:#6b7280">No registrations yet.</td></tr>';
  }
  $('regFilter').addEventListener('change', loadRegs);
  $('regBody').addEventListener('click', async e => {
    const b = e.target.closest('[data-rdel]');
    if (!b || !confirm('Remove this registration?')) return;
    try {
      await api('/api/admin/registrations/' + b.dataset.rdel, { method: 'DELETE' });
      toast('Registration removed');
      loadRegs();
      loadEvents();
    } catch (ex) { toast(ex.message, true); }
  });

  $('csvLink').addEventListener('click', e => {
    e.preventDefault();
    const id = $('regFilter').value;
    window.location.href = '/api/admin/export.csv?token=' + encodeURIComponent(token) + (id ? '&eventId=' + id : '');
  });

  /* ---------- check-in ---------- */
  $('checkinForm').addEventListener('submit', async e => {
    e.preventDefault();
    const box = $('ciResult');
    box.className = 'checkin-result';
    try {
      const out = await api('/api/admin/checkin', { method: 'POST', body: { ticketCode: $('ciCode').value } });
      box.className = 'checkin-result ok';
      box.innerHTML = `✔ <strong>${esc(out.registration.name)}</strong> checked in<br><small>${esc(out.eventTitle)} · ${esc(out.registration.rollNo)}</small>`;
      $('ciCode').value = '';
      $('ciCode').focus();
    } catch (ex) {
      box.className = 'checkin-result bad';
      box.textContent = '✖ ' + ex.message + (ex.data && ex.data.registration ? ' (' + ex.data.registration.name + ')' : '');
    }
  });

  /* ---------- init ---------- */
  async function refreshAll() {
    try {
      const meta = await (await fetch('/api/meta')).json();
      $('eCat').innerHTML = meta.categories.map(c => `<option>${esc(c)}</option>`).join('');
      await Promise.all([loadStats(), loadEvents()]);
    } catch (ex) { /* 401 handled in api() */ }
  }

  if (token) showApp();
})();
