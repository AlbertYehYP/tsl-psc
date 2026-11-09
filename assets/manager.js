/* TSL 船管事故通報入口 Ship Manager Incident Portal（v1.18）
 * 船管公司以「公司存取碼」登入（不需 Google 帳號），查看自家進行中的事故、上傳報告與更新。
 * 後端：同一個 Apps Script /exec；送 {action:'mgrLogin', payload:{code}} 取得 token，之後送 {mgrToken, action, payload}。
 * 示範模式（config.js demo:true 且頁面內含 PSC 核心與示範資料）：不連線，選公司即可進入。 */
(function () {
  'use strict';
  const CFG = window.PSC_CONFIG || {};
  const VERSION = '1.18.0';
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const DEMO = !!CFG.demo && typeof window.PSC === 'object' && !!window.PSC_DEMO_SEED;
  const MAX_FILES = 5, MAX_BYTES = 20 * 1024 * 1024;
  const S = { token: '', company: '', name: '', data: null, open: {}, form: null, busy: false };
  const store = k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const keep = (k, v) => { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} };
  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem(k) || ''; localStorage.setItem(k, v); } catch (e) { return ''; } return v; };

  function toast(msg, ms) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.style.display = 'block'; t.classList.remove('out');
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.classList.add('out'); setTimeout(() => { t.style.display = 'none'; }, 220); }, ms || 3200);
  }

  /* ---------------- 後端 ---------------- */
  let demoStore = null;
  function demoMem() {
    if (demoStore) return demoStore;
    const T = {}, seed = window.PSC_DEMO_SEED || {}, clone = o => JSON.parse(JSON.stringify(o));
    Object.keys(PSC.SCHEMA).forEach(k => { T[k] = clone(seed[k] || []); });
    const tbl = n => T[n] || (T[n] = []);
    demoStore = {
      all: n => clone(tbl(n)), insert: (n, o) => { tbl(n).push(clone(o)); },
      update: (n, k, v, p) => { tbl(n).forEach(r => { if (String(r[k]) === String(v)) Object.assign(r, p); }); },
      updateWhere: (n, f, p) => { tbl(n).forEach(r => { if (f(r)) Object.assign(r, p); }); },
      replaceWhere: (n, k, v, rows) => { T[n] = tbl(n).filter(r => String(r[k]) !== String(v)).concat(clone(rows)); },
      putFile: () => ({ id: 'demo-' + Math.random().toString(36).slice(2, 10), url: '' }),
      now: () => new Date().toISOString().slice(0, 19) + 'Z', lock: fn => fn()
    };
    return demoStore;
  }
  async function api(action, payload) {
    if (DEMO) {
      await new Promise(r => setTimeout(r, 120));
      if (action === 'mgrLogin') { const co = String(payload.code || '').toUpperCase(); return { token: 'demo-' + co, company: co, name: (PSC.CO_EN && PSC.CO_EN[co]) || co, hours: 6 }; }
      if (action === 'mgrLogout') return { ok: true };
      const r = PSC.handle(demoMem(), { email: 'mgr:' + S.company, name: S.name, role: 'manager', company: S.company }, action, payload || {});
      if (action === 'mgrSubmit') r.mail = { pic: '', receipt: '' };
      return r;
    }
    const url = String(CFG.apiUrl || '').trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]{20,}\/exec$/.test(url)) throw new Error('系統尚未設定後端網址，請聯絡德翔海務技術課。The portal is not configured yet — please contact TSL MARTEC.');
    const body = action === 'mgrLogin' ? { action, payload } : { mgrToken: S.token, action, payload: payload || {} };
    let r, j;
    try { r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }); }
    catch (e) { throw new Error('無法連線，請稍後再試。Connection failed — please try again later.'); }
    try { j = await r.json(); } catch (e) { throw new Error('伺服器暫時無法回應（HTTP ' + r.status + '）。Server unavailable — please try again later.'); }
    if (!j.ok) {
      if (/逾時|Session expired/.test(j.error || '') && action !== 'mgrLogin') { signOut(true); }
      throw new Error(j.error || '伺服器錯誤 Server error');
    }
    return j.data;
  }

  /* ---------------- 共用小工具 ---------------- */
  const dfmt = d => d ? String(d).slice(0, 10) : '—';
  const TIER = { '1': ['Tier 1', 'Major 重大'], '2': ['Tier 2', 'Moderate 中度'], '3': ['Tier 3', 'Minor 一般'] };
  const STATE = {
    ontime: ['ok', '已收到', 'Received'], late: ['late', '逾時收到', 'Received late'], overdue: ['over', '已逾期', 'Overdue'],
    pending: ['wait', '待提交', 'Pending'], exempt: ['wait', '不可抗力', 'Force majeure'], untracked: ['wait', '未追蹤', 'Not tracked']
  };
  function daysLeft(due, today) { if (!due) return null; return Math.round((Date.parse(due) - Date.parse(today)) / 864e5); }
  function nextStep(c, today) {
    const t = (c.timely || []).find(x => !x.at);
    if (!t) return { k: 'progress', html: '<b>已收到三階段報告</b>，如有後續進度或結案確認請上傳。<span class="en">All three reports received — please submit any further progress or the closure confirmation.</span>' };
    const d = daysLeft(t.due, today), quiet = t.state === 'untracked' || t.state === 'exempt';
    const when = !t.due || quiet ? '' : d < 0 ? `<span class="due over">已逾期 ${-d} 天 overdue by ${-d} day${-d > 1 ? 's' : ''}</span>` : d === 0 ? '<span class="due over">今天到期 due today</span>' : `<span class="due">${d} 天後到期 due in ${d} day${d > 1 ? 's' : ''}</span>`;
    return { k: t.stage, html: `<b>下一步：${esc(t.label)}</b> <span class="en">Next: ${esc(t.en)}</span>${t.due ? `　期限 Due <span class="mono">${esc(t.due)}</span>　${when}` : ''}` };
  }

  /* ---------------- 畫面 ---------------- */
  function whoBox() {
    const w = $('#mg-who');
    w.innerHTML = S.token ? `<span class="mg-co">${esc(S.name)}</span><button class="btn sm ghost" id="mg-out" type="button">登出 Sign out</button>` : '';
    const b = $('#mg-out'); if (b) b.addEventListener('click', () => signOut(false));
  }
  function vLogin(err) {
    whoBox();
    const demoCos = DEMO ? Array.from(new Set((window.PSC_DEMO_SEED.Incidents || []).map(x => String(x.company || '').toUpperCase()))).filter(c => c && !['TSL', 'TEH'].includes(c)).sort() : [];
    $('#mg-view').innerHTML = `<div class="card mg-login fx-in">
      <h2>公司存取碼登入 <span class="en">Sign in with your company access code</span></h2>
      <p class="sub">存取碼由德翔海務技術課另行提供，請勿轉寄或寫在信件中。<span class="en">The access code is provided separately by TSL MARTEC. Please do not forward it or include it in emails.</span></p>
      ${DEMO ? `<div class="btnrow" style="margin:6px 0 4px">${demoCos.map(c => `<button class="btn" type="button" data-demo="${esc(c)}">${esc((PSC.CO_EN && PSC.CO_EN[c]) || c)}</button>`).join('')}</div><p class="note">示範模式：選公司即可進入，不需存取碼。Demo mode — choose a company.</p>` : `
      <form id="mg-login" class="form" autocomplete="off">
        <div class="field"><label for="mg-code">存取碼 Access code</label><input class="inp mono mg-code" id="mg-code" placeholder="XXXX-XXXX" maxlength="12" autocapitalize="characters" spellcheck="false" required></div>
        <div class="btnrow"><button class="btn primary" type="submit" id="mg-go">登入 Sign in</button><span class="dim" style="font-size:12px">登入有效 6 小時 Session lasts 6 hours</span></div>
        <div class="err" id="mg-err">${esc(err || '')}</div>
      </form>`}
    </div>`;
    if (DEMO) { $('#mg-view').querySelectorAll('[data-demo]').forEach(b => b.addEventListener('click', () => login(b.dataset.demo))); return; }
    const f = $('#mg-login'), inp = $('#mg-code');
    inp.addEventListener('input', () => { const v = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); inp.value = v.length > 4 ? v.slice(0, 4) + '-' + v.slice(4) : v; });
    f.addEventListener('submit', e => { e.preventDefault(); login(inp.value); });
    inp.focus();
  }
  async function login(code) {
    const btn = $('#mg-go'), er = $('#mg-err');
    if (btn) { btn.disabled = true; btn.textContent = '登入中… Signing in…'; }
    try {
      const r = await api('mgrLogin', { code });
      Object.assign(S, { token: r.token, company: r.company, name: r.name });
      keep('tsl-mgr', JSON.stringify({ token: r.token, company: r.company, name: r.name }));
      await load();
    } catch (e) {
      if (er) er.textContent = e.message; else vLogin(e.message);
      if (btn) { btn.disabled = false; btn.textContent = '登入 Sign in'; }
    }
  }
  async function signOut(expired) {
    if (S.token && !expired) { try { await api('mgrLogout', {}); } catch (e) {} }
    Object.assign(S, { token: '', company: '', name: '', data: null, form: null });
    keep('tsl-mgr', null);
    vLogin(expired ? '登入已逾時，請重新輸入存取碼。Your session has expired — please sign in again.' : '');
  }
  async function load(keepForm) {
    $('#mg-view').innerHTML = '<p class="dim" style="padding:40px 0;text-align:center">讀取案件中 Loading cases…</p>';
    try { S.data = await api('mgrCases', {}); if (!keepForm) S.form = null; render(); }
    catch (e) { if (S.token) $('#mg-view').innerHTML = `<div class="card"><p class="err">${esc(e.message)}</p><button class="btn" type="button" id="mg-retry">重試 Retry</button></div>`; const b = $('#mg-retry'); if (b) b.addEventListener('click', () => load()); }
  }

  function stageChips(c) {
    return `<div class="mg-stages">${(c.timely || []).map(t => { const st = STATE[t.state] || STATE.pending; return `<div class="mg-stage ${st[0]}"><div class="mg-sl">${esc(t.label)}<span class="en">${esc(t.en)}</span></div><div class="mg-sd">期限 Due <span class="mono">${esc(t.due || '—')}</span></div><div class="mg-ss">${t.at ? `✓ <span class="mono">${esc(t.at)}</span>` : ''} ${esc(st[1])} <span class="en">${esc(st[2])}</span></div></div>`; }).join('')}</div>`;
  }
  function updList(c) {
    if (!c.updates.length && !c.docs.length) return '<p class="dim mg-none">尚無更新紀錄。No updates yet.</p>';
    const byUpd = {}; c.docs.forEach(d => { if (d.upd_id) (byUpd[d.upd_id] = byUpd[d.upd_id] || []).push(d); });
    const loose = c.docs.filter(d => !d.upd_id);
    return `<ol class="mg-upds">${c.updates.map(u => { const fs = byUpd[u.upd_id] || []; return `<li class="${u.origin === 'manager' ? 'mine' : 'tsl'}${u.ack_status === '退回' ? ' rej' : ''}">
      <div class="mg-uh"><span class="mono">${esc(u.received_at)} UTC</span><span class="stp stp-open">${esc(u.stage_name)}</span><span class="en">${esc(u.stage_en)}</span>
        <span class="mg-src">${u.origin === 'manager' ? `貴公司上傳 Submitted by you${u.reporter ? '｜' + esc(u.reporter) : ''}` : `德翔登錄 Recorded by TSL${u.channel ? '｜' + esc(u.channel) : ''}`}</span>
        ${u.ack_status === '已閱' ? '<span class="stp stp-closed">已閱 Acknowledged</span>' : u.ack_status === '退回' ? '<span class="stp stp-over">退回 Returned</span>' : u.origin === 'manager' ? '<span class="stp stp-nil">待德翔確認 Awaiting review</span>' : ''}</div>
      ${u.ack_status === '退回' && u.ack_note ? `<div class="mg-rej">退回原因 Reason：${esc(u.ack_note)}<br><span class="en">This update does not count toward the time limits. Please submit a corrected update.</span></div>` : ''}
      <div class="mg-uc">${esc(u.content)}</div>
      ${fs.length ? `<div class="mg-files">${fs.map(d => `<span class="mg-file">📎 ${esc(d.name)}</span>`).join('')}</div>` : ''}</li>`; }).join('')}</ol>
      ${loose.length ? `<div class="mg-docs"><div class="dim" style="font-size:12px;margin-bottom:4px">德翔已歸檔文件 Documents on file at TSL</div>${loose.map(d => `<div class="mg-doc"><span class="mono">${esc(d.uploaded_at)}</span> ${esc(d.doc_name)}｜${esc(d.name)}</div>`).join('')}</div>` : ''}`;
  }
  function formHTML(c) {
    const F = S.form, st = S.data.stages;
    return `<form class="mg-form form" id="mg-form" data-no="${esc(c.tracking_no)}">
      <div class="frow">
        <div class="field"><label for="mf-stage">報告階段 Report stage</label><select id="mf-stage" required>${st.map(x => `<option value="${esc(x.k)}"${x.k === F.stage ? ' selected' : ''}>${esc(x.name)} ${esc(x.en)}</option>`).join('')}</select></div>
        <div class="field"><label for="mf-rep">填報人姓名與職稱 Your name &amp; position</label><input class="inp" id="mf-rep" required maxlength="120" value="${esc(F.reporter)}" placeholder="e.g. Capt. J. Lee, DPA"></div>
        <div class="field"><label for="mf-mail">收件回執信箱（選填） Email for receipt (optional)</label><input class="inp" id="mf-mail" type="email" maxlength="120" value="${esc(F.mail)}" placeholder="name@company.com"></div>
      </div>
      <div class="field"><label for="mf-text">更新內容 Update</label><textarea id="mf-text" rows="6" maxlength="20000" placeholder="可直接貼上信件內容。You may paste the content of your email here.">${esc(F.content)}</textarea></div>
      <div class="field"><label for="mf-files">附件（最多 ${MAX_FILES} 個，合計 20 MB） Attachments (up to ${MAX_FILES} files, 20 MB in total)</label>
        <input id="mf-files" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.heic,.msg,.eml,.zip">
        <div class="mg-picked" id="mf-picked">${F.files.map((f, i) => `<span class="mg-file">📎 ${esc(f.name)} <span class="dim">${(f.size / 1048576).toFixed(1)} MB</span> <button type="button" class="mg-x" data-rm="${i}" aria-label="移除 Remove">×</button></span>`).join('')}</div></div>
      <p class="note" style="margin:0">送出後即記錄為德翔收到時間（UTC），內容不能修改；如有錯誤請再送一筆更正。<span class="en">Once submitted, the time is recorded as received by TSL (UTC) and the update cannot be edited. To correct it, submit another update.</span></p>
      <div class="btnrow"><button class="btn primary" type="submit" id="mf-go">送出 Submit</button><button class="btn ghost" type="button" id="mf-cancel">取消 Cancel</button><span class="err" id="mf-err"></span></div>
    </form>`;
  }
  function caseHTML(c, today, i) {
    const n = nextStep(c, today), t = TIER[c.tier] || ['Tier ' + c.tier, ''], open = !!S.open[c.tracking_no], formOn = S.form && S.form.no === c.tracking_no;
    const hasOver = (c.timely || []).some(x => x.state === 'overdue'), rej = c.updates.some(u => u.ack_status === '退回');
    return `<article class="card mg-case fx-in${hasOver ? ' is-over' : ''}" style="--i:${i}" id="c-${esc(c.tracking_no.replace(/[^\w-]/g, '_'))}">
      <div class="mg-ch">
        <div><div class="tn">${esc(c.tracking_no)}</div><h2>${esc(c.vessel)}</h2>
          <div class="mg-meta"><span class="tier tier-${esc(c.tier)}">${esc(t[0])}</span><span class="dim">${esc(t[1])}</span>
          <span>${esc(c.type_name || c.type)}</span><span class="mono">${esc(c.date)}</span>${c.location ? `<span>${esc(c.location)}</span>` : ''}
          ${c.psc ? `<span class="pill act">PSC${c.mou ? ' · ' + esc(c.mou) : ''}${c.def_count ? ' · ' + esc(c.def_count) + ' 項缺失 deficiencies' : ''}</span>` : ''}${c.detention === 'Y' ? '<span class="pill det">留置 Detained</span>' : ''}
          ${rej ? '<span class="pill det">有退回 Returned update</span>' : ''}</div></div>
        <button class="btn primary" type="button" data-upd="${esc(c.tracking_no)}"${formOn ? ' hidden' : ''}>＋ 上傳報告／更新 Submit report / update</button>
      </div>
      ${c.summary ? `<p class="mg-sum">${esc(c.summary)}</p>` : ''}
      <div class="mg-next">${n.html}</div>
      ${stageChips(c)}
      ${formOn ? formHTML(c) : ''}
      ${c.deficiencies.length ? `<details class="mg-defs"><summary>PSC 缺失 ${c.deficiencies.length} 項 Deficiencies</summary><table><thead><tr><th>#</th><th>Code</th><th>內容 Nature</th><th>Action</th><th>改正 Rectified</th></tr></thead><tbody>${c.deficiencies.map(d => `<tr><td>${esc(d.seq)}</td><td class="mono">${esc(d.code)}</td><td>${esc(d.nature)}</td><td class="mono">${esc(d.action)}</td><td>${d.rectified ? '✓' : ''}</td></tr>`).join('')}</tbody></table></details>` : ''}
      <details class="mg-hist"${open || formOn ? ' open' : ''} data-hist="${esc(c.tracking_no)}"><summary>更新紀錄 Update history（${c.updates.length}）</summary>${updList(c)}</details>
    </article>`;
  }
  function render() {
    whoBox();
    const D = S.data, today = D.today, cs = D.cases;
    const over = cs.filter(c => (c.timely || []).some(x => x.state === 'overdue')).length;
    const soon = cs.filter(c => { const t = (c.timely || []).find(x => !x.at); const d = t ? daysLeft(t.due, today) : null; return d != null && d >= 0 && d <= 2; }).length;
    const rej = cs.reduce((n, c) => n + c.updates.filter(u => u.ack_status === '退回').length, 0);
    $('#mg-view').innerHTML = `
      <section class="mg-kpis fx-in">
        <div class="mg-kpi"><b class="num">${cs.length}</b><span>進行中事故<br><span class="en">Open incidents</span></span></div>
        <div class="mg-kpi${over ? ' bad' : ''}"><b class="num">${over}</b><span>報告已逾期<br><span class="en">With overdue reports</span></span></div>
        <div class="mg-kpi${soon ? ' warn' : ''}"><b class="num">${soon}</b><span>2 天內到期<br><span class="en">Due within 2 days</span></span></div>
        <div class="mg-kpi${rej ? ' bad' : ''}"><b class="num">${rej}</b><span>被退回的更新<br><span class="en">Returned updates</span></span></div>
      </section>
      <div class="mg-bar"><span class="dim">資料時間 As of <span class="mono">${esc(D.now)}</span> UTC</span><button class="btn sm" type="button" id="mg-reload">重新整理 Refresh</button></div>
      ${cs.length ? cs.map((c, i) => caseHTML(c, today, i)).join('') : '<div class="card"><p class="dim" style="margin:0">目前沒有進行中的事故。There are no open incidents for your company.</p></div>'}`;
    $('#mg-reload').addEventListener('click', () => load());
    $('#mg-view').querySelectorAll('[data-upd]').forEach(b => b.addEventListener('click', () => openForm(b.dataset.upd)));
    $('#mg-view').querySelectorAll('[data-hist]').forEach(d => d.addEventListener('toggle', () => { S.open[d.dataset.hist] = d.open; }));
    if (S.form) wireForm();
  }
  function openForm(no) {
    const c = S.data.cases.find(x => x.tracking_no === no); if (!c) return;
    S.form = { no, stage: nextStep(c, S.data.today).k, reporter: pref('tsl-mgr-rep'), mail: pref('tsl-mgr-mail'), content: '', files: [] };
    render();
    const f = $('#mg-form'); if (f) { f.scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#mf-text').focus({ preventScroll: true }); }
  }
  function saveDraft() {
    if (!S.form || !$('#mg-form')) return;
    Object.assign(S.form, { stage: $('#mf-stage').value, reporter: $('#mf-rep').value, mail: $('#mf-mail').value, content: $('#mf-text').value });
  }
  function readB64(file) {
    return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(new Error('讀不到檔案 Cannot read file: ' + file.name)); r.readAsDataURL(file); });
  }
  function wireForm() {
    const f = $('#mg-form'); if (!f) return;
    const err = $('#mf-err');
    $('#mf-files').addEventListener('change', e => {
      saveDraft();
      const add = Array.from(e.target.files || []), all = S.form.files.concat(add);
      if (all.length > MAX_FILES) { err.textContent = `最多 ${MAX_FILES} 個檔案 Up to ${MAX_FILES} files`; e.target.value = ''; return; }
      if (all.reduce((n, x) => n + x.size, 0) > MAX_BYTES) { err.textContent = '檔案合計超過 20 MB，請分次上傳 Files exceed 20 MB — please submit them in separate updates'; e.target.value = ''; return; }
      S.form.files = all; render();
    });
    f.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { saveDraft(); S.form.files.splice(+b.dataset.rm, 1); render(); }));
    $('#mf-cancel').addEventListener('click', () => { S.form = null; render(); });
    f.addEventListener('submit', async e => {
      e.preventDefault(); if (S.busy) return;
      saveDraft(); err.textContent = '';
      const F = S.form;
      if (!F.reporter.trim()) { err.textContent = '請填寫填報人姓名與職稱 Please enter your name and position'; $('#mf-rep').focus(); return; }
      if (!F.content.trim() && !F.files.length) { err.textContent = '請填寫更新內容或附上檔案 Please enter the update or attach a file'; $('#mf-text').focus(); return; }
      const go = $('#mf-go'); S.busy = true; go.disabled = true; go.textContent = '送出中… Submitting…';
      try {
        const files = [];
        for (const x of F.files) files.push({ name: x.name, mime: x.type || 'application/octet-stream', size: x.size, base64: await readB64(x) });
        const r = await api('mgrSubmit', { tracking_no: F.no, stage: F.stage, reporter: F.reporter.trim(), reply_email: F.mail.trim(), content: F.content.trim(), files });
        pref('tsl-mgr-rep', F.reporter.trim()); pref('tsl-mgr-mail', F.mail.trim());
        S.open[F.no] = true; S.form = null;
        toast(`已送出，收到時間 ${r.received_at} UTC${r.mail && r.mail.receipt ? '；回執已寄出' : ''}。Submitted — received ${r.received_at} UTC.`, 6000);
        await load();
      } catch (e2) {
        err.textContent = e2.message; go.disabled = false; go.textContent = '送出 Submit';
      } finally { S.busy = false; }
    });
  }

  function start() {
    if (DEMO) { const b = $('#mg-demo'); b.hidden = false; b.textContent = '示範模式：資料只在這個瀏覽器，送出的更新不會寄信也不會存到德翔系統。Demo mode — nothing is sent or saved.'; }
    let saved = null; try { saved = JSON.parse(store('tsl-mgr') || 'null'); } catch (e) { saved = null; }
    if (saved && saved.token && !DEMO) { Object.assign(S, saved); load(); }
    else vLogin('');
  }
  window.__TSLMGR = { S, api, render, load, VERSION };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
