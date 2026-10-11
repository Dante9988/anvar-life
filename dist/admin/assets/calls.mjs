const content = document.querySelector('#content');
const notice = document.querySelector('#notice');
const account = document.querySelector('#account');
const dialog = document.querySelector('#call-dialog');
const detail = document.querySelector('#detail');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = ['ringing', 'answered', 'missed', 'unknown'];
const dispositions = ['connected', 'no_answer', 'voicemail', 'callback_requested', 'not_interested', 'do_not_contact', 'wrong_number', 'replied'];
const stages = ['qualified', 'quoted', 'application', 'submitted', 'issued', 'paid', 'active'];
const state = { session: null, view: 'calls', calls: [], total: 0, page: 1, pageSize: 25, status: '', vendor: '', vendors: new Map(), capabilities: null, production: null, loadId: 0, detailId: 0, selected: null, saving: false, controllers: new Set() };
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const label = value => String(value || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const show = value => value === null || value === undefined || value === '' ? 'Unknown' : escape(value);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() : 'Unknown';
const financialAccess = () => ['owner', 'admin'].includes(state.session?.user?.role);
const money = cents => Number.isSafeInteger(cents) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100) : 'Unknown';
const date = value => { const d = value ? new Date(value) : null; return d && Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d) : 'Unknown'; };
const duration = seconds => Number.isInteger(seconds) && seconds >= 0 ? `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s` : 'Unknown duration';
const shortId = value => UUID.test(value || '') ? value.slice(0, 8) : 'unknown';
const localDate = value => { const d = value ? new Date(value) : null; return d && Number.isFinite(d.getTime()) ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''; };
const fact = (name, value) => `<div><dt>${escape(name)}</dt><dd>${show(value)}</dd></div>`;
const statusBadge = status => `<span class="badge ${status === 'missed' ? 'warn' : status === 'answered' ? '' : 'muted'}">${escape(label(statuses.includes(status) ? status : 'unknown'))}</span>`;
const vendorName = call => call.vendor_name || (call.vendor_source_id ? `Vendor record ${shortId(call.vendor_source_id)}` : 'Unknown vendor');
const agentName = call => call.mapped_agent_email || call.mapped_agent_name || (call.mapped_agent_id ? `Mapped agent ${shortId(call.mapped_agent_id)}` : 'Agent not mapped');
const leadLink = call => UUID.test(call.lead_id || '') ? `<a href="/admin/leads?lead=${encodeURIComponent(call.lead_id)}">${escape(call.lead_name || `Linked lead ${shortId(call.lead_id)}`)}</a>` : '<span class="quiet">No linked lead</span>';
const recording = call => call.recording_status === 'available_unreviewed' ? 'Reference reported · unreviewed' : 'Not provided';
const isDnc = data => data.call.do_not_contact === true || data.call.disposition === 'do_not_contact' || data.call.lead_do_not_contact === true || data.tasks?.some(t => t.status === 'suppressed' && t.hold_reason === 'do_not_contact');
const followUpText = call => call.do_not_contact || call.lead_do_not_contact || call.disposition === 'do_not_contact' ? 'Do not contact · follow-up stopped' : call.reply_received || call.disposition === 'replied' ? 'Reply received · follow-up stopped' : ['not_interested', 'wrong_number'].includes(call.disposition) ? 'Follow-up stopped' : call.callback_at ? `Callback held · ${date(call.callback_at)}` : 'No callback scheduled';
function message(text, error = false) { notice.innerHTML = text ? `<div class="notice${error ? ' error' : ''}">${escape(text)}</div>` : ''; }
function clearPrivateState() {
  state.loadId++; state.detailId++; state.session = null; state.calls = []; state.vendors.clear(); state.total = 0; state.page = 1; state.status = ''; state.vendor = ''; state.production = null; state.capabilities = null; state.selected = null; state.saving = false;
  for (const controller of state.controllers) controller.abort();
  state.controllers.clear(); detail.replaceChildren(); content.replaceChildren(); notice.replaceChildren();
  if (dialog.open) dialog.close();
  account.textContent = 'Secure workspace';
  document.querySelector('[data-view="production"]').hidden = true;
}
function accessScreen(kind, text) {
  clearPrivateState(); content.setAttribute('aria-busy', 'false');
  content.innerHTML = `<div class="state-card"><div class="lock-icon" aria-hidden="true">◇</div><div class="eyebrow">Benefits with Veterans</div><h1>${kind === 'denied' ? 'Access is restricted' : kind === 'unavailable' ? 'Workspace not connected' : 'A secure space for your team'}</h1><p>${escape(text)}</p>${kind === 'unavailable' ? '<button class="btn" id="retry-session">Check connection again</button>' : '<a class="btn" href="/api/auth/google">Continue with Google Workspace ↗</a>'}<p class="quiet" style="margin-top:24px">Invitation required. An active, explicitly assigned agency role is checked on every request.</p><a class="quiet" href="/">Return to the public website</a></div>`;
  document.querySelector('#retry-session')?.addEventListener('click', boot);
}
async function api(path, options = {}) {
  const controller = new AbortController(); state.controllers.add(controller);
  const timer = setTimeout(() => controller.abort(), 15000);
  const mutation = options.method && options.method !== 'GET';
  try {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': state.session?.csrfToken || '' } : {}) }, signal: controller.signal });
    let body;
    try { body = await response.json(); } catch (error) { if (controller.signal.aborted) throw error; body = null; }
    if (!response.ok) {
      const error = new Error(body?.error?.message || body?.message || 'The secure request could not be completed. Please try again.');
      error.status = response.status; error.uncertain = mutation && response.status >= 500;
      if (response.status === 401) accessScreen('signedout', 'Your session has expired. Sign in again to continue.');
      throw error;
    }
    if (!body || typeof body !== 'object') { const error = new Error(mutation ? 'The save response was incomplete. Reload the record before trying again.' : 'The server returned an incomplete response. Please try again.'); error.uncertain = mutation; throw error; }
    return body;
  } catch (error) {
    if (controller.signal.aborted || error instanceof TypeError) { const interrupted = new Error(mutation ? 'We could not confirm this change. Reload the record and check it before trying again; the server may have saved it.' : 'The secure connection timed out or was interrupted. Please try again.'); interrupted.uncertain = !!mutation; throw interrupted; }
    throw error;
  } finally { clearTimeout(timer); state.controllers.delete(controller); }
}
function loading(text) { content.setAttribute('aria-busy', 'true'); content.innerHTML = `<div class="state-card"><div class="loading-ring" aria-hidden="true"></div><h1>${escape(text)}</h1><p>Retrieving authorized records securely.</p></div>`; }
function loadError(error) { content.setAttribute('aria-busy', 'false'); content.innerHTML = `<div class="state-card"><h1>${error.status === 403 ? 'This view is restricted' : 'We couldn’t load this view'}</h1><p>${escape(error.message)}</p><button class="btn" id="reload-view">Try again</button></div>`; document.querySelector('#reload-view').addEventListener('click', () => navigate(state.view)); }
function renderAccount() {
  const user = state.session.user;
  account.innerHTML = `<div>${escape(user.name || user.email)}<small>${escape(label(user.role))}</small></div><button id="logout">Sign out</button>`;
  document.querySelector('[data-view="production"]').hidden = !financialAccess();
  document.querySelector('#logout').addEventListener('click', async event => {
    const button = event.target; button.disabled = true;
    try { const result = await api('/api/auth/logout', { method: 'POST', body: '{}' }); accessScreen('signedout', result.remoteRevocationConfirmed === false ? 'This browser is signed out, but remote session revocation could not be confirmed. Other sessions may remain active.' : 'You have been signed out. Sign in with your invited Google Workspace account to continue.'); }
    catch (error) { if (state.session) { button.disabled = false; message(`Sign out could not be confirmed. ${error.message}`, true); } }
  });
}
async function boot() {
  clearPrivateState(); const request = ++state.loadId; loading('Opening your workspace');
  try {
    const session = await api('/api/admin/session');
    if (request !== state.loadId) return;
    if (session.authenticated !== true || !['owner', 'admin', 'agent'].includes(session.user?.role) || !session.csrfToken) return accessScreen('denied', 'Your account does not have a supported agency role or a complete secure session. Ask the agency owner to review your access.');
    state.session = session; renderAccount();
    const loaded = await navigate('calls');
    const callId = new URLSearchParams(location.search).get('call');
    if (loaded && state.session === session && UUID.test(callId || '')) await openCall(callId);
  } catch (error) { if (error.status !== 401 && request === state.loadId) accessScreen(error.status === 403 ? 'denied' : 'unavailable', error.message); }
}
async function navigate(view) {
  if (!state.session || (view === 'production' && !financialAccess())) return false;
  if (dialog.open) dialog.close();
  state.view = view; const request = ++state.loadId; message(''); loading(view === 'production' ? 'Loading production economics' : 'Loading call history');
  document.querySelectorAll('[data-view]').forEach(el => { const active = el.dataset.view === view; el.classList.toggle('active', active); if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
  try {
    if (view === 'calls') {
      const params = new URLSearchParams({ page: String(state.page), status: state.status, vendor: state.vendor });
      const [data, capabilities] = await Promise.all([api(`/api/admin/calls?${params}`), api('/api/admin/integrations/kixie')]);
      if (request !== state.loadId || !state.session) return false;
      if (!Array.isArray(data.calls) || !Number.isSafeInteger(data.total) || !Number.isSafeInteger(data.pageSize) || data.pageSize < 1) throw new Error('The call response was incomplete. Please try again.');
      state.calls = data.calls; state.total = data.total; state.pageSize = data.pageSize; state.capabilities = capabilities;
      for (const call of state.calls) if (UUID.test(call.vendor_source_id || '')) state.vendors.set(call.vendor_source_id, vendorName(call));
      renderCalls();
    } else {
      const data = await api('/api/admin/production');
      if (request !== state.loadId || !state.session) return false;
      if (!Array.isArray(data.policies) || !data.summary) throw new Error('The production response was incomplete. Please try again.');
      state.production = data; renderProduction();
    }
    content.setAttribute('aria-busy', 'false'); return true;
  } catch (error) { if (request === state.loadId && state.session) loadError(error); return false; }
}
const heading = (eyebrow, title, description) => `<div class="page-heading"><div><div class="eyebrow">${escape(eyebrow)}</div><h1>${escape(title)}</h1><p>${escape(description)}</p></div><span class="badge muted">${financialAccess() ? 'Private agency workspace' : 'Authorized calls only'}</span></div>`;
function setupBanner() {
  return `<section class="setup-banner" aria-label="Kixie setup status"><div><span class="badge warn">Kixie · live connection not verified</span><h2>Prepared for the next conversation.</h2><p>Live collection, Kixie click-to-call, recording playback, and follow-up sending are disabled in this release. ${state.capabilities?.ingestionEnabled === true ? 'Fictional-preview ingestion is configured; this does not verify a live account.' : 'Integration setup is still required.'}</p></div><button class="btn secondary" disabled aria-describedby="calling-gate">Kixie click-to-call unavailable</button><span id="calling-gate" hidden>Setup and live account verification are required. No calls can be placed here.</span></section>`;
}
function renderCalls() {
  content.innerHTML = heading('Every conversation, carefully recorded', 'Call workspace', 'Inbound calls, vendor attribution, and held next steps. Call activity never establishes a sale or permission to contact.') + setupBanner() +
    `<section class="panel"><div class="panel-header"><div><h2>Inbound call history</h2><span class="quiet">${count(state.total)} authorized records</span></div><button class="btn secondary small" id="refresh-calls">Refresh</button></div><form id="call-filters" class="toolbar"><label>Call status<select name="status"><option value="">All call statuses</option>${statuses.map(s => `<option value="${s}" ${state.status === s ? 'selected' : ''}>${label(s)}</option>`).join('')}</select></label><label>Vendor attribution<select name="vendor"><option value="">All vendors</option>${[...state.vendors.entries()].map(([id, name]) => `<option value="${escape(id)}" ${state.vendor === id ? 'selected' : ''}>${escape(name)}</option>`).join('')}</select></label><button class="btn" type="submit">Apply filters</button></form><div class="call-summary" aria-label="Call statuses on this page">${statuses.map(s => `<span class="summary-chip"><b>${state.calls.filter(c => c.status === s).length}</b> ${label(s)}</span>`).join('')}</div><p class="table-caption">Status counts cover this page only. Vendor choices come from authorized calls loaded in this session.</p>${state.calls.length ? `<div class="table-wrap call-table-wrap"><table class="call-table"><thead><tr><th scope="col">Caller / time</th><th scope="col">Vendor / agent</th><th scope="col">Call outcome</th><th scope="col">Lead / next step</th><th scope="col">Evidence</th></tr></thead><tbody>${state.calls.map(call => `<tr><td data-label="Caller"><button class="lead-name call-link" data-call="${escape(call.id)}">${escape(call.from_number || `Call ${shortId(call.id)}`)}</button><span class="subtext">${escape(date(call.started_at || call.last_event_at))}</span><span class="subtext">Inbound · ${escape(duration(call.duration_seconds))}</span></td><td data-label="Vendor / agent">${escape(vendorName(call))}<span class="subtext">${escape(agentName(call))}</span></td><td data-label="Call outcome">${statusBadge(call.status)}<span class="subtext">${call.disposition ? escape(label(call.disposition)) : 'Disposition not recorded'}</span></td><td data-label="Lead / next step">${leadLink(call)}<span class="subtext ${call.do_not_contact || call.lead_do_not_contact || call.disposition === 'do_not_contact' ? 'danger-line' : ''}">${escape(followUpText(call))}</span></td><td data-label="Evidence"><span class="subtext">Recording: ${escape(recording(call))}</span><span class="subtext">Consent: Unknown</span></td></tr>`).join('')}</tbody></table></div><div class="pagination"><span class="quiet">Page ${state.page} of ${Math.max(1, Math.ceil(state.total / state.pageSize))}</span><div><button class="btn secondary small" id="previous" ${state.page <= 1 ? 'disabled' : ''}>Previous</button><button class="btn secondary small" id="next" ${state.page * state.pageSize >= state.total ? 'disabled' : ''}>Next</button></div></div>` : `<div class="empty"><strong>${state.status || state.vendor ? 'No matching calls' : 'A clear place for your call history.'}</strong>${state.status || state.vendor ? 'Try another filter to review your authorized records.' : 'No call records were returned. Live collection has not been enabled.'}</div>`}</section><p class="quiet">Agent mapping identifies a call handler. It does not assign a lead or verify licensing. Unknown attribution and consent remain unknown.</p>`;
  document.querySelector('#refresh-calls').addEventListener('click', () => navigate('calls'));
  document.querySelector('#call-filters').addEventListener('submit', event => { event.preventDefault(); const form = new FormData(event.target); state.status = form.get('status'); state.vendor = form.get('vendor'); state.page = 1; navigate('calls'); });
  document.querySelectorAll('[data-call]').forEach(button => button.addEventListener('click', () => openCall(button.dataset.call)));
  document.querySelector('#previous')?.addEventListener('click', () => { state.page--; navigate('calls'); });
  document.querySelector('#next')?.addEventListener('click', () => { state.page++; navigate('calls'); });
}
function bindClose() { detail.querySelector('[data-close]')?.addEventListener('click', () => dialog.close()); }
function detailHeading(title) { return `<div class="dialog-heading"><div><div class="eyebrow">Private inbound call</div><h2 id="detail-title">${escape(title)}</h2></div><button class="close-btn" data-close aria-label="Close call">×</button></div>`; }
async function openCall(id) {
  if (!state.session || !UUID.test(id || '')) return;
  const request = ++state.detailId; state.selected = id; state.saving = false;
  detail.innerHTML = detailHeading('Loading call') + '<p class="inline-loading">Retrieving this authorized record…</p>'; bindClose(); if (!dialog.open) dialog.showModal();
  try {
    const data = await api(`/api/admin/calls/${encodeURIComponent(id)}`);
    if (request !== state.detailId || !state.session || !dialog.open) return;
    if (!data.call || data.call.id !== id || !Array.isArray(data.notes) || !Array.isArray(data.tasks)) throw new Error('The call response was incomplete. Reload the record before editing.');
    renderDetail(data);
  } catch (error) {
    if (request !== state.detailId || !state.session || !dialog.open) return;
    detail.innerHTML = detailHeading(error.status === 403 || error.status === 404 ? 'Call unavailable' : 'Unable to load call') + `<div class="call-details-error"><p>${escape(error.message)}</p><button id="retry-call" class="btn secondary">Reload record</button></div>`; bindClose(); document.querySelector('#retry-call').addEventListener('click', () => openCall(id));
  }
}
function identityReview(data) {
  if (state.session?.user?.role !== 'owner' || data.call.lead_id) return '';
  const candidates = (Array.isArray(data.candidates) ? data.candidates : []).filter(c => UUID.test(c.lead_id || ''));
  return `<section class="panel"><h3>Review caller identity</h3><p class="quiet">A phone match alone is insufficient. Verify the person against the lead record before linking. This does not merge records or establish contact consent.</p><form id="identity-link"><fieldset>${candidates.length ? `<label class="field">Possible lead matches<select name="candidate"><option value="">Review a candidate or enter a lead ID</option>${candidates.map(c => `<option value="${escape(c.lead_id)}">${escape(c.name || 'Name unknown')} · ${escape(c.state || 'State unknown')} · ${escape(label(c.product))}</option>`).join('')}</select></label>` : '<p class="quiet">No possible lead matches were returned. Open the lead workspace to identify the correct person.</p>'}<label class="field">Verified lead ID<input name="leadId" required maxlength="36" pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}" placeholder="Lead record UUID" autocomplete="off"></label><label class="field">Identity verification reason<textarea name="reason" required minlength="8" maxlength="500" placeholder="How did you verify this person? Do not include sensitive identity details."></textarea></label><button class="btn secondary" type="submit">Confirm verified lead link</button></fieldset></form></section>`;
}
function renderDetail(data) {
  const call = data.call; const dnc = isDnc(data);
  detail.innerHTML = detailHeading(call.from_number || `Call ${shortId(call.id)}`) + `<div class="call-status">${statusBadge(call.status)}<span class="badge muted">Consent unknown</span>${dnc ? '<span class="badge danger">Do not contact</span>' : '<span class="badge warn">Follow-up sending disabled</span>'}</div><div id="detail-message" role="status" aria-live="polite"></div><div class="split call-detail-grid"><div><section class="panel"><h3>Conversation & attribution</h3><dl class="facts">${fact('Started', date(call.started_at))}${fact('Duration', duration(call.duration_seconds))}${fact('Tracking number', call.to_number)}${fact('Vendor source', vendorName(call))}${fact('Mapped agent', agentName(call))}${fact('Ended', call.ended_at ? date(call.ended_at) : 'Not recorded')}<div class="full"><dt>Linked lead</dt><dd>${leadLink(call)}</dd></div></dl><p class="quiet controls-note">Mapped agent and lead assignment are separate. A call does not verify eligibility or production.</p></section>${identityReview(data)}<section class="panel"><h3>Recording & consent</h3><dl class="facts">${fact('Recording status', recording(call))}${fact('Contact consent', 'Unknown')}</dl><p class="quiet controls-note">No recording URLs or transcripts are shown. A recording or answered call never establishes consent.</p><div class="detail-actions"><button class="btn secondary small" disabled>Recording playback unavailable</button><button class="btn secondary small" disabled>Kixie click-to-call unavailable</button></div></section><section class="panel"><h3>Recorded notes</h3>${data.notes.length ? `<ul class="activity">${data.notes.map(note => `<li><div class="note-body">${escape(note.body)}</div><time>${escape(date(note.created_at))}</time></li>`).join('')}</ul>` : '<p class="quiet">No internal notes have been recorded.</p>'}</section></div><div><section class="panel"><h3>Disposition & next step</h3><div class="callback-notice">${dnc ? '<p class="danger-line">Do not contact. Follow-up is suppressed.</p><p>Changing the disposition does not clear a recorded do-not-contact preference.</p>' : call.reply_received ? '<p>Reply received. Follow-up is stopped. No outreach is sent.</p>' : '<p>Preparation only. Callbacks remain held and no outreach is sent.</p>'}</div><form id="call-update"><fieldset><label class="field">Call disposition<select name="disposition"><option value="" ${call.disposition ? 'disabled' : ''}>Not recorded</option>${dispositions.map(d => `<option value="${d}" ${call.disposition === d ? 'selected' : ''}>${label(d)}</option>`).join('')}</select></label><label class="field">Callback date & time (your local time)<input type="datetime-local" name="callback_at" value="${escape(localDate(call.callback_at))}" ${dnc ? 'disabled' : ''}></label><label class="field check"><input type="checkbox" name="follow_up_hold" ${call.follow_up_hold !== false || dnc ? 'checked' : ''} ${dnc ? 'disabled' : ''}> Keep a manual follow-up hold</label><p class="quiet">Removing a manual hold does not enable sending. Consent review and the release-wide sending gate still apply.</p><label class="field">Add an internal note<textarea name="note" maxlength="2000" placeholder="A concise outcome or next step"></textarea></label><p class="quiet">Do not include health, financial account, identity, or other sensitive personal details.</p><button class="btn" type="submit">Save call update</button></fieldset></form></section><section class="panel"><h3>Held follow-up tasks</h3>${data.tasks.length ? `<ul class="task-list">${data.tasks.map(task => `<li><span class="badge ${task.status === 'suppressed' ? 'danger' : 'warn'}">${escape(label(task.status))}</span><strong>${escape(label(task.hold_reason))}</strong><span class="subtext">Callback · ${escape(date(task.due_at))}</span></li>`).join('')}</ul>` : `<p class="quiet">${call.lead_id ? 'No follow-up task has been recorded.' : 'A callback task requires a verified linked lead. An unlinked call does not create outreach.'}</p>`}<p class="quiet">Do-not-contact, replies, and unsuitable-number outcomes stop follow-up. Open follow-ups remain held or suppressed; no call, email, or text is sent here.</p></section></div></div>`;
  bindClose();
  const form = document.querySelector('#call-update');
  form.elements.disposition.addEventListener('change', () => {
    const stopped = dnc || form.elements.disposition.value === 'do_not_contact';
    form.elements.callback_at.disabled = stopped; form.elements.follow_up_hold.disabled = stopped;
    if (stopped) form.elements.follow_up_hold.checked = true;
  });
  form.addEventListener('submit', event => { event.preventDefault(); saveCall(data, form); });
  const linkForm = document.querySelector('#identity-link');
  if (linkForm) {
    linkForm.elements.candidate?.addEventListener('change', () => { linkForm.elements.leadId.value = linkForm.elements.candidate.value; });
    linkForm.addEventListener('submit', event => {
      event.preventDefault();
      const leadId = linkForm.elements.leadId.value.trim(); const reason = linkForm.elements.reason.value.trim();
      if (!UUID.test(leadId) || reason.length < 8) { document.querySelector('#detail-message').innerHTML = '<p class="notice error">Enter a valid lead ID and an identity verification reason of at least 8 characters.</p>'; return; }
      persistCall(call, { leadId, reason }, `/api/admin/calls/${encodeURIComponent(call.id)}/link`, 'POST', 'Verified lead link saved. No outreach was sent.');
    });
  }
}
async function saveCall(data, form) {
  if (state.saving || !state.session || !dialog.open) return;
  const call = data.call;
  const values = new FormData(form); const disposition = values.get('disposition'); const callback = values.get('callback_at');
  const patch = {};
  if (disposition && disposition !== call.disposition) patch.disposition = disposition;
  if (!isDnc(data) && disposition !== 'do_not_contact') {
    const callbackAt = callback ? new Date(callback).toISOString() : null;
    if (callbackAt !== (call.callback_at ? new Date(call.callback_at).toISOString() : null)) patch.callback_at = callbackAt;
    const hold = values.get('follow_up_hold') === 'on';
    if (hold !== call.follow_up_hold) patch.follow_up_hold = hold;
  }
  const note = String(values.get('note') || '').trim(); if (note) patch.note = note;
  const result = document.querySelector('#detail-message');
  if (!Object.keys(patch).length) { result.innerHTML = '<p class="notice">No changes to save. Choose an outcome, update a callback, or add a note.</p>'; return; }
  await persistCall(call, patch, `/api/admin/calls/${encodeURIComponent(call.id)}`, 'PATCH', 'Call update saved. No outreach was sent.');
}
async function persistCall(call, patch, path, method, success) {
  if (state.saving || !state.session || !dialog.open || state.selected !== call.id) return;
  const request = state.detailId; const result = document.querySelector('#detail-message');
  state.saving = true; detail.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = true; }); result.innerHTML = '<p class="inline-loading">Saving your update…</p>';
  try {
    const saved = await api(path, { method, body: JSON.stringify(patch) });
    if (saved.call?.id !== call.id) { const error = new Error('The save response was incomplete. Reload the record before trying again.'); error.uncertain = true; throw error; }
    if (request !== state.detailId || !state.session || !dialog.open) return;
    // A confirmed response is never retried automatically. Re-read authoritative state.
    await openCall(call.id);
    if (state.session && state.selected === call.id && dialog.open) {
      message(`${success} Refresh the history when you finish reviewing this call.`);
      const node = document.querySelector('#detail-message'); if (node) node.innerHTML = `<p class="notice">${escape(success)}</p>`;
    }
  } catch (error) {
    if (request !== state.detailId || !state.session || !dialog.open) return;
    result.innerHTML = `<p class="notice error">${escape(error.message)}</p>${error.uncertain ? '<button class="btn secondary" id="reload-uncertain">Reload record before editing</button>' : ''}`;
    if (error.uncertain) document.querySelector('#reload-uncertain').addEventListener('click', () => openCall(call.id));
    else { state.saving = false; detail.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = false; }); }
  }
}
function financeMetric(title, cents, note) { return `<div class="metric"><div class="metric-label">${escape(title)}</div><div class="metric-value">${money(cents)}</div><div class="metric-note">${escape(note)}</div></div>`; }
function renderProduction() {
  const data = state.production; const summary = data.summary;
  content.innerHTML = heading('Recorded production, separate from activity', 'Production economics', 'Review explicit policy stages and verified financial facts. A conversation, quote, or estimate is never recognized revenue.') +
    `<section class="panel"><div class="panel-header"><div><h2>Policy progression</h2><span class="quiet">${count(data.policies.length)} authorized production records</span></div><button class="btn secondary small" id="refresh-production">Refresh</button></div><ol class="stage-strip">${stages.map((stage, i) => `<li><span class="stage-number">${String(i + 1).padStart(2, '0')}</span><span>${label(stage)}</span><strong>${data.policies.filter(p => p.status === stage).length}</strong></li>`).join('')}</ol><p class="quiet">Each number is a current, explicitly recorded production stage. Qualified, quoted, application, and submitted are not issued or paid policies. Active status is not a substitute for a dated retention check.</p>${data.policies.length ? `<div class="table-wrap"><table class="production-table"><thead><tr><th scope="col">Policy reference</th><th scope="col">Product / carrier</th><th scope="col">Stage</th><th scope="col">Verification</th></tr></thead><tbody>${data.policies.map(policy => `<tr><td>${show(policy.external_reference)}<span class="subtext">${UUID.test(policy.lead_id || '') ? `<a href="/admin/leads?lead=${encodeURIComponent(policy.lead_id)}">Open linked lead</a>` : 'No linked lead'}</span></td><td>${escape(label(policy.product))}<span class="subtext">${show(policy.carrier)}</span></td><td><span class="badge muted">${escape(label(policy.status))}</span></td><td>${policy.status_verified_at ? escape(date(policy.status_verified_at)) : 'Not verified'}<span class="subtext">${policy.verification_reference ? 'Verification reference recorded' : 'No verification reference'}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><strong>No policy production recorded.</strong>No sales or policy stages are inferred from inbound call activity.</div>'}</section><section class="panel"><h2>Verified financial ledger</h2><p class="quiet">USD only. These are verified, recorded ledger subtotals, not complete realized revenue. Zero means no included verified entry; missing evidence remains unknown. Estimates never enter these totals.</p><div class="finance-grid">${financeMetric('Commission paid', summary.paidCents, 'Verified paid · excludes separately recorded advances')}${financeMetric('Commission earned', summary.earnedCents, 'Verified earned · separate from cash received')}${financeMetric('Commission advances', summary.advancedCents, 'Verified advances · may be subject to chargeback')}${financeMetric('Chargebacks', summary.chargebackCents, 'Verified reversals recorded separately')}${financeMetric('Vendor lead costs', summary.vendorCostCents, 'Recorded purchased-lead costs')}${financeMetric('Telephony costs', summary.telephonyCostCents, 'Recorded calling and usage costs')}</div><div class="financial-context"><p>Recorded ledger net<strong>${money(summary.recordedLedgerNetCents ?? summary.netCashCents)}</strong></p><p>Cash ROI<strong>Awaiting reconciliation</strong></p></div><p class="section-note" style="margin-top:20px">Recorded ledger net = paid + advances − chargebacks − vendor costs − telephony costs. Earned amounts are not added again. Paid and advance classifications must be mutually exclusive. Complete cash and cost reconciliation is required before ROI can be reported. ${count(summary.policiesWithoutCashEvidence)} policies lack cash evidence; missing or unverified costs remain unknown.</p></section><section class="panel illustration"><div class="eyebrow">Whole-life illustration only</div><h2>Understand the commission math.</h2><p class="quiet">A planning illustration with the stated assumptions: issue age 60 or younger at 39%; over 60 at 65%; a 75% advance on commission. This is not a carrier quote, verified compensation schedule, or booked production. It does not apply to term or IUL.</p><div class="illustration-grid"><form id="illustration-form" class="illustration-form"><label>Issue age<input name="age" type="number" min="18" max="120" step="1" required value="61"></label><label>Monthly premium (USD)<input name="premium" type="number" min="0" max="100000" step="0.01" required value="75"></label><button class="btn secondary" type="submit">Calculate illustration</button><p class="quiet full">Example values are mathematical inputs, not a client or policy record. Nothing is saved.</p></form><div class="estimate-results" id="illustration-results" role="status" aria-live="polite"></div></div></section><section class="panel"><h2>Retention, with unknowns visible</h2><p class="quiet">30-, 60-, and 90-day retention use dated, verified active/inactive checks. An issued policy with no check remains unknown.</p><div class="retention-grid">${[30, 60, 90].map(days => { const row = data.retention?.find(r => r.days === days); return `<article><h3>${days} days</h3><p><strong>${row && typeof row.rate === 'number' && Number.isFinite(row.rate) ? `${(row.rate * 100).toFixed(1)}%` : 'Unknown'}</strong> verified active rate</p><p>${count(row?.active)} active / ${count(row?.verified)} verified<br>${count(row?.unknown)} unknown · ${count(row?.eligible)} eligible</p></article>`; }).join('')}</div></section>`;
  document.querySelector('#refresh-production').addEventListener('click', () => navigate('production'));
  const form = document.querySelector('#illustration-form');
  form.addEventListener('submit', event => { event.preventDefault(); renderIllustration(form); }); renderIllustration(form);
}
function renderIllustration(form) {
  const age = Number(form.elements.age.value); const premium = Number(form.elements.premium.value); const output = document.querySelector('#illustration-results');
  if (!Number.isInteger(age) || age < 18 || age > 120 || !Number.isFinite(premium) || premium < 0 || premium > 100000) { output.textContent = 'Enter an adult issue age and a valid monthly premium.'; return; }
  const monthlyCents = Math.round(premium * 100); const annual = monthlyCents * 12; const bps = age <= 60 ? 3900 : 6500; const commission = Math.round(annual * bps / 10000); const advance = Math.round(commission * 0.75);
  output.innerHTML = `<dl><div><dt>Annualized premium · 12 months</dt><dd>${money(annual)}</dd></div><div><dt>Illustrated commission · ${bps / 100}%</dt><dd>${money(commission)}</dd></div><div class="estimate-advance"><dt>Illustrated advance · 75%</dt><dd>${money(advance)}</dd></div><div><dt>Revenue recognized by this estimate</dt><dd>$0.00</dd></div></dl><p class="quiet controls-note">The advance is 75% of commission, not 75% of annualized premium. Actual compensation requires a matching, verified carrier, agent, contract, age band, and effective date.</p>`;
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
dialog.addEventListener('close', () => { state.detailId++; state.selected = null; state.saving = false; detail.replaceChildren(); });
window.addEventListener('pagehide', clearPrivateState);
window.addEventListener('pageshow', event => { if (event.persisted) boot(); });
boot();
