/* TSL 船隊事故追蹤系統 (TSL PSC System) — front-end (GitHub Pages). Requires config.js and assets/core.js. */
(function () {
'use strict';
const CFG = Object.assign({ apiUrl: '', googleClientId: '', demo: false, orgName: '德翔海技 TSL MARTEC', systemName: 'TSL 船隊事故追蹤系統' }, window.PSC_CONFIG || {});
const CAT = PSC.CATEGORIES, ACT = PSC.ACTIONS, ST = PSC.STATUS;
const SECTIONS = {
  inc: { tabs: [['inc-overview', '事故分析'], ['inc-vessels', '船舶事故'], ['incidents', '事故登錄與處理'], ['report', '週報／月報'], ['inc-rules', '事故規範']] },
  vf: { tabs: [['vf-overview', '總覽'], ['visits', '訪船紀錄'], ['vf-items', '缺失追蹤'], ['vf-ships', '船舶履歷']] },
  psc: { tabs: [['overview', '總覽'], ['map', '地圖'], ['inspections', '檢查登錄'], ['records', '缺失查詢'], ['vessels', '船舶檔案'], ['window', 'PSC 窗口'], ['bribe', '索賄分析'], ['codes', '代碼參考']] },
  admin: { tabs: [['admin', '系統管理']] }
};
const TAB_LIST = Object.values(SECTIONS).flatMap(x => x.tabs.map(t => t[0]));
const secOf = t => Object.keys(SECTIONS).find(k => SECTIONS[k].tabs.some(x => x[0] === t)) || 'psc';
const MAX_MB = 20;

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Number(n).toLocaleString('en-US');
const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '–';
const dfmt = s => s ? String(s).slice(0, 10).replace(/-/g, '/') : '—';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const clone = o => JSON.parse(JSON.stringify(o));
function toast(msg, ms) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('out'); t.style.display = 'none'; void t.offsetWidth; t.style.display = 'block';
  clearTimeout(toast._t); clearTimeout(toast._h);
  toast._t = setTimeout(() => { t.classList.add('out'); toast._h = setTimeout(() => { t.style.display = 'none'; t.classList.remove('out'); }, 230); }, ms || 4500);
}
/* motion helpers: enter = fade up in, leave = fade further up (same direction everywhere) */
const REDUCED = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
function fxIn(el, stagger) {
  if (!el || REDUCED) return;
  const items = stagger ? [...el.children].slice(0, 12) : [el];
  items.forEach((c, i) => { c.style.setProperty('--i', stagger ? i : 0); c.classList.remove('fx-in'); void c.offsetWidth; c.classList.add('fx-in'); c.addEventListener('animationend', () => c.classList.remove('fx-in'), { once: true }); });
}
function fxOut(el) { return new Promise(res => { if (!el || REDUCED || !el.children.length) return res(); [...el.children].forEach(c => c.classList.add('fx-out')); setTimeout(res, 190); }); }
/** 船舶主檔匯入結果：補了哪些欄位、哪些值與主檔不同 */
const NK_LABEL = { class_society: '船級', class_number: '船級號', flag: '船旗', flag_code: '船旗代碼', port_of_registry: '船籍港', ship_type: '船型', ism_company: 'ISM 公司', registered_owner: '登記船東', date_of_build: '建造日期', gross_tonnage: 'GT', deadweight: 'DWT', teu: 'TEU', builder: '造船廠', nk_data_date: 'NK 資料日期' };
function nkResult(r) {
  const all = r.conflicts || [], done = all.filter(c => c.applied), major = all.filter(c => !c.applied && !c.minor), minor = all.filter(c => !c.applied && c.minor);
  const by = Object.entries(r.filledBy || {}).map(([k, n]) => `${NK_LABEL[k] || k} ${n}`).join('、');
  const row = c => `<tr><td>${esc(c.vessel)}${c.former ? ' <span class="dim">（舊列）</span>' : ''}</td><td>${esc(NK_LABEL[c.field] || c.field)}</td><td>${esc(c.current)}</td><td>${esc(c.master)}</td></tr>`;
  const tbl = (list, h) => `<div class="tbl-wrap" style="max-height:${h}px"><table><thead><tr><th>船名</th><th>欄位</th><th>${list === done ? '原本的值' : '系統現值'}</th><th>${list === done ? '改成（主檔）' : '船舶主檔'}</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>`;
  const modeTxt = { class: '船級欄位以 Class 為準', fill: '只補空白', overwrite: '全部以主檔覆蓋' }[r.mode] || r.mode;
  openModal({ title: '船舶主檔匯入完成', sub: `${r.imported.length} 艘・${modeTxt}・補上 ${r.filled} 個空白欄位・更新 ${done.length} 個值`,
    html: `${by ? `<p class="note" style="margin-top:0">補上的欄位：${esc(by)}</p>` : ''}${r.skipped && r.skipped.length ? `<p class="flag">系統船隊資料沒有這些 IMO，已略過：${esc(r.skipped.join('、'))}</p>` : ''}
    ${done.length ? `<h2 style="margin:12px 0 6px">已改成主檔的值（${done.length}）</h2>${tbl(done, 260)}` : ''}
    ${major.length ? `<h2 style="margin:14px 0 6px">與主檔不同，未變更（${major.length}）</h2>${tbl(major, 220)}<p class="note">改名 / 換管理前的舊列保留當時的船旗、船東等資料；其他欄位如需改成主檔的值，可在試算表 Vessels 分頁個別修改，或選「全部以主檔覆蓋」再匯入。</p>` : ''}
    ${!done.length && !major.length ? '<p class="note">沒有與主檔不同的值。</p>' : ''}
    ${minor.length ? `<details style="margin-top:10px"><summary class="dim">造船廠中文簡稱與主檔英文名稱不同（${minor.length}，保留中文）</summary>${tbl(minor, 220)}</details>` : ''}` });
}
/** 彈出視窗：淡入（向上）開啟、淡出（繼續向上）關閉 */
function openModal(o) {
  const back = document.createElement('div'); back.className = 'modal-back'; back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true');
  back.innerHTML = `<div class="modal${o.wide ? ' wide' : ''}"><div class="modal-head"><div><h2>${o.title}</h2>${o.sub ? `<div class="dim" style="font-size:12.5px;margin-top:2px">${o.sub}</div>` : ''}</div><button class="modal-x" type="button" aria-label="關閉">×</button></div><div class="modal-body">${o.html}</div>${o.foot ? `<div class="modal-foot">${o.foot}</div>` : ''}</div>`;
  document.body.appendChild(back);
  const panel = back.querySelector('.modal'); fxIn(panel);
  let closed = false;
  const close = () => new Promise(res => { if (closed) return res(); closed = true; document.removeEventListener('keydown', onKey); if (REDUCED) { back.remove(); return res(); } back.classList.add('out'); panel.classList.add('fx-out'); setTimeout(() => { back.remove(); res(); }, 200); });
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  back.querySelector('.modal-x').addEventListener('click', close);
  if (o.onMount) o.onMount(back, close);
  const first = back.querySelector('input:not([disabled]),select:not([disabled]),textarea:not([disabled])'); if (first) setTimeout(() => first.focus(), 60);
  return close;
}
/* theme picker */
const THEMES = [['', '自動（依系統淺色／深色）'], ['mist', '海霧', '#2c7a75'], ['sand', '沙岸', '#b0613a'], ['sage', '森林', '#557a43'], ['sky', '晴空', '#3a6db0'], ['night', '夜航（深色）', '#19211f']];
function curTheme() { return document.documentElement.getAttribute('data-theme') || ''; }
function setTheme(t) {
  if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
  try { if (t) localStorage.setItem('tsl-theme', t); else localStorage.removeItem('tsl-theme'); } catch (e) {}
  renderThemes(); if (S.tab === 'map' && M) render();
}
function renderThemes() {
  const el = $('#themes'); if (!el) return;
  el.innerHTML = '<span>配色</span>' + THEMES.map(([k, l, c]) => `<button type="button" class="sw ${k ? '' : 'auto'}" data-theme-k="${k}" title="${l}" aria-label="${l}" aria-pressed="${curTheme() === k}" style="${c ? `background:${c}` : ''}"></button>`).join('');
  el.querySelectorAll('[data-theme-k]').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.themeK)));
}
function countBy(arr, f) { const m = new Map(); arr.forEach(x => { const k = f(x); if (k == null) return; m.set(k, (m.get(k) || 0) + 1); }); return m; }
const can = role => !!USER && ({ viewer: 1, editor: 2, admin: 3 }[USER.role] || 0) >= ({ viewer: 1, editor: 2, admin: 3 }[role]);

/* ---------- demo store (same interface as the Apps Script store) ---------- */
function memStore(seed) {
  const T = {}; Object.keys(PSC.SCHEMA).forEach(k => T[k] = clone((seed && seed[k]) || []));
  const tbl = n => T[n] || (T[n] = []);
  const now = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 19); };
  return {
    all: n => clone(tbl(n)),
    insert: (n, o) => { tbl(n).push(clone(o)); },
    update: (n, k, v, p) => { tbl(n).forEach(r => { if (String(r[k]) === String(v)) Object.assign(r, p); }); },
    updateWhere: (n, f, p) => { tbl(n).forEach(r => { if (f(r)) Object.assign(r, p); }); },
    replaceWhere: (n, k, v, rows) => { T[n] = tbl(n).filter(r => String(r[k]) !== String(v)).concat(clone(rows)); },
    putFile: (path, name, mime, b64) => {
      const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([u8], { type: mime }));
      return { id: 'demo-' + Math.random().toString(36).slice(2, 10), url: url };
    },
    now, lock: fn => fn()
  };
}
const Demo = {
  store: null, user: { email: 'demo@tsl.local', name: '示範使用者', role: 'admin' },
  init(seed) { this.store = memStore(seed); },
  async call(action, payload) { await new Promise(r => setTimeout(r, 60)); return clone(PSC.handle(this.store, this.user, action, payload)); }
};

/* ---------- API / auth ---------- */
const Auth = { token: null, email: '', name: '', exp: 0 };
async function api(action, payload) {
  if (CFG.demo) return Demo.call(action, payload || {});
  if (!Auth.token || Date.now() / 1000 > Auth.exp - 30) { showLogin('登入已過期，請重新登入'); throw new Error('登入已過期，請重新登入'); }
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]{20,}\/exec$/.test(String(CFG.apiUrl).trim())) throw new Error('config.js 的 apiUrl 不是 Apps Script 部署網址（應為 https://script.google.com/macros/s/……/exec，請整串貼上「管理部署作業」裡的網址）');
  let r, j;
  try { r = await fetch(CFG.apiUrl.trim(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ idToken: Auth.token, action, payload: payload || {} }) }); }
  catch (e) { throw new Error('連不到後端（Apps Script）。請確認：1) config.js 的 apiUrl 是「管理部署作業」裡的 /exec 網址；2) 部署的「具有存取權的使用者」是「所有人」；3) 用無痕視窗直接打開 apiUrl 會看到 {"ok":true…}'); }
  try { j = await r.json(); } catch (e) { throw new Error('後端回傳的不是資料（HTTP ' + r.status + '）。通常是 Apps Script 尚未授權或部署設定錯誤：請在 Apps Script 執行一次 setup，再「管理部署作業 → 編輯 → 新版本 → 部署」'); }
  if (!j.ok) throw new Error(/PSC is not defined/.test(j.error || '') ? '後端缺少 core.gs：請在 Apps Script 把「core」檔整份換成 apps-script/core.gs 的內容（開頭是「TSL PSC System — shared core logic」），「Code」檔放 Code.gs，儲存後部署新版本。' : (j.error || '伺服器錯誤'));
  if (action === 'bootstrap' && j.data && j.data.version && j.data.version !== PSC.VERSION) console.warn('前端 ' + PSC.VERSION + '／後端 ' + j.data.version + ' 版本不同，請部署相同版本');
  return j.data;
}
function jwtPayload(t) { try { return JSON.parse(decodeURIComponent(escape(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch (e) { return {}; } }
function onCredential(resp) {
  const p = jwtPayload(resp.credential);
  Object.assign(Auth, { token: resp.credential, email: p.email || '', name: p.name || '', exp: p.exp || 0 });
  try { sessionStorage.setItem('psc-token', resp.credential); } catch (e) {}
  start();
}
function loadGIS() {
  return new Promise((res, rej) => {
    if (window.google && google.accounts) return res();
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = res; s.onerror = () => rej(new Error('無法載入 Google 登入元件')); document.head.appendChild(s);
  });
}
async function showLogin(msg) {
  hideChrome(true);
  $('#view').innerHTML = `<div class="login card"><h2 style="font-size:18px">請用 Google 帳號登入</h2><p class="sub" style="margin:0">只有系統管理員開通的帳號可以使用。</p><div id="gbtn"></div>${msg ? `<p class="err">${esc(msg)}</p>` : ''}</div>`;
  try {
    await loadGIS();
    google.accounts.id.initialize({ client_id: CFG.googleClientId, callback: onCredential, auto_select: true });
    google.accounts.id.renderButton($('#gbtn'), { theme: 'outline', size: 'large', text: 'signin_with', locale: 'zh-TW' });
  } catch (e) { $('#gbtn').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
function signOut() {
  try { sessionStorage.removeItem('psc-token'); } catch (e) {}
  Object.assign(Auth, { token: null, email: '', exp: 0 });
  if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
  USER = null; showLogin();
}
function hideChrome(h) { ['#sections', '#tabs', '#filters', '#rp-quick'].forEach(s => { if ($(s)) $(s).hidden = h; }); if (h) $('#userbox').innerHTML = ''; }

/* ---------- model ---------- */
let RAW = null, M = null, USER = null;
function buildModel(raw) {
  const insp = raw.inspections.map(r => Object.assign({}, r, { y: +String(r.date).slice(0, 4), ym: String(r.date).slice(0, 7), mgmt: r.management || '—', defs: [], docs: [] }));
  const byId = new Map(insp.map(i => [i.insp_id, i]));
  const recs = [];
  raw.deficiencies.forEach(d => {
    const I = byId.get(d.insp_id); if (!I) return;
    const o = Object.assign({}, d, { date: I.date, y: I.y, port: I.port, country: I.country, vessel: I.vessel, imo: I.imo, mgmt: I.mgmt, tracking: I.tracking_no, cat: d.code ? d.code.slice(0, 2) : null, act: d.action, actMain: PSC.mainAction(d.action), insp: I });
    I.defs.push(o); recs.push(o);
  });
  (raw.documents || []).forEach(d => { const I = byId.get(d.insp_id); if (I) I.docs.push(d); });
  insp.forEach(I => { I.det = I.detention === 'Y' || I.defs.some(d => d.actMain === 30); I.defs.sort((a, b) => +a.seq - +b.seq); });
  insp.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (a.vessel < b.vessel ? -1 : 1));
  const vreg = {};
  (raw.vessels || []).forEach(v => { const k = v.imo || v.vessel; (vreg[k] || (vreg[k] = { imo: v.imo, rows: [], insp: [] })).rows.push(v); });
  Object.values(vreg).forEach(o => {
    o.rows.sort((a, b) => (a.valid_from || '') < (b.valid_from || '') ? -1 : 1);
    o.cur = o.rows[o.rows.length - 1]; o.name = o.cur.vessel; o.zh = o.cur.chinese || ''; o.former = o.rows.slice(0, -1).map(r => r.vessel);
  });
  insp.forEach(I => {
    const k = I.imo || I.vessel;
    const o = vreg[k] || (vreg[k] = { imo: I.imo, rows: [], insp: [], cur: null, name: I.vessel, zh: '', former: [] });
    o.insp.push(I); if (I.vessel !== o.name && !o.former.includes(I.vessel)) o.former.push(I.vessel);
  });
  const docsByNo = {}; (raw.documents || []).forEach(d => { if (!d.insp_id && d.tracking_no) (docsByNo[d.tracking_no] = docsByNo[d.tracking_no] || []).push(d); });
  const td = today();
  const incidents = (raw.incidents || []).map(x => {
    const I = x.insp_id ? byId.get(x.insp_id) : null, dl = PSC.incidentDeadlines(x, raw.rules);
    const o = Object.assign({}, x, dl, { I, y: +String(x.date).slice(0, 4), ym: String(x.date).slice(0, 7), psc: x.source === 'PSC' || !!I,
      mgmt: I ? I.mgmt : (PSC.COMPANY_TO_MGMT[x.company] || x.company || '—'), docs: I ? I.docs : (docsByNo[x.tracking_no] || []),
      over: x.status === ST.OPEN && !!dl.rca_due && dl.rca_due < td, void: x.status === ST.VOID, _today: td });
    o.timely = PSC.reportTimeliness(o, o.docs, td);
    o.checks = PSC.incidentChecks(o, o.docs, raw.rules, td);
    return o;
  }).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const incByNo = new Map(incidents.map(x => [x.tracking_no, x]));
  const visits = (raw.visits || []).map(v => Object.assign({}, v, { items: [], docs: docsByNo[v.visit_no] || [] }));
  const vByNo = new Map(visits.map(v => [String(v.visit_no).toUpperCase(), v]));
  const vitems = (raw.visitItems || []).map(it => { const v = vByNo.get(String(it.visit_no).toUpperCase()) || null; const o = Object.assign({}, it, { v, st: PSC.visitItemState(it, td) }); if (v) v.items.push(o); return o; });
  visits.forEach(v => { v.items.sort((a, b) => +a.seq - +b.seq); v.stats = PSC.visitStats(v.items, td); v.closed = v.stats.total > 0 && !v.stats.open && !v.stats.submitted; });
  visits.sort((a, b) => (a.date_from || a.report_date || '') < (b.date_from || b.report_date || '') ? 1 : -1);
  const lastInc = incidents.length ? incidents[0].date : '';
  return { insp, recs, vreg, byId, incidents, incByNo, asof: [insp.length ? insp[0].date : '', lastInc].sort().pop(), settings: raw.settings || {}, users: raw.users || [], vessels: raw.vessels || [],
    templates: raw.templates || PSC.templatesOf([]), companies: raw.companies || [], risk: raw.riskProfiles || [], nk: raw.nkStatus || [], mouMap: raw.mouMap || [], canBribe: !!raw.canBribe,
    rules: raw.rules || [], ports: raw.ports || [], docsByNo, visits, vitems };
}
const vkey = x => String(x.imo || x.vessel);

/* ---------- state & filters ---------- */
const S = { tab: 'inc-overview', last: {}, years: new Set(), mgmt: '', vessel: '', mou: '', country: '', cat: '', code: '', q: '', page: 0, showNil: false, profile: null, allC: false,
  caseId: null, caseMode: null, incId: null, cStatus: '', form: null, closing: false, incF: { co: '', tier: '', type: '', status: '', src: '' }, incForm: null, incEdit: false, adm: { user: null, vessel: null, mou: null } };
function yearsAll() { return [...new Set(M.insp.map(i => i.y))].sort(); }
function inspMatch(I) {
  if (S.years.size && !S.years.has(I.y)) return false;
  if (S.mgmt && I.mgmt !== S.mgmt) return false;
  if (S.vessel && vkey(I) !== S.vessel) return false;
  if (S.mou && (I.mou || '—') !== S.mou) return false;
  if (S.country && I.country !== S.country) return false;
  return true;
}
function incMatch(x) {
  if (S.years.size && !S.years.has(x.y)) return false;
  if (S.mgmt && x.mgmt !== S.mgmt) return false;
  if (S.vessel && String(x.imo || x.vessel) !== S.vessel) return false;
  if (S.q) { const q = S.q.toLowerCase(); if (!(x.tracking_no + ' ' + x.vessel + ' ' + x.summary + ' ' + x.pic + ' ' + x.unit).toLowerCase().includes(q)) return false; }
  return true;
}
function defMatch(d) {
  if (S.cat && d.cat !== S.cat) return false;
  if (S.code && d.code !== S.code) return false;
  if (S.q) { const q = S.q.toLowerCase(); const hay = (d.nature + ' ' + (d.code || '') + ' ' + d.port + ' ' + d.country + ' ' + d.vessel + ' ' + (CAT[d.cat] || '') + ' ' + (d.tracking || '') + ' ' + d.def_id).toLowerCase(); if (!hay.includes(q)) return false; }
  return true;
}
function current() {
  const insp = M.insp.filter(inspMatch); const defs = [];
  insp.forEach(I => I.defs.forEach(d => { if (defMatch(d)) defs.push(d); }));
  return { insp, defs, defFiltered: !!(S.cat || S.code || S.q) };
}
const opt = (v, l, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(l)}</option>`;
function buildFilters() {
  $('#f-years').innerHTML = yearsAll().map(y => `<button class="chip" type="button" data-y="${y}" aria-pressed="${S.years.has(y)}">${y}</button>`).join('');
  const mg = [...new Set(M.insp.map(i => i.mgmt))].sort();
  $('#f-mgmt').innerHTML = opt('', '全部管理公司') + mg.map(m => opt(m, m)).join('');
  const vs = Object.entries(M.vreg).filter(([, v]) => v.insp.length).map(([k, v]) => [k, v.name + (v.former.length ? `（前 ${v.former.join('、')}）` : '')]).sort((a, b) => a[1] < b[1] ? -1 : 1);
  $('#f-vessel').innerHTML = opt('', '全部船舶') + vs.map(([k, l]) => opt(k, l)).join('');
  const ms = [...new Set(M.insp.map(i => i.mou || '—'))].sort((a, b) => (a === PSC.TOKYO ? -1 : b === PSC.TOKYO ? 1 : a < b ? -1 : 1));
  $('#f-mou').innerHTML = opt('', '全部 MOU 區域') + ms.map(m => opt(m, m === '—' ? '未標示' : m)).join('');
  const cs = [...new Set(M.insp.map(i => i.country))].sort();
  $('#f-country').innerHTML = opt('', '全部港口國') + cs.map(c => opt(c, c)).join('');
  const cats = [...new Set(M.recs.map(d => d.cat).filter(Boolean))].sort();
  $('#f-cat').innerHTML = opt('', '全部缺失類別') + cats.map(c => opt(c, `${c} ${CAT[c] || ''}`)).join('');
  syncFilterUI();
}
function syncFilterUI() {
  document.querySelectorAll('#f-years .chip').forEach(b => b.setAttribute('aria-pressed', S.years.has(+b.dataset.y)));
  $('#f-mgmt').value = S.mgmt; $('#f-vessel').value = S.vessel; $('#f-mou').value = S.mou; $('#f-country').value = S.country; $('#f-cat').value = S.cat;
  if ($('#f-q').value !== S.q) $('#f-q').value = S.q;
  const tags = [];
  if (S.code) tags.push(`<span class="tag">代碼 <span class="mono">${S.code}</span><button type="button" data-clear="code" aria-label="移除代碼篩選">×</button></span>`);
  const yr = S.years.size ? [...S.years].sort().join('、') : '全部年度';
  $('#f-note').innerHTML = `<span>${yr}</span>${tags.join('')}${(S.cat || S.code || S.q) && ['overview', 'records', 'vessels', 'codes'].includes(S.tab) ? '<span>· 類別、代碼與關鍵字只篩選缺失項目，檢查次數不受影響</span>' : ''}`;
}

/* ---------- shared bits ---------- */
function statusPill(I) {
  const st = I.status || '';
  if (st === ST.OPEN && I.rca_due && I.rca_due < today()) return `<span class="stp stp-over">進行中・RCA 逾期</span>`;
  const cls = { [ST.OPEN]: 'open', [ST.CLOSED]: 'closed', [ST.NIL]: 'nil', [ST.HIST]: 'hist', '未立案': 'miss' }[st] || 'nil';
  return `<span class="stp stp-${cls}">${esc(st === ST.NIL ? 'NIL 無缺失' : st || '—')}</span>`;
}
const tierPill = t => t ? `<span class="tier tier-${esc(t)}" title="${esc((PSC.TIERS[t] || {}).zh || '')}">T${esc(t)}</span>` : '';
function actPill(d) {
  if (!d.act) return '<span class="dim">—</span>';
  return `<span class="pill ${d.actMain === 30 ? 'det' : 'act'}" title="${esc(ACT[d.actMain] || '')}">${esc(d.act)}${d.actMain === 30 ? ' 留置' : ''}</span>`;
}
const caseLink = I => `<a href="#inspections" class="vlink mono" data-case="${esc(I.insp_id)}">${esc(I.tracking_no || I.insp_id)}</a>`;
const mouTag = m => m ? `<span class="mou${m === PSC.TOKYO ? ' t' : ''}">${esc(m)}</span>` : '<span class="mou">MOU 未標示</span>';
function openCase(id, mode) { S.caseId = id; S.caseMode = mode || null; S.incId = null; S.closing = false; if (S.tab === 'incidents' || S.tab === 'inc-overview') { S.tab = 'incidents'; setTab('incidents', true); } else setTab('inspections', true); window.scrollTo({ top: 0 }); }
function openIncident(no) { const x = M.incByNo.get(no); if (x && x.I) return openCase(x.I.insp_id); S.incId = no; S.caseId = null; S.caseMode = null; S.closing = false; S.incEdit = false; setTab('incidents', true); window.scrollTo({ top: 0 }); }
function openVessel(k) { S.profile = String(k); setTab('vessels'); window.scrollTo({ top: 0 }); }
function wireLinks(root) {
  root.querySelectorAll('[data-case]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); openCase(a.dataset.case); }));
  root.querySelectorAll('[data-inc]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openIncident(a.dataset.inc); }));
  root.querySelectorAll('[data-v]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); openVessel(a.dataset.v); }));
}
function showTip(e, html) { const t = $('#tip'); t.innerHTML = html; t.style.display = 'block'; const r = t.getBoundingClientRect(); let x = e.clientX + 14, y = e.clientY + 14; if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14; if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14; t.style.left = x + 'px'; t.style.top = y + 'px'; }
function hideTip() { $('#tip').style.display = 'none'; }
function bars(el, items, o) {
  o = o || {};
  if (!items.length) { el.innerHTML = '<div class="empty">沒有符合條件的資料</div>'; return; }
  const max = Math.max(...items.map(i => i.v));
  el.innerHTML = items.map((it, ix) => `<button type="button" class="bar ${o.active && o.active === it.k ? 'active' : ''}" data-ix="${ix}" title="${esc(it.title || '')}"><span class="lab">${it.lab}</span><span class="trk"><span class="fill" style="width:${(it.v / max * 100).toFixed(1)}%"></span></span><span class="val">${fmt(it.v)}${it.extra ? `<small>${it.extra}</small>` : ''}</span></button>`).join('');
  if (o.onClick) el.querySelectorAll('.bar').forEach(b => b.addEventListener('click', () => o.onClick(items[+b.dataset.ix])));
}

/* ---------- view: overview ---------- */
function vOverview(v) {
  v.innerHTML = `<div class="kpis" id="kpis"></div>
  <div class="card" style="margin-bottom:16px"><div class="card-head"><div><h2>每月 PSC 檢查</h2><p class="sub">長條高度為檢查次數，依有無缺失分色；滑過看當月缺失件數</p></div>
  <div class="legend"><span><i style="background:var(--s1)"></i>有缺失</span><span><i style="background:var(--s2)"></i>無缺失（NIL）</span></div></div><div class="chart" id="ch-month"></div></div>
  <div class="grid g2" style="margin-bottom:16px"><div class="card"><h2>缺失類別</h2><p class="sub">依代碼前兩碼（Tokyo / Paris MOU）歸類；點一下即篩選該類別</p><div class="bars" id="ch-cat"></div></div>
  <div class="card"><h2>高頻缺失代碼</h2><p class="sub">前 15 名；點一下查看該代碼所有缺失</p><div class="bars" id="ch-code"></div></div></div>
  <div class="card" style="margin-bottom:16px"><h2>MOU 區域</h2><p class="sub">依港口國歸屬的 PSC 體系（系統管理 → MOU 對照表）；只有 Tokyo MOU 的檢查會重算 Tokyo MOU 窗口。點一下即篩選</p><div class="tbl-wrap"><table id="t-mou"></table></div></div>
  <div class="grid g2" style="margin-bottom:16px"><div class="card"><h2>港口國</h2><p class="sub">平均缺失 / 次越高，代表該國檢查越嚴；點一下即篩選</p><div class="tbl-wrap"><table id="t-country"></table></div><div id="c-more"></div></div>
  <div class="card"><h2>船舶缺失排名</h2><p class="sub">前 12 名；點一下開啟船舶檔案</p><div class="bars" id="ch-vessel"></div></div></div>
  <div class="grid g2"><div class="card"><h2>管理公司</h2><p class="sub">依每次檢查紀錄所載之管理公司</p><div class="tbl-wrap"><table id="t-mgmt"></table></div></div>
  <div class="card"><h2>同船重複缺失</h2><p class="sub">同一艘船、同一代碼，在不同次檢查再次被開立</p><div class="tbl-wrap"><table id="t-repeat"></table></div></div></div>`;
  const c = current();
  const n = c.insp.length, nil = c.insp.filter(i => !i.defs.length).length, det = c.insp.filter(i => i.det).length;
  const allDefs = c.insp.reduce((s, i) => s + i.defs.length, 0), vset = new Set(c.insp.map(vkey)).size;
  const open = c.insp.filter(i => i.status === ST.OPEN).length, over = c.insp.filter(i => i.status === ST.OPEN && i.rca_due && i.rca_due < today()).length;
  const tiles = [['PSC 檢查次數', fmt(n), `${vset} 艘船`], ['無缺失率', pct(nil, n), `${fmt(nil)} 次 NIL`],
    ['缺失項數', fmt(c.defs.length), c.defFiltered ? `篩選前 ${fmt(allDefs)} 項` : `平均 ${n ? (allDefs / n).toFixed(2) : '–'} 項 / 次`],
    ['PSC 事故進行中', fmt(open), over ? `其中 ${over} 件 RCA 逾期` : 'RCA 皆未逾期', over ? 'crit' : ''], ['留置', fmt(det), det ? '處理代碼 30（留置依據）' : '期間內無留置', det ? 'crit' : '']];
  $('#kpis').innerHTML = tiles.map(t => `<div class="kpi ${t[3] || ''}"><div class="k">${t[0]}</div><div class="v num">${t[1]}</div><div class="d">${t[2]}</div></div>`).join('');
  monthChart(c);
  const tot = c.defs.length;
  bars($('#ch-cat'), [...countBy(c.defs, d => d.cat || '—')].sort((a, b) => b[1] - a[1]).map(([k, val]) => ({ k, v: val, lab: `<span class="mono">${k}</span>${esc(CAT[k] || '無代碼')}`, extra: pct(val, tot) })), { active: S.cat, onClick: it => { if (it.k === '—') return; S.cat = S.cat === it.k ? '' : it.k; render(); } });
  const lastEx = {}; c.defs.slice().sort((a, b) => a.date < b.date ? -1 : 1).forEach(d => { if (d.code) lastEx[d.code] = d.nature; });
  bars($('#ch-code'), [...countBy(c.defs, d => d.code || null)].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 15).map(([k, val]) => ({ k, v: val, lab: `<span class="mono">${k}</span>${esc(CAT[k.slice(0, 2)] || '')}`, title: lastEx[k] })), { onClick: it => { S.code = it.k; S.page = 0; setTab('records'); } });
  const byMou = {}; c.insp.forEach(I => { const k = I.mou || '—'; const o = byMou[k] || (byMou[k] = { n: 0, nil: 0, d: 0, det: 0, cs: new Set() }); o.n++; o.d += I.defs.filter(defMatch).length; if (!I.defs.length) o.nil++; if (I.det) o.det++; o.cs.add(I.country); });
  const mr = Object.entries(byMou).sort((a, b) => b[1].n - a[1].n);
  $('#t-mou').innerHTML = '<thead><tr><th>MOU 區域</th><th>港口國</th><th class="n">檢查</th><th class="n">占比</th><th class="n">缺失</th><th class="n">平均 / 次</th><th class="n">NIL 率</th><th class="n">留置</th></tr></thead><tbody>' +
    (mr.length ? mr.map(([k, o]) => `<tr class="click" data-mou="${esc(k)}"><td>${k === '—' ? '<span class="dim">未標示</span>' : `<b${k === PSC.TOKYO ? ' style="color:var(--accent)"' : ''}>${esc(k)}</b>`}</td><td class="dim" style="font-size:12.5px">${esc([...o.cs].sort().join('、'))}</td><td class="n">${o.n}</td><td class="n">${pct(o.n, n)}</td><td class="n">${o.d}</td><td class="n">${(o.d / o.n).toFixed(2)}</td><td class="n">${pct(o.nil, o.n)}</td><td class="n">${o.det || '–'}</td></tr>`).join('') : '<tr><td colspan="8" class="empty">沒有符合條件的資料</td></tr>') + '</tbody>';
  $('#t-mou').querySelectorAll('tr.click').forEach(tr => tr.addEventListener('click', () => { S.mou = S.mou === tr.dataset.mou ? '' : tr.dataset.mou; render(); }));
  const byC = {}; c.insp.forEach(I => { const o = byC[I.country] || (byC[I.country] = { n: 0, nil: 0, d: 0, mou: I.mou }); o.n++; if (!I.defs.length) o.nil++; }); c.defs.forEach(d => { if (byC[d.country]) byC[d.country].d++; });
  const cr = Object.entries(byC).sort((a, b) => b[1].d - a[1].d || b[1].n - a[1].n), cmax = Math.max(0.01, ...cr.map(([, o]) => o.n ? o.d / o.n : 0));
  $('#t-country').innerHTML = '<thead><tr><th>港口國</th><th class="n">檢查</th><th class="n">缺失</th><th>平均缺失 / 次</th><th class="n">NIL 率</th></tr></thead><tbody>' +
    (cr.length ? cr.slice(0, S.allC ? cr.length : 12).map(([k, o]) => { const avg = o.n ? o.d / o.n : 0; return `<tr class="click" data-c="${esc(k)}"><td>${esc(k)}<div>${mouTag(o.mou)}</div></td><td class="n">${o.n}</td><td class="n">${o.d}</td><td class="num"><span class="inline-bar" style="width:${(avg / cmax * 90).toFixed(0)}px"></span>${avg.toFixed(2)}</td><td class="n">${pct(o.nil, o.n)}</td></tr>`; }).join('') : '<tr><td colspan="5" class="empty">沒有符合條件的資料</td></tr>') + '</tbody>';
  $('#c-more').innerHTML = cr.length > 12 ? `<button class="btn ghost more" type="button">${S.allC ? '只看前 12 名' : `顯示全部 ${cr.length} 國`}</button>` : '';
  const mb = $('#c-more button'); if (mb) mb.addEventListener('click', () => { S.allC = !S.allC; render(); });
  $('#t-country').querySelectorAll('tr.click').forEach(tr => tr.addEventListener('click', () => { S.country = S.country === tr.dataset.c ? '' : tr.dataset.c; render(); }));
  const vi = countBy(c.insp, vkey);
  bars($('#ch-vessel'), [...countBy(c.defs, vkey)].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, val]) => { const V = M.vreg[k]; return { k, v: val, lab: esc(V ? V.name : k) + (V && V.zh ? ` <span class="dim">${esc(V.zh)}</span>` : ''), extra: `${vi.get(k) || 0} 次` }; }), { onClick: it => openVessel(it.k) });
  const byM = {}; c.insp.forEach(I => { const o = byM[I.mgmt] || (byM[I.mgmt] = { n: 0, nil: 0, d: 0, v: new Set() }); o.n++; o.v.add(vkey(I)); if (!I.defs.length) o.nil++; }); c.defs.forEach(d => { if (byM[d.mgmt]) byM[d.mgmt].d++; });
  $('#t-mgmt').innerHTML = '<thead><tr><th>管理公司</th><th class="n">船數</th><th class="n">檢查</th><th class="n">缺失</th><th class="n">NIL 率</th><th class="n">平均 / 次</th></tr></thead><tbody>' +
    Object.entries(byM).sort((a, b) => b[1].n - a[1].n).map(([k, o]) => `<tr class="click" data-m="${esc(k)}"><td>${esc(k)}</td><td class="n">${o.v.size}</td><td class="n">${o.n}</td><td class="n">${o.d}</td><td class="n">${pct(o.nil, o.n)}</td><td class="n">${o.n ? (o.d / o.n).toFixed(2) : '–'}</td></tr>`).join('') + '</tbody>';
  $('#t-mgmt').querySelectorAll('tr.click').forEach(tr => tr.addEventListener('click', () => { S.mgmt = S.mgmt === tr.dataset.m ? '' : tr.dataset.m; render(); }));
  const rp = {}; c.defs.forEach(d => { if (!d.code) return; const k = vkey(d) + '|' + d.code; (rp[k] || (rp[k] = { v: vkey(d), code: d.code, dates: new Set() })).dates.add(d.date); });
  const rl = Object.values(rp).filter(r => r.dates.size > 1).map(r => Object.assign(r, { dates: [...r.dates].sort() })).sort((a, b) => a.dates[a.dates.length - 1] < b.dates[b.dates.length - 1] ? 1 : -1);
  $('#t-repeat').innerHTML = '<thead><tr><th>船舶</th><th>代碼</th><th>開立日期</th></tr></thead><tbody>' +
    (rl.length ? rl.map(r => { const V = M.vreg[r.v]; return `<tr class="click" data-vv="${esc(r.v)}"><td>${esc(V ? V.name : r.v)}</td><td><span class="mono">${r.code}</span> <span class="dim">${esc(CAT[r.code.slice(0, 2)] || '')}</span></td><td class="num">${r.dates.map(dfmt).join('<br>')}</td></tr>`; }).join('') : '<tr><td colspan="3" class="empty">篩選範圍內沒有重複缺失</td></tr>') + '</tbody>';
  $('#t-repeat').querySelectorAll('tr.click').forEach(tr => tr.addEventListener('click', () => openVessel(tr.dataset.vv)));
}
function monthChart(c) {
  const el = $('#ch-month'); if (!el) return;
  const ys = S.years.size ? [...S.years].sort() : yearsAll(); const last = (M.asof || today()).slice(0, 7); const months = [];
  ys.forEach(y => { for (let m = 1; m <= 12; m++) { const k = `${y}-${String(m).padStart(2, '0')}`; if (k <= last) months.push(k); } });
  if (!months.length) { el.innerHTML = '<div class="empty">沒有資料</div>'; return; }
  const agg = Object.fromEntries(months.map(m => [m, { def: 0, nil: 0, items: 0 }]));
  c.insp.forEach(I => { const a = agg[I.ym]; if (!a) return; if (I.defs.length) a.def++; else a.nil++; a.items += I.defs.filter(defMatch).length; });
  const W = Math.max(320, el.clientWidth || 900), H = 210, pl = 28, pr = 6, pt = 10, pb = 34;
  const max = Math.max(4, ...months.map(m => agg[m].def + agg[m].nil)), step = max <= 6 ? 1 : max <= 12 ? 2 : max <= 25 ? 5 : 10, top = Math.ceil(max / step) * step;
  const iw = W - pl - pr, ih = H - pt - pb, bw = iw / months.length, gap = Math.min(4, bw * .25), y = v => pt + ih - (v / top) * ih;
  let g = '';
  for (let v = 0; v <= top; v += step) g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10.5" fill="var(--muted)">${v}</text>`;
  months.forEach((m, i) => {
    const a = agg[m], x = pl + i * bw + gap / 2, w = Math.max(1, bw - gap), h1 = (a.def / top) * ih, h2 = (a.nil / top) * ih, r = Math.min(3, w / 2);
    const topPath = (yy, hh, fill) => { const rr = Math.min(r, hh); return `<path d="M${x},${yy + hh} V${yy + rr} Q${x},${yy} ${x + rr},${yy} H${x + w - rr} Q${x + w},${yy} ${x + w},${yy + rr} V${yy + hh} Z" fill="${fill}"/>`; };
    if (a.def) g += a.nil ? `<rect x="${x}" y="${y(a.def)}" width="${w}" height="${h1}" fill="var(--s1)"/>` : topPath(y(a.def), h1, 'var(--s1)');
    if (a.nil) g += topPath(y(a.def + a.nil), Math.max(1, h2 - (a.def ? 2 : 0)), 'var(--s2)');
    g += `<rect x="${pl + i * bw}" y="${pt}" width="${bw}" height="${ih}" fill="transparent" data-m="${m}" class="hit"/>`;
    const mo = +m.slice(5);
    if (mo === 1 || i === 0) g += `<text x="${pl + i * bw + 2}" y="${H - 8}" font-size="11" font-weight="600" fill="var(--ink-2)">${m.slice(0, 4)}</text>`;
    if (mo === 1 && i > 0) g += `<line x1="${pl + i * bw}" x2="${pl + i * bw}" y1="${pt}" y2="${H - pb + 16}" stroke="var(--line-2)" stroke-dasharray="2 3"/>`;
    if (bw >= 16 || mo % 3 === 1) g += `<text x="${pl + i * bw + bw / 2}" y="${H - pb + 14}" text-anchor="middle" font-size="10" fill="var(--muted)">${mo}</text>`;
  });
  g += `<line x1="${pl}" x2="${W - pr}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line-2)"/>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="每月 PSC 檢查次數">${g}</svg>`;
  el.querySelectorAll('.hit').forEach(h => {
    h.addEventListener('mousemove', e => { const a = agg[h.dataset.m]; showTip(e, `<b>${h.dataset.m.replace('-', '/')}</b><div class="row"><span><i style="background:var(--s1)"></i>有缺失</span><span>${a.def} 次</span></div><div class="row"><span><i style="background:var(--s2)"></i>無缺失</span><span>${a.nil} 次</span></div><div class="row"><span>缺失項數</span><span>${a.items} 項</span></div>`); });
    h.addEventListener('mouseleave', hideTip);
  });
}

/* ---------- view: records ---------- */
const PAGE = 50;
function recordRows(c) {
  let rows = c.defs.map(d => ({ t: 'd', d, date: d.date }));
  if (S.showNil && !c.defFiltered) rows = rows.concat(c.insp.filter(I => !I.defs.length).map(I => ({ t: 'n', I, date: I.date })));
  return rows.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
}
function vRecords(v) {
  v.innerHTML = `<div class="card"><div class="toolbar"><span id="r-count"></span><label><input type="checkbox" id="r-nil"> 顯示無缺失檢查</label><span style="flex:1"></span><button class="btn" id="r-copy" type="button">複製結果（CSV）</button></div><div class="tbl-wrap"><table id="t-rec"></table></div><div class="pager" id="r-pager"></div></div>`;
  const c = current(), rows = recordRows(c), pages = Math.max(1, Math.ceil(rows.length / PAGE)); S.page = Math.min(S.page, pages - 1);
  const sl = rows.slice(S.page * PAGE, (S.page + 1) * PAGE);
  $('#r-count').innerHTML = `<b class="num">${fmt(c.defs.length)}</b> 項缺失${S.showNil && !c.defFiltered ? `，另含 <b class="num">${fmt(c.insp.filter(I => !I.defs.length).length)}</b> 次無缺失檢查` : ''}`;
  $('#r-nil').checked = S.showNil; $('#r-nil').disabled = c.defFiltered;
  $('#t-rec').innerHTML = '<thead><tr><th>日期</th><th>船舶</th><th>港口 / 港口國</th><th>案件編號</th><th>代碼</th><th>缺失內容</th><th>處理</th></tr></thead><tbody>' +
    (sl.length ? sl.map(r => {
      if (r.t === 'n') { const I = r.I; return `<tr><td class="num c-date">${dfmt(I.date)}</td><td class="c-ves"><a href="#vessels" data-v="${esc(vkey(I))}" class="vlink">${esc(I.vessel)}</a></td><td class="c-port">${esc(I.port)}<div class="dim">${esc(I.country)}</div>${mouTag(I.mou)}</td><td class="c-mg">${caseLink(I)}</td><td colspan="3" class="c-nil"><span class="pill nil">NIL 無缺失</span></td></tr>`; }
      const d = r.d; return `<tr><td class="num c-date">${dfmt(d.date)}</td><td class="c-ves"><a href="#vessels" data-v="${esc(vkey(d))}" class="vlink">${esc(d.vessel)}</a></td><td class="c-port">${esc(d.port)}<div class="dim">${esc(d.country)}</div>${mouTag(d.insp.mou)}</td><td class="c-mg">${caseLink(d.insp)}</td><td class="c-code">${d.code ? `<span class="mono">${d.code}</span><div class="dim" style="font-size:11.5px">${esc(CAT[d.cat] || '')}</div>` : '<span class="dim">—</span>'}</td><td class="nature">${esc(d.nature)}${d.rectified === 'Y' ? ' <span class="stp stp-closed">已改正</span>' : ''}</td><td class="c-act">${actPill(d)}</td></tr>`;
    }).join('') : '<tr><td colspan="7" class="empty">沒有符合條件的缺失</td></tr>') + '</tbody>';
  wireLinks($('#t-rec'));
  $('#r-pager').innerHTML = pages > 1 ? `<button class="btn" type="button" data-p="-1" ${S.page ? '' : 'disabled'}>上一頁</button><span class="num">${S.page + 1} / ${pages}</span><button class="btn" type="button" data-p="1" ${S.page < pages - 1 ? '' : 'disabled'}>下一頁</button>` : '';
  $('#r-pager').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { S.page += +b.dataset.p; render(); window.scrollTo({ top: 0 }); }));
  $('#r-nil').addEventListener('change', e => { S.showNil = e.target.checked; S.page = 0; render(); });
  $('#r-copy').addEventListener('click', () => copyCSV(rows));
}
function csvCell(v) { v = String(v ?? ''); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }
async function copyCSV(rows) {
  const lines = [['Date', 'Vessel', 'IMO', 'Port', 'Country', 'MOU', 'Management', 'Tracking No', 'Deficiency ID', 'NIL', 'Code', 'Category', 'Nature of deficiency', 'Action', 'Rectified'].join(',')];
  rows.forEach(r => { if (r.t === 'n') { const I = r.I; lines.push([I.date, I.vessel, I.imo, I.port, I.country, I.mou, I.mgmt, '', I.insp_id, 'V', '', '', '', '', ''].map(csvCell).join(',')); } else { const d = r.d; lines.push([d.date, d.vessel, d.imo, d.port, d.country, d.insp.mou, d.mgmt, d.tracking, d.def_id, '', d.code, CAT[d.cat] || '', d.nature, d.act, d.rectified].map(csvCell).join(',')); } });
  const txt = lines.join('\n');
  try { await navigator.clipboard.writeText(txt); toast(`已複製 ${fmt(rows.length)} 筆，可直接貼到 Excel`); }
  catch (e) { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(`已複製 ${fmt(rows.length)} 筆`); } catch (_) { toast('瀏覽器不允許自動複製'); } ta.remove(); }
}

/* ---------- view: vessels ---------- */
/** Tokyo MOU 公司績效等級 → 色標（績效低 = 風險高） */
const PERF_META = { 'VERY LOW': { c: 'vl', t: '高風險', e: 'Very Low' }, 'LOW': { c: 'l', t: '偏高風險', e: 'Low' }, 'MEDIUM': { c: 'm', t: '一般', e: 'Medium' }, 'HIGH': { c: 'h', t: '低風險', e: 'High' } };
const PERF_ORDER = { 'VERY LOW': 0, 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3 };
const perfPill = (p, txt) => { const m = PERF_META[String(p || '').toUpperCase()]; return m ? `<span class="rk rk-${m.c}">${txt || m.t + '・' + m.e}</span>` : '<span class="dim">—</span>'; };
const LIST_PERF = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
const LEVEL_TXT = { above: '高於平均', average: '平均', below: '低於平均' };
const fix2 = v => v === null || v === undefined ? '—' : Number(v).toFixed(2);
/** 計算基礎：依目前篩選，或近 36 個月 Tokyo MOU 檢查（與 Tokyo MOU 官方算法相同） */
function perfBase(c) {
  if (S.perfBasis !== '36m') return c.insp;
  const d = new Date(today() + 'T00:00:00'); d.setMonth(d.getMonth() - 36); const from = d.toISOString().slice(0, 10);
  return M.insp.filter(I => I.date >= from && I.mou === PSC.TOKYO);
}
/* ---------- 訪船缺失管理：登輪報告缺失的追蹤、矯正與關閉；船舶履歷 ---------- */
const VS = PSC.VSTATUS;
const VS_CLS = { [VS.OPEN]: 'open', [VS.SUBMITTED]: 'sub', [VS.CLOSED]: 'closed', [VS.CANCELLED]: 'hist' };
const vsPill = it => { const st = it.st || PSC.visitItemState(it, today()); return st.overdue ? `<span class="stp stp-over">逾期 ${-st.daysLeft} 天</span>` : `<span class="stp stp-${VS_CLS[st.status] || 'open'}">${esc(st.status)}</span>`; };
const partyTag = p => `<span class="ptag ptag-${esc(String(p || 'OTH').toLowerCase())}" title="${esc(PSC.VISIT_PARTY[p] || p)}">${esc(p || '—')}</span>`;
const dueTxt = it => { const st = it.st; if (!it.due_date) return '<span class="dim">—</span>'; if (st && st.status === VS.SUBMITTED && it.submitted_at) return `<span class="num">${dfmt(it.due_date)}</span><div class="${st.ontime === false ? 'flag' : 'dim'}" style="font-size:11.5px">${dfmt(it.submitted_at)} 提交${st.ontime === false ? '（逾期）' : ''}</div>`; return `<span class="num">${dfmt(it.due_date)}</span>${st && st.active && st.daysLeft !== null ? `<div class="${st.daysLeft < 0 && st.status === VS.OPEN ? 'flag' : 'dim'}" style="font-size:11.5px">${st.daysLeft < 0 ? '已過 ' + (-st.daysLeft) + ' 天' : st.daysLeft === 0 ? '今天到期' : '剩 ' + st.daysLeft + ' 天'}</div>` : ''}`; };
const coLabel = code => ({ FLEET: 'FML', VSHIPS: 'V.Ships', BSM: 'BSM', TSL: 'T.S. Lines', TEH: 'Teh Shipping' })[code] || code || '—';
function vfBar(stats) { const t = stats.total || 0, w = n => t ? (n / t * 100).toFixed(1) : 0; return `<div class="vfbar" title="已關閉 ${stats.closed}・待確認 ${stats.submitted}・待改善 ${stats.open}"><i class="c" style="width:${w(stats.closed)}%"></i><i class="s" style="width:${w(stats.submitted)}%"></i><i class="o" style="width:${w(stats.open)}%"></i></div>`; }
function vfStatsLine(st) { return `<span><b class="num">${st.total}</b> 項</span><span>已關閉 <b class="num">${st.closed}</b></span>${st.submitted ? `<span>待確認 <b class="num">${st.submitted}</b></span>` : ''}${st.open ? `<span>待改善 <b class="num">${st.open}</b></span>` : ''}${st.overdue ? `<span class="flag">逾期 ${st.overdue}</span>` : ''}`; }

function vVfOverview(v) {
  const items = M.vitems.filter(it => it.st.status !== VS.CANCELLED), st = PSC.visitStats(items, today());
  const kpi = (k, val, d, cls) => `<div class="kpi ${cls || ''}"><div class="k">${k}</div><div class="v num">${val}</div><div class="d">${d}</div></div>`;
  const byCo = {}; M.visits.forEach(x => { const o = byCo[x.company] || (byCo[x.company] = { visits: 0, items: [] }); o.visits++; o.items.push(...x.items); });
  const coRows = Object.entries(byCo).sort((a, b) => coLabel(a[0]) < coLabel(b[0]) ? -1 : 1).map(([c, o]) => { const s2 = PSC.visitStats(o.items, today()); const days = o.items.map(it => it.st.closeDays).filter(n => n !== null); return `<tr><td><b>${esc(coLabel(c))}</b></td><td class="n">${o.visits}</td><td class="n">${s2.total}</td><td class="n">${s2.open}</td><td class="n">${s2.submitted}</td><td class="n ${s2.overdue ? 'flag' : ''}">${s2.overdue}</td><td class="n">${s2.closed}</td><td class="n">${s2.ontimeRate === null ? '–' : Math.round(s2.ontimeRate * 100) + '%'}</td><td class="n">${days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) + ' 天' : '–'}</td></tr>`; }).join('');
  const hot = items.filter(it => it.st.active && (it.st.overdue || (it.st.daysLeft !== null && it.st.daysLeft <= 14))).sort((a, b) => (a.due_date || '9') < (b.due_date || '9') ? -1 : 1).slice(0, 30);
  v.innerHTML = `<div class="kpis">${kpi('待改善', st.open, '船管尚未提交矯正')}${kpi('逾期', st.overdue, '超過改善期限仍待改善', st.overdue ? 'crit' : '')}${kpi('待確認', st.submitted, '已提交矯正，等 PIC 確認關閉')}${kpi('14 天內到期', st.dueSoon, '請提醒船管')}${kpi('已關閉', st.closed, `關閉率 ${st.closeRate === null ? '–' : Math.round(st.closeRate * 100) + '%'}・準時 ${st.ontimeRate === null ? '–' : Math.round(st.ontimeRate * 100) + '%'}`)}</div>
  <div class="grid g2" style="margin-bottom:16px"><div class="card"><div class="section-head"><h2>逾期與 14 天內到期（${hot.length}）</h2><button class="btn" type="button" id="vf-all">全部缺失</button></div>
  ${hot.length ? `<div class="tbl-wrap" style="max-height:440px"><table><thead><tr><th>期限</th><th>船舶</th><th>項目</th><th>缺失</th><th>狀態</th></tr></thead><tbody>${hot.map(it => `<tr class="click" data-vi="${esc(it.item_id)}"><td>${dueTxt(it)}</td><td>${esc(it.v ? it.v.vessel : '')}<div class="dim mono" style="font-size:11px">${esc(it.visit_no)}</div></td><td class="mono" style="font-size:12px">${esc(it.ref)}<div class="dim">${esc(it.area)}</div></td><td style="font-size:12.5px">${esc(it.finding)}</td><td>${vsPill(it)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="note">目前沒有逾期或即將到期的缺失。</p>'}</div>
  <div class="card"><h2 style="margin-bottom:8px">管理公司矯正表現</h2><div class="tbl-wrap"><table><thead><tr><th>公司</th><th class="n">訪船</th><th class="n">缺失</th><th class="n">待改善</th><th class="n">待確認</th><th class="n">逾期</th><th class="n">已關閉</th><th class="n">準時提交</th><th class="n">平均關閉</th></tr></thead><tbody>${coRows || '<tr><td colspan="9" class="empty">尚無訪船紀錄</td></tr>'}</tbody></table></div>
  <p class="note">準時提交 = 在改善期限內提交矯正（或關閉）的比例；平均關閉 = 登錄到關閉的天數。可作為 KPMG 要求的船管監督紀錄。</p>
  <h2 style="margin:14px 0 8px">最近訪船</h2>${M.visits.slice(0, 6).map(x => `<div class="vf-mini click" data-vno="${esc(x.visit_no)}"><span class="mono">${esc(x.visit_no)}</span><span class="dim">${dfmt(x.date_from)}</span>${vfBar(x.stats)}<span class="dim" style="font-size:12px">${x.stats.closed}/${x.stats.total}</span></div>`).join('') || '<p class="note">尚無訪船紀錄</p>'}</div></div>`;
  v.querySelectorAll('[data-vi]').forEach(tr => tr.addEventListener('click', () => visitItemModal(tr.dataset.vi)));
  v.querySelectorAll('[data-vno]').forEach(tr => tr.addEventListener('click', () => openVisit(tr.dataset.vno)));
  $('#vf-all').addEventListener('click', () => setTab('vf-items'));
}
function openVisit(no) { S.visitNo = no; setTab('visits'); window.scrollTo({ top: 0 }); }

function vVisits(v) {
  if (S.visitNo) { const x = M.visits.find(x => x.visit_no === S.visitNo); if (x) return visitDetail(v, x); S.visitNo = null; }
  const f = S.vfF || (S.vfF = { st: '', co: '', party: '', q: '' });
  const cos = [...new Set(M.visits.map(x => x.company))].sort();
  const list = M.visits.filter(x => (!f.co || x.company === f.co) && (!f.party || x.party === f.party) && (!f.st || (f.st === 'open' ? !x.closed : x.closed)) && (!f.q || (x.visit_no + ' ' + x.vessel + ' ' + x.inspector + ' ' + x.port).toLowerCase().includes(f.q.toLowerCase())));
  v.innerHTML = `<div class="card" style="margin-bottom:16px"><div class="section-head"><div><h2>訪船紀錄</h2><p class="sub" style="margin:2px 0 0">每次登輪（管理公司 VIR、船東訪船、稽核等）一筆，編號沿用船管登輪審查系統的配號，例 TEH-VICTORY-2026-01-MGR-VIR。報告中的缺失逐項追蹤到關閉。</p></div>${can('editor') ? '<div class="btnrow"><button class="btn" type="button" id="vs-new">新增訪船紀錄</button><button class="btn primary" type="button" id="vs-pdf">上傳 VIR 報告 PDF</button></div>' : ''}</div>
  <div class="rp-ctl"><div class="chips">${[['', '全部'], ['open', '有未關閉缺失'], ['closed', '已全部關閉']].map(([k, l]) => `<button class="chip" type="button" data-vst="${k}" aria-pressed="${f.st === k}">${l}</button>`).join('')}</div>
  <label class="pl-sel">管理公司 <select id="vs-co">${opt('', '全部', !f.co)}${cos.map(c => opt(c, coLabel(c), f.co === c)).join('')}</select></label><label class="pl-sel">檢查方 <select id="vs-party">${opt('', '全部', !f.party)}${Object.entries(PSC.VISIT_PARTY).map(([k, l]) => opt(k, k + ' ' + l, f.party === k)).join('')}</select></label><input class="inp" id="vs-q" placeholder="搜尋編號、船名、檢查員、港口" value="${esc(f.q)}" style="max-width:260px"></div></div>
  <div class="vgrid">${list.length ? list.map(x => `<button type="button" class="vcard vfcard${x.stats.overdue ? ' risk-vl' : x.closed ? ' risk-h' : ''}" data-vno="${esc(x.visit_no)}"><span class="mono" style="font-size:12px">${esc(x.visit_no)}</span><span class="nm">${esc(x.vessel)} ${partyTag(x.party)} <span class="pill cat">${esc(x.vtype)}</span></span><span class="zh">${dfmt(x.date_from)}${x.date_to && x.date_to !== x.date_from ? ' ~ ' + dfmt(x.date_to) : ''}${x.port ? '・' + esc(x.port) : ''}${x.inspector ? '・' + esc(x.inspector) : ''}</span>${vfBar(x.stats)}<span class="st">${vfStatsLine(x.stats)}</span>${(b => b.ok === false ? `<span class="st flag">報告 ${b.report} 項，已登錄 ${b.found} 項</span>` : b.ok ? `<span class="st vr-okt">✓ 與報告 ${b.report} 項相符</span>` : '')(PSC.visitBreakdown(x, x.items))}</button>`).join('') : '<div class="empty">沒有符合條件的訪船紀錄</div>'}</div>`;
  v.querySelectorAll('[data-vst]').forEach(b => b.addEventListener('click', () => { f.st = b.dataset.vst; render(); }));
  $('#vs-co').addEventListener('change', e => { f.co = e.target.value; render(); });
  $('#vs-party').addEventListener('change', e => { f.party = e.target.value; render(); });
  let t; $('#vs-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value.trim(); render(); setTimeout(() => { const q = $('#vs-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 0); }, 300); });
  v.querySelectorAll('[data-vno]').forEach(b => b.addEventListener('click', () => openVisit(b.dataset.vno)));
  const nb = $('#vs-new'); if (nb) nb.addEventListener('click', () => editVisit(null)); const pb = $('#vs-pdf'); if (pb) pb.addEventListener('click', () => virPdfModal(null));
}
function visitItemsTable(items, opts) {
  opts = opts || {};
  const ed = can('editor');
  return `<div class="tbl-wrap"><table class="vf-t"><thead><tr>${ed ? '<th style="width:28px"><input type="checkbox" id="vi-all" aria-label="全選"></th>' : ''}${opts.visit ? '<th>訪船</th>' : ''}<th>編號</th><th>項目</th><th>缺失說明</th><th>矯正要求</th><th>期限</th><th>狀態</th><th>矯正措施</th></tr></thead><tbody>${items.map(it => `<tr class="click${it.st.status === VS.CANCELLED ? ' dim' : ''}" data-vi="${esc(it.item_id)}">${ed ? `<td data-nc><input type="checkbox" class="vi-ck" value="${esc(it.item_id)}" ${it.st.status === VS.CLOSED || it.st.status === VS.CANCELLED ? 'disabled' : ''}></td>` : ''}${opts.visit ? `<td>${esc(it.v ? it.v.vessel : '')}<div class="dim mono" style="font-size:11px">${esc(it.visit_no)}</div></td>` : ''}<td class="mono" style="font-size:12px">${esc(it.ref || '#' + it.seq)}</td><td style="font-size:12.5px">${ftypePill(it.ftype)}${esc(it.area)}<div class="dim" style="font-size:11px">${esc(it.section)}</div></td><td class="vf-txt">${esc(it.finding)}</td><td class="vf-txt">${esc(it.action_required)}</td><td>${dueTxt(it)}</td><td>${vsPill(it)}</td><td class="vf-txt dim">${esc(it.corrective_action)}</td></tr>`).join('') || `<tr><td colspan="9" class="empty">沒有缺失</td></tr>`}</tbody></table></div>`;
}
function wireItemsTable(root) {
  root.querySelectorAll('tr[data-vi]').forEach(tr => tr.addEventListener('click', e => { if (e.target.closest('[data-nc]')) return; visitItemModal(tr.dataset.vi); }));
  const all = root.querySelector('#vi-all'), bar = root.querySelector('#vi-bulk');
  const sel = () => [...root.querySelectorAll('.vi-ck:checked')].map(c => c.value);
  const upd = () => { if (!bar) return; const n = sel().length; bar.hidden = !n; bar.querySelector('b').textContent = n; };
  if (all) all.addEventListener('change', () => { root.querySelectorAll('.vi-ck:not(:disabled)').forEach(c => { c.checked = all.checked; }); upd(); });
  root.querySelectorAll('.vi-ck').forEach(c => c.addEventListener('change', upd));
  if (bar) bar.querySelectorAll('[data-bulk]').forEach(b => b.addEventListener('click', () => bulkItemsModal(sel(), b.dataset.bulk)));
}
const bulkBarHTML = () => can('editor') ? `<div class="vf-bulk" id="vi-bulk" hidden>已選 <b>0</b> 項：<button class="btn sm" type="button" data-bulk="submit">提交矯正（待確認）</button><button class="btn sm primary" type="button" data-bulk="close">確認關閉</button></div>` : '';
function visitDetail(v, x) {
  const ed = can('editor'), secs = {}; x.items.forEach(it => { if (it.st.status !== VS.CANCELLED) secs[it.section || '其他'] = (secs[it.section || '其他'] || 0) + 1; });
  const facts = [['船舶', `${esc(x.vessel)} <span class="dim">IMO ${esc(x.imo)}</span>`], ['管理公司', esc(coLabel(x.company))], ['檢查方', `${partyTag(x.party)} ${esc(PSC.VISIT_PARTY[x.party] || '')}`], ['類別', esc(x.vtype + ' ' + (PSC.VISIT_TYPE[x.vtype] || ''))], ['登輪期間', `${dfmt(x.date_from)}${x.date_to ? ' ~ ' + dfmt(x.date_to) : ''}`], ['地點', esc(x.port || '—')], ['檢查人員', esc(x.inspector || '—')], ['報告日期', x.report_date ? dfmt(x.report_date) : '—'], ['報告評分', esc(x.score || '—')], ['報告缺失數', x.reported_defects ? `${esc(x.reported_defects)} 項${x.tasks ? '／' + esc(x.tasks) + ' 題' : ''}` : '—'], ['TSL PIC', esc(x.pic || '—')], ['報告連結', x.report_url ? `<a href="${esc(x.report_url)}" target="_blank" rel="noopener">開啟報告</a>` : '—']];
  v.innerHTML = `<button class="backlink" type="button" id="vd-back">← 回到訪船紀錄</button>
  <div class="card" style="margin-bottom:16px"><div class="vprof-head"><div style="min-width:0"><div class="eyebrow">訪船編號</div><div class="tn-lg">${esc(x.visit_no)}</div></div><div class="btnrow">${ed ? '<button class="btn" type="button" id="vd-edit">編輯訪船資料</button><button class="btn" type="button" id="vd-pdf">上傳 VIR 報告 PDF</button><button class="btn" type="button" id="vd-import">匯入缺失（貼上）</button><button class="btn primary" type="button" id="vd-add">新增一項</button>' : ''}<button class="btn" type="button" id="vd-hist">船舶履歷</button></div></div>
  <dl class="facts">${facts.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>
  ${x.note ? `<div class="note" style="white-space:pre-wrap">${esc(x.note)}</div>` : ''}
  <div style="margin-top:12px">${vfBar(x.stats)}<div class="st vf-stl">${vfStatsLine(x.stats)}<span class="dim">${Object.entries(secs).map(([k, n]) => `${esc(k)} ${n}`).join('・')}</span></div></div>
  ${visitReconHTML(x)}</div>
  <div class="card" style="margin-bottom:16px"><div class="section-head"><h2>缺失追蹤（${x.stats.total}）</h2><span class="dim" style="font-size:12.5px">點一列開啟：填矯正措施、提交、確認關閉、退回；可勾選多項一次處理</span></div>${bulkBarHTML()}${visitItemsTable(x.items)}</div>
  <div class="card"><div class="section-head"><h2>報告與矯正文件（${x.docs.length}）</h2><span class="dim" style="font-size:12.5px">Drive：訪船 / ${esc((x.date_from || x.report_date || '').slice(0, 4))} / ${esc(x.visit_no)}；說明欄填缺失編號（例 ${esc(x.visit_no)}-03）可連到該項</span></div>${ed ? uploadHTML(x.visit_no, 'visit') : ''}${docListHTML(x.docs, 'visit')}</div>`;
  $('#vd-back').addEventListener('click', () => { S.visitNo = null; render(); });
  $('#vd-hist').addEventListener('click', () => { S.histShip = String(x.imo || x.vessel); setTab('vf-ships'); });
  if (ed) { $('#vd-edit').addEventListener('click', () => editVisit(x)); $('#vd-import').addEventListener('click', () => importItemsModal(x)); $('#vd-pdf').addEventListener('click', () => virPdfModal(x)); $('#vd-add').addEventListener('click', () => importItemsModal(x, true)); wireUpload(x.visit_no, x.docs, { tracking_no: x.visit_no }); }
  wireItemsTable(v);
}
function editVisit(x) {
  const isNew = !x, f = x ? Object.assign({}, x) : { visit_no: '', vessel: '', party: 'MGR', vtype: 'VIR', date_from: today(), date_to: '', port: '', inspector: '', report_date: '', score: '', reported_defects: '', reported_breakdown: '', report_url: '', pic: '', note: '' };
  const ships = PSC.currentVessels(M.vessels, today()).sort((a, b) => a.vessel < b.vessel ? -1 : 1);
  const inp = (k, l, type, ph) => `<div class="field"><label for="ev-${k}">${l}</label><input class="inp${k === 'visit_no' ? ' mono' : ''}" id="ev-${k}" data-k="${k}" type="${type || 'text'}" value="${esc(f[k] || '')}" placeholder="${esc(ph || '')}" ${k === 'visit_no' && !isNew ? 'readonly' : ''}></div>`;
  openModal({ title: isNew ? '新增訪船紀錄' : '編輯訪船資料', sub: isNew ? '編號請用船管登輪審查系統的配號；船東自行訪船沒有配號時可按「產生編號」' : esc(x.visit_no),
    html: `<div class="form"><div class="frow">${inp('visit_no', '訪船編號', 'text', 'TEH-VICTORY-2026-01-MGR-VIR')}<div class="field"><label for="ev-vessel">船舶</label><select id="ev-vessel" data-k="vessel">${opt('', '依編號自動判斷', !f.vessel)}${ships.map(s2 => opt(s2.vessel, s2.vessel, f.vessel === s2.vessel)).join('')}</select></div></div>
    <div class="frow"><div class="field"><label for="ev-party">檢查方</label><select id="ev-party" data-k="party">${Object.entries(PSC.VISIT_PARTY).map(([k, l]) => opt(k, k + ' ' + l, f.party === k)).join('')}</select></div><div class="field"><label for="ev-vtype">類別</label><select id="ev-vtype" data-k="vtype">${Object.entries(PSC.VISIT_TYPE).map(([k, l]) => opt(k, k + ' ' + l, f.vtype === k)).join('')}</select></div>${inp('date_from', '登輪日', 'date')}${inp('date_to', '離船日', 'date')}</div>
    <div class="frow">${inp('port', '地點／航段', 'text', 'Xiamen → Shekou（航行中）')}${inp('inspector', '檢查人員', 'text', 'Wang Yun Cheng')}${inp('report_date', '報告日期', 'date')}${inp('score', '報告評分', 'text', '3.9')}${inp('reported_defects', '報告缺失數', 'number', '31')}</div>
    <div class="frow">${inp('reported_breakdown', '報告各章節缺失數', 'text', 'Radio / Navigation=6; Safety / LSA / FFA=7; Technical=12')}</div>
    <div class="frow">${inp('report_url', '報告連結（Drive）', 'url', 'https://drive.google.com/file/d/…')}${inp('pic', 'TSL PIC', 'text', '空白 = 該船 PIC')}</div>
    <div class="field"><label for="ev-note">備註</label><textarea class="inp" id="ev-note" data-k="note" rows="2">${esc(f.note || '')}</textarea></div><div id="ev-err" class="err"></div></div>`,
    foot: `${isNew ? '<button class="btn ghost" type="button" id="ev-gen">產生編號</button><span style="flex:1"></span>' : ''}<button class="btn ghost" type="button" data-close>取消</button><button class="btn primary" type="button" id="ev-save">儲存</button>`,
    onMount(root, close) {
      const q = s2 => root.querySelector(s2);
      root.querySelector('[data-close]').addEventListener('click', close);
      const no = q('#ev-visit_no');
      if (isNew) {
        no.addEventListener('input', () => { const p = PSC.parseVisitNo(no.value); if (!p) return; const hit = ships.find(s2 => s2.vessel.toUpperCase() === p.vessel); if (hit) q('#ev-vessel').value = hit.vessel; if (PSC.VISIT_PARTY[p.party]) q('#ev-party').value = p.party; if (PSC.VISIT_TYPE[p.vtype]) q('#ev-vtype').value = p.vtype; });
        q('#ev-gen').addEventListener('click', () => { const vs = q('#ev-vessel').value; if (!vs) { q('#ev-err').textContent = '請先選船舶'; return; } no.value = PSC.nextVisitNo(M.visits, vs, (q('#ev-date_from').value || today()).slice(0, 4), q('#ev-party').value, q('#ev-vtype').value); q('#ev-err').textContent = ''; });
      }
      q('#ev-save').addEventListener('click', () => {
        const row = { is_new: isNew }; root.querySelectorAll('[data-k]').forEach(el => { row[el.dataset.k] = el.value.trim(); });
        if (!row.visit_no) { q('#ev-err').textContent = '請填訪船編號'; return; }
        if (!row.vessel && !PSC.parseVisitNo(row.visit_no)) { q('#ev-err').textContent = '編號格式不是「船名-年度-序號-檢查方-類別」，請選擇船舶'; return; }
        run(async () => { const r = await api('saveVisit', row); await close(); S.visitNo = r.visit_no; await reload(); setTab('visits'); toast('已儲存 ' + r.visit_no); if (isNew) importItemsModal(M.visits.find(x2 => x2.visit_no === r.visit_no)); }, q('#ev-save'));
      });
    } });
}
function importItemsModal(x, single) {
  if (!x) return;
  openModal({ title: single ? '新增缺失' : '匯入缺失（貼上）', sub: esc(x.visit_no),
    html: single ? `<div class="form"><div class="frow"><div class="field"><label for="ia-ref">編號</label><input class="inp mono" id="ia-ref" placeholder="4.016"></div><div class="field"><label for="ia-area">項目</label><input class="inp" id="ia-area" placeholder="BNWAS"></div><div class="field"><label for="ia-due">改善期限</label><input class="inp" type="date" id="ia-due"></div></div>
      <div class="field"><label for="ia-f">缺失說明</label><textarea class="inp" id="ia-f" rows="2"></textarea></div><div class="field"><label for="ia-a">矯正要求</label><textarea class="inp" id="ia-a" rows="2"></textarea></div><div id="ia-err" class="err"></div></div>`
      : `<div class="form"><p class="note" style="margin:0">可貼上兩種格式：<b>表格</b>（從 Excel 或 VIR 匯出檔複製，欄位：編號、項目、缺失說明、矯正要求、改善期限，可含標題列）或 <b>條列文字</b>（例如「項目 4.016 (BNWAS)／缺失說明：…／矯正要求：…／改善期限：2026/10/31」，Gemini 整理的格式可直接貼）。重複的項目會自動略過。</p>
      <textarea class="inp mono" id="ia-text" rows="10" placeholder="項目 4.016 (BNWAS)&#10;缺失說明：導航人員對 BNWAS 操作與測試程序不熟悉。&#10;矯正要求：加強人員培訓並張貼操作程序。&#10;改善期限：2026/10/31。"></textarea>
      <div id="ia-prev"></div><div id="ia-err" class="err"></div></div>`,
    foot: `<button class="btn ghost" type="button" data-close>取消</button><button class="btn primary" type="button" id="ia-go">${single ? '新增' : '匯入'}</button>`,
    onMount(root, close) {
      const q = s2 => root.querySelector(s2);
      root.querySelector('[data-close]').addEventListener('click', close);
      let parsed = [];
      if (!single) q('#ia-text').addEventListener('input', () => {
        parsed = PSC.parseVisitItems(q('#ia-text').value);
        q('#ia-prev').innerHTML = parsed.length ? `<div class="tbl-wrap" style="max-height:260px"><table class="vf-t"><thead><tr><th>編號</th><th>項目</th><th>缺失說明</th><th>矯正要求</th><th>期限</th></tr></thead><tbody>${parsed.map(it => `<tr><td class="mono">${esc(it.ref)}</td><td>${esc(it.area)}<div class="dim" style="font-size:11px">${esc(it.section || '')}</div></td><td class="vf-txt">${esc(it.finding)}</td><td class="vf-txt">${esc(it.action_required)}</td><td class="num ${it.due_date ? '' : 'flag'}">${it.due_date ? dfmt(it.due_date) : '未讀到'}</td></tr>`).join('')}</tbody></table></div><p class="note" style="margin:6px 0 0">讀到 ${parsed.length} 項${parsed.some(it => !it.due_date) ? '；沒有期限的項目匯入後可個別補上' : ''}</p>` : (q('#ia-text').value.trim() ? '<p class="flag">看不懂這段內容，請確認格式</p>' : '');
      });
      q('#ia-go').addEventListener('click', () => {
        const items = single ? [{ ref: q('#ia-ref').value.trim(), area: q('#ia-area').value.trim(), finding: q('#ia-f').value.trim(), action_required: q('#ia-a').value.trim(), due_date: q('#ia-due').value }] : parsed;
        if (!items.length || !items.some(it => it.finding || it.action_required)) { q('#ia-err').textContent = single ? '請填缺失說明' : '沒有讀到缺失'; return; }
        run(async () => { const r = await api('importVisitItems', { visit_no: x.visit_no, items }); await close(); await reload(); toast(`已新增 ${r.added.length} 項${r.skipped ? '，重複略過 ' + r.skipped : ''}`); }, q('#ia-go'));
      });
    } });
}
/* ---------- PDF 照片壓縮（瀏覽器端）：只重新壓縮 PDF 內的照片，文字與向量內容不動 ---------- */
const PDFLIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
let pdfLibP = null;
function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  return pdfLibP || (pdfLibP = new Promise((res, rej) => {
    const sc = document.createElement('script'); sc.src = PDFLIB_URL;
    sc.onload = () => window.PDFLib ? res(window.PDFLib) : (pdfLibP = null, rej(new Error('PDF 壓縮元件載入失敗')));
    sc.onerror = () => { pdfLibP = null; rej(new Error('無法載入 PDF 壓縮元件，請確認網路可連到 cdnjs.cloudflare.com')); };
    document.head.appendChild(sc);
  }));
}
/** 壓縮等級：依序嘗試，直到小於目標大小 */
const PDF_SHRINK_LEVELS = [{ max: 1600, q: 0.72 }, { max: 1280, q: 0.62 }, { max: 1024, q: 0.55 }, { max: 800, q: 0.5 }];
async function shrinkPdf(src, targetBytes, onProg) {
  const L = await loadPdfLib(), { PDFDocument, PDFName, PDFRawStream, PDFNumber, PDFArray, PDFDict, PDFRef, decodePDFRawStream } = L;
  const bytes = src instanceof Uint8Array ? src : new Uint8Array(await src.arrayBuffer());
  const num = v => v instanceof PDFNumber ? v.asNumber() : (v && v.asNumber ? v.asNumber() : null);
  let best = null;
  for (let li = 0; li < PDF_SHRINK_LEVELS.length; li++) {
    const lv = PDF_SHRINK_LEVELS[li];
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }), ctx = doc.context;
    const res = (o) => o instanceof PDFRef ? ctx.lookup(o) : o;
    const imgs = [];
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue;
      const d = obj.dict; if (d.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
      if (obj.contents.length < 40000) continue; // 小圖（標誌、圖示）不動
      let f = res(d.get(PDFName.of('Filter'))); if (f instanceof PDFArray) f = f.size() === 1 ? res(f.get(0)) : null;
      const fname = f ? f.toString() : '';
      if (d.get(PDFName.of('ImageMask')) || d.get(PDFName.of('Mask'))) continue;
      let cs = res(d.get(PDFName.of('ColorSpace'))), comps = 0;
      if (cs === PDFName.of('DeviceRGB')) comps = 3; else if (cs === PDFName.of('DeviceGray')) comps = 1;
      else if (cs instanceof PDFArray && res(cs.get(0)) === PDFName.of('ICCBased')) { const icc = res(cs.get(1)); const n = icc && icc.dict ? num(res(icc.dict.get(PDFName.of('N')))) : null; if (n === 3 || n === 1) comps = n; }
      if (!comps) continue; // CMYK、Indexed 等不動
      if (fname === '/DCTDecode') imgs.push({ ref, obj, kind: 'jpeg', comps });
      else if (fname === '/FlateDecode' && num(res(d.get(PDFName.of('BitsPerComponent')))) === 8) imgs.push({ ref, obj, kind: 'flate', comps });
    }
    let done = 0;
    for (const im of imgs) {
      const d = im.obj.dict, w = num(res(d.get(PDFName.of('Width')))), h = num(res(d.get(PDFName.of('Height'))));
      try {
        let bmp;
        if (im.kind === 'jpeg') bmp = await createImageBitmap(new Blob([im.obj.contents], { type: 'image/jpeg' }));
        else {
          const raw = decodePDFRawStream(im.obj).decode(); if (raw.length < w * h * im.comps) continue;
          const id = new ImageData(w, h), px = id.data;
          for (let i = 0, j = 0; i < w * h; i++, j += im.comps) { if (im.comps === 3) { px[i * 4] = raw[j]; px[i * 4 + 1] = raw[j + 1]; px[i * 4 + 2] = raw[j + 2]; } else { px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = raw[j]; } px[i * 4 + 3] = 255; }
          bmp = await createImageBitmap(id);
        }
        const k = Math.min(1, lv.max / Math.max(bmp.width, bmp.height)), nw = Math.max(1, Math.round(bmp.width * k)), nh = Math.max(1, Math.round(bmp.height * k));
        const cv = document.createElement('canvas'); cv.width = nw; cv.height = nh;
        const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, nw, nh); g.drawImage(bmp, 0, 0, nw, nh); bmp.close && bmp.close();
        const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', lv.q));
        const out = new Uint8Array(await blob.arrayBuffer());
        if (out.length < im.obj.contents.length * 0.9) {
          const nd = d.clone(ctx);
          nd.set(PDFName.of('Filter'), PDFName.of('DCTDecode')); nd.set(PDFName.of('Width'), PDFNumber.of(nw)); nd.set(PDFName.of('Height'), PDFNumber.of(nh));
          nd.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8)); nd.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
          nd.delete(PDFName.of('DecodeParms')); nd.delete(PDFName.of('Decode'));
          ctx.assign(im.ref, PDFRawStream.of(nd, out));
        }
      } catch (e) { /* 這張圖解不開就保留原樣 */ }
      done++; if (onProg) onProg(li, done, imgs.length);
    }
    const saved = await doc.save({ useObjectStreams: true });
    best = { bytes: saved, level: li, images: imgs.length, max: lv.max, q: lv.q };
    if (saved.length <= targetBytes) break;
  }
  return best;
}
const MB = n => (n / 1048576).toFixed(1) + ' MB';
const SHRINK_TARGET = Math.floor(MAX_MB * 0.97 * 1048576); // 留一點餘裕給上傳
/** 上傳前處理：超過 MAX_MB 的 PDF 壓縮照片、圖片縮小；回傳可上傳的 Blob */
async function fitUpload(file, onProg) {
  if (file.size <= MAX_MB * 1048576) return { blob: file, size: file.size, shrunk: false };
  const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name), isImg = /^image\/(jpeg|png|webp)$/i.test(file.type);
  if (isPdf) {
    const r = await shrinkPdf(file, SHRINK_TARGET, (lv, i, n) => onProg && onProg(`壓縮照片（第 ${lv + 1} 級）${i} / ${n}`));
    if (r.bytes.length > MAX_MB * 1048576) throw new Error(`${file.name} 壓縮後仍有 ${MB(r.bytes.length)}，超過 ${MAX_MB} MB；請把附件拆成兩份再上傳`);
    return { blob: new Blob([r.bytes], { type: 'application/pdf' }), size: r.bytes.length, shrunk: true, from: file.size, level: r.level, max: r.max };
  }
  if (isImg) {
    const bmp = await createImageBitmap(file);
    for (const [mx, q] of [[2400, 0.82], [1800, 0.75], [1400, 0.7]]) {
      const k = Math.min(1, mx / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      const b = await new Promise(r => cv.toBlob(r, 'image/jpeg', q));
      if (b.size <= MAX_MB * 1048576) return { blob: b, size: b.size, shrunk: true, from: file.size, max: mx };
    }
  }
  throw new Error(`${file.name} 有 ${MB(file.size)}，超過 ${MAX_MB} MB${isPdf || isImg ? '' : '（只有 PDF 與照片可自動壓縮）'}`);
}
const shrinkNote = u => u.shrunk ? `（原檔 ${MB(u.from)}，照片已壓縮為 ${MB(u.size)}）` : '';
/* ---------- v1.8 VIR 報告 PDF 自動匯入與缺失數比對 ---------- */
const PDFJS_V = '3.11.174', PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_V}/`;
let pdfjsP = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return pdfjsP || (pdfjsP = new Promise((res, rej) => {
    const sc = document.createElement('script'); sc.src = PDFJS_CDN + 'pdf.min.js';
    sc.onload = () => { const L = window.pdfjsLib; if (!L) { pdfjsP = null; return rej(new Error('PDF 讀取元件載入失敗')); } L.GlobalWorkerOptions.workerSrc = PDFJS_CDN + 'pdf.worker.min.js'; res(L); };
    sc.onerror = () => { pdfjsP = null; rej(new Error('無法載入 PDF 讀取元件，請確認網路可連到 cdnjs.cloudflare.com')); };
    document.head.appendChild(sc);
  }));
}
/** PDF → 每頁文字片段（含座標：x 由左、y 由上），交給 PSC.parseVirPages 依欄位位置重組表格 */
async function pdfTextPages(file, onProg) {
  const L = await loadPdfJs(), doc = await L.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise, pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i), tc = await pg.getTextContent(), vp = pg.getViewport({ scale: 1 });
    pages.push({ page: i, items: tc.items.filter(t => t.str && t.str.trim()).map(t => ({ str: t.str, x: +t.transform[4].toFixed(1), y: +(vp.height - t.transform[5]).toFixed(1), w: +(t.width || 0).toFixed(1) })) });
    if (onProg) onProg(i, doc.numPages);
  }
  doc.destroy && doc.destroy();
  return pages;
}
const fileB64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('讀取檔案失敗')); r.readAsDataURL(f); });
const secKey = n => String(n || '').replace(/\s+/g, '').toUpperCase();
/** 檔名開頭的訪船編號，例 TEH-VICTORY-2026-01-MGR-VIR_VIR Report.pdf */
function visitNoFromName(name) { const m = String(name || '').toUpperCase().match(/([A-Z0-9]+(?:-[A-Z0-9]+)*?-\d{4}-\d{1,3}-[A-Z]{2,4}-[A-Z]{2,4})(?![A-Z])/); return m && PSC.parseVisitNo(m[1]) ? m[1] : ''; }
function shipByName(n) { const k = String(n || '').toUpperCase().replace(/\s+/g, ' ').trim(); return k ? PSC.currentVessels(M.vessels, today()).find(s2 => s2.vessel.toUpperCase() === k) : null; }

/** 比對表：報告摘要 vs DEFECT SUMMARY 擷取 vs 內文評分題目 vs 系統已登錄 */
const FTYPE_CLS = t => /defic|non.?conform/i.test(t || '') ? 'ft-d' : 'ft-o';
const ftypePill = t => t ? `<span class="ftype ${FTYPE_CLS(t)}">${esc(t)}</span>` : '';
/** V.Ships Shipsure：沒有封面缺失數，以連號、重複、Actions 表交叉檢查 */
function shipsureReconHTML(job) {
  const r = job.parse, sm = r.summary, have = M.vitems.filter(it => it.visit_no === job.visitNo && it.st.status !== VS.CANCELLED);
  const types = Object.keys(sm.byType || {}), secs = Object.keys(sm.categories);
  const cnt = (sec, t) => r.defects.filter(d => d.section === sec && (!t || d.ftype === t)).length;
  const haveN = sec => have.filter(it => secKey(it.section) === secKey(sec)).length;
  return `<div class="tbl-wrap"><table class="vr-t"><thead><tr><th>System / Area</th>${types.map(t => `<th class="n">${esc(t)}</th>`).join('')}<th class="n">合計</th><th class="n">報告已清除</th><th class="n">系統已登錄</th></tr></thead><tbody>${secs.map(sec => `<tr><td>${esc(sec)}</td>${types.map(t => `<td class="n">${cnt(sec, t) || '·'}</td>`).join('')}<td class="n">${cnt(sec)}</td><td class="n">${r.defects.filter(d => d.section === sec && d.cleared_date).length}</td><td class="n">${haveN(sec)}</td></tr>`).join('')}
  <tr class="vr-sum"><td>合計</td>${types.map(t => `<td class="n">${sm.byType[t]}</td>`).join('')}<td class="n">${r.defects.length}</td><td class="n">${sm.cleared}</td><td class="n">${have.length}</td></tr></tbody></table></div>
  <ul class="vr-checks">${r.checks.map(c => `<li class="${c.ok ? 'ok' : 'ng'}">${c.ok ? '✓' : '✗'} ${esc(c.label)}${c.detail ? `：<span class="mono">${esc(c.detail)}</span>` : ''}</li>`).join('')}</ul>
  <p class="note" style="margin:6px 0 0">V.Ships（Shipsure）報告沒有封面缺失總數，改以 Insp. Ref. 是否連號、編號是否重複、Actions 表是否對得上來確認沒有漏讀。報告上已有 Cleared 日期的項目匯入後為「待確認」，由 PIC 確認關閉。</p>`;
}
/** BSM：附錄缺失單 vs 主文評為 No／Fair／Poor 的題目 */
function bsmReconHTML(job) {
  const r = job.parse, sm = r.summary, have = M.vitems.filter(it => it.visit_no === job.visitNo && it.st.status !== VS.CANCELLED);
  const neg = r.reconcile.reduce((a, x) => a + x.negative, 0), lst = r.reconcile.reduce((a, x) => a + x.listed, 0);
  const subs = Object.keys(sm.categories);
  return `<div class="grid g2" style="gap:12px"><div class="tbl-wrap"><table class="vr-t"><thead><tr><th>主文章節</th><th class="n">題數</th><th class="n">評為 No／Fair／Poor</th><th class="n">列入附錄缺失</th><th></th></tr></thead><tbody>${r.reconcile.map(x => `<tr><td>${esc(x.section)}</td><td class="n">${x.questions}</td><td class="n">${x.negative || '·'}</td><td class="n">${x.listed || '·'}</td><td>${x.negative === x.listed ? '<span class="vr-ok">✓</span>' : '<span class="vr-ng">✗</span>'}</td></tr>`).join('')}
  <tr class="vr-sum"><td>合計</td><td class="n">${sm.tasks}</td><td class="n">${neg}</td><td class="n">${lst}</td><td>${neg === lst ? '<span class="vr-ok">✓</span>' : '<span class="vr-ng">✗</span>'}</td></tr></tbody></table></div>
  <div class="tbl-wrap"><table class="vr-t"><thead><tr><th>附錄 SubCategory</th><th class="n">缺失</th><th class="n">系統已登錄</th></tr></thead><tbody>${subs.map(k => `<tr><td>${esc(k)}</td><td class="n">${sm.categories[k]}</td><td class="n">${have.filter(it => secKey(it.section) === secKey(k)).length}</td></tr>`).join('')}<tr class="vr-sum"><td>合計</td><td class="n">${r.defects.length}</td><td class="n">${have.length}</td></tr></tbody></table></div></div>
  <ul class="vr-checks">${r.checks.map(c => `<li class="${c.ok ? 'ok' : 'ng'}">${c.ok ? '✓' : '✗'} ${esc(c.label)}${c.detail ? `：<span class="mono">${esc(c.detail)}</span>` : ''}</li>`).join('')}${sm.unanswered && sm.unanswered.length ? `<li class="ng">✗ 主文有 ${sm.unanswered.length} 題讀不到評語：${esc(sm.unanswered.slice(0, 8).join('、'))}</li>` : ''}</ul>
  <p class="note" style="margin:6px 0 0">BSM 報告的缺失列在附錄「SUPERINTENDENT VESSEL INSPECTION」缺失單（匯入以此為準）；主文 ${sm.tasks} 題中評為 No／Fair／Poor 的題目應該都列入附錄，用來確認沒有漏列。直接原因與根本原因寫在缺失說明下方，負責職位寫在矯正要求。</p>
  ${r.onlyInDetail.length ? `<div class="callout" style="margin:8px 0 0">主文評為負面、但附錄沒列：${r.onlyInDetail.map(b => esc(b.section + ' 第 ' + b.body_no + ' 題（' + b.answer + '）')).join('、')}。這幾項不會自動匯入，請向船管確認。</div>` : ''}`;
}
function virReconHTML(job) {
  if (job.parse.format === 'SHIPSURE') return shipsureReconHTML(job);
  if (job.parse.format === 'BSM') return bsmReconHTML(job);
  const r = job.parse, have = M.vitems.filter(it => it.visit_no === job.visitNo && it.st.status !== VS.CANCELLED);
  const rows = r.reconcile.map(x => ({ section: x.section, report: x.report, found: x.found }));
  const cnt = (arr, k) => arr.filter(it => secKey(it.section) === k).length;
  const total = { report: r.summary.defects, found: r.defects.length, detail: r.detailDefects.length, have: have.length };
  const ok = (a, b) => a === b ? '<span class="vr-ok">✓</span>' : '<span class="vr-ng">✗</span>';
  return `<div class="tbl-wrap"><table class="vr-t"><thead><tr><th>章節</th><th class="n">① 報告摘要</th><th class="n">② DEFECT SUMMARY 擷取</th><th class="n">③ 內文評分題目</th><th class="n">④ 系統已登錄</th><th>①=②</th></tr></thead><tbody>${rows.map(x => { const k = secKey(x.section); return `<tr><td>${esc(x.section)}</td><td class="n">${x.report}</td><td class="n">${x.found}</td><td class="n">${cnt(r.detailDefects, k)}</td><td class="n">${cnt(have, k)}</td><td>${ok(x.report, x.found)}</td></tr>`; }).join('')}
  <tr class="vr-sum"><td>合計</td><td class="n">${total.report === null ? '讀不到' : total.report}</td><td class="n">${total.found}</td><td class="n">${total.detail}</td><td class="n">${total.have}</td><td>${ok(total.report, total.found)}</td></tr></tbody></table></div>
  <p class="note" style="margin:6px 0 0">① 封面「${total.report ?? '?'} Defects (out of ${r.summary.tasks ?? '?'} Tasks)」及各類別數量；② 報告最後的 DEFECT SUMMARY 逐項擷取（匯入以此為準）；③ 各章節題目中評分 1–3 的項目，用來交叉檢查有沒有漏列；④ 匯入前系統內這筆訪船已有的缺失。</p>
  ${r.onlyInDetail.length ? `<div class="callout" style="margin:8px 0 0">內文評分有缺失、但 DEFECT SUMMARY 沒列：${r.onlyInDetail.map(d => esc(d.ref + ' ' + (d.area || ''))).join('、')}。這幾項不會自動匯入，請向船管確認。</div>` : ''}`;
}
function virItemsHTML(job) {
  const ik = it => String(it.ref || '').trim() ? 'R|' + String(it.ref).trim().toUpperCase() : 'F|' + String(it.finding || '').trim().toUpperCase().slice(0, 60);
  const haveRef = new Set(M.vitems.filter(it => it.visit_no === job.visitNo).map(ik));
  return `<div class="tbl-wrap" style="max-height:320px"><table class="vf-t"><thead><tr><th></th><th>編號</th><th>項目／題目</th><th>缺失說明</th><th>矯正要求</th><th>期限</th><th>代碼</th></tr></thead><tbody>${job.parse.defects.map(d => `<tr><td>${haveRef.has(ik(d)) ? '<span class="stp stp-hist" title="系統已有這個編號：保留原文字，只補齊章節、題目與代碼">已有</span>' : '<span class="stp stp-open">新增</span>'}</td><td class="mono" style="white-space:nowrap">${d.ref ? esc(d.ref) : '<span class="dim" title="報告中沒有題號（例：其他觀察）">無題號</span>'}</td><td>${ftypePill(d.ftype)}${esc(d.area || (d.ftype ? d.section : ''))}<div class="dim" style="font-size:11px">${esc(d.question || '')}</div></td><td class="vf-txt">${esc(d.finding)}</td><td class="vf-txt">${esc(d.action_required)}${d.cleared_date ? `<div class="vr-okt" style="font-size:11.5px">報告記錄 ${dfmt(d.cleared_date)} 已清除${d.cleared_by ? '（' + esc(d.cleared_by) + '）' : ''}</div>` : ''}</td><td class="num ${d.due_date ? '' : 'flag'}">${d.due_date ? dfmt(d.due_date) : '—'}</td><td class="mono dim" style="font-size:11px">${[d.pms_code && 'PMS ' + d.pms_code, d.psc_code && 'PSC ' + d.psc_code, d.viq_code && 'VIQ ' + d.viq_code].filter(Boolean).map(esc).join('<br>')}</td></tr>`).join('')}</tbody></table></div>`;
}
function virJobHTML(job, i) {
  const r = job.parse, sm = r.summary, ex = M.visits.find(x => x.visit_no === job.visitNo), ves = shipByName(sm.vessel) || (ex && { vessel: ex.vessel });
  const shp = r.format === 'SHIPSURE', bsm = r.format === 'BSM';
  const facts = bsm ? [['格式', 'BSM Ship Inspection Report'], ['船舶', esc(sm.vessel || '—') + (sm.imo ? ` <span class="dim">IMO ${esc(sm.imo)}</span>` : '') + (ves ? '' : ' <span class="flag">船隊主檔找不到</span>')], ['檢查期間', sm.date ? dfmt(sm.date) + (sm.date_to && sm.date_to !== sm.date ? ' ~ ' + dfmt(sm.date_to) : '') : '—'], ['檢查人員', esc(sm.by || '—')], ['地點', esc(sm.at || '—')], ['主文題數', `${sm.tasks}（評語 ${sm.answered}）`], ['附錄缺失', String(r.defects.length)]]
    : shp ? [['格式', 'V.Ships Shipsure'], ['船舶', esc(sm.vessel || '—') + (sm.imo ? ` <span class="dim">IMO ${esc(sm.imo)}</span>` : '') + (ves ? '' : ' <span class="flag">船隊主檔找不到</span>')], ['檢查期間', sm.date ? dfmt(sm.date) + (sm.date_to && sm.date_to !== sm.date ? ' ~ ' + dfmt(sm.date_to) : '') : '—'], ['檢查人員', esc(sm.by || '—')], ['公司', esc(sm.company || '—')], ['地點', esc(sm.at || '—')], ['類型', esc(sm.type || '—')], ['已清除', `${sm.cleared} / ${r.defects.length}`]]
    : [['格式', 'FML Paris'], ['船舶', esc(sm.vessel || '—') + (ves ? '' : ' <span class="flag">船隊主檔找不到</span>')], ['檢查日期', sm.date ? dfmt(sm.date) : '—'], ['檢查人員', esc(sm.by || '—')], ['地點', esc(sm.at || '—')], ['類型', esc(sm.type || '—')], ['評分', esc(sm.score || '—')], ['報告狀態', sm.status ? esc(sm.status) + (/progress/i.test(sm.status) ? ' <span class="flag">未定稿</span>' : '') : '—']];
  return `<div class="vr-job" data-job="${i}"><div class="vr-head"><div style="min-width:0"><div class="mono dim" style="font-size:11.5px;word-break:break-all">${esc(job.file.name)}・${r.defects.length ? '' : '<span class="flag">讀不到缺失</span>・'}${MB(job.file.size)}${job.up && job.up.shrunk ? ` → <b class="vr-okt">壓縮後 ${MB(job.up.size)}</b>（照片長邊 ${job.up.max}px，文字不變）` : job.upErr ? ` <span class="flag">${esc(job.upErr)}</span>` : ''}</div>
    <div class="vr-no"><label>訪船編號 <input class="inp mono" data-no="${i}" value="${esc(job.visitNo)}"></label>${ex ? `<span class="stp stp-sub">已有紀錄・已登錄 ${M.vitems.filter(it => it.visit_no === ex.visit_no && it.st.status !== VS.CANCELLED).length} 項</span>` : '<span class="stp stp-open">新建訪船紀錄</span>'}</div></div>
    <span class="vr-badge ${r.ok ? 'ok' : 'ng'}">${shp || bsm ? (r.ok ? `檢查通過・${r.defects.length} 項` : `請檢查・讀到 ${r.defects.length} 項`) : r.ok ? `比對相符 ${r.defects.length} / ${sm.defects}` : `比對不符 ${r.defects.length} / ${sm.defects ?? '?'}`}</span></div>
    <dl class="facts">${facts.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>
    ${/progress/i.test(sm.status || '') ? '<div class="callout" style="margin:0">報告狀態為 In progress（船管尚未定稿），缺失數可能還會變動；定稿後再上傳一次，系統只補新增的項目。</div>' : ''}
    ${virReconHTML(job)}
    <details class="vr-items"><summary>缺失清單（${r.defects.length} 項，標「已有」的編號不重複建立）</summary>${virItemsHTML(job)}</details></div>`;
}
function virPdfModal(x) {
  const jobs = [];
  openModal({ title: '上傳 VIR 報告 PDF', sub: x ? esc(x.visit_no) : '自動讀出缺失、比對報告摘要的缺失數，並建立／更新訪船紀錄', wide: true,
    html: `<div class="form"><label class="vr-drop" id="vr-drop"><input type="file" id="vr-file" accept="application/pdf,.pdf" multiple hidden><b>選擇或拖曳 VIR 報告 PDF</b><span class="dim">可一次多份。檔名開頭若是訪船編號（例 TEH-VICTORY-2026-01-MGR-VIR_VIR Report.pdf）會自動對應${x ? '；否則歸到目前這筆訪船' : '；否則依船名與日期產生新編號'}。支援 FML（Paris）、V.Ships（Shipsure）、BSM 三種報告格式，自動判斷。超過 ${MAX_MB} MB 的 PDF 會自動壓縮照片後歸檔（文字與表格不變）。</span></label>
      <div id="vr-prog" class="dim" style="font-size:12.5px"></div><div id="vr-jobs"></div>
      <div id="vr-opts" hidden class="vr-opts"><label><input type="checkbox" id="vr-upd" checked> 以報告內容更新訪船資料（評分、缺失數、章節分布、檢查人員、地點）</label><label><input type="checkbox" id="vr-up" checked> PDF 歸檔到 Drive（文件類別 VIR）</label></div><div id="vr-err" class="err"></div></div>`,
    foot: `<button class="btn ghost" type="button" data-close>取消</button><button class="btn primary" type="button" id="vr-go" disabled>匯入</button>`,
    onMount(root, close) {
      const q = s2 => root.querySelector(s2), go = q('#vr-go');
      root.querySelector('[data-close]').addEventListener('click', close);
      const draw = () => {
        q('#vr-jobs').innerHTML = jobs.map(virJobHTML).join('');
        q('#vr-opts').hidden = !jobs.length;
        const n = jobs.reduce((a, j) => a + j.parse.defects.length, 0);
        go.disabled = !jobs.some(j => j.parse.defects.length); go.textContent = jobs.length > 1 ? `匯入 ${jobs.length} 份（${n} 項）` : `匯入 ${n} 項`;
        root.querySelectorAll('[data-no]').forEach(inp => inp.addEventListener('change', () => { jobs[+inp.dataset.no].visitNo = inp.value.trim().toUpperCase(); draw(); }));
      };
      const add = async files => {
        q('#vr-err').textContent = '';
        for (const f of files) {
          if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { q('#vr-err').textContent = f.name + ' 不是 PDF'; continue; }
          try {
            q('#vr-prog').textContent = `讀取 ${f.name}…`;
            const pages = await pdfTextPages(f, (i, n) => { q('#vr-prog').textContent = `讀取 ${f.name}：第 ${i} / ${n} 頁`; });
            const parse = PSC.parseInspectionPages(pages), sm = parse.summary;
            if (sm.defects === null && !parse.defects.length) { q('#vr-err').textContent = f.name + '：認不出報告格式（目前支援 FML Paris、V.Ships Shipsure、BSM），請改用「匯入缺失（貼上）」'; continue; }
            let no = visitNoFromName(f.name) || (x && !jobs.some(j => j.visitNo === x.visit_no) ? x.visit_no : '');
            if (!no) { const v = shipByName(sm.vessel); if (v) { const taken = M.visits.concat(jobs.map(j => ({ visit_no: j.visitNo }))); no = PSC.nextVisitNo(taken, v.vessel, (sm.date || today()).slice(0, 4), 'MGR', 'VIR'); } }
            const job = { file: f, parse, visitNo: no };
            if (f.size > MAX_MB * 1048576) { try { job.up = await fitUpload(f, t => { q('#vr-prog').textContent = `${f.name}：${t}`; }); } catch (e) { job.upErr = e.message; } }
            jobs.push(job);
          } catch (e) { q('#vr-err').textContent = f.name + '：' + (e.message || e); }
        }
        q('#vr-prog').textContent = ''; draw();
      };
      q('#vr-file').addEventListener('change', e => { add([...e.target.files]); e.target.value = ''; });
      const dz = q('#vr-drop');
      ['dragenter', 'dragover'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add('on'); }));
      ['dragleave', 'drop'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.remove('on'); }));
      dz.addEventListener('drop', e => add([...e.dataTransfer.files]));
      go.addEventListener('click', () => {
        const bad = jobs.find(j => j.parse.defects.length && !PSC.parseVisitNo(j.visitNo) && !M.visits.some(v => v.visit_no === j.visitNo));
        if (bad) { q('#vr-err').textContent = bad.file.name + '：請填訪船編號（格式 船名-年度-序號-檢查方-類別）'; return; }
        const upd = q('#vr-upd').checked, upl = q('#vr-up').checked;
        run(async () => {
          const out = [];
          for (const j of jobs) {
            if (!j.parse.defects.length) continue;
            const sm = j.parse.summary, ex = M.visits.find(v => v.visit_no === j.visitNo), ship = shipByName(sm.vessel), p = PSC.parseVisitNo(j.visitNo) || {};
            const row = { visit_no: j.visitNo, is_new: !ex };
            const shp = j.parse.format === 'SHIPSURE' || j.parse.format === 'BSM';
            if (!ex) Object.assign(row, { vessel: ship ? ship.vessel : '', party: p.party || 'MGR', vtype: p.vtype || 'VIR', date_from: sm.date || '', date_to: sm.date_to || '' });
            if (!ex || upd) Object.assign(row, { score: sm.score, reported_defects: shp ? j.parse.defects.length : sm.defects ?? '', tasks: sm.tasks ?? '', reported_breakdown: PSC.breakdownText(sm.categories), report_status: sm.status, inspector: (ex && ex.inspector) || [sm.by, shp && sm.company ? '(' + sm.company + ')' : ''].filter(Boolean).join(' '), port: (ex && ex.port) || (shp ? sm.at : [sm.at, sm.type].filter(Boolean).join('（') + (sm.type ? '）' : '')) });
            if (shp && sm.comments && !(ex && ex.note)) row.note = 'V.Ships 檢查意見：' + sm.comments;
            if (ex && !ex.date_from && sm.date) row.date_from = sm.date;
            await api('saveVisit', row);
            const r = await api('importVisitItems', { visit_no: j.visitNo, items: j.parse.defects, update_existing: true });
            if (upl && j.upErr) throw new Error(j.upErr + '。可取消勾選「PDF 歸檔到 Drive」只匯入缺失');
            const ub = j.up ? j.up.blob : j.file;
            if (upl) await api('uploadDocument', { tracking_no: j.visitNo, doc_type: 'VIR', original_name: j.file.name, mime: 'application/pdf', size: ub.size, base64: await fileB64(ub), note: (j.parse.format === 'BSM' ? `BSM ${j.parse.defects.length} deficiencies / ${sm.tasks} questions` : j.parse.format === 'SHIPSURE' ? `V.Ships Shipsure ${j.parse.defects.length} findings（${Object.entries(sm.byType || {}).map(([k, v]) => k + ' ' + v).join('、')}）・cleared ${sm.cleared}` : `VIR ${sm.defects ?? '?'} defects / ${sm.tasks ?? '?'} tasks・score ${sm.score || '—'}・${sm.status || ''}`) + (j.up ? shrinkNote(j.up) : '') });
            out.push(`${j.visitNo}：新增 ${r.added.length}${r.skipped ? '、已有 ' + r.skipped : ''}${r.updated && r.updated.length ? '（補齊 ' + r.updated.length + '）' : ''}`);
          }
          await close(); await reload();
          const last = jobs.filter(j => j.parse.defects.length).pop(); if (last) { S.visitNo = last.visitNo; setTab('visits'); }
          toast(out.join('；'), 7000);
        }, go);
      });
    } });
}
/** 訪船詳情：報告摘要各章節缺失數 vs 系統已登錄 */
function visitReconHTML(x) {
  const b = PSC.visitBreakdown(x, x.items);
  if (b.report === null && !b.hasBreakdown) return '';
  const st = b.ok ? 'ok' : 'ng';
  return `<div class="vr-panel ${st}"><div class="vr-ph"><b>報告缺失數比對</b><span class="vr-badge ${st}">${b.ok ? '相符' : '不符'}：報告 ${b.report ?? '?'} 項／已登錄 ${b.found} 項</span>${x.tasks ? `<span class="dim">檢查題數 ${esc(x.tasks)}</span>` : ''}${x.report_status ? `<span class="dim">報告狀態 ${esc(x.report_status)}</span>` : ''}</div>
  ${b.hasBreakdown ? `<div class="vr-chips">${b.rows.map(r => `<span class="vr-chip ${r.diff === null ? 'x' : r.diff ? 'ng' : 'ok'}">${esc(r.section)} <b class="num">${r.found}</b>${r.report === null ? '<i>報告未列</i>' : `<i>/ ${r.report}</i>`}</span>`).join('')}</div>` : ''}
  ${b.ok === false ? `<p class="note" style="margin:6px 0 0">${b.found < (b.report || 0) ? `還差 ${b.report - b.found} 項。` : b.found > (b.report || 0) ? `多 ${b.found - b.report} 項（可能重複登錄或報告後補列）。` : '總數相同但章節分布不同，請檢查章節。'}上傳 VIR 報告 PDF 可自動補齊。</p>` : ''}
  ${/progress/i.test(x.report_status || '') ? '<p class="note flag" style="margin:4px 0 0">報告仍是 In progress（未定稿），定稿後請再上傳一次比對。</p>' : ''}</div>`;
}
function visitItemModal(id) {
  const it = M.vitems.find(x => x.item_id === id); if (!it) return;
  const ed = can('editor'), st = it.st, docs = (it.v ? it.v.docs : []).filter(d => String(d.note || '').toUpperCase().includes(id.toUpperCase()));
  const hist = String(it.history || '').split('\n').filter(Boolean).reverse();
  const acts = !ed ? [] : st.status === VS.OPEN ? [['submit', '提交矯正（待確認）', ''], ['close', '確認關閉', 'primary']] : st.status === VS.SUBMITTED ? [['reject', '退回', 'danger'], ['close', '確認關閉', 'primary']] : st.status === VS.CLOSED ? [['reopen', '重新開啟', '']] : [['reopen', '恢復', '']];
  if (can('admin') && st.status !== VS.CANCELLED) acts.unshift(['cancel', '撤銷（登錄錯誤）', 'ghost']);
  openModal({ title: `${esc(it.ref || '#' + it.seq)} ${esc(it.area)}`, sub: `${esc(it.item_id)}・${esc(it.v ? it.v.vessel : '')}・${esc(it.section || '')}`,
    html: `<div class="vf-item"><div class="btnrow">${ftypePill(it.ftype)}${vsPill(it)}${it.due_date ? `<span class="dim">改善期限 ${dfmt(it.due_date)}${st.status === VS.SUBMITTED && it.submitted_at ? `（${dfmt(it.submitted_at)} 提交）` : st.active && st.daysLeft !== null ? (st.daysLeft < 0 ? `（已過 ${-st.daysLeft} 天）` : `（剩 ${st.daysLeft} 天）`) : ''}</span>` : ''}${st.ontime === false ? '<span class="stp stp-over">逾期提交</span>' : ''}${ed ? '<button class="btn sm ghost" type="button" id="vm-editc">修改缺失內容</button>' : ''}</div>
    ${it.question || it.pms_code || it.psc_code || it.viq_code || it.score ? `<div class="vf-blk"><span>檢查題目</span><p>${esc(it.question || '—')}</p><div class="vr-codes">${[['PMS', it.pms_code], ['PSC', it.psc_code], ['VIQ', it.viq_code], ['評分', it.score]].filter(c => c[1]).map(c => `<span class="pill cat">${c[0]} ${esc(c[1])}</span>`).join('')}</div></div>` : ''}
    <div id="vm-view"><div class="vf-blk"><span>缺失說明</span><p>${esc(it.finding) || '—'}</p></div><div class="vf-blk"><span>矯正要求</span><p>${esc(it.action_required) || '—'}</p></div></div>
    <div id="vm-editbox" hidden><div class="frow"><div class="field"><label>編號</label><input class="inp mono" data-e="ref" value="${esc(it.ref)}"></div><div class="field"><label>項目</label><input class="inp" data-e="area" value="${esc(it.area)}"></div><div class="field"><label>章節</label><input class="inp" data-e="section" value="${esc(it.section)}"></div><div class="field"><label>改善期限</label><input class="inp" type="date" data-e="due_date" value="${esc(it.due_date)}"></div><div class="field"><label>風險</label><select data-e="risk">${['', 'High', 'Medium', 'Low'].map(r => opt(r, r || '—', it.risk === r)).join('')}</select></div></div><div class="field"><label>缺失說明</label><textarea class="inp" rows="2" data-e="finding">${esc(it.finding)}</textarea></div><div class="field"><label>矯正要求</label><textarea class="inp" rows="2" data-e="action_required">${esc(it.action_required)}</textarea></div><div class="btnrow"><button class="btn primary sm" type="button" id="vm-savec">儲存內容</button></div></div>
    ${ed ? `<div class="form" style="margin-top:12px"><div class="field"><label for="vm-ca">矯正措施（船管提交的內容）</label><textarea class="inp" id="vm-ca" rows="3" placeholder="例：已於 2026/10/20 完成 ENC 更新，附 ECDIS 截圖">${esc(it.corrective_action)}</textarea></div><div class="frow"><div class="field"><label for="vm-date">日期</label><input class="inp" type="date" id="vm-date" value="${today()}"></div><div class="field" style="grid-column:span 2"><label for="vm-note">確認意見／退回原因（選填）</label><input class="inp" id="vm-note" value=""></div></div></div>` : `<div class="vf-blk"><span>矯正措施</span><p>${esc(it.corrective_action) || '—'}</p></div>`}
    ${it.verify_note ? `<div class="vf-blk"><span>確認意見</span><p>${esc(it.verify_note)}</p></div>` : ''}
    <div class="vf-blk"><span>佐證文件（${docs.length}）</span>${docs.length ? docs.map(d => `<div><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.file_name)}</a> <span class="dim">${esc(d.doc_type)}</span></div>`).join('') : '<p class="dim" style="margin:2px 0">尚無</p>'}${ed ? `<div class="btnrow" style="margin-top:6px"><select id="vm-dt">${['EVID', 'RECT', 'CORR'].map(c => opt(c, c + ' ' + PSC.DOC_TYPES.find(t => t.code === c).name)).join('')}</select><input type="file" id="vm-file" multiple class="inp" style="max-width:280px"><button class="btn sm" type="button" id="vm-up">上傳</button></div>` : ''}</div>
    <div class="vf-blk"><span>處理紀錄</span><ol class="vf-hist">${hist.map(h => `<li>${esc(h)}</li>`).join('')}</ol></div><div id="vm-err" class="err"></div></div>`,
    foot: acts.map(([k, l, c]) => `<button class="btn ${c}" type="button" data-act="${k}">${l}</button>`).join('') || '<span class="dim">只有 editor 以上可以處理</span>',
    onMount(root, close) {
      const q = s2 => root.querySelector(s2);
      root.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
        const act = b.dataset.act, ca = q('#vm-ca') ? q('#vm-ca').value.trim() : it.corrective_action, note = q('#vm-note') ? q('#vm-note').value.trim() : '';
        if ((act === 'submit' || act === 'close') && !ca) { q('#vm-err').textContent = '請先填寫矯正措施'; q('#vm-ca').focus(); return; }
        if (act === 'reject' && !note) { q('#vm-err').textContent = '請填寫退回原因'; q('#vm-note').focus(); return; }
        if (act === 'cancel' && !confirm('撤銷這一項？撤銷的缺失不列入統計，但會保留紀錄。')) return;
        run(async () => { await api('visitItemAction', { item_id: id, action: act, corrective_action: ca, date: q('#vm-date') ? q('#vm-date').value : '', note }); await close(); await reload(); toast({ submit: '已提交，待確認', close: '已關閉', reject: '已退回', reopen: '已重新開啟', cancel: '已撤銷' }[act] + '：' + id); }, b);
      }));
      const ec = q('#vm-editc'); if (ec) ec.addEventListener('click', () => { q('#vm-editbox').hidden = !q('#vm-editbox').hidden; q('#vm-view').hidden = !q('#vm-editbox').hidden; });
      const sc = q('#vm-savec'); if (sc) sc.addEventListener('click', () => { const row = { item_id: id }; root.querySelectorAll('[data-e]').forEach(el => { row[el.dataset.e] = el.value.trim(); }); run(async () => { await api('saveVisitItem', row); await close(); await reload(); toast('已更新 ' + id); }, sc); });
      const ub = q('#vm-up'); if (ub) ub.addEventListener('click', () => {
        const files = [...q('#vm-file').files]; if (!files.length) { q('#vm-err').textContent = '請先選擇檔案'; return; }
        run(async () => { for (const fl of files) { const u = await fitUpload(fl, t => { ub.textContent = t; }); ub.textContent = '上傳中…'; await api('uploadDocument', { tracking_no: it.visit_no, doc_type: q('#vm-dt').value, original_name: fl.name, mime: u.shrunk ? u.blob.type : fl.type, size: u.size, base64: await fileB64(u.blob), note: (id + ' ' + shrinkNote(u)).trim() }); } await close(); await reload(); toast('已上傳 ' + files.length + ' 個檔案'); visitItemModal(id); }, ub);
      });
    } });
}
function bulkItemsModal(ids, act) {
  if (!ids.length) return;
  openModal({ title: act === 'close' ? `確認關閉 ${ids.length} 項` : `提交矯正 ${ids.length} 項`, sub: '船管一次回覆多項矯正（例如同一份 CAR）時使用',
    html: `<div class="form"><div class="field"><label for="bk-ca">矯正措施</label><textarea class="inp" id="bk-ca" rows="3" placeholder="例：依 FML CAR 2026-10-20 完成，佐證見附件"></textarea><span class="hint">已經填過矯正措施的項目保留原內容，只有空白的項目會套用這段文字</span></div><div class="frow"><div class="field"><label for="bk-date">日期</label><input class="inp" type="date" id="bk-date" value="${today()}"></div><div class="field" style="grid-column:span 2"><label for="bk-note">確認意見（選填）</label><input class="inp" id="bk-note"></div></div><p class="note mono" style="margin:0;font-size:11.5px">${ids.map(esc).join('、')}</p><div id="bk-err" class="err"></div></div>`,
    foot: `<button class="btn ghost" type="button" data-close>取消</button><button class="btn primary" type="button" id="bk-go">${act === 'close' ? '確認關閉' : '提交'}</button>`,
    onMount(root, close) {
      root.querySelector('[data-close]').addEventListener('click', close);
      root.querySelector('#bk-go').addEventListener('click', () => {
        const ca = root.querySelector('#bk-ca').value.trim(), miss = ids.filter(i => !(M.vitems.find(x => x.item_id === i) || {}).corrective_action);
        if (miss.length && !ca) { root.querySelector('#bk-err').textContent = `${miss.length} 項還沒有矯正措施，請填寫`; return; }
        run(async () => { await api('visitItemAction', { item_ids: ids, action: act, corrective_action: ca, fill_only: true, date: root.querySelector('#bk-date').value, note: root.querySelector('#bk-note').value.trim() }); await close(); await reload(); toast(`已${act === 'close' ? '關閉' : '提交'} ${ids.length} 項`); }, root.querySelector('#bk-go'));
      });
    } });
}
function vVfItems(v) {
  const f = S.viF || (S.viF = { st: 'active', co: '', ship: '', party: '', sec: '', q: '' });
  const ships = [...new Set(M.vitems.map(it => it.v && it.v.vessel).filter(Boolean))].sort(), secs = [...new Set(M.vitems.map(it => it.section).filter(Boolean))].sort();
  const stOk = it => ({ active: it.st.active, open: it.st.status === VS.OPEN, sub: it.st.status === VS.SUBMITTED, over: it.st.overdue, closed: it.st.status === VS.CLOSED, all: it.st.status !== VS.CANCELLED, cancel: it.st.status === VS.CANCELLED })[f.st];
  const list = M.vitems.filter(it => stOk(it) && (!f.co || (it.v && it.v.company === f.co)) && (!f.ship || (it.v && it.v.vessel === f.ship)) && (!f.party || (it.v && it.v.party === f.party)) && (!f.sec || it.section === f.sec) && (!f.q || (it.item_id + ' ' + it.ref + ' ' + it.area + ' ' + it.finding + ' ' + it.action_required + ' ' + it.corrective_action).toLowerCase().includes(f.q.toLowerCase())))
    .sort((a, b) => ((a.st.overdue ? 0 : 1) - (b.st.overdue ? 0 : 1)) || ((a.due_date || '9') < (b.due_date || '9') ? -1 : (a.due_date || '9') > (b.due_date || '9') ? 1 : 0));
  const cos = [...new Set(M.visits.map(x => x.company))].sort();
  v.innerHTML = `<div class="card" style="margin-bottom:16px"><div class="section-head"><div><h2>缺失追蹤（${list.length}）</h2><p class="sub" style="margin:2px 0 0">所有訪船缺失一起看；逾期排最前面。點一列開啟處理，勾選可一次提交或關閉。</p></div><button class="btn" type="button" id="vi-csv">下載 CSV</button></div>
  <div class="rp-ctl"><div class="chips">${[['active', '未關閉'], ['over', '逾期'], ['open', '待改善'], ['sub', '待確認'], ['closed', '已關閉'], ['all', '全部'], ['cancel', '撤銷']].map(([k, l]) => `<button class="chip" type="button" data-vf="${k}" aria-pressed="${f.st === k}">${l}</button>`).join('')}</div>
  <label class="pl-sel">公司 <select id="vi-co">${opt('', '全部', !f.co)}${cos.map(c => opt(c, coLabel(c), f.co === c)).join('')}</select></label><label class="pl-sel">船舶 <select id="vi-ship">${opt('', '全部', !f.ship)}${ships.map(x => opt(x, x, f.ship === x)).join('')}</select></label><label class="pl-sel">檢查方 <select id="vi-party">${opt('', '全部', !f.party)}${Object.keys(PSC.VISIT_PARTY).map(k => opt(k, k, f.party === k)).join('')}</select></label><label class="pl-sel">章節 <select id="vi-sec">${opt('', '全部', !f.sec)}${secs.map(x => opt(x, x, f.sec === x)).join('')}</select></label><input class="inp" id="vi-q" placeholder="搜尋缺失內容" value="${esc(f.q)}" style="max-width:220px"></div></div>
  <div class="card">${bulkBarHTML()}${visitItemsTable(list, { visit: true })}</div>`;
  v.querySelectorAll('[data-vf]').forEach(b => b.addEventListener('click', () => { f.st = b.dataset.vf; render(); }));
  [['#vi-co', 'co'], ['#vi-ship', 'ship'], ['#vi-party', 'party'], ['#vi-sec', 'sec']].forEach(([s2, k]) => $(s2).addEventListener('change', e => { f[k] = e.target.value; render(); }));
  let t; $('#vi-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value.trim(); render(); setTimeout(() => { const q = $('#vi-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 0); }, 300); });
  $('#vi-csv').addEventListener('click', () => {
    const rows = [['缺失編號', '訪船編號', '船舶', '公司', '檢查方', '編號', '項目', '章節', '缺失說明', '矯正要求', '改善期限', '狀態', '逾期', '矯正措施', '提交日', '關閉日', '確認人', '確認意見']].concat(list.map(it => [it.item_id, it.visit_no, it.v ? it.v.vessel : '', it.v ? coLabel(it.v.company) : '', it.v ? it.v.party : '', it.ref, it.area, it.section, it.finding, it.action_required, it.due_date, it.st.status, it.st.overdue ? 'Y' : '', it.corrective_action, it.submitted_at, it.closed_at, it.closed_by, it.verify_note]));
    const blob = new Blob(['﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `TSL_訪船缺失_${today()}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); toast(`已下載 ${list.length} 項`);
  });
  wireItemsTable(v);
}

/* 船舶履歷：各方（管理公司、船東、PSC、事故）觀察到的事項，依時間排列 */
function vVfShips(v) {
  if (S.histShip) return shipHistory(v, S.histShip);
  const cur = PSC.currentVessels(M.vessels, today()).sort((a, b) => a.vessel < b.vessel ? -1 : 1);
  const rows = cur.map(sh => { const k = String(sh.imo || sh.vessel), vis = M.visits.filter(x => String(x.imo || x.vessel) === k), its = vis.flatMap(x => x.items), stt = PSC.visitStats(its, today()), V = M.vreg[k] || {}, ins = V.insp || [], incs = M.incidents.filter(x => vkey(x) === k && !x.void);
    const last = [vis[0] && vis[0].date_from, ins[0] && ins[0].date].filter(Boolean).sort().pop(); return { k, sh, vis, stt, ins, incs, last, pdef: ins.reduce((n, I) => n + I.defs.length, 0) }; });
  v.innerHTML = `<div class="card perf-legend"><p class="note" style="margin:0">每艘船一張卡片：訪船（管理公司 MGR、船東 OWN 等）、PSC 檢查與事故，合在一起看這條船被各方觀察到的事項。紅框為有逾期未改善的訪船缺失。</p></div>
  <div class="vgrid">${rows.map(o => `<button type="button" class="vcard${o.stt.overdue ? ' risk-vl' : o.stt.open + o.stt.submitted ? ' risk-m' : ''}" data-hs="${esc(o.k)}"><span class="nm">${esc(o.sh.vessel)} <span class="dim" style="font-weight:400;font-size:12px">${esc(o.sh.chinese || '')}</span></span><span class="zh">${esc(coLabel(o.sh.company))}・PIC ${esc(o.sh.pic || '—')}</span>
    <span class="st"><span>訪船 <b class="num">${o.vis.length}</b></span><span>缺失 <b class="num">${o.stt.total}</b>${o.stt.open + o.stt.submitted ? `（未關閉 ${o.stt.open + o.stt.submitted}）` : ''}</span>${o.stt.overdue ? `<span class="flag">逾期 ${o.stt.overdue}</span>` : ''}</span><span class="st"><span>PSC <b class="num">${o.ins.length}</b> 次・${o.pdef} 項</span><span>事故 <b class="num">${o.incs.length}</b></span></span><span class="st dim">最近紀錄 ${o.last ? dfmt(o.last) : '—'}</span></button>`).join('')}</div>`;
  v.querySelectorAll('[data-hs]').forEach(b => b.addEventListener('click', () => { S.histShip = b.dataset.hs; render(); window.scrollTo({ top: 0 }); }));
}
function shipHistory(v, k) {
  const V = M.vreg[k] || {}, cur = (V.cur) || PSC.currentVessels(M.vessels, today()).find(x => String(x.imo || x.vessel) === k) || {}, name = V.name || cur.vessel || k;
  const f = S.hsF || (S.hsF = '');
  const vis = M.visits.filter(x => String(x.imo || x.vessel) === k), ins = V.insp || [], incs = M.incidents.filter(x => vkey(x) === k && !x.void);
  const ev = [];
  vis.forEach(x => ev.push({ d: x.date_from || x.report_date, kind: 'visit', party: x.party, x }));
  ins.forEach(I => ev.push({ d: I.date, kind: 'psc', party: 'PSC', x: I }));
  incs.forEach(x => ev.push({ d: x.date, kind: 'inc', party: 'INC', x }));
  const show = ev.filter(e => !f || (f === 'INC' ? e.kind === 'inc' : f === 'PSC' ? e.kind === 'psc' : e.kind === 'visit' && e.party === f)).sort((a, b) => a.d < b.d ? 1 : -1);
  const cnt = {}; ev.forEach(e => { const kk = e.kind === 'visit' ? e.party : e.kind === 'psc' ? 'PSC' : 'INC'; cnt[kk] = (cnt[kk] || 0) + 1; });
  const areas = {}; vis.forEach(x => x.items.forEach(it => { if (it.st.status !== VS.CANCELLED) { const a = it.area || it.section || '其他'; areas[a] = (areas[a] || 0) + 1; } }));
  ins.forEach(I => I.defs.forEach(d => { const a = 'PSC ' + (CAT[d.cat] || '其他'); areas[a] = (areas[a] || 0) + 1; }));
  const topA = Object.entries(areas).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const byY = {}; show.forEach(e => { const y = String(e.d || '').slice(0, 4) || '—'; (byY[y] || (byY[y] = [])).push(e); });
  const item = e => {
    if (e.kind === 'visit') { const x = e.x; return `<li class="tl-it hv"><span class="tl-dot pd-${esc(String(x.party).toLowerCase())}"></span><span class="tl-date num">${dfmt(e.d)}</span><div class="tl-body"><div class="tl-head">${partyTag(x.party)}<span class="pill cat">${esc(x.vtype)}</span><a href="#" class="mono" data-go-visit="${esc(x.visit_no)}" style="font-size:12px">${esc(x.visit_no)}</a><span class="dim">${esc(x.inspector || '')}${x.port ? '・' + esc(x.port) : ''}</span></div><div class="st vf-stl">${vfStatsLine(x.stats)}</div>${x.items.filter(it => it.st.status !== VS.CANCELLED).map(it => `<div class="hv-row" data-vi="${esc(it.item_id)}">${vsPill(it)}<span class="mono">${esc(it.ref)}</span><b>${esc(it.area)}</b><span>${esc(it.finding)}</span></div>`).join('')}</div></li>`; }
    if (e.kind === 'psc') { const I = e.x; return `<li class="tl-it hv"><span class="tl-dot pd-psc"></span><span class="tl-date num">${dfmt(e.d)}</span><div class="tl-body"><div class="tl-head">${partyTag('PSC')}<span>${esc(I.port)} <span class="dim">${esc(I.country)}</span></span>${mouTag(I.mou)}${I.det ? '<span class="pill det">留置</span>' : ''}${I.defs.length ? `<b>${I.defs.length} 項缺失</b>` : '<span class="pill nil">NIL</span>'}<a href="#" data-go-insp="${esc(I.insp_id)}" style="font-size:12px">開啟</a></div>${I.defs.map(d => `<div class="hv-row"><span class="mono">${esc(d.code || '')}</span><span>${esc(d.nature)}</span></div>`).join('')}</div></li>`; }
    const x = e.x; return `<li class="tl-it hv t${esc(x.tier)}"><span class="tl-dot"></span><span class="tl-date num">${dfmt(e.d)}</span><div class="tl-body"><div class="tl-head">${partyTag('INC')}${tierPill(x.tier)}<a href="#" class="mono" data-go-inc="${esc(x.tracking_no)}" style="font-size:12px">${esc(x.tracking_no)}</a><span class="stp stp-${x.status === ST.OPEN ? 'open' : 'closed'}">${esc(x.status)}</span></div><div class="tl-sum">${esc(x.summary)}</div></div></li>`;
  };
  v.innerHTML = `<button class="backlink" type="button" id="hs-back">← 回到船舶履歷</button>
  <div class="card" style="margin-bottom:16px"><div class="vprof-head"><div><div class="eyebrow">船舶履歷</div><h2 style="font-size:20px;margin-top:2px">${esc(name)} <span class="dim" style="font-weight:400;font-size:15px">${esc(cur.chinese || V.zh || '')}</span></h2><div class="dim" style="font-size:12.5px">IMO ${esc(cur.imo || V.imo || '—')}・${esc(coLabel(cur.company))}・PIC ${esc(cur.pic || '—')}</div></div><div class="btnrow">${V.insp && V.insp.length ? '<button class="btn" type="button" id="hs-psc">PSC 船舶檔案</button>' : ''}${incs.length ? '<button class="btn" type="button" id="hs-inc">事故時間軸</button>' : ''}</div></div>
  <div class="rp-ctl" style="margin-top:12px"><div class="chips"><button class="chip" type="button" data-hf="" aria-pressed="${!f}">全部 ${ev.length}</button>${Object.entries(cnt).map(([kk, n]) => `<button class="chip" type="button" data-hf="${esc(kk)}" aria-pressed="${f === kk}">${esc(kk === 'INC' ? '事故' : kk === 'PSC' ? 'PSC' : kk + ' ' + (PSC.VISIT_PARTY[kk] || ''))} ${n}</button>`).join('')}</div></div>
  ${topA.length ? `<div class="hv-areas"><span class="dim">各方最常指出的項目：</span>${topA.map(([a, n]) => `<span class="pill cat">${esc(a)} ${n}</span>`).join('')}</div>` : ''}</div>
  <div class="card">${show.length ? Object.keys(byY).sort((a, b) => b < a ? -1 : 1).map(y => `<div class="tl-year"><div class="tl-yh"><b>${esc(y)}</b><span class="dim">${byY[y].length} 筆</span></div><ol class="tl">${byY[y].map(item).join('')}</ol></div>`).join('') : '<div class="empty">沒有紀錄</div>'}</div>`;
  $('#hs-back').addEventListener('click', () => { S.histShip = null; render(); });
  v.querySelectorAll('[data-hf]').forEach(b => b.addEventListener('click', () => { S.hsF = b.dataset.hf; render(); }));
  v.querySelectorAll('[data-go-visit]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); openVisit(a.dataset.goVisit); }));
  v.querySelectorAll('[data-go-insp]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); openCase(a.dataset.goInsp); }));
  v.querySelectorAll('[data-go-inc]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); openIncident(a.dataset.goInc); }));
  v.querySelectorAll('.hv-row[data-vi]').forEach(r => r.addEventListener('click', () => visitItemModal(r.dataset.vi)));
  const pb = $('#hs-psc'); if (pb) pb.addEventListener('click', () => openVessel(k));
  const ib = $('#hs-inc'); if (ib) ib.addEventListener('click', () => { S.incVessel = k; setTab('inc-vessels'); });
}

/* ---------- 週報 / 月報：選期間一鍵產生，列印成 PDF、複製到 Outlook、下載 CSV ---------- */
const WD = ['日', '一', '二', '三', '四', '五', '六'];
const dW = d => d ? `${dfmt(d)}（${WD[new Date(d + 'T00:00:00Z').getUTCDay()]}）` : '';
function rpState() {
  if (!S.rp) { const p = PSC.periodOf('week', today()); S.rp = { kind: 'week', from: p.from, to: p.to, co: '', defs: true, closed: true }; }
  return S.rp;
}
function rpTitle(st) {
  if (st.kind === 'week' || st.kind === 'lastweek') return { t: '週報', no: PSC.isoWeek(st.from) };
  if (st.kind === 'month' || st.kind === 'lastmonth') return { t: '月報', no: st.from.slice(0, 7) };
  return { t: '期間報告', no: '' };
}
function rpData() {
  const st = rpState();
  return PSC.periodReport({ inspections: M.insp, incidents: M.incidents, from: st.from, to: st.to, company: st.co });
}
const rpCoName = code => { const c = M.companies.find(x => x.code === code); return code ? (({ FLEET: 'FML', VSHIPS: 'V.Ships', BSM: 'BSM', TSL: 'T.S. Lines（自管）', TEH: 'Teh Shipping（自管）' })[code] || (c && c.name) || code) : '全部'; };
const rpResult = I => { const n = Math.max(I.defs.length, Number(I.def_count) || 0); return n ? `${n} 項缺失${I.det ? '・留置' : ''}` : 'NIL'; };
const typeName = x => (PSC.rulesAt(M.rules, x.date).types[x.type] || {}).name || x.type || '';
function vReport(v) {
  const st = rpState(), r = rpData(), T = rpTitle(st), s = r.sum, gen = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const cos = [...new Set(M.vessels.map(x => x.company).filter(Boolean))].sort();
  const kinds = [['week', '本週'], ['lastweek', '上週'], ['month', '本月'], ['lastmonth', '上月'], ['custom', '自訂期間']];
  const kpi = (k, val, d) => `<div class="kpi"><div class="k">${k}</div><div class="v num">${val}</div><div class="d">${d}</div></div>`;
  const insByDef = r.inspections.filter(I => I.defs.length);
  v.innerHTML = `<div class="card no-print" id="rp-ctl" style="margin-bottom:16px"><div class="section-head"><div><h2>週報／月報</h2><p class="sub" style="margin:2px 0 0">選擇期間後即時產生：期間內發生的事故、PSC 檢查與有無缺失。事故依發生日、PSC 依檢查日計算，作廢的事故不列入。</p></div>
    <div class="btnrow"><button class="btn" type="button" id="rp-print">列印／存成 PDF</button><button class="btn" type="button" id="rp-mail">複製到 Outlook</button><button class="btn" type="button" id="rp-csv">下載 CSV</button></div></div>
    <div class="rp-ctl"><div class="chips">${kinds.map(([k, l]) => `<button class="chip" type="button" data-rk="${k}" aria-pressed="${st.kind === k}">${l}</button>`).join('')}</div>
    <label class="pl-sel">從 <input class="inp" type="date" id="rp-from" value="${esc(st.from)}"></label><label class="pl-sel">到 <input class="inp" type="date" id="rp-to" value="${esc(st.to)}"></label>
    <label class="pl-sel">管理公司 <select id="rp-co">${opt('', '全部', !st.co)}${cos.map(c => opt(c, rpCoName(c), st.co === c)).join('')}</select></label>
    <label class="pl-sel"><input type="checkbox" id="rp-defs" ${st.defs ? 'checked' : ''}> 缺失明細</label><label class="pl-sel"><input type="checkbox" id="rp-closed" ${st.closed ? 'checked' : ''}> 期間內結案</label></div></div>
  <article class="card rp-doc" id="rp-doc">
    <header class="rp-head"><div class="eyebrow">${esc(CFG.orgName)}</div><h1>船隊事故與 PSC ${T.t}${T.no ? ` <span class="num">${esc(T.no)}</span>` : ''}</h1>
    <div class="rp-meta">期間 <b>${dW(r.from)} ~ ${dW(r.to)}</b>・管理公司 <b>${esc(rpCoName(st.co))}</b>・製表 ${esc((USER && (USER.name || USER.email)) || '')}・${gen}</div></header>
    <div class="kpis rp-kpis">${kpi('事故', s.inc + ' 件', `T1 ${s.t1}・T2 ${s.t2}・T3 ${s.t3}${s.incPsc ? `・PSC ${s.incPsc}` : ''}`)}${kpi('仍在進行', s.incOpen + ' 件', '期間內發生、尚未結案')}${kpi('PSC 檢查', s.insp + ' 次', `NIL ${s.nil}・有缺失 ${s.withDef}`)}${kpi('PSC 缺失', s.defs + ' 項', `ISM ${s.ism}${s.defRatio !== null ? `・缺失比 ${s.defRatio.toFixed(2)}` : ''}`)}${kpi('留置', s.det + ' 次', s.det ? '請確認後續處理' : '無')}${kpi('涉及船舶', s.ships + ' 艘', st.closed ? `期間內結案 ${s.closed} 件` : '')}</div>
    <h2 class="rp-h">一、事故（${s.inc}）</h2>
    ${r.incidents.length ? `<div class="tbl-wrap"><table class="rp-t rp-inc"><thead><tr><th>日期</th><th>事故編號</th><th>船舶</th><th>分級</th><th>性質</th><th>事故簡述</th><th>狀態</th><th>PIC</th></tr></thead><tbody>${r.incidents.map(x => `<tr class="click" data-rpinc="${esc(x.tracking_no)}"><td class="num">${dfmt(x.date)}</td><td class="mono" style="font-size:11.5px">${esc(x.tracking_no)}</td><td>${esc(x.vessel)}</td><td>${tierPill(x.tier)}${x.major_level ? ' <span class="rk rk-vl">4.1</span>' : ''}</td><td>${esc(typeName(x))}${x.psc ? ' <span class="pill cat">PSC</span>' : ''}</td><td class="rp-sum">${esc(x.summary)}</td><td>${esc(x.status)}</td><td>${esc(x.pic || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="note">本期間沒有事故。</p>'}
    <h2 class="rp-h">二、PSC 檢查（${s.insp} 次：NIL ${s.nil}、有缺失 ${s.withDef}${s.det ? `、留置 ${s.det}` : ''}）</h2>
    ${r.inspections.length ? `<div class="tbl-wrap"><table class="rp-t"><thead><tr><th>日期</th><th>船舶</th><th>港口</th><th>MOU</th><th>結果</th><th>事故編號</th></tr></thead><tbody>${r.inspections.map(I => `<tr class="click" data-rpinsp="${esc(I.insp_id)}"><td class="num">${dfmt(I.date)}</td><td>${esc(I.vessel)}</td><td>${esc(I.port)} <span class="dim">${esc(I.country)}</span></td><td>${esc(I.mou || '—')}</td><td>${I.det ? '<span class="pill det">留置</span> ' : ''}${I.defs.length || Number(I.def_count) ? `<b>${esc(rpResult(I).replace('・留置', ''))}</b>` : '<span class="pill nil">NIL</span>'}</td><td class="mono" style="font-size:11.5px">${esc(I.tracking_no || '—')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="note">本期間沒有 PSC 檢查。</p>'}
    ${st.defs ? `<h2 class="rp-h">三、PSC 缺失明細（${s.defs} 項）</h2>${insByDef.length ? insByDef.map(I => `<div class="rp-grp"><div class="rp-gh"><b>${esc(I.vessel)}</b>・${dfmt(I.date)}・${esc(I.port)}${I.det ? ' <span class="pill det">留置</span>' : ''}</div><table class="rp-t"><tbody>${I.defs.map(d => `<tr><td class="mono" style="width:68px">${esc(d.code || '—')}</td><td>${esc(d.nature)}</td><td style="width:60px" class="dim">${esc(d.action || '')}</td></tr>`).join('')}</tbody></table></div>`).join('') : '<p class="note">本期間沒有 PSC 缺失。</p>'}` : ''}
    ${st.closed ? `<h2 class="rp-h">${st.defs ? '四' : '三'}、期間內結案（${s.closed}）</h2>${r.closed.length ? `<div class="tbl-wrap"><table class="rp-t"><thead><tr><th>結案日</th><th>事故編號</th><th>船舶</th><th>分級</th><th>事故簡述</th></tr></thead><tbody>${r.closed.map(x => `<tr class="click" data-rpinc="${esc(x.tracking_no)}"><td class="num">${dfmt(x.closed_date)}</td><td class="mono" style="font-size:11.5px">${esc(x.tracking_no)}</td><td>${esc(x.vessel)}</td><td>${tierPill(x.tier)}</td><td class="rp-sum">${esc(x.summary)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="note">本期間沒有結案的事故。</p>'}` : ''}
    <footer class="rp-foot">資料來源：${esc(CFG.systemName)}。事故依發生日、PSC 依檢查日；缺失比 =（ISM 缺失 × 5 ＋ 其他缺失）÷ 檢查次數。</footer>
  </article>`;
  const set = patch => { Object.assign(st, patch); render(); };
  v.querySelectorAll('[data-rk]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.rk; if (k === 'custom') return set({ kind: 'custom' }); const p = PSC.periodOf(k, today()); set({ kind: k, from: p.from, to: p.to }); }));
  $('#rp-from').addEventListener('change', e => { if (e.target.value) set({ kind: 'custom', from: e.target.value, to: st.to < e.target.value ? e.target.value : st.to }); });
  $('#rp-to').addEventListener('change', e => { if (e.target.value) set({ kind: 'custom', to: e.target.value, from: st.from > e.target.value ? e.target.value : st.from }); });
  $('#rp-co').addEventListener('change', e => set({ co: e.target.value }));
  $('#rp-defs').addEventListener('change', e => set({ defs: e.target.checked }));
  $('#rp-closed').addEventListener('change', e => set({ closed: e.target.checked }));
  v.querySelectorAll('[data-rpinc]').forEach(tr => tr.addEventListener('click', () => openIncident(tr.dataset.rpinc)));
  v.querySelectorAll('[data-rpinsp]').forEach(tr => tr.addEventListener('click', () => openCase(tr.dataset.rpinsp)));
  $('#rp-print').addEventListener('click', () => { const t = document.title; document.title = `TSL_${T.t}_${T.no || (r.from + '_' + r.to)}`; window.print(); setTimeout(() => { document.title = t; }, 500); });
  $('#rp-mail').addEventListener('click', () => rpCopyMail(r, st, T));
  $('#rp-csv').addEventListener('click', () => rpCSV(r, T));
}
/** Outlook 用：內嵌樣式的 HTML（表格），同時附純文字 */
function rpEmail(r, st, T) {
  const s = r.sum, td = 'border:1px solid #d0d8d1;padding:4px 8px;font-size:12px;vertical-align:top', th = td + ';background:#eef2ee;text-align:left';
  const tbl = (head, rows) => `<table style="border-collapse:collapse;margin:4px 0 14px;font-family:Arial,'Microsoft JhengHei',sans-serif">${head ? `<tr>${head.map(h => `<th style="${th}">${esc(h)}</th>`).join('')}</tr>` : ''}${rows.map(rw => `<tr>${rw.map(c => `<td style="${td}">${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
  const h2 = t => `<p style="font-size:14px;font-weight:bold;margin:14px 0 4px;color:#1f3864">${esc(t)}</p>`;
  const title = `船隊事故與 PSC ${T.t}${T.no ? ' ' + T.no : ''}`, period = `${r.from} ~ ${r.to}`;
  let html = `<div style="font-family:Arial,'Microsoft JhengHei',sans-serif;font-size:13px;color:#1f2b2c"><p style="font-size:16px;font-weight:bold;margin:0">${esc(title)}</p><p style="margin:2px 0 10px;color:#4a585a">期間 ${esc(period)}・管理公司 ${esc(rpCoName(st.co))}</p>`;
  html += tbl(['事故', '仍在進行', 'PSC 檢查', 'NIL', '有缺失', '缺失項數', '留置', '涉及船舶'], [[`${s.inc}（T1 ${s.t1}／T2 ${s.t2}／T3 ${s.t3}）`, s.incOpen, s.insp, s.nil, s.withDef, `${s.defs}（ISM ${s.ism}）`, s.det, s.ships]]);
  html += h2(`一、事故（${s.inc}）`) + (r.incidents.length ? tbl(['日期', '事故編號', '船舶', '分級', '性質', '事故簡述', '狀態', 'PIC'], r.incidents.map(x => [x.date, x.tracking_no, x.vessel, 'Tier ' + x.tier, typeName(x) + (x.psc ? '（PSC）' : ''), x.summary, x.status, x.pic || ''])) : '<p>本期間沒有事故。</p>');
  html += h2(`二、PSC 檢查（${s.insp} 次：NIL ${s.nil}、有缺失 ${s.withDef}）`) + (r.inspections.length ? tbl(['日期', '船舶', '港口', 'MOU', '結果', '事故編號'], r.inspections.map(I => [I.date, I.vessel, `${I.port} ${I.country || ''}`, I.mou || '', rpResult(I), I.tracking_no || ''])) : '<p>本期間沒有 PSC 檢查。</p>');
  if (st.defs) { html += h2(`三、PSC 缺失明細（${s.defs} 項）`); const g = r.inspections.filter(I => I.defs.length); html += g.length ? g.map(I => `<p style="margin:6px 0 2px"><b>${esc(I.vessel)}</b>・${esc(I.date)}・${esc(I.port)}${I.det ? '・留置' : ''}</p>` + tbl(null, I.defs.map(d => [d.code || '', d.nature || '', d.action || '']))).join('') : '<p>本期間沒有 PSC 缺失。</p>'; }
  if (st.closed) html += h2(`${st.defs ? '四' : '三'}、期間內結案（${s.closed}）`) + (r.closed.length ? tbl(['結案日', '事故編號', '船舶', '分級', '事故簡述'], r.closed.map(x => [x.closed_date, x.tracking_no, x.vessel, 'Tier ' + x.tier, x.summary])) : '<p>本期間沒有結案的事故。</p>');
  html += '</div>';
  const lines = [title, `期間 ${period}・管理公司 ${rpCoName(st.co)}`, '', `事故 ${s.inc} 件（T1 ${s.t1}／T2 ${s.t2}／T3 ${s.t3}），仍在進行 ${s.incOpen}；PSC 檢查 ${s.insp} 次（NIL ${s.nil}、有缺失 ${s.withDef}、留置 ${s.det}），缺失 ${s.defs} 項（ISM ${s.ism}）`, '', `一、事故（${s.inc}）`]
    .concat(r.incidents.map(x => `${x.date}  ${x.tracking_no}  ${x.vessel}  T${x.tier}  ${x.summary}  [${x.status}]`), ['', `二、PSC 檢查（${s.insp}）`], r.inspections.map(I => `${I.date}  ${I.vessel}  ${I.port}  ${rpResult(I)}`));
  return { html, text: lines.join('\n'), subject: `${title}（${period}）` };
}
async function rpCopyMail(r, st, T) {
  const m = rpEmail(r, st, T);
  try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([m.html], { type: 'text/html' }), 'text/plain': new Blob([m.text], { type: 'text/plain' }) })]); toast('已複製報表，可直接貼到 Outlook（主旨：' + m.subject + '）', 6000); }
  catch (e) {
    const box = document.createElement('div'); box.innerHTML = m.html; box.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(box);
    const rg = document.createRange(); rg.selectNodeContents(box); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg);
    try { document.execCommand('copy'); toast('已複製報表，可直接貼到 Outlook', 6000); } catch (_) { toast('瀏覽器不允許複製，請改用「列印／存成 PDF」'); }
    sel.removeAllRanges(); box.remove();
  }
}
function rpCSV(r, T) {
  const rows = [['類別', '日期', '船舶', 'IMO', '事故編號', '分級', '性質', '港口', '國家', 'MOU', '結果', '缺失代碼', '缺失內容', '處置', '狀態', '事故簡述']];
  r.incidents.forEach(x => rows.push(['事故', x.date, x.vessel, x.imo, x.tracking_no, x.tier, typeName(x), '', '', '', '', '', '', '', x.status, x.summary]));
  r.inspections.forEach(I => { rows.push(['PSC 檢查', I.date, I.vessel, I.imo, I.tracking_no || '', I.tier || '', '', I.port, I.country, I.mou || '', rpResult(I), '', '', '', I.status || '', '']); I.defs.forEach(d => rows.push(['PSC 缺失', I.date, I.vessel, I.imo, I.tracking_no || '', '', '', I.port, I.country, I.mou || '', '', d.code || '', d.nature || '', d.action || '', d.rectified === 'Y' ? '已改正' : '', ''])); });
  r.closed.forEach(x => rows.push(['期間內結案', x.closed_date, x.vessel, x.imo, x.tracking_no, x.tier, typeName(x), '', '', '', '', '', '', '', x.status, x.summary]));
  const blob = new Blob(['﻿' + rows.map(rw => rw.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `TSL_${T.t}_${T.no || ''}_${r.from}_${r.to}.csv`.replace(/__/g, '_'); document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast(`已下載 ${rows.length - 1} 列`);
}

/* ---------- 趨勢圖：拖曳下方時間軸選期間，計算平均、斜率、期間變化量，並與基準線比較 ---------- */
function trendBlockHTML(id, title, sub) {
  return `<div class="card trend" id="${id}" style="margin-bottom:16px"><div class="section-head"><div><h2>${title}</h2><p class="sub" style="margin:2px 0 0">${sub}</p></div><div class="btnrow tr-rng">${[['all', '全部'], ['36', '近 3 年'], ['24', '近 2 年'], ['12', '近 12 個月']].map(([k, l]) => `<button class="chip" type="button" data-rng="${k}" aria-pressed="${k === 'all'}">${l}</button>`).join('')}</div></div><div class="tr-wrap"><div class="tr-chart"></div><div class="tr-stats"></div></div></div>`;
}
const iso = d => d.toISOString().slice(0, 10);
function trendVerdict(t, o) {
  if (!t.n) return '';
  const up = t.dir === 'up', down = t.dir === 'down';
  if (o.baseKind === 'tmou') {
    if (t.vsBase > 0 && up) return perfPill('VERY LOW', '高於 Tokyo MOU 基準且上升：優先介入');
    if (t.vsBase > 0) return perfPill('LOW', down ? '高於基準，趨勢改善中：持續追蹤' : '高於基準：需要改善');
    if (up) return perfPill('MEDIUM', '低於基準但上升：提前預防');
    return perfPill('HIGH', down ? '低於基準且下降：維持' : '低於基準且平穩：維持');
  }
  if (up) return perfPill(t.vsBase > 0 ? 'VERY LOW' : 'LOW', '嚴重性上升：檢討原因');
  if (down) return perfPill('HIGH', '嚴重性下降');
  return perfPill(t.vsBase > 0 ? 'MEDIUM' : 'HIGH', '平穩');
}
function trendChart(card, o) {
  if (!card) return;
  const chart = card.querySelector('.tr-chart'), stats = card.querySelector('.tr-stats'), d3 = window.d3;
  const pts = (o.points || []).slice().sort((a, b) => a.d < b.d ? -1 : 1);
  if (!d3) { chart.innerHTML = '<div class="empty">圖表元件（d3）載入失敗，請確認網路可連到 cdn.jsdelivr.net。</div>'; return; }
  if (!pts.length) { chart.innerHTML = '<div class="empty">沒有資料</div>'; stats.innerHTML = ''; return; }
  const fmtV = o.fmt || (v => v.toFixed(2)), roll = o.roll || 3, base = o.baseline, band = o.band === undefined ? 0.25 : o.band;
  const P = pts.map(p => Object.assign({}, p, { t: new Date(p.d + 'T00:00:00Z') }));
  P.forEach((p, i) => { const win = P.slice(Math.max(0, i - roll + 1), i + 1); const sw = win.reduce((m, q) => m + (q.w || 1), 0); p.r = win.reduce((m, q) => m + q.v * (q.w || 1), 0) / sw; });
  const W = Math.max(320, chart.clientWidth || 640), m = { t: 14, r: 16, b: 22, l: 40 }, H1 = 210, H2 = 48, GAP = 44, H = m.t + H1 + GAP + H2 + 18;
  const tf = dt => dt.getUTCMonth() === 0 ? d3.utcFormat('%Y')(dt) : (dt.getUTCMonth() + 1) + '月', nt = Math.min(8, Math.round(W / 110));
  const dMin = P[0].d, dMax = P[P.length - 1].d, clampD = (a, b) => [a < dMin ? dMin : a, b > dMax ? dMax : b];
  let lo = P[0].t, hi = P[P.length - 1].t; if (hi - lo < 120 * 864e5) { lo = new Date(+lo - 60 * 864e5); hi = new Date(+hi + 60 * 864e5); }
  const pad = (hi - lo) * 0.03, full = [new Date(+lo - pad), new Date(+hi + pad)];
  const yMax = Math.max(d3.max(P, p => Math.max(p.v, p.r)), base || 0) * 1.15 || 1;
  const x = d3.scaleUtc().domain(full).range([m.l, W - m.r]), x2 = x.copy(), y = d3.scaleLinear().domain([0, yMax]).nice().range([m.t + H1, m.t]);
  const y2 = d3.scaleLinear().domain(y.domain()).range([m.t + H1 + GAP + H2, m.t + H1 + GAP]);
  const cid = 'clip-' + card.id;
  chart.innerHTML = '';
  const svg = d3.select(chart).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'tr-svg').attr('role', 'img').attr('aria-label', o.aria || '趨勢圖');
  svg.append('clipPath').attr('id', cid).append('rect').attr('x', m.l).attr('y', m.t - 6).attr('width', W - m.l - m.r).attr('height', H1 + 12);
  const gy = svg.append('g').attr('class', 'tr-axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)));
  gy.select('.domain').remove();
  const gx = svg.append('g').attr('class', 'tr-axis').attr('transform', `translate(0,${m.t + H1})`);
  const main = svg.append('g').attr('clip-path', `url(#${cid})`);
  if (base !== null && base !== undefined) {
    svg.append('line').attr('class', 'tr-base').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(base)).attr('y2', y(base));
    svg.append('text').attr('class', 'tr-base-lbl').attr('x', W - m.r - 4).attr('y', y(base) - 5).attr('text-anchor', 'end').text(`${o.baseLabel || '基準'} ${fmtV(base)}`);
  }
  const rollLine = d3.line().x(p => x(p.t)).y(p => y(p.r)).curve(d3.curveMonotoneX);
  const pathR = main.append('path').attr('class', 'tr-roll');
  const reg = main.append('line').attr('class', 'tr-reg');
  const rad = p => o.agg ? 2.5 + Math.min(5, Math.sqrt(p.w || 1) * 0.9) : 3.6;
  const dots = main.selectAll('circle').data(P).join('circle').attr('class', p => 'tr-dot' + (base !== null && base !== undefined && p.v > base ? ' over' : '')).attr('r', rad)
    .on('mousemove', (e, p) => showTip(e, (o.tip ? o.tip(p) : `<b>${p.label || dfmt(p.d)}</b><div class="row"><span>${o.yLabel || '值'}</span><span>${fmtV(p.v)}</span></div>`) + `<div class="row"><span>移動平均</span><span>${fmtV(p.r)}</span></div>`))
    .on('mouseleave', hideTip).on('click', (e, p) => { if (o.onClick) o.onClick(p); });
  // context strip + brush
  svg.append('g').attr('class', 'tr-axis').attr('transform', `translate(0,${m.t + H1 + GAP + H2})`).call(d3.axisBottom(x2).ticks(nt).tickFormat(tf).tickSizeOuter(0));
  svg.append('path').attr('class', 'tr-roll ctx').attr('d', d3.line().x(p => x2(p.t)).y(p => y2(p.r)).curve(d3.curveMonotoneX)(P));
  svg.selectAll('circle.ctx').data(P).join('circle').attr('class', 'tr-dot ctx').attr('r', 1.6).attr('cx', p => x2(p.t)).attr('cy', p => y2(p.v));
  if (base !== null && base !== undefined) svg.append('line').attr('class', 'tr-base ctx').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y2(base)).attr('y2', y2(base));
  svg.append('text').attr('class', 'tr-hint').attr('x', W - m.r).attr('text-anchor', 'end').attr('y', m.t + H1 + GAP - 5).text('↔ 拖曳下方時間軸、拉動兩側把手選擇期間');
  const draw = dom => {
    x.domain(dom);
    gx.call(d3.axisBottom(x).ticks(nt).tickFormat(tf).tickSizeOuter(0));
    dots.attr('cx', p => x(p.t)).attr('cy', p => y(p.v)).attr('opacity', p => p.t >= dom[0] && p.t <= dom[1] ? 1 : 0.25);
    pathR.attr('d', rollLine(P));
    const t = PSC.trendSummary(pts, iso(dom[0]), iso(dom[1]), base, band);
    if (t.n > 1) { const x0 = PSC.yearFrac(iso(dom[0])), x1 = PSC.yearFrac(iso(dom[1])); reg.attr('x1', x(dom[0])).attr('x2', x(dom[1])).attr('y1', y(Math.max(0, t.fit.intercept + t.fit.slope * x0))).attr('y2', y(Math.max(0, t.fit.intercept + t.fit.slope * x1))).attr('opacity', 1).attr('class', 'tr-reg ' + t.dir); }
    else reg.attr('opacity', 0);
    const arrow = { up: '↗ 上升', down: '↘ 下降', flat: '→ 持平' }[t.dir];
    const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + fmtV(Math.abs(v));
    const shown = clampD(iso(dom[0]), iso(dom[1]));
    stats.innerHTML = t.n ? `<div class="tr-st"><span>期間</span><b class="num">${dfmt(shown[0])} ~ ${dfmt(shown[1])}</b></div>
      <div class="tr-st"><span>樣本</span><b class="num">${t.n} ${o.agg ? '季' : '次檢查'}${o.agg && o.unitN ? `・${fmt(t.w)} ${o.unitN}` : ''}</b></div>
      <div class="tr-st"><span>${o.meanLabel || '平均'}</span><b class="num">${fmtV(t.mean)}</b>${t.vsBase !== null ? (Math.abs(t.vsBase) < 0.005 ? `<em>與${o.baseLabel || '基準'}相同</em>` : `<em class="${t.vsBase > 0 ? 'bad' : 'ok'}">${t.vsBase > 0 ? '高於' : '低於'}${o.baseLabel || '基準'} ${fmtV(Math.abs(t.vsBase))}</em>`) : ''}</div>
      <div class="tr-st"><span>趨勢（每年）</span><b class="num tr-${t.dir}">${arrow} ${sgn(t.slope)}</b></div>
      <div class="tr-st"><span>期間變化量</span><b class="num tr-${t.dir}">${sgn(t.change)}</b><em>${fmtV(Math.max(0, t.start))} → ${fmtV(Math.max(0, t.end))}</em></div>
      <div class="tr-st verdict">${trendVerdict(t, o)}</div>` : '<div class="empty">此期間沒有資料</div>';
  };
  const brush = d3.brushX().extent([[m.l, m.t + H1 + GAP], [W - m.r, m.t + H1 + GAP + H2]])
    .on('brush end', ({ selection, sourceEvent }) => { const dom = selection && selection[1] - selection[0] > 4 ? selection.map(x2.invert) : full; draw(dom); if (sourceEvent) card.querySelectorAll('[data-rng]').forEach(b => b.setAttribute('aria-pressed', 'false')); });
  const bg = svg.append('g').attr('class', 'tr-brush').call(brush);
  const setRange = k => {
    card.querySelectorAll('[data-rng]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.rng === k)));
    if (k === 'all') { bg.call(brush.move, [x2(full[0]), x2(full[1])]); return; }
    const end = full[1], st = new Date(end); st.setUTCMonth(st.getUTCMonth() - Number(k));
    bg.call(brush.move, [x2(st < full[0] ? full[0] : st), x2(end)]);
  };
  card.querySelectorAll('[data-rng]').forEach(b => b.addEventListener('click', () => setRange(b.dataset.rng)));
  setRange(o.initial || 'all');
}

/* ---------- 事故管理：船舶事故卡片、年度嚴重性風險、事故時間軸 ---------- */
const IRK = { H: { c: 'vl', t: '高風險' }, E: { c: 'l', t: '偏高風險' }, M: { c: 'm', t: '一般' }, L: { c: 'h', t: '低風險' } };
const irkPill = (lv, txt) => { const m = IRK[lv] || IRK.L; return `<span class="rk rk-${m.c}">${txt || m.t}</span>`; };
const PSC_HIGH = p => p === 'VERY LOW' || p === 'LOW';
function shipPsc(k) {
  const V = M.vreg[k]; if (!V) return PSC.perfIndex([], PSC.tmouAvg(M.settings));
  let ins = V.insp;
  if (S.perfBasis === '36m') { const d = new Date(today() + 'T00:00:00'); d.setMonth(d.getMonth() - 36); const from = d.toISOString().slice(0, 10); ins = ins.filter(I => I.date >= from && I.mou === PSC.TOKYO); }
  return PSC.perfIndex(ins, PSC.tmouAvg(M.settings));
}
function yearBarsHTML(years, cfg, from) {
  const ys = Object.keys(years).map(Number); const y1 = new Date().getFullYear(), y0 = from || Math.min(...ys.concat([y1]));
  const top = Math.max(cfg.levels[0] * 1.4, ...Object.values(years).map(o => o.score));
  const out = []; for (let y = y0; y <= y1; y++) { const o = years[y] || { score: 0, n: 0, level: 'L' }; out.push(`<span class="yb" title="${y}：${o.n} 件、${o.score} 分"><i class="rkb-${IRK[o.level].c}" style="height:${o.score ? Math.max(8, Math.round(o.score / top * 100)) : 0}%"></i><small>${String(y).slice(2)}</small></span>`); }
  return `<span class="ybars">${out.join('')}</span>`;
}
function vIncVessels(v) {
  if (S.incVessel) return incVesselDetail(v, S.incVessel);
  const cfg = PSC.incRiskCfg(M.settings), list = incList(), by = {};
  list.forEach(x => { (by[vkey(x)] || (by[vkey(x)] = [])).push(x); });
  const allBy = {}; M.incidents.forEach(x => { if (!x.void) (allBy[vkey(x)] || (allBy[vkey(x)] = [])).push(x); });
  const rows = Object.keys(by).map(k => {
    const xs = by[k], r = PSC.incidentRisk(allBy[k] || [], cfg, today()), V = M.vreg[k] || {}, p = shipPsc(k);
    return { k, xs, r, V, name: V.name || xs[0].vessel, zh: V.zh || '', co: (V.cur && V.cur.company) || xs[0].company, open: xs.filter(x => x.status === ST.OPEN).length, last: xs[0].date, psc: p };
  });
  const sorts = { risk: (a, b) => b.r.last12 - a.r.last12 || b.xs.length - a.xs.length, n: (a, b) => b.xs.length - a.xs.length || b.r.last12 - a.r.last12, last: (a, b) => a.last < b.last ? 1 : -1 };
  const sk = sorts[S.ivSort] ? S.ivSort : 'risk'; rows.sort((a, b) => sorts[sk](a, b) || (a.name < b.name ? -1 : 1));
  const cnt = {}; rows.forEach(r => { cnt[r.r.level] = (cnt[r.r.level] || 0) + 1; });
  const w = cfg.w, lv = cfg.levels;
  v.innerHTML = trendBlockHTML('tr-inc', '船隊事故嚴重性趨勢', '每季事故分數合計（依下方計分方式），虛線為全期每季平均。依目前的管理公司、船舶與關鍵字篩選，不受年度篩選影響；拖曳下方時間軸選擇期間。') +
  `<div class="card perf-legend"><div class="pl-row"><span><b class="num">${rows.length}</b> 艘船有事故紀錄（依篩選條件）</span><label class="pl-sel">排序 <select id="iv-sort">${opt('risk', '近 12 個月風險分數', sk === 'risk')}${opt('n', '事故件數', sk === 'n')}${opt('last', '最近事故', sk === 'last')}</select></label></div>
  <div class="pl-row">${['H', 'E', 'M', 'L'].map(k => `${irkPill(k)}<span class="num dim" style="margin-right:8px">${cnt[k] || 0}</span>`).join('')}<span class="alarm-key">PSC 高風險船（Tokyo MOU 績效 Low / Very Low）</span></div>
  <p class="note" style="margin:0">計分：Tier 1 = ${w.tier1} 分、Tier 2 = ${w.tier2}、Tier 3 = ${w.tier3}；4.1 重大事件另加 ${w.major}；PSC 檢查產生的事故 × ${w.psc}；作廢不計。近 12 個月 ≥ ${lv[0]} 分為高風險、≥ ${lv[1]} 偏高、≥ ${lv[2]} 一般。長條為每年分數。可在「事故規範 → 事故風險計分」調整。</p></div>
  <div class="vgrid">${rows.length ? rows.map(o => { const m = IRK[o.r.level], ph = PSC_HIGH(o.psc.performance); const t = { 1: 0, 2: 0, 3: 0 }; o.xs.forEach(x => { if (t[x.tier] !== undefined) t[x.tier]++; });
    return `<button type="button" class="vcard icard risk-${m.c}${ph ? ' alarm' : ''}" data-iv="${esc(o.k)}"><span class="nm">${esc(o.name)}${o.open ? ` <span class="stp stp-open">進行中 ${o.open}</span>` : ''}${ph ? ` <span class="rk rk-vl" title="Tokyo MOU 績效 ${esc(o.psc.performance)}">PSC 高風險</span>` : ''}</span><span class="zh">${[esc(o.zh), esc(o.co || '')].filter(Boolean).join(' · ')}</span>
    <span class="st"><span><b class="num">${o.xs.length}</b> 件</span>${['1', '2', '3'].map(k => t[k] ? `<span>${tierPill(k)} <b class="num">${t[k]}</b></span>` : '').join('')}</span>
    <span class="st rkline">${irkPill(o.r.level)}<span>近 12 個月 <b class="num">${o.r.last12}</b> 分</span>${yearBarsHTML(o.r.years, cfg, new Date().getFullYear() - 3)}</span><span class="st dim">最近 ${dfmt(o.last)}</span></button>`; }).join('') : '<div class="empty">沒有符合條件的事故</div>'}</div>`;
  const base = M.incidents.filter(x => !x.void && incMatchNoYear(x)), qp = PSC.quarterIncidentPoints(base, cfg);
  const avgQ = qp.length ? qp.reduce((s2, p) => s2 + p.v, 0) / qp.length : null;
  trendChart($('#tr-inc'), { points: qp, baseline: avgQ, baseLabel: '全期季平均', baseKind: 'ref', agg: true, roll: 2, band: 2, fmt: v => v.toFixed(1), yLabel: '季分數', meanLabel: '平均每季分數', tip: p => `<b>${esc(p.label)}</b><div class="row"><span>事故</span><span>${p.n} 件</span></div><div class="row"><span>分數</span><span>${p.v}</span></div>` });
  v.querySelectorAll('[data-iv]').forEach(b => b.addEventListener('click', () => { S.incVessel = b.dataset.iv; render(); window.scrollTo({ top: 0 }); }));
  $('#iv-sort').addEventListener('change', e => { S.ivSort = e.target.value; render(); });
}
function incMatchNoYear(x) { const y = S.years; S.years = new Set(); try { return incMatch(x); } finally { S.years = y; } }
function inspMatchNoYear(I) { const y = S.years; S.years = new Set(); try { return inspMatch(I); } finally { S.years = y; } }
function incVesselDetail(v, k) {
  const cfg = PSC.incRiskCfg(M.settings), xs = M.incidents.filter(x => vkey(x) === k).sort((a, b) => a.date < b.date ? 1 : -1);
  const V = M.vreg[k] || {}, name = V.name || (xs[0] && xs[0].vessel) || k, r = PSC.incidentRisk(xs, cfg, today()), p = shipPsc(k), ph = PSC_HIGH(p.performance);
  const byY = {}; xs.forEach(x => { (byY[x.y] || (byY[x.y] = [])).push(x); });
  const ys = Object.keys(r.years).map(Number), y1 = new Date().getFullYear(), y0 = ys.length ? Math.min(...ys) : y1;
  const strip = []; for (let y = y1; y >= y0; y--) { const o = r.years[y] || { score: 0, n: 0, t1: 0, t2: 0, t3: 0, major: 0, level: 'L' }; strip.push(`<div class="ysev rkbg-${IRK[o.level].c}"><b>${y}</b><span class="num">${o.score} 分</span><small>${o.n} 件${o.n ? `・T1 ${o.t1}・T2 ${o.t2}・T3 ${o.t3}${o.major ? `・4.1 ${o.major}` : ''}` : ''}</small>${irkPill(o.level)}</div>`); }
  v.innerHTML = `<button class="backlink" type="button" id="iv-back">← 回到船舶事故</button>
  <div class="card${ph ? ' alarm' : ''}" style="margin-bottom:16px;position:relative"><div class="vprof-head"><div><div class="eyebrow">船舶事故歷史</div><h2 style="font-size:20px;margin-top:2px">${esc(name)} <span class="dim" style="font-weight:400;font-size:15px">${esc(V.zh || '')}</span></h2>
  <div class="dim" style="font-size:12.5px">IMO ${esc(V.imo || (xs[0] && xs[0].imo) || '—')}${V.cur ? `・${esc(V.cur.company)}・${esc(V.cur.manager || V.cur.management || '')}・PIC ${esc(V.cur.pic || '—')}` : ''}${V.former && V.former.length ? `・曾用名 ${esc(V.former.join('、'))}` : ''}</div></div>
  <div class="btnrow">${irkPill(r.level, IRK[r.level].t + '・近 12 個月 ' + r.last12 + ' 分')}${p.n ? perfPill(p.performance, 'PSC ' + PERF_META[p.performance].t + '・' + PERF_META[p.performance].e) : ''}${V.insp && V.insp.length ? '<button class="btn" type="button" id="iv-psc">PSC 船舶檔案</button>' : ''}</div></div>
  <div class="ysevs">${strip.join('')}</div></div>
  <div class="card"><div class="section-head"><h2>事故時間軸（${xs.length} 件，有紀錄以來）</h2><span class="dim" style="font-size:12.5px">點一下開啟事故</span></div>
  ${xs.length ? Object.keys(byY).sort((a, b) => b - a).map(y => `<div class="tl-year"><div class="tl-yh"><b>${y}</b>${irkPill((r.years[y] || {}).level || 'L', ((r.years[y] || {}).score || 0) + ' 分')}</div><ol class="tl">${byY[y].map(x => { const sc = PSC.incidentScore(x, cfg); return `<li class="tl-it t${esc(x.tier)}${x.void ? ' void' : ''}" data-no="${esc(x.tracking_no)}" tabindex="0"><span class="tl-dot"></span><span class="tl-date num">${dfmt(x.date)}</span><div class="tl-body"><div class="tl-head">${tierPill(x.tier)}<span class="mono" style="font-size:12px">${esc(x.tracking_no)}</span>${x.void ? '<span class="stp stp-hist">作廢</span>' : x.over ? '<span class="stp stp-over">RCA 逾期</span>' : `<span class="stp stp-${x.status === ST.OPEN ? 'open' : 'closed'}">${esc(x.status)}</span>`}${x.psc ? '<span class="pill cat">PSC</span>' : ''}${x.major_level ? `<span class="rk rk-vl">4.1 重大事件</span>` : ''}</div><div class="tl-sum">${esc(x.summary || '—')}</div><div class="dim" style="font-size:12px">${esc((PSC.rulesAt(M.rules, x.date).types[x.type] || {}).name || x.type)}${x.location ? '・' + esc(x.location) : ''}・PIC ${esc(x.pic || '—')}・${sc} 分</div></div></li>`; }).join('')}</ol></div>`).join('') : '<div class="empty">沒有事故紀錄</div>'}</div>`;
  $('#iv-back').addEventListener('click', () => { S.incVessel = null; render(); });
  const pb = $('#iv-psc'); if (pb) pb.addEventListener('click', () => openVessel(k));
  v.querySelectorAll('.tl-it').forEach(li => { const go = () => openIncident(li.dataset.no); li.addEventListener('click', go); li.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); });
}
function incRiskCardHTML() {
  const cfg = PSC.incRiskCfg(M.settings), w = cfg.w, lv = cfg.levels;
  return `<div class="card" style="margin-bottom:16px"><div class="section-head"><div><h2>事故風險計分</h2><p class="sub" style="margin:2px 0 0">「船舶事故」卡片與時間軸用每年事故的嚴重性評估船舶風險。設定存在試算表 Settings 分頁（inc_risk_weights、inc_risk_levels）。</p></div>${can('admin') ? '<button class="btn" type="button" id="ir-edit">修改</button>' : ''}</div>
  <div class="tbl-wrap"><table class="ref"><tbody><tr><td>每件事故</td><td>Tier 1 = <b>${w.tier1}</b> 分、Tier 2 = <b>${w.tier2}</b> 分、Tier 3 = <b>${w.tier3}</b> 分；屬 4.1 重大事件另加 <b>${w.major}</b> 分；由 PSC 檢查產生的事故 × <b>${w.psc}</b>；作廢不計</td></tr>
  <tr><td>風險等級</td><td>近 12 個月（或單一年度）合計 ≥ <b>${lv[0]}</b> ${irkPill('H')}　≥ <b>${lv[1]}</b> ${irkPill('E')}　≥ <b>${lv[2]}</b> ${irkPill('M')}　其餘 ${irkPill('L')}</td></tr></tbody></table></div></div>`;
}
function editIncRisk() {
  const set = M.settings;
  openModal({ title: '事故風險計分', sub: '修改後立即套用到所有事故（含過去年度）',
    html: `<div class="form"><div class="field"><label for="ir-w">計分（名稱=分數，以分號分隔）</label><input class="inp mono" id="ir-w" value="${esc(set.inc_risk_weights || PSC.DEFAULT_SETTINGS.find(d => d.key === 'inc_risk_weights').value)}"><span class="hint">tier1 / tier2 / tier3：各分級每件分數；major：4.1 重大事件加分；psc：PSC 事故係數</span></div>
    <div class="field"><label for="ir-l">等級門檻（高風險; 偏高; 一般）</label><input class="inp mono" id="ir-l" value="${esc(set.inc_risk_levels || PSC.DEFAULT_SETTINGS.find(d => d.key === 'inc_risk_levels').value)}"></div><div id="ir-err" class="err"></div></div>`,
    foot: '<button class="btn ghost" type="button" data-close>取消</button><button class="btn primary" type="button" id="ir-save">儲存</button>',
    onMount(root, close) {
      root.querySelector('[data-close]').addEventListener('click', close);
      root.querySelector('#ir-save').addEventListener('click', () => {
        const wv = root.querySelector('#ir-w').value.trim(), lv = root.querySelector('#ir-l').value.trim();
        const nums = PSC.nameList(lv).map(Number);
        if (nums.length !== 3 || nums.some(isNaN) || !(nums[0] >= nums[1] && nums[1] >= nums[2])) { root.querySelector('#ir-err').textContent = '門檻請填三個由大到小的數字，例如 15; 8; 3'; return; }
        const d = k => PSC.DEFAULT_SETTINGS.find(x => x.key === k).note;
        run(async () => { await api('saveSettings', { rows: [{ key: 'inc_risk_weights', value: wv, note: d('inc_risk_weights') }, { key: 'inc_risk_levels', value: lv, note: d('inc_risk_levels') }] }); await close(); await reload(); toast('已更新事故風險計分'); }, root.querySelector('#ir-save'));
      });
    } });
}
function companyPerfHTML(c, avg) {
  const base = perfBase(c), by = {};
  base.forEach(I => { (by[I.company] || (by[I.company] = [])).push(I); });
  const cur = PSC.currentVessels(M.vessels, today()), ships = {}; cur.forEach(v => { ships[v.company] = (ships[v.company] || 0) + 1; });
  const hp = new Set(PSC.nameList(M.settings.tmou_high_perf_docs).map(x => x.replace(/\D/g, '')));
  const hpPer = M.settings.tmou_high_perf_period || '';
  const NAME = { FLEET: 'Fleet Management（FML）', VSHIPS: 'V.Ships', BSM: 'Bernhard Schulte（BSM）', TSL: 'T.S. Lines（自管）', TEH: 'Teh Shipping（自管）' };
  const cos = M.companies.length ? M.companies : Object.keys(by).map(code => ({ code }));
  const row = (label, sub, ins, extra) => { const r = PSC.perfIndex(ins, avg); return `<tr><td><b>${label}</b>${sub ? `<div class="dim" style="font-size:11.5px">${sub}</div>` : ''}</td>${extra.ships}<td class="n">${r.n || '–'}</td><td class="n">${r.n ? fix2(r.def_ratio) : '–'}<div class="dim" style="font-size:11px">${r.n ? LEVEL_TXT[r.def_level] : ''}</div></td><td class="n">${r.n ? r.det_rate.toFixed(1) + '%' : '–'}<div class="dim" style="font-size:11px">${r.n ? LEVEL_TXT[r.det_level] : ''}</div></td><td>${r.n ? perfPill(r.performance) : '<span class="dim">無檢查</span>'}</td>${extra.tail}</tr>`; };
  const body = cos.map(co => {
    const off = co.tmou_performance ? `${perfPill(co.tmou_performance, PERF_META[String(co.tmou_performance).toUpperCase()] ? PERF_META[String(co.tmou_performance).toUpperCase()].e : co.tmou_performance)}<div class="dim" style="font-size:11px">${dfmt(co.perf_as_of)}</div>` : '<span class="dim">未匯入</span>';
    const inHp = co.doc_imo && hp.has(String(co.doc_imo).replace(/\D/g, ''));
    return row(esc(NAME[co.code] || co.name || co.code), `${esc(co.code)}${co.doc_imo ? ' · DOC ' + esc(co.doc_imo) : ''}`, by[co.code] || [], { ships: `<td class="n">${ships[co.code] || '–'}</td>`, tail: `<td>${off}</td><td>${hp.size ? (inHp ? `<span class="rk rk-h">✓ 名單內</span>` : '<span class="dim">—</span>') : '<span class="dim">未設定</span>'}</td>` });
  }).join('') + row('船隊合計', '', base, { ships: `<td class="n">${cur.length}</td>`, tail: '<td></td><td></td>' });
  return `<div class="card" style="margin-bottom:16px"><div class="section-head"><div><h2>管理公司績效（Tokyo MOU 公司績效算法）</h2><p class="sub" style="margin:2px 0 0">缺失比 = (ISM 缺失 × 5 + 其他缺失) ÷ 檢查次數；留置率 = 留置 ÷ 檢查次數。與 Tokyo MOU 平均相差超過 1（留置率 1 個百分點）為高於 / 低於平均，再依績效矩陣分級。</p></div></div>
  <div class="tbl-wrap"><table class="perf-t"><thead><tr><th>管理公司</th><th class="n">現役船</th><th class="n">檢查</th><th class="n">缺失比</th><th class="n">留置率</th><th>系統試算績效</th><th>Tokyo MOU 官方績效</th><th>高績效公司名單${hpPer ? `（${esc(hpPer)}）` : ''}</th></tr></thead><tbody>${body}</tbody></table></div>
  <p class="note" style="margin:8px 0 0">官方績效取自「PSC 窗口」匯入的 Tokyo MOU 窗口檔，以 36 個月滾動計算；系統試算依上方選擇的期間。自管船分 T.S. Lines 與 Teh Shipping 兩家 DOC 公司。</p></div>`;
}
function vVessels(v) {
  const c = current(), agg = {}, avg = PSC.tmouAvg(M.settings);
  c.insp.forEach(I => { const k = vkey(I); const o = agg[k] || (agg[k] = { n: 0, nil: 0, d: 0, last: '', det: 0, open: 0 }); o.n++; if (!I.defs.length) o.nil++; if (I.det) o.det++; if (I.status === ST.OPEN) o.open++; if (I.date > o.last) o.last = I.date; });
  c.defs.forEach(d => { const k = vkey(d); if (agg[k]) agg[k].d++; });
  const pb = {}; perfBase(c).forEach(I => { (pb[vkey(I)] || (pb[vkey(I)] = [])).push(I); });
  Object.keys(agg).forEach(k => { agg[k].p = PSC.perfIndex(pb[k] || [], avg); });
  let html = '';
  if (S.profile && M.vreg[S.profile]) html += profileHTML(S.profile, c) + `<div style="height:16px"></div>` + trendBlockHTML('tr-ship', `${esc(M.vreg[S.profile].name)} 缺失趨勢`, `每個點是一次檢查的缺失比（ISM 缺失 × 5 ＋ 其他缺失），實線為近 3 次移動平均，紅色虛線為 Tokyo MOU 平均缺失指數 ${avg.def}，斜線為所選期間的趨勢線。點一下開啟該次檢查。${M.incidents.some(x => vkey(x) === S.profile) ? ' <a href="#" id="to-inc-tl">查看這艘船的事故時間軸 →</a>' : ''}`);
  const sorts = { d: (a, b) => b.o.d - a.o.d || b.o.n - a.o.n, risk: (a, b) => (PERF_ORDER[a.o.p.performance] ?? 9) - (PERF_ORDER[b.o.p.performance] ?? 9) || (b.o.p.def_ratio || 0) - (a.o.p.def_ratio || 0), ratio: (a, b) => (b.o.p.def_ratio ?? -1) - (a.o.p.def_ratio ?? -1) };
  const sk = sorts[S.vSort] ? S.vSort : 'd';
  const list = Object.entries(agg).map(([k, o]) => ({ k, o, V: M.vreg[k] })).sort((a, b) => sorts[sk](a, b) || (a.V.name < b.V.name ? -1 : 1));
  const cnt = {}; list.forEach(x => { const p = x.o.p.performance || '—'; cnt[p] = (cnt[p] || 0) + 1; });
  html += trendBlockHTML('tr-fleet', '船隊缺失趨勢', `每季缺失比 =（ISM 缺失 × 5 ＋ 其他缺失）÷ 檢查次數；紅色虛線為 Tokyo MOU 平均缺失指數 ${avg.def}（${esc(avg.valid)}）。依目前的管理公司、MOU、港口國篩選，不受年度篩選影響；拖曳下方時間軸選擇期間，看平均、趨勢與變化量。`);
  html += companyPerfHTML(c, avg);
  html += `<div class="card perf-legend"><div class="pl-row"><span><b class="num">${list.length}</b> 艘船有 PSC 紀錄（依篩選條件）</span><label class="pl-sel">期間 <select id="pf-basis">${opt('filter', '依目前篩選', S.perfBasis !== '36m')}${opt('36m', '近 36 個月 Tokyo MOU（官方算法）', S.perfBasis === '36m')}</select></label><label class="pl-sel">排序 <select id="pf-sort">${opt('d', '缺失件數', sk === 'd')}${opt('risk', '風險（高 → 低）', sk === 'risk')}${opt('ratio', '缺失比', sk === 'ratio')}</select></label></div>
  <div class="pl-row">${['VERY LOW', 'LOW', 'MEDIUM', 'HIGH'].map(p => `${perfPill(p)}<span class="num dim" style="margin-right:8px">${cnt[p] || 0}</span>`).join('')}${cnt['—'] ? `<span class="dim">無檢查 ${cnt['—']}</span>` : ''}</div>
  <p class="note" style="margin:0">依 Tokyo MOU 平均留置指數 <b>${avg.det}%</b>、平均缺失指數 <b>${avg.def}</b>（${esc(avg.valid)}）判定，算法與 Tokyo MOU 公司績效相同，套用在單船。可在「系統管理 → Tokyo MOU 年度指數與名單」更新。</p></div><div class="vgrid">` +
    (list.length ? list.map(({ k, o, V }) => { const m = PERF_META[o.p.performance]; return `<button type="button" class="vcard${m ? ' risk-' + m.c : ''}${PSC_HIGH(o.p.performance) ? ' alarm' : ''}" data-vc="${esc(k)}"><span class="nm">${esc(V.name)}${o.det ? ` <span class="pill det">留置 ${o.det}</span>` : ''}${o.open ? ` <span class="stp stp-open">進行中 ${o.open}</span>` : ''}</span><span class="zh">${esc(V.zh)}${V.former.length ? ` · 前 ${esc(V.former.join('、'))}` : ''}${V.cur ? ` · ${esc(V.cur.company)}` : ''}</span><span class="st"><span><b class="num">${o.n}</b> 次檢查</span><span><b class="num">${o.d}</b> 項缺失</span><span>NIL ${pct(o.nil, o.n)}</span></span><span class="st rkline">${m ? `<span class="rk rk-${m.c}">${m.t}</span><span>缺失比 <b class="num">${fix2(o.p.def_ratio)}</b></span><span>留置率 <b class="num">${o.p.det_rate.toFixed(1)}%</b></span>` : (S.perfBasis === '36m' ? '<span class="dim">近 36 個月無 Tokyo MOU 檢查</span>' : '<span class="dim">無檢查</span>')}</span><span class="st dim">最近 ${dfmt(o.last)}</span></button>`; }).join('') : '<div class="empty">沒有符合條件的船舶</div>') + '</div>';
  v.innerHTML = html;
  const tmouT = { baseline: avg.def, baseLabel: 'Tokyo MOU 缺失指數', baseKind: 'tmou', yLabel: '缺失比', meanLabel: '平均缺失比' };
  trendChart($('#tr-fleet'), Object.assign({}, tmouT, { points: PSC.quarterTrendPoints(M.insp.filter(inspMatchNoYear)), agg: true, roll: 4, unitN: '次檢查',
    tip: p => `<b>${esc(p.label)}</b><div class="row"><span>檢查</span><span>${p.w} 次</span></div><div class="row"><span>缺失比</span><span>${p.v.toFixed(2)}</span></div>${p.det ? `<div class="row"><span>留置</span><span>${p.det}</span></div>` : ''}` }));
  if (S.profile && M.vreg[S.profile]) trendChart($('#tr-ship'), Object.assign({}, tmouT, { points: PSC.inspTrendPoints(M.vreg[S.profile].insp.filter(inspMatchNoYear)), roll: 3, band: 0.5,
    tip: p => `<b>${dfmt(p.d)}</b> <span class="dim">${esc(p.ref.port)}</span><div class="row"><span>缺失</span><span>${p.ref.defs.length} 項${p.ref.det ? '・留置' : ''}</span></div><div class="row"><span>缺失比</span><span>${p.v}</span></div>`, onClick: p => openCase(p.ref.insp_id) }));
  const tl = $('#to-inc-tl'); if (tl) tl.addEventListener('click', e => { e.preventDefault(); const k = S.profile; S.profile = null; S.incVessel = k; setTab('inc-vessels'); S.incVessel = k; render(); });
  v.querySelectorAll('.vcard').forEach(b => b.addEventListener('click', () => openVessel(b.dataset.vc)));
  $('#pf-basis').addEventListener('change', e => { S.perfBasis = e.target.value; render(); });
  $('#pf-sort').addEventListener('change', e => { S.vSort = e.target.value; render(); });
  const cl = v.querySelector('[data-close]'); if (cl) cl.addEventListener('click', () => { S.profile = null; render(); });
  wireLinks(v);
}
function profileHTML(k, c) {
  const V = M.vreg[k], cur = V.cur || {};
  const ins = c.insp.filter(I => vkey(I) === k), defs = c.defs.filter(d => vkey(d) === k), nil = ins.filter(I => !I.defs.length).length;
  const cats = [...countBy(defs, d => d.cat || '—')].sort((a, b) => b[1] - a[1]);
  const rep = {}; defs.forEach(d => { if (d.code) (rep[d.code] || (rep[d.code] = new Set())).add(d.date); });
  const repl = Object.entries(rep).filter(([, s]) => s.size > 1);
  const facts = [['IMO', V.imo || '—'], ['船型系列', cur.series || '—'], ['船旗', cur.flag || '—'], ['事故編號公司碼', cur.company || '—'], ['管理公司', cur.manager || cur.management || '—'], ['DOC 公司 IMO', cur.doc_company_imo || '—'], ['負責人 PIC', cur.pic || '—'],
    ['建造日期', cur.date_of_build ? dfmt(cur.date_of_build) : '—'], ['造船廠', cur.builder || '—'], ['船級 / 船級號', [cur.class_society, cur.class_number].filter(Boolean).join(' ') || '—'], ['GT / DWT', [cur.gross_tonnage, cur.deadweight].filter(Boolean).map(fmt).join(' / ') || '—'], ['TEU', cur.teu ? fmt(cur.teu) : '—'], ['登記船東', cur.registered_owner || '—'], ['船籍港', cur.port_of_registry || '—'], ['ISM 公司', cur.ism_company || '—'], ['船旗績效（Tokyo MOU）', LIST_PERF[PSC.flagPerf(cur.flag, M.settings)] || '—'], ['船級 RO 績效（Tokyo MOU）', LIST_PERF[PSC.roPerf(cur.class_society, M.settings)] || '—'], ['NK 資料日期', cur.nk_data_date ? dfmt(cur.nk_data_date) : '未匯入']];
  const W = windowRows().find(r => String(r.imo) === String(V.imo));
  return `<div class="card"><div class="vprof-head"><div><div class="eyebrow">船舶檔案</div><h2 style="font-size:20px;margin-top:2px">${esc(V.name)} <span class="dim" style="font-weight:400;font-size:15px">${esc(V.zh)}</span></h2>${V.former.length ? `<div class="note" style="margin-top:2px">曾用名 ${esc(V.former.join('、'))}；紀錄保留檢查當時的船名</div>` : ''}</div><button class="btn" type="button" data-close>關閉</button></div>
  <dl class="facts">${facts.map(([a, x]) => `<div><dt>${a}</dt><dd>${esc(x)}</dd></div>`).join('')}</dl>
  <div class="kpis" style="margin-top:16px;margin-bottom:12px"><div class="kpi"><div class="k">檢查次數</div><div class="v num">${ins.length}</div></div><div class="kpi"><div class="k">無缺失率</div><div class="v num">${pct(nil, ins.length)}</div></div><div class="kpi"><div class="k">缺失項數</div><div class="v num">${defs.length}</div></div><div class="kpi"><div class="k">平均缺失 / 次</div><div class="v num">${ins.length ? (ins.reduce((s, I) => s + I.defs.length, 0) / ins.length).toFixed(2) : '–'}</div></div><div class="kpi ${ins.some(I => I.det) ? 'crit' : ''}"><div class="k">留置</div><div class="v num">${ins.filter(I => I.det).length}</div></div></div>
  ${W ? `<div class="drop" style="margin-bottom:12px"><div class="btnrow">${prioPill(W)} <b>Tokyo MOU 窗口</b> ${W.from ? dfmt(W.from) + ' ~ ' + dfmt(W.to) : esc(W.note)} <span class="dim">（${distText(W)}；官方 SRP ${esc(W.srp || '—')}，估算 ${esc(W.srp_est)}；最近 Tokyo MOU 檢查 ${dfmt(W.last_tmou_date)} ${esc(W.last_tmou_port)}）</span></div>${W.nk_alerts.map(a => `<div class="flag">${esc(a)}</div>`).join('')}</div>` : ''}
  ${repl.length ? `<div class="callout">重複開立的代碼：${repl.map(([cd, s]) => `<span class="mono">${cd}</span>（${[...s].sort().map(dfmt).join('、')}）`).join('；')}</div>` : ''}
  <div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,2fr)"><div><h2 style="font-size:14px;margin:0 0 8px">缺失類別</h2><div class="bars">${cats.length ? cats.map(([ck, x]) => `<div class="bar" style="cursor:default"><span class="lab"><span class="mono">${ck}</span>${esc(CAT[ck] || '無代碼')}</span><span class="trk"><span class="fill" style="width:${(x / cats[0][1] * 100).toFixed(0)}%"></span></span><span class="val">${x}</span></div>`).join('') : '<div class="empty">無缺失</div>'}</div></div>
  <div><h2 style="font-size:14px;margin:0 0 8px">檢查紀錄</h2><div class="timeline">${ins.length ? ins.map(I => { const ds = I.defs.filter(defMatch); return `<div class="ins ${!I.defs.length ? 'nil' : I.det ? 'det' : ''}"><div class="ins-h"><b class="num">${dfmt(I.date)}</b><span>${esc(I.port)}, ${esc(I.country)} ${mouTag(I.mou)}</span>${caseLink(I)}${statusPill(I)}${I.det ? '<span class="pill det">留置</span>' : ''}</div>${ds.length ? `<ul>${ds.map(d => `<li><span class="mono">${d.code || '—'}</span><span>${esc(d.nature)}</span>${actPill(d)}</li>`).join('')}</ul>` : ''}</div>`; }).join('') : '<div class="empty">篩選範圍內沒有檢查紀錄</div>'}</div></div></div></div>`;
}

/* ---------- view: codes ---------- */
function vCodes(v) {
  const used = new Set(M.recs.map(d => d.cat));
  const c = current(), m = {};
  c.defs.slice().sort((a, b) => a.date < b.date ? -1 : 1).forEach(d => { if (!d.code) return; const o = m[d.code] || (m[d.code] = { n: 0, v: new Set(), last: null }); o.n++; o.v.add(vkey(d)); o.last = d; });
  const rows = Object.entries(m).sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1));
  v.innerHTML = `<div class="grid g2" style="margin-bottom:16px"><div class="card"><h2>缺失類別對照</h2><p class="sub">缺失代碼前兩碼</p><div class="tbl-wrap"><table class="ref"><thead><tr><th>代碼</th><th>類別</th></tr></thead><tbody>${Object.keys(CAT).map(k => `<tr${used.has(k) ? '' : ' class="dim"'}><td class="mono">${k}xxx</td><td>${CAT[k]}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="card"><h2>處理代碼（Action taken）</h2><p class="sub">PSC 報告中對每項缺失要求的處置</p><div class="tbl-wrap"><table class="ref"><thead><tr><th>代碼</th><th>說明</th></tr></thead><tbody>${Object.entries(ACT).map(([k, x]) => `<tr><td class="mono">${k}</td><td>${x}${k === '30' ? ' <span class="pill det">留置</span>' : ''}</td></tr>`).join('')}</tbody></table></div></div></div>
  <div class="card"><h2>已開立過的缺失代碼</h2><p class="sub">依篩選條件統計；點一下查看該代碼所有缺失</p><div class="tbl-wrap"><table id="t-codes"><thead><tr><th>代碼</th><th>類別</th><th class="n">件數</th><th class="n">船數</th><th>最近一筆</th></tr></thead><tbody>${rows.length ? rows.map(([k, o]) => `<tr class="click" data-code="${k}"><td class="mono">${k}</td><td>${esc(CAT[k.slice(0, 2)] || '')}</td><td class="n">${o.n}</td><td class="n">${o.v.size}</td><td class="nature">${esc(o.last.nature)} <span class="dim">（${esc(o.last.vessel)}，${dfmt(o.last.date)}）</span></td></tr>`).join('') : '<tr><td colspan="5" class="empty">沒有符合條件的代碼</td></tr>'}</tbody></table></div></div>`;
  v.querySelectorAll('#t-codes tr.click').forEach(tr => tr.addEventListener('click', () => { S.code = tr.dataset.code; S.page = 0; setTab('records'); }));
}

/* ---------- view: PSC inspections (all, incl. NIL) ---------- */
function caseRoute(v) {
  if (S.caseMode === 'new' || S.caseMode === 'edit') { caseForm(v); return true; }
  if (S.caseId && M.byId.get(S.caseId)) { caseDetail(v, M.byId.get(S.caseId)); return true; }
  S.caseId = null; return false;
}
function vInspections(v) { if (!caseRoute(v)) caseList(v); }
function caseList(v) {
  const q = S.q.toLowerCase();
  let list = M.insp.filter(inspMatch);
  if (S.cStatus === 'over') list = list.filter(I => I.status === ST.OPEN && I.rca_due && I.rca_due < today());
  else if (S.cStatus) list = list.filter(I => I.status === S.cStatus);
  if (q) list = list.filter(I => (I.tracking_no + ' ' + I.insp_id + ' ' + I.vessel + ' ' + I.port + ' ' + I.country + ' ' + I.defs.map(d => d.code + ' ' + d.nature).join(' ')).toLowerCase().includes(q));
  const cnt = st => M.insp.filter(inspMatch).filter(I => I.status === st).length;
  const statuses = [['', '全部'], [ST.OPEN, '進行中'], ['over', 'RCA 逾期'], ['未立案', '未立案'], [ST.CLOSED, '已完成'], [ST.NIL, 'NIL'], [ST.HIST, '歷史資料']];
  const pages = Math.max(1, Math.ceil(list.length / PAGE)); S.page = Math.min(S.page, pages - 1);
  v.innerHTML = `<div class="card"><div class="section-head"><div><h2>PSC 檢查登錄</h2><p class="sub" style="margin:2px 0 0">每一次 PSC 檢查都登錄在這裡（含 NIL）。有缺失的檢查會自動取得事故編號，同步出現在「事故管理」。</p></div><div class="btnrow">${can('editor') ? '<button class="btn primary" type="button" id="c-new">新增 PSC 檢查</button>' : ''}</div></div>
  <div class="toolbar"><div class="yrs">${statuses.map(([k, l]) => `<button type="button" class="chip" data-cs="${k}" aria-pressed="${S.cStatus === k}">${l}${k && k !== 'over' ? ` <span class="num">${cnt(k)}</span>` : ''}</button>`).join('')}</div><span style="flex:1"></span><span><b class="num">${fmt(list.length)}</b> 筆</span></div>
  <div class="tbl-wrap"><table><thead><tr><th>檢查日</th><th>船舶</th><th>港口</th><th class="n">缺失</th><th>事故編號 / 檢查編號</th><th>等級</th><th>狀態</th><th>RCA 期限</th><th class="n">文件</th></tr></thead><tbody>${list.length ? list.slice(S.page * PAGE, (S.page + 1) * PAGE).map(I => `<tr class="click" data-open="${esc(I.insp_id)}"><td class="num">${dfmt(I.date)}</td><td>${esc(I.vessel)}</td><td>${esc(I.port)}<div class="dim">${esc(I.country)}</div>${mouTag(I.mou)}</td><td class="n">${I.defs.length || '–'}</td><td><span class="tn">${esc(I.tracking_no || I.insp_id)}</span></td><td>${tierPill(I.tier && I.tracking_no ? I.tier : '')}</td><td>${statusPill(I)}</td><td class="num">${I.tracking_no && I.status === ST.OPEN ? dfmt(I.rca_due) : '<span class="dim">—</span>'}</td><td class="n">${I.docs.length || '–'}</td></tr>`).join('') : '<tr><td colspan="9" class="empty">沒有符合條件的案件</td></tr>'}</tbody></table></div><div class="pager" id="c-pager"></div></div>`;
  v.querySelectorAll('[data-cs]').forEach(b => b.addEventListener('click', () => { S.cStatus = b.dataset.cs; S.page = 0; render(); }));
  v.querySelectorAll('[data-open]').forEach(tr => tr.addEventListener('click', () => openCase(tr.dataset.open)));
  const nb = $('#c-new'); if (nb) nb.addEventListener('click', () => { S.form = null; openCase(null, 'new'); });
  $('#c-pager').innerHTML = pages > 1 ? `<button class="btn" type="button" data-p="-1" ${S.page ? '' : 'disabled'}>上一頁</button><span class="num">${S.page + 1} / ${pages}</span><button class="btn" type="button" data-p="1" ${S.page < pages - 1 ? '' : 'disabled'}>下一頁</button>` : '';
  $('#c-pager').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { S.page += +b.dataset.p; render(); }));
}
function docChecklist(X, psc) {
  const has = t => X.docs.some(d => d.doc_type === t);
  const t = PSC.TIERS[X.tier] || PSC.TIERS['3'], open = X.status === ST.OPEN, td = today();
  const box = (k, due, docType, label) => { const done = has(docType); const over = !done && open && due && due < td; return `<div class="box ${done ? 'done' : over ? 'over' : ''}"><div class="k">${k}</div><div class="v">${done ? '✓ 已歸檔' : due ? (over ? '逾期 ' : '期限 ') + dfmt(due) : '—'}</div><div class="k">${label}</div></div>`; };
  const plain = (k, ok, label, todo) => `<div class="box ${ok ? 'done' : ''}"><div class="k">${k}</div><div class="v">${ok ? '✓ 已歸檔' : todo || '尚未上傳'}</div><div class="k">${label}</div></div>`;
  const extra = psc ? plain('PSC 報告', has('PSC-A') || has('PSC-B'), 'Form A / Form B') + plain('船舶矯正報告', has('RECT'), '含佐證照片')
    : plain('船方事故報告', has('RPT'), '船長 / 輪機長報告') + plain('結案確認', has('CLOSE'), 'Template 5C');
  return `<div class="dl">${box('立即通報', X.flash_due, 'FLASH', `Template 1 · ${t.flashH} 小時內`)}${box('正式初步報告', X.initial_due, 'INIT', `Template 2 · ${t.initialH} 小時內`)}${box('最終調查報告 RCA', X.rca_due, 'RCA', `Template 4 · ${t.rcaD} 天內`)}${extra}</div>`;
}
function docTypesFor(psc) { if (psc === 'visit') return PSC.DOC_TYPES.filter(t => ['VIR', 'RECT', 'EVID', 'CORR', 'OTH'].includes(t.code)); return PSC.DOC_TYPES.filter(t => !t.visit && (psc ? !t.inc : !t.psc)); }
function uploadHTML(base, psc) {
  const types = docTypesFor(psc); if (!types.some(t => t.code === S.upType)) S.upType = psc === 'visit' ? 'VIR' : psc ? 'PSC-B' : 'RPT';
  return `<div class="drop" style="margin-bottom:12px"><div class="frow"><div class="field"><label for="up-type">文件類別</label><select id="up-type">${types.map(t => opt(t.code, `${t.code}　${t.name}`, S.upType === t.code)).join('')}</select></div><div class="field"><label for="up-file">檔案（單檔 ${MAX_MB} MB 以內；超過時 PDF 與照片自動壓縮）</label><input class="inp" type="file" id="up-file" multiple></div><div class="field"><label for="up-note">說明（選填）</label><input class="inp" id="up-note" placeholder="例如：Form B 第 2 頁補件"></div></div><div class="btnrow"><button class="btn primary" type="button" id="up-go">上傳並歸檔</button><span class="dim" id="up-preview" style="font-size:12.5px"></span></div></div>`;
}
function docListHTML(docs, psc) {
  const groups = docTypesFor(psc).concat(PSC.DOC_TYPES.filter(t => !docTypesFor(psc).includes(t))).map(t => ({ t, docs: docs.filter(d => d.doc_type === t.code).sort((a, b) => +a.seq - +b.seq) })).filter(g => g.docs.length);
  return groups.length ? groups.map(g => `<div class="docgroup"><h3>${esc(g.t.code)}　${esc(g.t.name)}</h3>${g.docs.map(d => `<div class="doc"><div><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.file_name)}</a>${d.note ? ` <span class="dim">· ${esc(d.note)}</span>` : ''}<div class="dim" style="font-size:12px">原檔名 ${esc(d.original_name)}</div></div><div class="m">${esc(d.uploaded_by)}<br>${dfmt(d.uploaded_at)}</div></div>`).join('')}</div>`).join('') : '<div class="empty">尚未上傳文件</div>';
}
function wireUpload(base, docs, target) {
  const ub = $('#up-go'); if (!ub) return;
  const prev = () => { const t = $('#up-type').value, n = docs.filter(d => d.doc_type === t).reduce((m, d) => Math.max(m, +d.seq || 0), 0) + 1; const f = $('#up-file').files[0]; $('#up-preview').textContent = '將存為 ' + PSC.documentFileName(PSC.documentId(base, t, n), f ? f.name : '.pdf') + ($('#up-file').files.length > 1 ? ` 等 ${$('#up-file').files.length} 個檔案` : ''); };
  $('#up-type').addEventListener('change', () => { S.upType = $('#up-type').value; prev(); }); $('#up-file').addEventListener('change', prev); prev();
  const ubLabel = ub.textContent;
  ub.addEventListener('click', () => {
    const files = [...$('#up-file').files]; if (!files.length) { toast('請先選擇檔案'); return; }
    run(async () => {
      const names = [];
      for (const f of files) {
        const u = await fitUpload(f, t => { ub.textContent = t; }); ub.textContent = '上傳中…';
        const d = await api('uploadDocument', Object.assign({ doc_type: $('#up-type').value, original_name: f.name, mime: u.shrunk ? u.blob.type : f.type, size: u.size, base64: await fileB64(u.blob), note: ($('#up-note').value + ' ' + shrinkNote(u)).trim() }, target));
        names.push(d.file_name);
      }
      await reload(); toast('已歸檔：' + names.join('、'), 6000);
    }, ub).finally(() => { if (document.body.contains(ub)) ub.textContent = ubLabel; });
  });
}
function closeBoxHTML(msg) {
  return `<div class="drop" style="margin-top:14px" id="close-box"><b>確認結案</b><div class="frow"><div class="field"><label for="close-date">結案日期</label><input class="inp" type="date" id="close-date" value="${today()}"></div></div><div class="note" style="margin:0">${msg}</div><div id="close-err" class="err"></div><div class="btnrow"><button class="btn primary" type="button" id="close-ok">確認結案</button><button class="btn ghost" type="button" id="close-cancel">取消</button></div></div>`;
}
function wireClose(target, label) {
  const cb = $('#close'); if (cb) cb.addEventListener('click', () => { S.closing = true; render(); });
  const rb = $('#reopen'); if (rb) rb.addEventListener('click', () => run(async () => { await api('setCaseStatus', Object.assign({ status: ST.OPEN }, target)); await reload(); toast('已重新開啟'); }));
  if (!S.closing) return;
  $('#close-cancel').addEventListener('click', () => { S.closing = false; render(); });
  const go = force => run(async () => {
    try { await api('setCaseStatus', Object.assign({ status: ST.CLOSED, closed_date: $('#close-date').value, force }, target)); }
    catch (e) {
      if (/未標記改正|尚未歸檔/.test(e.message) && !force) { $('#close-err').innerHTML = esc(e.message) + ' <button class="btn danger" type="button" id="close-force">仍要結案</button>'; $('#close-force').addEventListener('click', () => go(true)); return; }
      throw e;
    }
    S.closing = false; await reload(); toast('已結案：' + label);
  }, $('#close-ok'));
  $('#close-ok').addEventListener('click', () => go(false));
}
function caseDetail(v, I) {
  const inc = I.tracking_no ? M.incidents.find(x => x.tracking_no === I.tracking_no) : null, incM = inc;
  const ed = can('editor');
  const base = I.tracking_no || I.insp_id;
  const rectified = I.defs.filter(d => d.rectified === 'Y').length;
  const mh = PSC.resolveMOU(M.mouMap, I.country, I.port);
  v.innerHTML = `<button class="backlink" type="button" id="back">← 回到${S.tab === 'incidents' ? '事故' : '檢查'}列表</button>
  <div class="card" style="margin-bottom:16px"><div class="vprof-head"><div style="min-width:0"><div class="eyebrow">${I.tracking_no ? '事故追蹤編號（PSC 檢查有缺失）' : '檢查編號（NIL 不立事故編號）'}</div><div class="tn-lg">${esc(base)}</div>
  <div class="btnrow" style="margin-top:6px">${statusPill(I)}${I.tracking_no ? tierPill(I.tier) : ''}${I.det ? '<span class="pill det">留置</span>' : ''}<span class="dim" style="font-size:13px">${esc(I.tier_reason || '')}</span></div></div>
  <div class="btnrow"><button class="btn" type="button" id="copy-no">複製編號</button>${ed ? '<button class="btn" type="button" id="edit">編輯檢查內容</button>' : ''}${ed && inc ? '<button class="btn" type="button" id="edit-inc">編輯事故資料</button>' : ''}${ed && I.tracking_no ? (I.status === ST.CLOSED ? '<button class="btn" type="button" id="reopen">重新開啟</button>' : '<button class="btn primary" type="button" id="close">結案</button>') : ''}</div></div>
  <dl class="facts"><div><dt>檢查日期</dt><dd>${dfmt(I.date)}</dd></div><div><dt>船舶</dt><dd><a href="#vessels" class="vlink" data-v="${esc(vkey(I))}">${esc(I.vessel)}</a> <span class="dim">IMO ${esc(I.imo)}</span></dd></div><div><dt>港口 / 港口國</dt><dd>${esc(I.port)}, ${esc(I.country)}</dd></div><div><dt>MOU 區域</dt><dd>${esc(I.mou || '—')}${mh.also ? ` <span class="dim">（${esc(I.country)} 也是 ${esc(mh.also)} 成員）</span>` : ''}</dd></div><div><dt>公司碼 / 管理</dt><dd>${esc(I.company || '—')} / ${esc(I.mgmt)}</dd></div><div><dt>監管人員 PIC</dt><dd>${esc(I.pic || '—')}</dd></div>${I.closed_date ? `<div><dt>結案日</dt><dd>${dfmt(I.closed_date)}</dd></div>` : ''}</dl>
  ${I.tracking_no ? docChecklist(I, true) : ''}${incM ? checksHTML(incM) + timelyHTML(incM) : ''}
  ${S.closing ? closeBoxHTML(`已改正 ${rectified} / ${I.defs.length} 項。結案後事故登錄器同步改為「已完成」。`) : ''}
  ${I.status === '未立案' ? `<div class="callout" style="margin-top:14px">這次檢查有 ${I.defs.length} 項缺失，但事故登錄器沒有對應編號。${ed ? '按「編輯檢查內容」後直接儲存，系統就會補發事故編號。' : ''}</div>` : ''}${I.status === ST.HIST ? '<div class="note">2026 年以前的歷史資料，未納入事故登錄器，不補發事故編號。</div>' : ''}
  ${M.canBribe && I.bribe_flag && I.bribe_flag !== 'N' ? `<div class="callout" style="margin-top:14px;background:var(--crit-soft);color:var(--crit)">索賄紀錄：${I.bribe_flag === 'R' ? '有索取、未付' : '有付出'}${I.bribe_demanded_usd ? `；要求 USD ${fmt(I.bribe_demanded_usd)}` : ''}${Number(I.bribe_paid_usd) > 0 ? `；實付 USD ${fmt(I.bribe_paid_usd)}` : ''}${I.bribe_cig ? `；香菸 ${esc(I.bribe_cig)}` : ''}${I.bribe_goods ? `；實物 ${esc(I.bribe_goods)}` : ''}${I.bribe_note ? `（${esc(I.bribe_note)}）` : ''}</div>` : ''}
  ${inc ? `<div class="note">事故登錄：${esc(inc.summary)}${inc.check_notes ? ` <span class="flag">⚠ ${esc(inc.check_notes)}</span>` : ''}</div>` : ''}${I.remarks ? `<div class="note">備註：${esc(I.remarks)}</div>` : ''}</div>
  <div class="card" style="margin-bottom:16px"><div class="section-head"><h2>缺失與矯正（${rectified} / ${I.defs.length} 已改正）</h2></div>
  ${I.defs.length ? `<div class="tbl-wrap"><table><thead><tr><th>缺失編號</th><th>代碼</th><th>缺失內容</th><th>處理</th><th>改正</th><th>矯正措施</th>${ed ? '<th></th>' : ''}</tr></thead><tbody>${I.defs.map(d => `<tr data-def="${esc(d.def_id)}"><td class="tn" style="font-size:11.5px">${esc(d.def_id.slice(base.length) || d.def_id)}</td><td><span class="mono">${esc(d.code || '—')}</span><div class="dim" style="font-size:11.5px">${esc(CAT[d.cat] || '')}</div></td><td class="nature">${esc(d.nature)}${d.deadline ? `<div class="dim">期限 ${dfmt(d.deadline)}</div>` : ''}</td><td>${actPill(d)}</td>
  <td>${ed ? `<label class="check"><input type="checkbox" data-k="rectified" ${d.rectified === 'Y' ? 'checked' : ''}> 已改正</label><input class="inp" type="date" data-k="rectified_date" value="${esc(d.rectified_date)}" style="margin-top:4px;max-width:150px">` : (d.rectified === 'Y' ? `<span class="stp stp-closed">已改正 ${dfmt(d.rectified_date)}</span>` : '<span class="dim">未改正</span>')}</td>
  <td style="min-width:200px">${ed ? `<textarea class="inp" rows="2" data-k="corrective_action" placeholder="矯正措施摘要">${esc(d.corrective_action)}</textarea>` : esc(d.corrective_action || '—')}</td>${ed ? '<td><button class="btn" type="button" data-save>儲存</button></td>' : ''}</tr>`).join('')}</tbody></table></div>` : '<div class="empty">無缺失（NIL）</div>'}</div>
  <div class="card"><div class="section-head"><h2>文件歸檔（${I.docs.length}）</h2><span class="dim" style="font-size:12.5px">命名規則：${esc(base)}_[文件代碼]_[序號]</span></div>
  ${ed ? uploadHTML(base, true) : ''}
  ${docListHTML(I.docs, true)}</div>`;
  $('#back').addEventListener('click', () => { S.caseId = null; S.closing = false; render(); });
  $('#copy-no').addEventListener('click', async () => { try { await navigator.clipboard.writeText(base); toast('已複製 ' + base); } catch (e) { toast(base); } });
  wireLinks(v);
  const eb = $('#edit'); if (eb) eb.addEventListener('click', () => { S.form = null; S.caseMode = 'edit'; render(); });
  const ei = $('#edit-inc'); if (ei) ei.addEventListener('click', () => editIncident(inc));
  wireClose({ insp_id: I.insp_id }, I.tracking_no);
  v.querySelectorAll('tr[data-def] [data-save]').forEach(b => b.addEventListener('click', () => {
    const tr = b.closest('tr'), f = {};
    tr.querySelectorAll('[data-k]').forEach(el => { f[el.dataset.k] = el.type === 'checkbox' ? (el.checked ? 'Y' : 'N') : el.value; });
    if (f.rectified === 'Y' && !f.rectified_date) f.rectified_date = today();
    run(async () => { await api('updateDeficiency', { def_id: tr.dataset.def, fields: f }); await reload(); toast('已儲存 ' + tr.dataset.def); }, b);
  }));
  wireUpload(base, I.docs, { insp_id: I.insp_id });
}
/* ---------- case form ---------- */
function vesselOptions(date, selImo) {
  const seen = {}; const out = [];
  M.vessels.forEach(v => { const k = v.imo || v.vessel; if (seen[k]) return; seen[k] = 1; const at = PSC.vesselAt(M.vessels, k, date || today()) || v; out.push([k, at.vessel + (at.chinese ? ' ' + at.chinese : ''), at]); });
  const d0 = date || today();
  out.sort((a, b) => a[1] < b[1] ? -1 : 1);
  return opt('', '選擇船舶') + out.map(([k, l, at]) => opt(k, l + (at.valid_to && at.valid_to < d0 ? '（已退出）' : ''), k === selImo)).join('');
}
function initForm() {
  const I = S.caseMode === 'edit' && S.caseId ? M.byId.get(S.caseId) : null;
  S.form = I ? { insp: { insp_id: I.insp_id, imo: I.imo, date: I.date, port: I.port, country: I.country, mou: I.mou, detention: I.detention === 'Y', pic: I.pic, remarks: I.remarks, tracking_no: I.tracking_no,
      bribe_demanded_usd: I.bribe_demanded_usd || '', bribe_paid_usd: I.bribe_paid_usd || '', bribe_cig: I.bribe_cig || '', bribe_goods: I.bribe_goods || '', bribe_note: I.bribe_note || '' },
    defs: I.defs.map(d => ({ def_id: d.def_id, code: d.code, nature: d.nature, action: d.action, deadline: d.deadline, rectified: d.rectified, rectified_date: d.rectified_date, corrective_action: d.corrective_action, remarks: d.remarks })) }
    : { insp: { imo: '', date: today(), port: '', country: '', mou: '', detention: false, pic: '', remarks: '' }, defs: [{ code: '', nature: '', action: '17', deadline: '' }] };
  S.form.mouManual = !!(I && I.mou && I.mou !== PSC.resolveMOU(M.mouMap, I.country, I.port).mou);
}
function defRowHTML(d, i) {
  const c = PSC.normCode(d.code);
  return `<div class="defrow" data-i="${i}"><div><input class="inp mono" data-d="code" value="${esc(d.code)}" placeholder="07109" inputmode="numeric" aria-label="缺失代碼"><div class="cat">${esc(CAT[c.slice(0, 2)] || '')}</div></div>
  <div><textarea class="inp" data-d="nature" rows="2" placeholder="缺失內容（照 PSC 報告原文）" aria-label="缺失內容">${esc(d.nature)}</textarea></div>
  <div class="c-act"><select class="inp" data-d="action" aria-label="處理代碼">${opt('', '—')}${Object.entries(ACT).map(([k, x]) => opt(k, `${k} ${x}`, String(d.action) === k)).join('')}${d.action && !ACT[d.action] ? opt(d.action, d.action, true) : ''}</select></div>
  <div class="c-dl"><input class="inp" type="date" data-d="deadline" value="${esc(d.deadline)}" aria-label="改正期限"></div>
  <button class="del" type="button" data-del="${i}" aria-label="刪除這一項">×</button></div>`;
}
function caseForm(v) {
  if (!S.form) initForm();
  const F = S.form, editing = !!F.insp.insp_id;
  const ports = [...new Set(M.insp.map(i => i.port))].sort(), countries = [...new Set(M.insp.map(i => i.country))].sort();
  v.innerHTML = `<button class="backlink" type="button" id="back">← ${editing ? '回到案件' : '回到案件列表'}</button>
  <div class="layout-form"><div class="card"><h2 style="margin-bottom:12px">${editing ? '編輯 PSC 檢查' : '新增 PSC 檢查'}</h2><div class="form">
  <div class="frow"><div class="field"><label for="cf-date">檢查日期</label><input class="inp" type="date" id="cf-date" data-f="date" value="${esc(F.insp.date)}"></div>
  <div class="field"><label for="cf-ves">船舶</label><select id="cf-ves" data-f="imo">${vesselOptions(F.insp.date, F.insp.imo)}</select><span class="hint" id="cf-ves-hint"></span></div></div>
  <div class="frow"><div class="field"><label for="cf-port">港口</label><input class="inp" id="cf-port" data-f="port" list="dl-port" value="${esc(F.insp.port)}" placeholder="HONG KONG"></div>
  <div class="field"><label for="cf-country">港口國</label><input class="inp" id="cf-country" data-f="country" list="dl-country" value="${esc(F.insp.country)}" placeholder="CHINA"></div>
  <div class="field"><label for="cf-mou">MOU 區域</label><input class="inp" id="cf-mou" data-f="mou" list="dl-mou" value="${esc(F.insp.mou)}" placeholder="依港口國自動帶入"><span class="hint" id="cf-mou-hint"></span></div></div>
  <div class="frow"><div class="field"><label for="cf-pic">監管人員 PIC</label><input class="inp" id="cf-pic" data-f="pic" value="${esc(F.insp.pic)}" placeholder="預設帶入該船 PIC"></div>
  <div class="field"><label>&nbsp;</label><label class="check"><input type="checkbox" id="cf-det" data-f="detention" ${F.insp.detention ? 'checked' : ''}> 本次檢查被留置（扣船）</label></div></div>
  <div><div class="section-head" style="margin:8px 0 4px"><h2 style="font-size:14px">缺失項目（<span id="cf-ndef">${F.defs.filter(d => d.code || d.nature).length}</span>）</h2><button class="btn" type="button" id="cf-add">新增一項</button></div>
  <div class="defhead"><span>代碼</span><span>缺失內容</span><span>處理代碼</span><span>改正期限</span><span></span></div><div id="cf-defs">${F.defs.map(defRowHTML).join('')}</div>
  <p class="note">沒有缺失時請刪除所有項目，存成 NIL（無缺失）檢查；NIL 不立事故編號。</p></div>
  ${M.canBribe ? `<div class="drop"><div class="section-head" style="margin:0"><h2 style="font-size:14px">索賄紀錄（Bribe）</h2><span class="dim" style="font-size:12px">只有 ${esc(M.settings.bribe_roles || 'admin,editor')} 看得到</span></div>
  <div class="frow"><div class="field"><label for="cf-bdem">對方要求金額（USD）</label><input class="inp" id="cf-bdem" data-f="bribe_demanded_usd" inputmode="decimal" value="${esc(F.insp.bribe_demanded_usd || '')}" placeholder="開價"></div>
  <div class="field"><label for="cf-bpaid">實付金額（USD）</label><input class="inp" id="cf-bpaid" data-f="bribe_paid_usd" inputmode="decimal" value="${esc(F.insp.bribe_paid_usd || '')}" placeholder="0 = 沒有付"></div>
  <div class="field"><label for="cf-bcig">香菸（條 / 包數）</label><input class="inp" id="cf-bcig" data-f="bribe_cig" value="${esc(F.insp.bribe_cig || '')}"></div>
  <div class="field"><label for="cf-bgoods">其他實物</label><input class="inp" id="cf-bgoods" data-f="bribe_goods" value="${esc(F.insp.bribe_goods || '')}" placeholder="例如 Paint、Soft drink"></div></div>
  <div class="field"><label for="cf-bnote">說明</label><input class="inp" id="cf-bnote" data-f="bribe_note" value="${esc(F.insp.bribe_note || '')}" placeholder="例如：PSCO 暗示 NIL 需付費、經代理議價"></div></div>` : ''}
  <div class="field"><label for="cf-rem">備註</label><textarea class="inp" id="cf-rem" data-f="remarks" rows="2">${esc(F.insp.remarks)}</textarea></div>
  <div id="cf-err" class="err"></div><div class="btnrow"><button class="btn primary" type="button" id="cf-save">${editing ? '儲存變更' : '儲存並取得編號'}</button><button class="btn ghost" type="button" id="cf-cancel">取消</button></div></div></div>
  <aside class="card preview" id="cf-prev"></aside></div>
  <datalist id="dl-port">${ports.map(p => `<option value="${esc(p)}">`).join('')}</datalist><datalist id="dl-country">${countries.map(p => `<option value="${esc(p)}">`).join('')}</datalist><datalist id="dl-mou">${PSC.MOU_NAMES.map(p => `<option value="${esc(p)}">`).join('')}</datalist>`;
  const back = () => { S.caseMode = null; S.form = null; render(); };
  $('#back').addEventListener('click', back); $('#cf-cancel').addEventListener('click', back);
  v.querySelectorAll('[data-f]').forEach(el => el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', () => {
    F.insp[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.f === 'mou') F.mouManual = !!el.value.trim();
    if ((el.dataset.f === 'country' || el.dataset.f === 'port') && !F.mouManual) { F.insp.mou = PSC.resolveMOU(M.mouMap, F.insp.country, F.insp.port).mou; $('#cf-mou').value = F.insp.mou; }
    if (el.dataset.f === 'imo' || el.dataset.f === 'date') {
      const at = PSC.vesselAt(M.vessels, F.insp.imo, F.insp.date || today());
      if (el.dataset.f === 'imo' && at && !F.insp.pic) { F.insp.pic = at.pic || ''; $('#cf-pic').value = F.insp.pic; }
      if (el.dataset.f === 'date') { const sel = F.insp.imo; $('#cf-ves').innerHTML = vesselOptions(F.insp.date, sel); }
    }
    preview();
  }));
  const defs = $('#cf-defs');
  defs.addEventListener('input', e => { const el = e.target.closest('[data-d]'); if (!el) return; const i = +el.closest('.defrow').dataset.i; F.defs[i][el.dataset.d] = el.value; if (el.dataset.d === 'code') el.parentElement.querySelector('.cat').textContent = CAT[PSC.normCode(el.value).slice(0, 2)] || ''; preview(); });
  defs.addEventListener('change', e => { const el = e.target.closest('[data-d]'); if (!el) return; const i = +el.closest('.defrow').dataset.i; F.defs[i][el.dataset.d] = el.value; preview(); });
  defs.addEventListener('click', e => { const b = e.target.closest('[data-del]'); if (!b) return; F.defs.splice(+b.dataset.del, 1); $('#cf-defs').innerHTML = F.defs.map(defRowHTML).join(''); preview(); });
  $('#cf-add').addEventListener('click', () => { F.defs.push({ code: '', nature: '', action: '17', deadline: '' }); $('#cf-defs').innerHTML = F.defs.map(defRowHTML).join(''); preview(); const last = $('#cf-defs').lastElementChild; if (last) last.querySelector('input').focus(); });
  $('#cf-save').addEventListener('click', saveForm);
  preview();
}
function preview() {
  const F = S.form, el = $('#cf-prev'); if (!el) return;
  const date = PSC.isoDate(F.insp.date), v = F.insp.imo ? PSC.vesselAt(M.vessels, F.insp.imo, date || today()) : null;
  const defs = F.defs.filter(d => d.code || d.nature);
  $('#cf-ndef').textContent = defs.length;
  const mh = PSC.resolveMOU(M.mouMap, F.insp.country, F.insp.port);
  $('#cf-mou-hint').textContent = !String(F.insp.country || '').trim() ? '' : !mh.found ? '對照表沒有這個國家，請手動選擇並通知管理員補上' : (F.insp.mou && F.insp.mou !== mh.mou && !String(mh.also).includes(F.insp.mou) ? `對照表為 ${mh.mou}，請確認` : (mh.also ? `也是 ${mh.also} 成員；依 PSC 報告抬頭` : (F.insp.mou === PSC.TOKYO ? '會重算 Tokyo MOU 窗口' : '不重算 Tokyo MOU 窗口')));
  $('#cf-ves-hint').textContent = v ? `${v.vessel} · 公司碼 ${v.company} · ${v.management || ''}` + (v.note ? ` · ${v.note}` : '') : '';
  const set = M.settings, ti = PSC.pscTier({ deficiencies: defs, detention: F.insp.detention, threshold: +set.tier2_def_threshold || 6, ismEscalate: String(set.tier2_on_ism || 'Y').toUpperCase() !== 'N' });
  let no = '', note = '';
  if (F.insp.tracking_no) { no = F.insp.tracking_no; note = '編號已發出，不會變更'; }
  else if (ti.tier && v && date) { no = PSC.buildTrackingNo(v.company, v.vessel, date, ti.tier, PSC.PSC_TYPE, PSC.nextSeq(M.incidents, v.vessel, date)); note = '預覽；儲存時由系統正式配號（同船同日序號）'; }
  else if (!ti.tier && v && date) { no = F.insp.insp_id || PSC.inspectionId(date, v.imo, v.vessel); note = 'NIL：只登錄在 PSC 資料庫，不立事故編號'; }
  const dl = ti.tier && date ? PSC.deadlines(date, ti.tier) : null, T = PSC.TIERS[ti.tier];
  const miss = defs.filter(d => !PSC.normCode(d.code) || !String(d.nature).trim()).length;
  el.innerHTML = `<div class="eyebrow">${ti.tier ? '事故追蹤編號' : '檢查編號'}</div><div class="big">${esc(no || '選擇船舶與日期後產生')}</div><div class="note" style="margin:0">${esc(note)}</div>
  <dl class="kv"><dt>等級</dt><dd>${ti.tier ? `${tierPill(ti.tier)} ${esc(T.zh)}` : 'NIL'}</dd><dt>判定</dt><dd>${esc(ti.reason)}</dd><dt>類型</dt><dd>${ti.tier ? 'O 其他（PSC 統一）' : '—'}</dd>
  ${dl ? `<dt>立即通報</dt><dd>${T.flashH} 小時內</dd><dt>初步報告</dt><dd>${T.initialH} 小時內（${dfmt(dl.initial_due)}）</dd><dt>RCA</dt><dd>${T.rcaD} 天內（${dfmt(dl.rca_due)}）</dd>` : ''}
  <dt>缺失編號</dt><dd class="tn" style="white-space:normal">${no && ti.tier ? esc(no) + '-D01 起' : '—'}</dd><dt>歸檔資料夾</dt><dd class="tn" style="white-space:normal">${no ? esc(PSC.folderPath({ date: date, tracking_no: ti.tier ? no : '', insp_id: no }).join(' / ')) : '—'}</dd></dl>
  ${miss ? `<p class="err" style="margin-top:10px">${miss} 項缺失的代碼或內容還沒填</p>` : ''}`;
}
function saveForm() {
  const F = S.form, err = $('#cf-err'); err.textContent = '';
  if (!F.insp.imo) { err.textContent = '請選擇船舶'; return; }
  if (!F.insp.date) { err.textContent = '請填寫檢查日期'; return; }
  if (!String(F.insp.port).trim()) { err.textContent = '請填寫港口'; return; }
  const defs = F.defs.filter(d => d.code || d.nature);
  const bad = defs.find(d => !PSC.normCode(d.code) || !String(d.nature).trim());
  if (bad) { err.textContent = '每一項缺失都需要代碼與內容'; return; }
  run(async () => {
    const r = await api('saveInspection', { inspection: Object.assign({}, F.insp, { detention: F.insp.detention ? 'Y' : 'N' }), deficiencies: defs });
    S.form = null; S.caseMode = null; S.caseId = r.inspection.insp_id;
    await reload();
    toast((r.inspection.tracking_no ? '已登錄，事故編號 ' + r.inspection.tracking_no : '已登錄 NIL 檢查 ' + r.inspection.insp_id) + (r.warnings && r.warnings.length ? '。注意：' + r.warnings.join('；') : ''), 7000);
  }, $('#cf-save'));
}

/* ---------- 事故管理（主軸）: analysis ---------- */
const dueCell = (d, done, open) => { if (done) return '<span class="due" style="color:var(--good)">✓ 已歸檔</span>'; if (!d) return '<span class="dim">—</span>'; const late = open && d < today(); return `<span class="due ${late ? 'over' : ''}">${late ? '逾期 ' : ''}${dfmt(d)}</span>`; };
const srcPill = x => x.psc ? '<span class="srcpill">PSC</span>' : '<span class="srcpill oth">其他</span>';
const incSum = x => esc(String(x.summary).slice(0, 140)) + (String(x.summary).length > 140 ? '…' : '');
function incList(withVoid) { return M.incidents.filter(x => (withVoid || !x.void) && incMatch(x)); }
function vIncOverview(v) {
  const L = incList(), n = L.length, psc = L.filter(x => x.psc).length, open = L.filter(x => x.status === ST.OPEN), over = L.filter(x => x.over);
  const t12 = L.filter(x => x.tier === '1' || x.tier === '2').length, t1 = L.filter(x => x.tier === '1').length;
  const miss = M.insp.filter(inspMatch).filter(I => I.status === '未立案');
  const pscN = M.insp.filter(inspMatch), pscDef = pscN.filter(I => I.defs.length && I.status !== ST.HIST);
  const first = M.incidents.length ? M.incidents[M.incidents.length - 1].date : '';
  const RT = PSC.rulesAt(M.rules, today()), target = (Number(RT.params.ontime_target) || 95) / 100;
  const ot = PSC.ontimeStats(L, M.docsByNo), otM = PSC.ontimeStats(L, M.docsByNo, x => x.mgmt);
  const stageAgg = PSC.STAGES_LIST.map(st => { const o = { due: 0, ontime: 0, late: 0, overdue: 0 }; L.forEach(x => { if (x.void) return; const t = x.timely.find(q => q.stage === st.k); if (!t || t.state === 'pending' || t.state === 'exempt' || t.state === 'untracked') return; o.due++; o[t.state]++; }); return [st.label, o]; });
  const majors = L.filter(x => x.major_level);
  const imported = L.filter(x => (x.source === 'REGISTER' || x.created_by === 'import') && !x.flash_at && !x.initial_at && !x.docs.length).length;
  v.innerHTML = `<div class="callout" style="margin-bottom:14px">事故登錄器是主軸：所有事故（含 PSC 有缺失的檢查，類型一律 O）都在這裡編號與追蹤期限。PSC 檢查的完整統計（含 ${fmt(M.insp.filter(I => I.status === ST.NIL).length)} 次 NIL）在「PSC 檢查」分頁。事故登錄自 ${dfmt(first)} 起建檔。</div>
  <div class="kpis"><div class="kpi"><div class="k">事故件數</div><div class="v num">${fmt(n)}</div><div class="d">PSC ${psc} 件 · 其他 ${n - psc} 件</div></div>
  <div class="kpi"><div class="k">進行中</div><div class="v num">${fmt(open.length)}</div><div class="d">已完成 ${fmt(L.filter(x => x.status === ST.CLOSED).length)} 件</div></div>
  <div class="kpi ${over.length ? 'crit' : ''}"><div class="k">RCA 期限已過仍未結案</div><div class="v num">${fmt(over.length)}</div><div class="d">${over.length ? '請追蹤調查報告' : '皆在期限內'}</div></div>
  <div class="kpi ${ot.all && ot.all.rate != null && ot.all.rate < target ? 'crit' : ''}"><div class="k">通報時限準時率</div><div class="v num">${ot.all && ot.all.rate != null ? Math.round(ot.all.rate * 100) + '%' : '—'}</div><div class="d">目標 ≥ ${Math.round(target * 100)}%；${ot.all && ot.all.due ? `已到期 ${ot.all.due} 份報告` : '尚無可計算的報告'}</div></div>
  <div class="kpi ${miss.length ? 'crit' : ''}"><div class="k">PSC 有缺失未立案</div><div class="v num">${fmt(miss.length)}</div><div class="d">${miss.length ? '點下方清單補發編號' : `${fmt(pscDef.length)} 次有缺失檢查皆已立案或為歷史資料`}</div></div></div>
  ${miss.length ? `<div class="card" style="margin-bottom:16px;border-left:3px solid var(--crit)"><h2>PSC 有缺失但未立案（${miss.length}）</h2><p class="sub">開啟後按「編輯檢查內容」→ 儲存，系統即補發事故編號</p><div class="tbl-wrap"><table><thead><tr><th>檢查日</th><th>船舶</th><th>港口</th><th class="n">缺失</th><th>檢查編號</th></tr></thead><tbody>${miss.map(I => `<tr class="click" data-open="${esc(I.insp_id)}"><td class="num">${dfmt(I.date)}</td><td>${esc(I.vessel)}</td><td>${esc(I.port)}, ${esc(I.country)}</td><td class="n">${I.defs.length}</td><td class="tn">${esc(I.insp_id)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
  <div class="card" style="margin-bottom:16px"><div class="card-head"><div><h2>每月事故</h2><p class="sub">依事故日期；PSC = PSC 檢查有缺失自動立案</p></div><div class="legend"><span><i class="k-psc"></i>PSC</span><span><i class="k-oth"></i>其他事故</span></div></div><div class="chart" id="ch-inc-month"></div></div>
  <div class="card" style="margin-bottom:16px"><div class="section-head"><h2>待處理事故（${open.length}）</h2><span class="dim" style="font-size:12.5px">依 RCA 期限排序；點一下開啟事故</span></div><div class="tbl-wrap"><table id="t-open"><thead><tr><th>事故編號</th><th>船舶</th><th>等級</th><th>立即通報</th><th>初步報告</th><th>RCA</th><th>PIC</th><th>簡述</th></tr></thead><tbody>${open.slice().sort((a, b) => (a.rca_due || '9') < (b.rca_due || '9') ? -1 : 1).map(x => { const has = t => x.docs.some(d => d.doc_type === t); return `<tr class="click" data-incrow="${esc(x.tracking_no)}"><td><span class="tn">${esc(x.tracking_no)}</span> ${srcPill(x)}</td><td>${esc(x.vessel)}</td><td style="white-space:nowrap">${tierPill(x.tier)} <span class="mono">${esc(x.type)}</span></td>${x.timely.map(t => `<td>${t.state === 'untracked' && t.stage !== 'rca' ? '<span class="dim" style="font-size:12px">匯入，未追蹤</span>' : t.at ? `<span class="due" style="color:var(--good)">✓ ${dfmt(t.at)}</span>` : dueCell(t.due, false, true)}</td>`).join('')}<td>${esc(x.pic)}</td><td class="nature" style="min-width:220px">${incSum(x)}</td></tr>`; }).join('') || '<tr><td colspan="8" class="empty">沒有進行中的事故</td></tr>'}</tbody></table></div><p class="note">從事故登錄器匯入的事故沒有通報文件紀錄，所以立即通報 / 初步報告顯示「未追蹤」；RCA 期限依事故日期與等級推算。在事故頁上傳 FLASH / INIT / RCA 文件後即顯示已歸檔。</p></div>
  <div class="grid g2" style="margin-bottom:16px"><div class="card"><h2>通報時限達成率</h2><p class="sub">依 3-TSTB-VSL-P002 6.4.2；實際提交日以事故頁填寫的日期為準，沒填時以最早歸檔的 FLASH／INIT／RCA 文件日期計；不可抗力（6.4.2.5）不計入。委外船舶列入年度評比（6.5.5），目標 ≥ ${Math.round(target * 100)}%</p>
  <div class="tbl-wrap"><table><thead><tr><th>管理公司</th><th class="n">已到期</th><th class="n">準時</th><th class="n">遲交</th><th class="n">逾期未交</th><th>準時率</th></tr></thead><tbody>${Object.entries(otM).sort((a, b) => b[1].due - a[1].due).map(([k, o]) => `<tr><td>${esc(k)}</td><td class="n">${o.due}</td><td class="n">${o.ontime}</td><td class="n">${o.late || '–'}</td><td class="n">${o.overdue ? `<b style="color:var(--crit)">${o.overdue}</b>` : '–'}</td><td class="num">${o.rate == null ? '—' : `<span class="inline-bar" style="width:${Math.round(o.rate * 70)}px;background:${o.rate >= target ? 'var(--good)' : 'var(--crit)'}"></span>${Math.round(o.rate * 100)}%`}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">沒有資料</td></tr>'}</tbody></table></div>
  <div class="tbl-wrap" style="margin-top:10px"><table><thead><tr><th>階段</th><th class="n">已到期</th><th class="n">準時</th><th class="n">遲交</th><th class="n">逾期未交</th></tr></thead><tbody>${stageAgg.map(([l, o]) => `<tr><td>${l}</td><td class="n">${o.due}</td><td class="n">${o.ontime}</td><td class="n">${o.late || '–'}</td><td class="n">${o.overdue || '–'}</td></tr>`).join('')}</tbody></table></div>
  ${imported ? `<p class="note">${imported} 件從事故登錄器匯入的舊事故沒有實際提交日、也沒有歸檔文件，標為「未填報」，不計入準時率。可在事故頁「編輯事故」補填實際日期後納入統計。</p>` : ''}</div>
  <div class="card"><h2>4.1 重大事件（${majors.length}）</h2><p class="sub">決定緊急應變小組與主持層級；通報分級不得低於對應級別（4.2.4.2）</p>${majors.length ? `<div class="tbl-wrap"><table><thead><tr><th>事故編號</th><th>等級</th><th>主持</th><th>應變小組</th><th>通報分級</th></tr></thead><tbody>${majors.map(x => { const m = RT.major[x.major_level] || {}; return `<tr class="click" data-incrow="${esc(x.tracking_no)}"><td class="tn">${esc(x.tracking_no)}</td><td>${esc(m.name || x.major_level)}</td><td>${esc(x.ert_chair || m.ert_chair || '—')}</td><td>${x.ert === 'Y' ? '已成立' : '<span style="color:var(--crit)">未成立</span>'}</td><td>${tierPill(x.tier)}${m.min_tier && Number(x.tier) > Number(m.min_tier) ? ' <span class="flag">低於規定</span>' : ''}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="note">目前沒有標記為 4.1 重大事件的事故。在事故頁「編輯事故」填入海損金額、死亡／受傷人數或延誤時數，系統會依規範提示等級。</p>'}
  <h2 style="margin-top:16px">規範檢核提醒</h2><p class="sub">依目前有效的事故規範（${esc(RT.set)}）</p>${(() => { const c = L.filter(x => x.checks.length); return c.length ? `<div class="tbl-wrap" style="max-height:260px"><table><tbody>${c.slice(0, 40).map(x => `<tr class="click" data-incrow="${esc(x.tracking_no)}"><td class="tn" style="font-size:11.5px">${esc(x.tracking_no)}</td><td style="font-size:12.5px">${x.checks.map(esc).join('<br>')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="note">沒有需要提醒的事項。</p>'; })()}</div></div>
  <div class="grid g2" style="margin-bottom:16px"><div class="card"><h2>事故性質</h2><p class="sub">依編號規則類型碼；O 類大多為 PSC</p><div class="bars" id="ch-itype"></div></div><div class="card"><h2>嚴重程度</h2><p class="sub">依編號規則 Tier</p><div class="bars" id="ch-itier"></div><h2 style="margin-top:16px">TSL 責任單位</h2><div class="bars" id="ch-iunit"></div></div></div>
  <div class="grid g2"><div class="card"><h2>船舶事故排名</h2><p class="sub">前 12 名；點一下只看這艘船</p><div class="bars" id="ch-ives"></div></div><div class="card"><h2>管理公司</h2><p class="sub">PSC 事故依檢查當時管理公司；其他事故依公司碼</p><div class="tbl-wrap"><table id="t-imgmt"></table></div></div></div>`;
  incMonth($('#ch-inc-month'), L);
  const TY = PSC.TYPES;
  bars($('#ch-itype'), [...countBy(L, x => x.type || '—')].sort((a, b) => b[1] - a[1]).map(([k, val]) => ({ k, v: val, lab: `<span class="mono">${esc(k)}</span>${esc(TY[k] || '不在規則內')}`, extra: pct(L.filter(x => x.type === k && x.psc).length, val) + ' PSC' })), { onClick: it => { S.incF.type = it.k; setTab('incidents'); } });
  bars($('#ch-itier'), [...countBy(L, x => x.tier || '—')].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([k, val]) => ({ k, v: val, lab: `${tierPill(k)} ${esc((PSC.TIERS[k] || {}).zh || '不在規則內（' + k + '）')}`, extra: pct(val, n) })), { onClick: it => { S.incF.tier = it.k; setTab('incidents'); } });
  bars($('#ch-iunit'), [...countBy(L, x => x.unit || '—')].sort((a, b) => b[1] - a[1]).map(([k, val]) => ({ k, v: val, lab: esc(k), extra: pct(val, n) })));
  bars($('#ch-ives'), [...countBy(L, x => String(x.imo || x.vessel))].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, val]) => { const V = M.vreg[k]; const o = L.filter(x => String(x.imo || x.vessel) === k); return { k, v: val, lab: esc(V ? V.name : o[0].vessel) + (V && V.zh ? ` <span class="dim">${esc(V.zh)}</span>` : ''), extra: `PSC ${o.filter(x => x.psc).length}` }; }), { onClick: it => { S.vessel = it.k; setTab('incidents'); } });
  const byM = {}; L.forEach(x => { const o = byM[x.mgmt] || (byM[x.mgmt] = { n: 0, open: 0, over: 0, psc: 0, t12: 0, v: new Set() }); o.n++; o.v.add(String(x.imo || x.vessel)); if (x.status === ST.OPEN) o.open++; if (x.over) o.over++; if (x.psc) o.psc++; if (x.tier === '1' || x.tier === '2') o.t12++; });
  $('#t-imgmt').innerHTML = '<thead><tr><th>管理公司</th><th class="n">船數</th><th class="n">事故</th><th class="n">每船</th><th class="n">PSC</th><th class="n">Tier 1–2</th><th class="n">進行中</th><th class="n">逾期</th></tr></thead><tbody>' +
    Object.entries(byM).sort((a, b) => b[1].n - a[1].n).map(([k, o]) => `<tr class="click" data-m="${esc(k)}"><td>${esc(k)}</td><td class="n">${o.v.size}</td><td class="n">${o.n}</td><td class="n">${(o.n / o.v.size).toFixed(1)}</td><td class="n">${o.psc}</td><td class="n">${o.t12}</td><td class="n">${o.open}</td><td class="n">${o.over ? `<b style="color:var(--crit)">${o.over}</b>` : '–'}</td></tr>`).join('') + '</tbody>';
  $('#t-imgmt').querySelectorAll('tr.click').forEach(tr => tr.addEventListener('click', () => { S.mgmt = S.mgmt === tr.dataset.m ? '' : tr.dataset.m; render(); }));
  v.querySelectorAll('[data-incrow]').forEach(tr => tr.addEventListener('click', () => openIncident(tr.dataset.incrow)));
  v.querySelectorAll('[data-open]').forEach(tr => tr.addEventListener('click', () => openCase(tr.dataset.open)));
}
function incMonth(el, L) {
  if (!el) return;
  const ys = S.years.size ? [...S.years].sort() : [...new Set(M.incidents.map(x => x.y))].sort(); const first = M.incidents.length ? M.incidents[M.incidents.length - 1].ym : '', last = (M.asof || today()).slice(0, 7);
  const months = []; ys.forEach(y => { for (let m = 1; m <= 12; m++) { const k = `${y}-${String(m).padStart(2, '0')}`; if (k >= first && k <= last) months.push(k); } });
  if (!months.length) { el.innerHTML = '<div class="empty">沒有資料</div>'; return; }
  const agg = Object.fromEntries(months.map(m => [m, { p: 0, o: 0 }])); L.forEach(x => { const a = agg[x.ym]; if (a) a[x.psc ? 'p' : 'o']++; });
  const W = Math.max(320, el.clientWidth || 900), H = 200, pl = 28, pr = 6, pt = 10, pb = 30;
  const max = Math.max(4, ...months.map(m => agg[m].p + agg[m].o)), step = max <= 6 ? 1 : max <= 12 ? 2 : 5, top = Math.ceil(max / step) * step;
  const iw = W - pl - pr, ih = H - pt - pb, bw = iw / months.length, gap = Math.min(10, bw * .3), y = v => pt + ih - (v / top) * ih;
  let g = '';
  for (let v = 0; v <= top; v += step) g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10.5" fill="var(--muted)">${v}</text>`;
  months.forEach((m, i) => {
    const a = agg[m], x = pl + i * bw + gap / 2, w = Math.max(1, bw - gap);
    if (a.p) g += `<rect x="${x}" y="${y(a.p)}" width="${w}" height="${(a.p / top) * ih}" fill="var(--s1)"/>`;
    if (a.o) g += `<rect x="${x}" y="${y(a.p + a.o)}" width="${w}" height="${Math.max(1, (a.o / top) * ih - (a.p ? 2 : 0))}" rx="2" fill="var(--s2)"/>`;
    if (a.p + a.o) g += `<text x="${x + w / 2}" y="${y(a.p + a.o) - 4}" text-anchor="middle" font-size="10.5" fill="var(--ink-2)">${a.p + a.o}</text>`;
    g += `<rect x="${pl + i * bw}" y="${pt}" width="${bw}" height="${ih}" fill="transparent" data-m="${m}" class="hit"/>`;
    g += `<text x="${pl + i * bw + bw / 2}" y="${H - pb + 14}" text-anchor="middle" font-size="10" fill="var(--muted)">${+m.slice(5)}</text>`;
    if (+m.slice(5) === 1 || i === 0) g += `<text x="${pl + i * bw + 2}" y="${H - 4}" font-size="11" font-weight="600" fill="var(--ink-2)">${m.slice(0, 4)}</text>`;
  });
  g += `<line x1="${pl}" x2="${W - pr}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line-2)"/>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="每月事故件數">${g}</svg>`;
  el.querySelectorAll('.hit').forEach(h => { h.addEventListener('mousemove', e => { const a = agg[h.dataset.m]; showTip(e, `<b>${h.dataset.m.replace('-', '/')}</b><div class="row"><span><i style="background:var(--s1)"></i>PSC</span><span>${a.p} 件</span></div><div class="row"><span><i style="background:var(--s2)"></i>其他事故</span><span>${a.o} 件</span></div>`); }); h.addEventListener('mouseleave', hideTip); });
}

/* ---------- 事故管理: register list + detail ---------- */
function vIncidents(v) {
  if (caseRoute(v)) return;
  if (S.incId && M.incByNo.get(S.incId)) return incidentDetail(v, M.incByNo.get(S.incId));
  S.incId = null;
  const F = S.incF;
  let list = incList(F.status === ST.VOID).filter(x => (!F.co || x.company === F.co) && (!F.tier || x.tier === F.tier) && (!F.type || x.type === F.type) && (!F.src || (F.src === 'PSC' ? x.psc : !x.psc)));
  const base = list;
  if (F.status === 'over') list = list.filter(x => x.over); else if (F.status) list = list.filter(x => x.status === F.status);
  const cos = [...new Set(M.incidents.map(x => x.company))].sort();
  const flagged = list.filter(x => x.check_notes).length;
  const pages = Math.max(1, Math.ceil(list.length / PAGE)); S.page = Math.min(S.page, pages - 1);
  const chips = [['', '全部', base.length], [ST.OPEN, '進行中', base.filter(x => x.status === ST.OPEN).length], ['over', 'RCA 逾期', base.filter(x => x.over).length], [ST.CLOSED, '已完成', base.filter(x => x.status === ST.CLOSED).length]];
  const nVoid = incList(true).filter(x => x.void).length; if (nVoid) chips.push([ST.VOID, '作廢', nVoid]);
  v.innerHTML = `<div class="grid" style="grid-template-columns:minmax(0,1fr)">
  <div class="card"><div class="section-head"><div><h2>事故登錄器</h2><p class="sub" style="margin:2px 0 0">點一下開啟事故處理頁（期限、文件歸檔、結案）。PSC 事故會開啟對應的檢查與缺失矯正。</p></div><div class="btnrow">${can('editor') ? '<button class="btn" type="button" id="i-psc">登錄 PSC 檢查</button><button class="btn primary" type="button" id="i-new">新增其他事故</button>' : ''}</div></div>
  <div class="toolbar"><div class="yrs">${chips.map(([k, l, c]) => `<button type="button" class="chip" data-is="${k}" aria-pressed="${F.status === k}">${l} <span class="num">${c}</span></button>`).join('')}</div></div>
  <div class="toolbar"><select class="sel" id="i-co">${opt('', '全部公司碼')}${cos.map(c => opt(c, c, F.co === c)).join('')}</select><select class="sel" id="i-tier">${opt('', '全部等級')}${['1', '2', '3'].map(t => opt(t, `Tier ${t} ${PSC.TIERS[t].en}`, F.tier === t)).join('')}</select>
  <select class="sel" id="i-type">${opt('', '全部類型')}${Object.entries(PSC.TYPES).map(([k, x]) => opt(k, `${k} ${x}`, F.type === k)).join('')}</select>
  <select class="sel" id="i-src">${opt('', 'PSC 與其他')}${opt('PSC', '只看 PSC', F.src === 'PSC')}${opt('OTHER', '只看非 PSC', F.src === 'OTHER')}</select><span style="flex:1"></span><span><b class="num">${list.length}</b> 筆 · ${flagged} 筆有檢核註記</span></div>
  <div class="tbl-wrap"><table><thead><tr><th>事故編號</th><th>日期</th><th>船舶</th><th>等級</th><th>單位</th><th>狀態</th><th>RCA 期限</th><th class="n">文件</th><th>事故簡述</th></tr></thead><tbody>${list.slice(S.page * PAGE, (S.page + 1) * PAGE).map(x => `<tr class="click" data-incrow="${esc(x.tracking_no)}"><td><span class="tn">${esc(x.tracking_no)}</span> ${srcPill(x)}${x.tracking_no_std && x.tracking_no_std !== x.tracking_no ? `<div class="dim tn" style="font-size:11.5px">建議：${esc(x.tracking_no_std)}</div>` : ''}${x.check_notes ? `<div class="flag" title="${esc(x.check_notes)}">⚠ ${esc(x.check_notes.split('；')[0])}${x.check_notes.split('；').length > 1 ? ` 等 ${x.check_notes.split('；').length} 項` : ''}</div>` : ''}</td><td class="num">${dfmt(x.date)}</td><td>${esc(x.vessel)}</td><td style="white-space:nowrap">${tierPill(x.tier)} <span class="mono">${esc(x.type)}</span></td><td style="white-space:nowrap">${esc(x.unit)}</td><td>${x.void ? '<span class="stp stp-hist">作廢</span>' : x.over ? '<span class="stp stp-over">進行中・RCA 逾期</span>' : `<span class="stp stp-${x.status === ST.OPEN ? 'open' : 'closed'}">${esc(x.status)}</span>`}${x.closed_date ? `<div class="dim">${dfmt(x.closed_date)}</div>` : ''}</td><td>${x.status === ST.OPEN ? dueCell(x.rca_due, x.docs.some(d => d.doc_type === 'RCA'), true) : '<span class="dim">—</span>'}</td><td class="n">${x.docs.length || '–'}</td><td class="nature" style="min-width:240px">${incSum(x)}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">沒有符合條件的事故</td></tr>'}</tbody></table></div><div class="pager" id="i-pager"></div></div>
  <div class="card"><h2>編號規則速查</h2><p class="sub">[公司碼]-[船名]-[YYYYMMDD]-[等級][類型]-[序號]；序號為同船同日序號 01–99（PSC 與其他事故共用）</p><div class="grid g2"><div class="tbl-wrap"><table class="ref"><thead><tr><th>等級</th><th>判定</th><th>通報 / 初報 / RCA</th></tr></thead><tbody><tr><td>${tierPill('1')} Major</td><td>人員死亡、全損、重大污染、擱淺碰撞、主機失效影響航行</td><td>2 小時 / 24 小時 / 14 天</td></tr><tr><td>${tierPill('2')} Moderate</td><td>嚴重傷害、重要設備故障、PSC 留置、PSC 缺失 ≥ ${esc(M.settings.tier2_def_threshold || 6)} 項或有 ISM 缺失、輕微污染、港口罰款</td><td>2 小時 / 24 小時 / 14 天</td></tr><tr><td>${tierPill('3')} Minor</td><td>輕傷、一般設備故障、Near Miss、PSC 缺失</td><td>12 小時 / 48 小時 / 21 天</td></tr></tbody></table></div>
  <div class="tbl-wrap"><table class="ref"><thead><tr><th>類型</th><th>說明</th></tr></thead><tbody>${Object.entries(PSC.TYPES).map(([k, x]) => `<tr><td class="mono">${k}</td><td>${esc(x)}${k === 'O' ? '（PSC 檢查一律用 O）' : ''}</td></tr>`).join('')}</tbody></table></div></div></div></div>`;
  [['#i-co', 'co'], ['#i-tier', 'tier'], ['#i-type', 'type'], ['#i-src', 'src']].forEach(([s, k]) => $(s).addEventListener('change', e => { F[k] = e.target.value; S.page = 0; render(); }));
  v.querySelectorAll('[data-is]').forEach(b => b.addEventListener('click', () => { F.status = b.dataset.is; S.page = 0; render(); }));
  v.querySelectorAll('[data-incrow]').forEach(tr => tr.addEventListener('click', () => openIncident(tr.dataset.incrow)));
  $('#i-pager').innerHTML = pages > 1 ? `<button class="btn" type="button" data-p="-1" ${S.page ? '' : 'disabled'}>上一頁</button><span class="num">${S.page + 1} / ${pages}</span><button class="btn" type="button" data-p="1" ${S.page < pages - 1 ? '' : 'disabled'}>下一頁</button>` : '';
  $('#i-pager').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { S.page += +b.dataset.p; render(); }));
  const nb = $('#i-new'); if (nb) nb.addEventListener('click', () => editIncident(null));
  const pb = $('#i-psc'); if (pb) pb.addEventListener('click', () => { S.form = null; S.caseMode = 'new'; S.caseId = null; render(); window.scrollTo({ top: 0 }); });
}
const UNITS = ['海技', '工務', '物料', '船員', '運務'];
const TL_PILL = { ontime: ['stp-closed', '準時'], late: ['stp-miss', '遲交'], overdue: ['stp-over', '逾期未交'], pending: ['stp-nil', '未到期'], exempt: ['stp-hist', '不可抗力'], untracked: ['stp-hist', '未填報（匯入）'] };
const CLOSE_ITEMS = ['所有調查程序已完成', '符合合約及本程序書所訂時限', '符合 ISM Code 之要求', '相關文件已歸檔'];
function timelyHTML(x) {
  const R = PSC.rulesAt(M.rules, x.date), m = R.major[x.major_level];
  const pd = m ? Number(R.params.progress_major_d || 7) : Number((R.tiers[x.tier] || {}).progress_d || 0);
  const lastUpd = [x.progress_at].concat(x.docs.filter(d => d.doc_type === 'UPD').map(d => String(d.uploaded_at).slice(0, 10))).filter(Boolean).sort().pop();
  return `<div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>報告階段</th><th>期限</th><th>實際提交</th><th>狀態</th></tr></thead><tbody>${x.timely.map(t => `<tr><td>${esc(t.label)}</td><td class="num">${dfmt(t.due)}</td><td class="num">${t.at ? dfmt(t.at) + (t.src === '文件' ? ' <span class="dim" style="font-size:11.5px">（依文件）</span>' : '') : '<span class="dim">—</span>'}</td><td><span class="stp ${TL_PILL[t.state][0]}">${TL_PILL[t.state][1]}</span></td></tr>`).join('')}
  <tr><td>進度更新</td><td>${pd ? `每 ${pd} 天至少一次` : '<span class="dim">依本公司要求</span>'}</td><td class="num">${lastUpd ? dfmt(lastUpd) : '<span class="dim">—</span>'}</td><td></td></tr></tbody></table></div>
  <div class="dim" style="font-size:12px;margin-top:4px">規範：${esc(R.set)}${x.due_note ? `；期限調整原因：${esc(x.due_note)}` : ''}${x.force_majeure === 'Y' ? `；不可抗力：${esc(x.fm_note || '已註記')}` : ''}</div>`;
}
function checksHTML(x) { return x.checks.length ? `<div class="callout" style="margin-top:12px">${x.checks.map(c => `<div>⚠ ${esc(c)}</div>`).join('')}</div>` : ''; }
function incidentDetail(v, x) {
  const ed = can('editor'), base = x.tracking_no, open = x.status === ST.OPEN;
  const V = M.vreg[String(x.imo || x.vessel)], R = PSC.rulesAt(M.rules, x.date), m = R.major[x.major_level];
  const cc = String(x.close_checks || '');
  v.innerHTML = `<button class="backlink" type="button" id="back">← 回到事故列表</button>
  <div class="card" style="margin-bottom:16px"><div class="vprof-head"><div style="min-width:0"><div class="eyebrow">事故追蹤編號</div><div class="tn-lg">${esc(base)}</div>${x.former_no ? `<div class="dim" style="font-size:12px">原編號 ${esc(x.former_no)}</div>` : ''}
  <div class="btnrow" style="margin-top:6px">${x.void ? '<span class="stp stp-hist">作廢</span>' : x.over ? '<span class="stp stp-over">進行中・RCA 逾期</span>' : `<span class="stp stp-${open ? 'open' : 'closed'}">${esc(x.status)}</span>`}${tierPill(x.tier)}<span class="mono">${esc(x.type)}</span><span class="dim" style="font-size:13px">${esc((R.types[x.type] || {}).name || '')} · ${esc((R.tiers[x.tier] || {}).name || '')}</span>${m ? `<span class="pill det">4.1 ${esc(m.name)}</span>` : ''}</div></div>
  <div class="btnrow"><button class="btn" type="button" id="copy-no">複製編號</button>${x.void ? '' : '<button class="btn" type="button" id="i-reply">回信範本</button>'}${ed ? '<button class="btn" type="button" id="i-edit">編輯事故</button>' : ''}${ed && !x.void ? (open ? '<button class="btn primary" type="button" id="close">結案</button>' : '<button class="btn" type="button" id="reopen">重新開啟</button>') : ''}</div></div>
  <dl class="facts"><div><dt>事故日期</dt><dd>${dfmt(x.date)}</dd></div><div><dt>船舶</dt><dd>${V ? `<a href="#vessels" class="vlink" data-v="${esc(String(x.imo || x.vessel))}">${esc(x.vessel)}</a>` : esc(x.vessel)} <span class="dim">IMO ${esc(x.imo || '—')}</span></dd></div><div><dt>公司碼 / 管理</dt><dd>${esc(x.company)} / ${esc(x.mgmt)}</dd></div><div><dt>地點</dt><dd>${esc(x.location || '—')}</dd></div><div><dt>TSL 責任單位</dt><dd>${esc(x.unit || '—')}</dd></div><div><dt>監管人員 PIC</dt><dd>${esc(x.pic || '—')}</dd></div>
  ${m || x.loss_usd || x.deaths || x.injuries ? `<div><dt>4.1 重大事件</dt><dd>${m ? esc(m.name) + '・' + (x.ert === 'Y' ? '應變小組已成立' : '應變小組未成立') + '（' + esc(x.ert_chair || m.ert_chair) + '）' : '未達'}</dd></div><div><dt>損失</dt><dd>${[x.loss_usd ? 'USD ' + fmt(x.loss_usd) : '', x.deaths ? '死亡 ' + x.deaths : '', x.injuries ? '受傷 ' + x.injuries : '', x.delay_h ? '延誤 ' + x.delay_h + ' 小時' : ''].filter(Boolean).join('・') || '—'}</dd></div>` : ''}
  <div><dt>來源</dt><dd>${x.source === 'MANUAL' ? '本系統新增' : '事故登錄器匯入'}</dd></div>${x.closed_date ? `<div><dt>結案日</dt><dd>${dfmt(x.closed_date)}</dd></div>` : ''}</dl>
  ${checksHTML(x)}${timelyHTML(x)}
  ${S.closing ? closeBoxHTML('結案前請確認已歸檔 RCA（Template 4）或結案確認（Template 5C），並在「編輯事故」勾選 6.6.4 結案確認四項。') : ''}
  <div class="note" style="white-space:pre-wrap">事故簡述：${esc(x.summary)}</div>${x.corrective_action ? `<div class="note" style="white-space:pre-wrap">矯正／預防措施：${esc(x.corrective_action)}</div>` : ''}
  ${x.status === ST.CLOSED ? `<div class="note">6.6.4 結案確認：${CLOSE_ITEMS.map((t, i) => (cc[i] === 'Y' ? '✓ ' : '✗ ') + t).join('　')}</div>` : ''}${x.check_notes ? `<div class="note flag">檢核註記：${esc(x.check_notes)}</div>` : ''}${x.reply_log ? `<div class="note"><b>回信紀錄</b>${String(x.reply_log).split('\n').map(l => `<div class="mono" style="font-size:12px">${esc(l)}</div>`).join('')}</div>` : ''}</div>
  <div class="card"><div class="section-head"><h2>文件歸檔（${x.docs.length}）</h2><span class="dim" style="font-size:12.5px">命名規則：${esc(base)}_[文件代碼]_[序號]；Drive：${esc(PSC.folderPath({ date: x.date, tracking_no: base, source: x.source }).join(' / '))}</span></div>
  ${ed ? uploadHTML(base, false) : ''}${docListHTML(x.docs, false)}</div>`;
  $('#back').addEventListener('click', () => { S.incId = null; S.closing = false; render(); });
  $('#copy-no').addEventListener('click', async () => { try { await navigator.clipboard.writeText(base); toast('已複製 ' + base); } catch (e) { toast(base); } });
  wireLinks(v);
  const eb = $('#i-edit'); if (eb) eb.addEventListener('click', () => editIncident(x));
  const rb = $('#i-reply'); if (rb) rb.addEventListener('click', () => replyComposer(x));
  wireClose({ tracking_no: base }, base);
  wireUpload(base, x.docs, { tracking_no: base });
}
/* ---------- 回信範本：管理公司各階段通報後，套用範本快速回信 ---------- */
const TPL_STAGE = { flash: '立即通報', initial: '初步報告', progress: '進度更新', rca: 'RCA', close: '結案', overdue: '逾期' };
async function copyText(t, msg) {
  try { await navigator.clipboard.writeText(t); }
  catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (_) {} ta.remove(); }
  toast(msg || '已複製');
}
function replyComposer(x, code) {
  const list = M.templates.filter(t => t.active !== 'N');
  if (!list.length) { toast('沒有可用的回信範本，請到「事故規範 → 回信範本」新增'); return; }
  const sug = PSC.replyStage(x, x.docs, today());
  let cur = list.find(t => t.code === (code || sug)) || list[0], dirty = false;
  const co = M.companies.find(c => c.code === x.company) || {};
  const picFull = p => { p = String(p || '').trim(); if (!p) return ''; const hit = M.vessels.map(v => String(v.pic || '').trim()).find(v => v !== p && v.toLowerCase().endsWith(' ' + p.toLowerCase())); return hit || p; };
  const st = { master: '', team: co.greeting || '', incident_en: '', pic: picFull(x.pic || (USER && USER.name)) };
  const vars = () => PSC.replyVars(x, Object.assign({ rules: M.rules, company: co, docs: x.docs, today: today() }, st));
  const tabs = () => list.map(t => `<button class="chip" type="button" data-tpl="${esc(t.code)}" aria-pressed="${t.code === cur.code}">${esc(t.name)}${t.code === sug ? ' <span class="tpl-sug">建議</span>' : ''}</button>`).join('');
  const field = (id, label, val, ph) => `<div class="field"><label for="${id}">${label}</label><input class="inp" id="${id}" value="${esc(val)}" placeholder="${esc(ph || '')}"></div>`;
  openModal({ title: '回信範本', sub: `${esc(x.tracking_no)}・${esc(x.vessel)}・${esc(x.company)}`,
    html: `<div class="tpl-tabs" id="rc-tabs">${tabs()}</div>
    <div class="form"><div class="frow">${field('rc-master', '船長姓名（稱謂用）', st.master, '例：Xu')}${field('rc-team', '管理公司稱謂', st.team, vars().greeting.replace(/^Master and /, ''))}${field('rc-pic', '署名（TSL PIC）', st.pic, 'Capt. Albert Yeh')}</div>
    ${field('rc-inc', '事故英文名稱', st.incident_en, '例：Major Container Fire at Bay 38 (Undeclared Lithium-ion Batteries)')}
    <div class="frow">${field('rc-to', '收件人 To', co.email_to || '', '管理公司信箱（可在系統管理設定）')}${field('rc-cc', '副本 Cc', co.email_cc || '', '')}</div>
    <div class="field"><label for="rc-subj">主旨</label><input class="inp" id="rc-subj"></div>
    <div class="field"><label for="rc-body">內文 <span class="dim" style="font-weight:400">（可直接修改；【】是要填寫的地方）</span></label><textarea class="inp tpl-body" id="rc-body" rows="20" spellcheck="false"></textarea></div>
    <div id="rc-warn"></div></div>`,
    foot: `<button class="btn ghost" type="button" id="rc-reset">重新套用範本</button><span style="flex:1"></span><button class="btn" type="button" id="rc-cs">複製主旨</button><button class="btn" type="button" id="rc-cb">複製內文</button><button class="btn" type="button" id="rc-mail">開啟郵件</button>${can('editor') ? '<button class="btn primary" type="button" id="rc-log">記錄已回覆</button>' : ''}`,
    onMount(root, close) {
      const $r = q => root.querySelector(q), subj = $r('#rc-subj'), body = $r('#rc-body');
      const warn = () => { const p = PSC.pendingMarks(subj.value + '\n' + body.value); $r('#rc-warn').innerHTML = p.length ? `<div class="callout">還有 ${p.length} 處待填：${p.slice(0, 4).map(t => esc(t.length > 40 ? t.slice(0, 40) + '…' : t)).join('、')}${p.length > 4 ? '…' : ''}</div>` : '<div class="note" style="margin:0">✓ 沒有待填欄位</div>'; };
      const apply = () => { const v = vars(); subj.value = PSC.fillTemplate(cur.subject, v); body.value = PSC.fillTemplate(cur.body, v); dirty = false; warn(); };
      const wireTabs = () => $r('#rc-tabs').querySelectorAll('[data-tpl]').forEach(b => b.addEventListener('click', () => {
        if (dirty && !confirm('內文已修改，切換範本會覆蓋修改的內容，要繼續嗎？')) return;
        cur = list.find(t => t.code === b.dataset.tpl); $r('#rc-tabs').innerHTML = tabs(); wireTabs(); apply();
      }));
      wireTabs();
      [['#rc-master', 'master'], ['#rc-team', 'team'], ['#rc-pic', 'pic'], ['#rc-inc', 'incident_en']].forEach(([id, k]) => $r(id).addEventListener('input', e => { st[k] = e.target.value.trim(); if (!dirty) apply(); else warn(); }));
      [subj, body].forEach(el => el.addEventListener('input', () => { dirty = true; warn(); }));
      $r('#rc-reset').addEventListener('click', () => { if (!dirty || confirm('用範本重新產生主旨與內文？目前的修改會被覆蓋。')) apply(); });
      $r('#rc-cs').addEventListener('click', () => copyText(subj.value, '已複製主旨'));
      $r('#rc-cb').addEventListener('click', () => copyText(body.value, '已複製內文，可直接貼到 Outlook'));
      $r('#rc-mail').addEventListener('click', async () => {
        const to = $r('#rc-to').value.trim(), cc = $r('#rc-cc').value.trim();
        let url = `mailto:${encodeURIComponent(to).replace(/%40/g, '@').replace(/%2C/gi, ',')}?${cc ? 'cc=' + encodeURIComponent(cc) + '&' : ''}subject=${encodeURIComponent(subj.value)}`;
        const withBody = url + '&body=' + encodeURIComponent(body.value.replace(/\n/g, '\r\n'));
        if (withBody.length <= 1900) location.href = withBody;
        else { await copyText(body.value, '內文較長，已先複製；郵件開啟後請在內文貼上'); location.href = url; }
      });
      const lb = $r('#rc-log'); if (lb) lb.addEventListener('click', () => run(async () => { await api('logReply', { tracking_no: x.tracking_no, code: cur.code, name: cur.name, subject: subj.value }); await close(); await reload(); toast('已記錄回信：' + cur.name); }, lb));
      apply();
    } });
}
function templatesCardHTML() {
  const adm = can('admin');
  return `<div class="card" style="margin-bottom:16px"><div class="section-head"><div><h2>回信範本</h2><p class="sub" style="margin:2px 0 0">事故頁的「回信範本」依事故進度建議範本，自動帶入編號、船名、分級、期限與管理公司稱謂。範本存在試算表「Templates」分頁（同代碼覆蓋預設範本），admin 可在這裡修改。</p></div>${adm ? '<button class="btn" type="button" id="tp-new">新增範本</button>' : ''}</div>
  <div class="tbl-wrap"><table><thead><tr><th>回覆階段</th><th>名稱</th><th>主旨</th><th>狀態</th><th></th></tr></thead><tbody>${M.templates.map(t => `<tr><td>${esc(TPL_STAGE[t.stage] || t.stage || '—')}</td><td>${esc(t.name)}${t.builtin === 'N' ? ' <span class="dim">自訂</span>' : ''}</td><td class="mono" style="font-size:12px">${esc(t.subject)}</td><td>${t.active === 'N' ? '<span class="dim">停用</span>' : '啟用'}</td><td>${adm ? `<button class="btn sm" type="button" data-tp="${esc(t.code)}">修改</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
}
const TPL_VARS = ['greeting', 'tracking_no', 'vessel', 'incident', 'date', 'location', 'tier_en', 'type_en', 'company', 'pic', 'initial_h', 'initial_due', 'rca_d', 'rca_due', 'progress_txt', 'progress_txt_short', 'flash_at_txt', 'progress_at_txt', 'rca_at_txt', 'closed_date_txt', 'corrective_action', 'close_checks_txt', 'overdue_txt', 'retention_years'];
function editTemplate(t) {
  const isNew = !t; t = t || { code: '', stage: 'progress', name: '', subject: '[{{tracking_no}}] M/V {{vessel}} - ', body: 'Dear {{greeting}},\n\n', sort: '70', active: 'Y', note: '' };
  openModal({ title: isNew ? '新增回信範本' : '修改回信範本', sub: isNew ? '' : `${esc(t.name)}（${esc(t.code)}）`,
    html: `<div class="form"><div class="frow"><div class="field"><label for="tp-code">代碼</label><input class="inp mono" id="tp-code" data-k="code" value="${esc(t.code)}" ${isNew ? '' : 'readonly'} placeholder="例：survey"></div><div class="field"><label for="tp-name">名稱</label><input class="inp" id="tp-name" data-k="name" value="${esc(t.name)}"></div><div class="field"><label for="tp-stage">回覆階段</label><select id="tp-stage" data-k="stage">${Object.entries(TPL_STAGE).map(([k, l]) => opt(k, l, t.stage === k)).join('')}</select></div><div class="field"><label for="tp-sort">排序</label><input class="inp" id="tp-sort" data-k="sort" value="${esc(t.sort || '')}"></div><div class="field"><label for="tp-active">狀態</label><select id="tp-active" data-k="active">${opt('Y', '啟用', t.active !== 'N')}${opt('N', '停用', t.active === 'N')}</select></div></div>
    <div class="field"><label for="tp-subj">主旨</label><input class="inp mono" id="tp-subj" data-k="subject" value="${esc(t.subject)}"></div>
    <div class="field"><label for="tp-body">內文</label><textarea class="inp tpl-body" id="tp-body" data-k="body" rows="18" spellcheck="false">${esc(t.body)}</textarea><span class="hint">可用變數（點一下插入）：${TPL_VARS.map(k => `<button type="button" class="tpl-var" data-v="${k}">{{${k}}}</button>`).join(' ')}；【…】代表要人工填寫的地方，回信時會提醒。</span></div>
    <div class="field"><label for="tp-note">備註</label><input class="inp" id="tp-note" data-k="note" value="${esc(t.note || '')}"></div><div id="tp-err" class="err"></div></div>`,
    foot: `${!isNew && t.builtin === 'Y' ? '<button class="btn ghost" type="button" id="tp-default">還原預設內容</button><span style="flex:1"></span>' : ''}<button class="btn ghost" type="button" data-close>取消</button><button class="btn primary" type="button" id="tp-save">儲存</button>`,
    onMount(root, close) {
      root.querySelector('[data-close]').addEventListener('click', close);
      const bodyEl = root.querySelector('#tp-body');
      root.querySelectorAll('.tpl-var').forEach(b => b.addEventListener('click', () => { const a = bodyEl.selectionStart, z = bodyEl.selectionEnd, ins = '{{' + b.dataset.v + '}}'; bodyEl.value = bodyEl.value.slice(0, a) + ins + bodyEl.value.slice(z); bodyEl.focus(); bodyEl.selectionStart = bodyEl.selectionEnd = a + ins.length; }));
      const dft = root.querySelector('#tp-default');
      if (dft) dft.addEventListener('click', () => { const d = PSC.DEFAULT_TEMPLATES.find(x => x.code === t.code); if (!d) return; root.querySelectorAll('[data-k]').forEach(el => { if (d[el.dataset.k] !== undefined && el.dataset.k !== 'code') el.value = d[el.dataset.k]; }); toast('已還原預設內容，按「儲存」生效'); });
      root.querySelector('#tp-save').addEventListener('click', () => {
        const row = {}; root.querySelectorAll('[data-k]').forEach(el => { row[el.dataset.k] = el.value; });
        row.code = row.code.trim();
        if (!/^[\w-]+$/.test(row.code)) { root.querySelector('#tp-err').textContent = '代碼請用英數字（例如 survey）'; return; }
        if (isNew && M.templates.some(x => x.code === row.code)) { root.querySelector('#tp-err').textContent = '代碼已存在'; return; }
        run(async () => { await api('saveTemplate', row); await close(); await reload(); toast('已儲存範本：' + row.name); }, root.querySelector('#tp-save'));
      });
    } });
}
function editCompany(c) {
  openModal({ title: '管理公司聯絡資訊', sub: `${esc(c.code)}・${esc(c.name)}`,
    html: `<div class="form"><div class="field"><label for="ec-greet">回信稱謂</label><input class="inp" id="ec-greet" value="${esc(c.greeting || '')}" placeholder="例：V.Ships Management Team"><span class="hint">回信開頭為「Dear Capt. 船長 and 這裡的稱謂」</span></div>
    <div class="field"><label for="ec-to">收件人 To</label><input class="inp" id="ec-to" value="${esc(c.email_to || '')}" placeholder="多個信箱以逗號分隔"></div><div class="field"><label for="ec-cc">副本 Cc</label><input class="inp" id="ec-cc" value="${esc(c.email_cc || '')}"></div></div>`,
    foot: '<button class="btn ghost" type="button" data-close>取消</button><button class="btn primary" type="button" id="ec-save">儲存</button>',
    onMount(root, close) {
      root.querySelector('[data-close]').addEventListener('click', close);
      root.querySelector('#ec-save').addEventListener('click', () => run(async () => { await api('saveCompany', Object.assign({}, c, { greeting: root.querySelector('#ec-greet').value.trim(), email_to: root.querySelector('#ec-to').value.trim(), email_cc: root.querySelector('#ec-cc').value.trim() })); await close(); await reload(); toast('已儲存 ' + c.code); }, root.querySelector('#ec-save')));
    } });
}
/** 事故編輯（彈出視窗）：新增非 PSC 事故、或修改任何事故的所有欄位 */
function editIncident(x) {
  const isNew = !x, psc = !!x && x.psc, admin = can('admin');
  const f = isNew ? { date: today(), imo: '', company: '', tier: '3', type: 'M', unit: '海技', pic: '', summary: '', location: '' }
    : Object.assign({}, x, { imo: x.imo || x.vessel });
  const optsV = vesselOptions(f.date, String(f.imo));
  const R0 = PSC.rulesAt(M.rules, f.date || today());
  const fld = (k, l, inner, hint) => `<div class="field"><label for="ei-${k}">${l}</label>${inner}${hint ? `<span class="hint" id="ei-${k}-hint">${hint}</span>` : ''}</div>`;
  const inp = (k, type, extra) => `<input class="inp" id="ei-${k}" data-k="${k}" type="${type || 'text'}" value="${esc(f[k] || '')}" ${extra || ''}>`;
  const lockP = psc ? 'disabled title="PSC 事故請在對應的 PSC 檢查修改"' : '';
  const cc = String(f.close_checks || '');
  const html = `<div class="form">
  <fieldset class="fieldset"><legend>基本資料</legend>
  ${psc ? '<div class="note" style="margin:0">PSC 事故的日期、船舶與簡述由 PSC 檢查決定；其他欄位可在這裡修改。</div>' : ''}
  <div class="frow">${fld('date', '事故日期', inp('date', 'date', lockP))}${fld('imo', '船舶', `<select id="ei-imo" data-k="imo" ${lockP}>${optsV}</select>`)}${fld('company', '公司碼', `<select id="ei-company" data-k="company">${opt('', '依船隊資料')}${Object.keys(PSC.COMPANY_TO_MGMT).map(c => opt(c, c, f.company === c)).join('')}</select>`)}</div>
  <div class="frow">${fld('tier', '通報分級（4.2）', `<select id="ei-tier" data-k="tier">${['1', '2', '3'].map(t => opt(t, `${t} ${(R0.tiers[t] || {}).name || ''} ${(R0.tiers[t] || {}).name_en || ''}`, f.tier === t)).join('')}</select>`, '')}${fld('type', '事故性質（4.3）', `<select id="ei-type" data-k="type">${Object.entries(R0.types).map(([k, t]) => opt(k, `${k} ${t.name} ${t.name_en || ''}`, f.type === k)).join('')}</select>`)}${fld('unit', 'TSL 責任單位', `<select id="ei-unit" data-k="unit">${UNITS.map(u => opt(u, u, f.unit === u)).join('')}</select>`)}${fld('pic', '監管人員 PIC', inp('pic'))}</div>
  <div class="frow">${fld('location', '地點（港口／海域）', inp('location', 'text', 'placeholder="例如 Kaohsiung 外海"'))}</div>
  ${fld('summary', '事故簡述', `<textarea class="inp" id="ei-summary" data-k="summary" rows="3" ${lockP}>${esc(f.summary || '')}</textarea>`)}
  <div class="drop" style="padding:10px"><div class="eyebrow">事故編號</div><div class="tn-lg" id="ei-no" style="font-size:15px">—</div><div class="dim" style="font-size:12px" id="ei-no-note"></div>
  ${!isNew && admin ? `<label class="check"><input type="checkbox" id="ei-renumber"> 依修改後的內容重新編號（舊號保留在「原編號」，相關檢查、缺失、文件同步更新）</label>` : ''}</div></fieldset>
  <fieldset class="fieldset"><legend>4.1 重大事件與緊急應變小組</legend>
  <div class="frow">${fld('loss_usd', '海損金額（USD）', inp('loss_usd', 'text', 'inputmode="decimal"'))}${fld('deaths', '死亡人數', inp('deaths', 'number', 'min="0"'))}${fld('injuries', '受傷人數', inp('injuries', 'number', 'min="0"'))}${fld('delay_h', '延誤船期（小時）', inp('delay_h', 'number', 'min="0"'))}</div>
  <div class="hint" id="ei-suggest" style="font-size:12.5px"></div>
  <div class="frow">${fld('major_level', '4.1 重大事件等級', `<select id="ei-major_level" data-k="major_level">${opt('', '未達重大事件（不成立應變小組）')}${Object.entries(R0.major).map(([k, mm]) => opt(k, `${mm.name}（${mm.ert_chair}主持）`, String(f.major_level) === k)).join('')}</select>`)}${fld('ert_chair', '應變小組主持人', inp('ert_chair', 'text', 'placeholder="依等級自動帶入"'))}<div class="field"><label>&nbsp;</label><label class="check"><input type="checkbox" data-k="ert" ${f.ert === 'Y' ? 'checked' : ''}> 已成立緊急應變小組</label></div></div></fieldset>
  <fieldset class="fieldset"><legend>通報時效（6.4.2）</legend>
  <div class="dim" style="font-size:12px" id="ei-rule"></div>
  <div class="frow">${fld('flash_due', '立即通報期限', inp('flash_due', 'date'))}${fld('initial_due', '初步報告期限', inp('initial_due', 'date'))}${fld('rca_due', 'RCA 期限', inp('rca_due', 'date'))}</div>
  <div class="frow">${fld('flash_at', '立即通報實際日', inp('flash_at', 'date'))}${fld('initial_at', '初步報告實際日', inp('initial_at', 'date'))}${fld('rca_at', 'RCA 實際提交日', inp('rca_at', 'date'))}${fld('progress_at', '最近進度更新日', inp('progress_at', 'date'))}</div>
  <div class="frow">${fld('due_note', '期限調整原因', inp('due_note', 'text', 'placeholder="例如：合約期限較短（6.5.1）、舊帳補登"'))}</div>
  <div class="btnrow"><label class="check"><input type="checkbox" data-k="force_majeure" ${f.force_majeure === 'Y' ? 'checked' : ''}> 不可抗力致無法於時限內通報（6.4.2.5）</label>${!isNew ? '<label class="check"><input type="checkbox" id="ei-recalc"> 依規範重算期限</label>' : ''}</div>
  ${fld('fm_note', '不可抗力說明（原因、實際發生時間）', inp('fm_note'))}</fieldset>
  ${isNew ? '' : `<fieldset class="fieldset"><legend>結案（6.6.4）</legend>
  <div class="frow">${fld('status', '狀態', `<select id="ei-status" data-k="status">${[ST.OPEN, ST.CLOSED].concat(admin && !psc ? [ST.VOID] : []).map(t => opt(t, t, f.status === t)).join('')}</select>`)}${fld('closed_date', '結案日', inp('closed_date', 'date'))}</div>
  <div class="frow">${CLOSE_ITEMS.map((t, i) => `<label class="check"><input type="checkbox" data-cc="${i}" ${cc[i] === 'Y' ? 'checked' : ''}> ${t}</label>`).join('')}</div>
  ${fld('corrective_action', '矯正／預防措施', `<textarea class="inp" id="ei-corrective_action" data-k="corrective_action" rows="2">${esc(f.corrective_action || '')}</textarea>`)}
  ${fld('check_notes', '檢核註記', inp('check_notes'))}</fieldset>`}
  <div id="ei-err" class="err"></div></div>`;
  openModal({ title: isNew ? '新增事故（非 PSC）' : '編輯事故', sub: isNew ? 'PSC 檢查請改用「登錄 PSC 檢查」，系統會自動判定等級' : esc(x.tracking_no), html,
    foot: `<button class="btn ghost" type="button" data-close>取消</button><button class="btn primary" type="button" id="ei-save">${isNew ? '取得編號並登錄' : '儲存'}</button>`,
    onMount(root, close) {
      const q = sel => root.querySelector(sel);
      const val = () => { const o = {}; root.querySelectorAll('[data-k]').forEach(el => { o[el.dataset.k] = el.type === 'checkbox' ? (el.checked ? 'Y' : 'N') : el.value; }); if (!isNew) o.close_checks = [0, 1, 2, 3].map(i => q(`[data-cc="${i}"]`).checked ? 'Y' : 'N').join(''); return o; };
      const upd = () => {
        const o = Object.assign({}, f, val()), R = PSC.rulesAt(M.rules, o.date || today());
        const v = o.imo ? PSC.vesselAt(M.vessels, o.imo, o.date || today()) : null;
        const sug = PSC.suggestMajor(o, R), mm = R.major[o.major_level];
        q('#ei-suggest').innerHTML = (sug.level ? `數值符合 <b>${esc(R.major[sug.level].name)}</b>（${esc(sug.reasons.join('、'))}）：應變小組由${esc(sug.chair)}主持，通報分級至少第 ${esc(sug.min_tier)} 級。劫持、污染等條件請人工判斷。` : '依數值未達 4.1 重大事件；劫持、污染等條件請人工判斷。') +
          (mm && Number(o.tier) > Number(mm.min_tier) ? `<div class="err">4.2.4.2：${esc(mm.name)} 的通報分級不得低於第 ${esc(mm.min_tier)} 級</div>` : '');
        q('#ei-ert_chair').placeholder = mm ? mm.ert_chair : '依等級自動帶入';
        const T = R.tiers[o.tier] || {}, dl = o.date ? PSC.ruleDeadlines(o.date, o.tier, R) : null;
        q('#ei-rule').textContent = `${R.set}：${T.name || ''} 立即通報 ${T.flash_h} 小時、初步報告 ${T.initial_h} 小時、RCA ${T.rca_d} 天${dl ? `（依事故日 ${dfmt(o.date)} 推算 RCA 期限 ${dfmt(dl.rca_due)}）` : ''}`;
        if (isNew && dl) ['flash_due', 'initial_due', 'rca_due'].forEach(k => { if (!q('#ei-' + k).dataset.touched) q('#ei-' + k).value = dl[k]; });
        const co = o.company || (v && v.company) || '';
        if (isNew) { q('#ei-no').textContent = v && o.date ? PSC.buildTrackingNo(co, v.vessel, o.date, o.tier, o.type, PSC.nextSeq(M.incidents, v.vessel, o.date)) : '選擇船舶與日期後產生'; }
        else {
          const rn = q('#ei-renumber') && q('#ei-renumber').checked;
          const vv = v ? v.vessel : x.vessel, dd = o.date || x.date;
          const nn = PSC.buildTrackingNo(co || x.company, vv, dd, o.tier, o.type, PSC.nextSeq(M.incidents.filter(i => i.tracking_no !== x.tracking_no), vv, dd));
          q('#ei-no').textContent = rn ? nn : x.tracking_no;
          q('#ei-no-note').textContent = rn ? `重新編號後：${nn}（原 ${x.tracking_no}）` : (nn.replace(/-\d{2}$/, '') !== x.tracking_no.replace(/-\d{2}$/, '') ? `依目前內容應為 ${nn}；編號預設不變` : '');
        }
      };
      root.querySelectorAll('[data-k],[data-cc],#ei-renumber').forEach(el => el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date' ? 'change' : 'input', () => {
        if (/_due$/.test(el.dataset.k || '')) el.dataset.touched = '1';
        if (el.dataset.k === 'date') q('#ei-imo').innerHTML = vesselOptions(el.value, q('#ei-imo').value);
        if (el.dataset.k === 'imo' && isNew && !q('#ei-pic').value) { const v = PSC.vesselAt(M.vessels, el.value, q('#ei-date').value || today()); if (v) q('#ei-pic').value = v.pic || ''; }
        if (el.dataset.k === 'status' && el.value === ST.CLOSED && !q('#ei-closed_date').value) q('#ei-closed_date').value = today();
        upd();
      }));
      root.querySelector('[data-close]').addEventListener('click', close);
      upd();
      q('#ei-save').addEventListener('click', () => {
        const o = val(), err = q('#ei-err'); err.textContent = '';
        if (isNew) {
          if (!o.imo || !o.date) { err.textContent = '請選擇船舶與日期'; return; }
          if (!String(o.summary).trim()) { err.textContent = '請填寫事故簡述'; return; }
          run(async () => { const r = await api('saveIncident', o); await close(); await reload(); openIncident(r.tracking_no); toast('已登錄：' + r.tracking_no, 7000); }, q('#ei-save'));
          return;
        }
        if (psc) { delete o.date; delete o.imo; delete o.summary; }
        if (!o.company) delete o.company;
        const p = { tracking_no: x.tracking_no, fields: o, renumber: !!(q('#ei-renumber') && q('#ei-renumber').checked), recalc: !!(q('#ei-recalc') && q('#ei-recalc').checked) };
        if (p.recalc) ['flash_due', 'initial_due', 'rca_due'].forEach(k => delete o[k]);
        run(async () => {
          const r = await api('updateIncident', p); await close();
          if (S.incId === x.tracking_no) S.incId = r.incident.tracking_no;
          await reload();
          toast('已儲存 ' + r.incident.tracking_no + (r.warnings.length ? '。注意：' + r.warnings.join('；') : ''), r.warnings.length ? 9000 : 4500);
        }, q('#ei-save'));
      });
    } });
}

/* ---------- 事故管理: 事故規範 (3-TSTB-VSL-P002) — editable, versioned ---------- */
const RULE_FIELDS = {
  tier: [['name', '名稱'], ['name_en', '英文'], ['flash_h', '立即通報（小時）'], ['initial_h', '初步報告（小時）'], ['progress_d', '進度更新間隔（日，空白 = 依公司要求）'], ['rca_d', 'RCA（日）'], ['criteria', '判定標準'], ['ref', '條次']],
  major: [['name', '名稱'], ['ert_chair', '應變小組主持'], ['min_tier', '最低通報分級'], ['loss_usd_min', '海損門檻 USD（≥）'], ['deaths_min', '死亡門檻（≥）'], ['delay_h_min', '延誤門檻（小時 ≥）'], ['injury_min', '受傷門檻（≥）'], ['criteria', '條件說明'], ['ref', '條次']],
  type: [['name', '名稱'], ['name_en', '英文'], ['criteria', '說明'], ['ref', '條次']],
  param: [['name', '說明'], ['value', '值'], ['ref', '條次']]
};
function vIncRules(v) {
  const at = S.ruleDate || today(), R = PSC.rulesAt(M.rules, at), adm = can('admin');
  const sets = {}; M.rules.forEach(r => { const k = r.rule_set + '|' + r.valid_from; (sets[k] = sets[k] || { set: r.rule_set, from: r.valid_from, n: 0 }).n++; });
  const setList = Object.values(sets).sort((a, b) => a.from < b.from ? 1 : -1);
  const editBtn = r => adm ? `<button class="btn sm" type="button" data-rule="${esc(PSC.ruleKey(r))}">修改</button>` : '';
  const T = R.tiers, MJ = R.major;
  v.innerHTML = `<div class="card" style="margin-bottom:16px"><div class="section-head"><div><h2>事故規範</h2><p class="sub" style="margin:2px 0 0">依據 3-TSTB-VSL-P002 船舶重大事件處理程序書。規範存在試算表「Rules」分頁，可修改、可分版本；每件事故依「事故日期當時有效」的版本計算期限與檢核，舊帳不受新版影響。</p></div>
  <div class="btnrow"><label class="dim" style="font-size:12.5px">查看日期 <input class="inp" type="date" id="rd" value="${esc(at)}" style="width:auto;display:inline-block"></label>${adm ? '<button class="btn primary" type="button" id="r-new">新增規範版本</button>' : ''}</div></div>
  <div class="tbl-wrap"><table><thead><tr><th>版本</th><th>生效日</th><th class="n">條目</th><th></th></tr></thead><tbody>${setList.map(o => `<tr><td>${esc(o.set)}</td><td class="num">${dfmt(o.from)}</td><td class="n">${o.n}</td><td>${o.set === R.set ? '<span class="stp stp-open">此日期適用</span>' : ''}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="card" style="margin-bottom:16px"><h2>通報分級與時限（4.2、6.4.2、附件 8.3）</h2><p class="sub">時限自事故發生時間起算；委外船舶合約期限較短者從其規定（6.5.1），可在個別事故調整期限並註明原因</p>
  <div class="tbl-wrap"><table><thead><tr><th>分級</th><th>判定標準</th><th class="n">立即通報</th><th class="n">初步報告</th><th>進度更新</th><th class="n">最終調查報告 RCA</th><th>條次</th><th></th></tr></thead><tbody>${['1', '2', '3'].filter(k => T[k]).map(k => { const r = T[k]; return `<tr><td style="white-space:nowrap">${tierPill(k)} ${esc(r.name)}<div class="dim" style="font-size:11.5px">${esc(r.name_en)}</div></td><td style="min-width:220px">${esc(r.criteria)}</td><td class="n">${esc(r.flash_h)} 小時</td><td class="n">${esc(r.initial_h)} 小時</td><td>${r.progress_d ? `每 ${esc(r.progress_d)} 天至少一次` : '依本公司要求'}</td><td class="n">${esc(r.rca_d)} 日</td><td class="dim" style="font-size:12px">${esc(r.ref)}</td><td>${editBtn(r)}</td></tr>`; }).join('')}</tbody></table></div></div>
  <div class="card" style="margin-bottom:16px"><h2>4.1 重大事件分級與緊急應變小組</h2><p class="sub">4.1 決定緊急應變小組的成立與主持層級；4.2 決定通報時限。達 4.1 重大事件者，通報分級不得低於對應級別（4.2.4.2）；未達者仍依第三級通報追蹤，但不成立應變小組（4.2.4.3）。數字門檻包含本數（7.2）。</p>
  <div class="tbl-wrap"><table><thead><tr><th>等級</th><th>主持</th><th>最低通報分級</th><th>數值門檻（系統提示用）</th><th>條件</th><th>條次</th><th></th></tr></thead><tbody>${Object.keys(MJ).sort().map(k => { const r = MJ[k]; return `<tr><td style="white-space:nowrap"><b>${esc(r.name)}</b></td><td>${esc(r.ert_chair)}</td><td>${tierPill(r.min_tier)}</td><td style="font-size:12.5px">${[r.loss_usd_min ? '海損 ≥ USD ' + fmt(r.loss_usd_min) : '', r.deaths_min ? '死亡 ≥ ' + r.deaths_min : '', r.delay_h_min ? '延誤 ≥ ' + r.delay_h_min + ' 小時' : '', r.injury_min ? '受傷 ≥ ' + r.injury_min : ''].filter(Boolean).join('<br>') || '—'}</td><td style="min-width:240px;font-size:12.5px">${esc(r.criteria)}</td><td class="dim" style="font-size:12px">${esc(r.ref)}</td><td>${editBtn(r)}</td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">此版本沒有 4.1 分級</td></tr>'}</tbody></table></div></div>
  ${incRiskCardHTML()}${templatesCardHTML()}
  <div class="grid g2"><div class="card"><h2>事故性質代碼（4.3）</h2><div class="tbl-wrap"><table class="ref"><tbody>${Object.entries(R.types).map(([k, r]) => `<tr><td class="mono">${esc(k)}</td><td>${esc(r.name)} <span class="dim">${esc(r.name_en)}</span><div class="dim" style="font-size:12px">${esc(r.criteria)}</div></td><td>${editBtn(r)}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="card"><h2>參數</h2><div class="tbl-wrap"><table class="ref"><tbody>${Object.keys(R.params).map(code => M.rules.filter(x => x.kind === 'param' && x.code === code && x.active !== 'N' && x.valid_from <= at).sort((a, b) => a.valid_from < b.valid_from ? 1 : -1)[0]).filter(Boolean).map(r => `<tr><td>${esc(r.name)}<div class="dim" style="font-size:12px">${esc(r.ref)}</div></td><td class="mono">${esc(r.value)}</td><td>${editBtn(r)}</td></tr>`).join('')}</tbody></table></div>
  <h2 style="margin-top:16px">程序重點</h2><ul style="margin:6px 0 0;padding-left:18px;font-size:13px;display:grid;gap:4px"><li>6.4.2.5：通訊中斷等不可抗力，回復後立即通報並敘明原因與實際發生時間（事故頁勾選「不可抗力」）。</li><li>6.4.3：海技課確認收到通報後產生追蹤編號並回覆通報人；後續文件都要載明編號。</li><li>6.5：委外船舶依合約通報；本公司監管進度、RCA 品質與矯正措施有效性，不介入調查細節；時限達成率納入年度評比。</li><li>6.6.4：結案前確認調查完成、符合時限、符合 ISM、文件已歸檔，再以正式信文通知結案。</li><li>6.7：事故追蹤清冊、各階段報告與往來信文保存 ${esc(R.params.retention_years || 5)} 年。</li></ul></div></div>`;
  $('#rd').addEventListener('change', e => { S.ruleDate = e.target.value || ''; render(); });
  v.querySelectorAll('[data-rule]').forEach(b => b.addEventListener('click', () => editRule(M.rules.find(r => PSC.ruleKey(r) === b.dataset.rule))));
  const nb = $('#r-new'); if (nb) nb.addEventListener('click', newRuleSetModal);
  v.querySelectorAll('[data-tp]').forEach(b => b.addEventListener('click', () => editTemplate(M.templates.find(t => t.code === b.dataset.tp))));
  const tn = $('#tp-new'); if (tn) tn.addEventListener('click', () => editTemplate(null));
  const ire = $('#ir-edit'); if (ire) ire.addEventListener('click', editIncRisk);
}
function editRule(r) {
  if (!r) return;
  const fields = RULE_FIELDS[r.kind] || [];
  openModal({ title: '修改規範', sub: `${esc(r.rule_set)}（${dfmt(r.valid_from)} 起）· ${esc(r.kind)} ${esc(r.code)}`,
    html: `<div class="form"><div class="note" style="margin:0">修改後，生效日在此版本之後的所有事故都會用新的值重算（已人工調整期限的事故不變）。若要保留舊值給過去的事故，請改用「新增規範版本」。</div>
    <div class="frow">${fields.map(([k, l]) => `<div class="field" style="${k === 'criteria' ? 'grid-column:1/-1' : ''}"><label for="er-${k}">${l}</label>${k === 'criteria' ? `<textarea class="inp" id="er-${k}" data-k="${k}" rows="2">${esc(r[k])}</textarea>` : `<input class="inp" id="er-${k}" data-k="${k}" value="${esc(r[k])}">`}</div>`).join('')}
    <div class="field"><label for="er-active">啟用</label><select id="er-active" data-k="active">${opt('Y', '啟用', r.active !== 'N')}${opt('N', '停用', r.active === 'N')}</select></div></div><div id="er-err" class="err"></div></div>`,
    foot: '<button class="btn ghost" type="button" data-close>取消</button><button class="btn primary" type="button" id="er-save">儲存</button>',
    onMount(root, close) {
      root.querySelector('[data-close]').addEventListener('click', close);
      root.querySelector('#er-save').addEventListener('click', () => {
        const row = Object.assign({}, r, { old_key: PSC.ruleKey(r) }); root.querySelectorAll('[data-k]').forEach(el => { row[el.dataset.k] = el.value.trim(); });
        run(async () => { await api('saveRule', row); await close(); await reload(); toast('已儲存規範：' + (row.name || row.code)); }, root.querySelector('#er-save'));
      });
    } });
}
function newRuleSetModal() {
  const R = PSC.rulesAt(M.rules, today());
  openModal({ title: '新增規範版本', sub: '例如程序書第 2 版正式發行、或之後改版',
    html: `<div class="form"><div class="frow"><div class="field"><label for="ns-name">版本名稱</label><input class="inp" id="ns-name" placeholder="P002 第 2 版（2026 發行）"></div><div class="field"><label for="ns-from">生效日</label><input class="inp" type="date" id="ns-from" value="${today()}"></div></div>
    <p class="note" style="margin:0">會以目前有效的「${esc(R.set)}」為底複製一份，再逐條修改。生效日之前的事故仍用舊版本計算。</p><div id="ns-err" class="err"></div></div>`,
    foot: '<button class="btn ghost" type="button" data-close>取消</button><button class="btn primary" type="button" id="ns-save">建立</button>',
    onMount(root, close) {
      root.querySelector('[data-close]').addEventListener('click', close);
      root.querySelector('#ns-save').addEventListener('click', () => run(async () => { const r = await api('newRuleSet', { rule_set: root.querySelector('#ns-name').value.trim(), valid_from: root.querySelector('#ns-from').value }); await close(); S.ruleDate = root.querySelector('#ns-from').value; await reload(); toast(`已建立 ${r.rule_set}（${r.rows} 條）`); }, root.querySelector('#ns-save')));
    } });
}

/* ---------- admin: port coordinates for the map ---------- */
function portsCardHTML() {
  const pt = PSC.portTable(M.ports), used = countBy(M.insp, I => I.port), rows = [...used].map(([p, n]) => ({ p, n, c: pt[PSC.up(p)], country: (M.insp.find(I => I.port === p) || {}).country })).sort((a, b) => (a.c ? 1 : 0) - (b.c ? 1 : 0) || b.n - a.n);
  const miss = rows.filter(r => !r.c).length;
  return `<div class="card" style="margin-bottom:16px"><div class="section-head"><div><h2>港口座標（地圖用）</h2><p class="sub" style="margin:2px 0 0">新港口沒有座標時，地圖暫用國家中心點。試算表「Ports」分頁也可以直接編輯。${miss ? `<b style="color:var(--crit)">${miss} 個港口缺座標</b>` : '所有檢查港口都有座標'}</p></div><button class="btn" type="button" data-port="">新增港口</button></div>
  <div class="tbl-wrap" style="max-height:300px"><table><thead><tr><th>港口</th><th>港口國</th><th class="n">檢查</th><th class="n">緯度</th><th class="n">經度</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.p)}</td><td>${esc(r.country || '')}</td><td class="n">${r.n}</td><td class="n">${r.c ? esc(r.c.lat) : '<span class="flag">未設定</span>'}</td><td class="n">${r.c ? esc(r.c.lng) : ''}</td><td><button class="btn sm" type="button" data-port="${esc(r.p)}">修改</button></td></tr>`).join('')}</tbody></table></div></div>`;
}
function editPort(port) {
  const c = port ? PSC.portTable(M.ports)[PSC.up(port)] : null, country = port ? (M.insp.find(I => I.port === port) || {}).country : '';
  openModal({ title: port ? '港口座標：' + esc(port) : '新增港口', sub: '十進位度數，北緯、東經為正（例如 Kaohsiung 22.61, 120.28）',
    html: `<div class="frow"><div class="field"><label for="pt-port">港口</label><input class="inp" id="pt-port" value="${esc(port || '')}" ${port ? 'readonly' : ''}></div><div class="field"><label for="pt-country">港口國</label><input class="inp" id="pt-country" value="${esc((c && c.country) || country || '')}"></div><div class="field"><label for="pt-lat">緯度</label><input class="inp" id="pt-lat" inputmode="decimal" value="${esc(c ? c.lat : '')}"></div><div class="field"><label for="pt-lng">經度</label><input class="inp" id="pt-lng" inputmode="decimal" value="${esc(c ? c.lng : '')}"></div></div>`,
    foot: '<button class="btn ghost" type="button" data-close>取消</button><button class="btn primary" type="button" id="pt-save">儲存</button>',
    onMount(root, close) {
      root.querySelector('[data-close]').addEventListener('click', close);
      root.querySelector('#pt-save').addEventListener('click', () => run(async () => { const g = id => root.querySelector(id).value.trim(); await api('savePort', { port: g('#pt-port'), country: g('#pt-country'), lat: g('#pt-lat'), lng: g('#pt-lng') }); await close(); await reload(); toast('已儲存港口座標'); }, root.querySelector('#pt-save')));
    } });
}

/* ---------- view: admin ---------- */
function vAdmin(v) {
  if (!can('admin')) { v.innerHTML = '<div class="card empty">只有系統管理員可以使用這個頁面</div>'; return; }
  const set = M.settings, U = S.adm.user, VV = S.adm.vessel, MM = S.adm.mou;
  const mouUse = countBy(M.insp, I => (I.country || '') + '|' + (I.mou || ''));
  const companies = ['FLEET', 'VSHIPS', 'BSM', 'TSL', 'TEH'];
  v.innerHTML = `<div class="grid g2" style="margin-bottom:16px"><div class="card"><div class="section-head"><h2>使用者</h2><button class="btn" type="button" id="u-new">新增使用者</button></div>
  ${U ? `<div class="drop" style="margin-bottom:10px"><div class="frow"><div class="field"><label for="u-email">Google 帳號 Email</label><input class="inp" id="u-email" value="${esc(U.email)}" ${U._edit ? 'readonly' : ''}></div><div class="field"><label for="u-name">姓名</label><input class="inp" id="u-name" value="${esc(U.name)}"></div></div><div class="frow"><div class="field"><label for="u-role">角色</label><select id="u-role">${[['viewer', 'viewer 只能查閱'], ['editor', 'editor 可登錄與上傳'], ['admin', 'admin 系統管理']].map(([k, l]) => opt(k, l, U.role === k)).join('')}</select></div><div class="field"><label for="u-active">狀態</label><select id="u-active">${opt('Y', '啟用', U.active !== 'N')}${opt('N', '停用', U.active === 'N')}</select></div></div><div class="btnrow"><button class="btn primary" type="button" id="u-save">儲存</button><button class="btn ghost" type="button" id="u-cancel">取消</button></div></div>` : ''}
  <div class="tbl-wrap"><table><thead><tr><th>Email</th><th>姓名</th><th>角色</th><th>狀態</th></tr></thead><tbody>${M.users.map(u => `<tr class="click" data-u="${esc(u.email)}"><td>${esc(u.email)}</td><td>${esc(u.name)}</td><td><span class="role">${esc(u.role)}</span></td><td>${u.active === 'N' ? '停用' : '啟用'}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">尚無使用者</td></tr>'}</tbody></table></div><p class="note">部署 Apps Script 的 Google 帳號自動擁有 admin 權限。</p></div>
  <div class="card"><h2 style="margin-bottom:10px">編號與等級設定</h2><div class="form"><div class="frow"><div class="field"><label for="s-th">升 Tier 2 的缺失項數門檻</label><input class="inp" type="number" min="1" id="s-th" value="${esc(set.tier2_def_threshold || 6)}"><span class="hint">未留置但缺失達此數量即為 Tier 2</span></div><div class="field"><label for="s-ism">開出 ISM 缺失即升 Tier 2</label><select id="s-ism">${opt('Y', '是', String(set.tier2_on_ism || 'Y').toUpperCase() !== 'N')}${opt('N', '否', String(set.tier2_on_ism).toUpperCase() === 'N')}</select></div></div>
  <div class="field"><label for="s-cid">Google OAuth Client ID</label><input class="inp mono" id="s-cid" value="${esc(set.google_client_id || '')}"><span class="hint">需與前端 config.js 的 googleClientId 相同</span></div>
  <div class="field"><label>Drive 歸檔根資料夾 ID</label><input class="inp mono" value="${esc(set.drive_root_folder_id || '（第一次上傳時自動建立）')}" readonly></div>
  <div class="field"><label for="s-br">可看 Bribe 的角色</label><input class="inp" id="s-br" value="${esc(set.bribe_roles || 'admin,editor')}"><span class="hint">以逗號分隔，例如 admin,editor</span></div>
  <div class="frow"><div class="field"><label for="s-ad">窗口提醒天數</label><input class="inp" type="number" min="1" id="s-ad" value="${esc(set.window_alert_days || 30)}"></div><div class="field"><label for="s-mail">每日提醒收件人</label><input class="inp" id="s-mail" value="${esc(set.alert_emails || '')}" placeholder="a@tslines.com, b@tslines.com"></div></div>
  <div class="btnrow"><button class="btn primary" type="button" id="s-save">儲存設定</button></div><p class="note" style="margin:0">變更門檻只影響之後新登錄的案件；已發出的編號不會變更。</p></div></div></div>
  <div class="card" style="margin-bottom:16px"><div class="section-head"><div><h2>Tokyo MOU 年度指數與名單</h2><p class="sub" style="margin:2px 0 0">船舶檔案的風險色標、管理公司績效與 PSC 窗口的估算 SRP 都用這裡的值。Tokyo MOU 每年 7 月 1 日更新：平均指數見 NIR 頁「Detention and Deficiency Indices」，船旗與 RO 名單見年報 Flag / RO performance list，高績效公司名單每季公布。名單以分號或換行分隔。</p></div><div class="btnrow"><button class="btn" type="button" id="tm-fill">填入 2026–27 公告值</button></div></div>
  <div class="form"><div class="frow"><div class="field"><label for="tm-valid">適用期間</label><input class="inp" id="tm-valid" data-tm="tmou_index_valid" value="${esc(set.tmou_index_valid || '')}"></div><div class="field"><label for="tm-det">平均留置指數（%）</label><input class="inp" id="tm-det" data-tm="tmou_avg_detention_index" value="${esc(set.tmou_avg_detention_index || '')}"></div><div class="field"><label for="tm-def">平均缺失指數</label><input class="inp" id="tm-def" data-tm="tmou_avg_deficiency_index" value="${esc(set.tmou_avg_deficiency_index || '')}"></div><div class="field"><label for="tm-hpp">高績效公司名單季度</label><input class="inp" id="tm-hpp" data-tm="tmou_high_perf_period" value="${esc(set.tmou_high_perf_period || '')}"></div></div>
  <div class="frow">${[['tmou_white_flags', '船旗 High 名單（LRS 條件）'], ['tmou_black_flags', '船旗 Low 名單（HRS +1）'], ['tmou_ro_high', 'RO High 名單（LRS 條件）'], ['tmou_ro_low', 'RO Low 名單（HRS +1）']].map(([k, l]) => `<div class="field"><label for="tm-${k}">${l}</label><textarea class="inp" rows="3" id="tm-${k}" data-tm="${k}">${esc(set[k] || '')}</textarea></div>`).join('')}</div>
  <div class="field"><label for="tm-docs">高績效公司名單（ISM DOC 公司 IMO）</label><textarea class="inp mono" rows="2" id="tm-docs" data-tm="tmou_high_perf_docs">${esc(set.tmou_high_perf_docs || '')}</textarea><span class="hint">從「List of high performing companies」PDF 複製公司 IMO 即可，系統只看 7 位數字</span></div>
  <div class="btnrow"><button class="btn primary" type="button" id="tm-save">儲存</button></div></div></div>
  <div class="grid g2" style="margin-bottom:16px"><div class="card"><div class="section-head"><h2>資料檢核</h2><button class="btn" type="button" id="dc-run">執行檢核</button></div><p class="sub">組員直接編輯 Google 試算表後，用這裡檢查編號重複、找不到對應、格式錯誤等問題。試算表選單「TSL PSC → 檢核資料」結果相同。</p><div id="dc-out"></div></div>
  <div class="card"><h2>匯入船舶主檔 / NK 資料</h2><p class="sub">選擇船隊監控系統的 <span class="mono">fleet-data.js</span>（整個船隊一次匯入），或貼上 SHIP JSON。依 IMO 對應，更新船級、GT / DWT、TEU、登記船東等欄位與 NK 檢驗 / 證書到期。</p><div class="form"><input class="inp" type="file" id="nk-file" accept=".js,.json,application/json,text/javascript"><textarea class="inp mono" id="nk-text" rows="3" placeholder='{"vessel_master": {"imo_number": "9967512", ...}, "certificates": [...], "surveys": [...]}'></textarea><div class="field"><label for="nk-mode">寫入方式</label><select id="nk-mode"><option value="class">船級欄位以 Class 資料為準，其餘只補空白（建議）</option><option value="fill">只補空白欄位，不同值列出來確認</option><option value="overwrite">全部以主檔覆蓋</option></select></div><div class="btnrow"><button class="btn primary" type="button" id="nk-go">匯入</button><span class="dim" id="nk-info" style="font-size:12.5px"></span></div></div>
  <h2 style="margin-top:14px">管理公司（Tokyo MOU 績效）</h2><div class="tbl-wrap"><table><thead><tr><th>公司碼</th><th>名稱</th><th>DOC 公司 IMO</th><th>績效</th><th>日期</th><th>回信稱謂 / 收件人</th></tr></thead><tbody>${M.companies.map(c => `<tr class="click" data-co="${esc(c.code)}" title="${esc(c.note || '')}"><td class="mono">${esc(c.code)}</td><td>${esc(c.name)}</td><td class="mono">${esc(c.doc_imo)}</td><td>${esc(c.tmou_performance)}</td><td class="num">${dfmt(c.perf_as_of)}</td><td style="font-size:12px">${c.greeting || c.email_to ? `${esc(c.greeting || '')}<div class="dim">${esc(c.email_to || '')}</div>` : '<span class="dim">點一下設定</span>'}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">尚未匯入</td></tr>'}</tbody></table></div></div></div>
  <div class="card" style="margin-bottom:16px"><div class="section-head"><div><h2>MOU 對照表（港口國 → 檢查區域）</h2><p class="sub" style="margin:2px 0 0">新登錄的 PSC 檢查依港口國（與港口）自動帶入 MOU；有填港口的列優先。只有 MOU = Tokyo MOU 的檢查會重算 Tokyo MOU 窗口。Google 試算表的「MOUMap」分頁也可以直接編輯。</p></div><div class="btnrow"><button class="btn" type="button" id="m-new">新增一列</button><button class="btn" type="button" id="m-apply">補標空白的檢查</button><button class="btn" type="button" id="m-apply-all">全部依對照表重新套用</button></div></div>
  ${MM ? `<div class="drop" style="margin-bottom:10px"><div class="frow"><div class="field"><label for="mm-country">港口國</label><input class="inp" id="mm-country" value="${esc(MM.country || '')}" placeholder="UAE"></div><div class="field"><label for="mm-port">港口（選填）</label><input class="inp" id="mm-port" value="${esc(MM.port || '')}" placeholder="空白 = 全國"></div><div class="field"><label for="mm-mou">MOU 區域</label><select id="mm-mou">${PSC.MOU_NAMES.map(m => opt(m, m, MM.mou === m)).join('')}</select></div><div class="field"><label for="mm-also">也是哪些 MOU 成員</label><input class="inp" id="mm-also" value="${esc(MM.also || '')}" placeholder="例如 Indian Ocean MOU"></div></div><div class="field"><label for="mm-note">備註</label><input class="inp" id="mm-note" value="${esc(MM.note || '')}"></div><div class="btnrow"><button class="btn primary" type="button" id="mm-save">儲存</button>${MM._key ? '<button class="btn danger" type="button" id="mm-del">刪除這一列</button>' : ''}<button class="btn ghost" type="button" id="mm-cancel">取消</button></div></div>` : ''}
  <div class="tbl-wrap" style="max-height:420px"><table><thead><tr><th>港口國</th><th>港口</th><th>MOU 區域</th><th>也是成員</th><th class="n">檢查次數</th><th>備註</th></tr></thead><tbody>${M.mouMap.slice().sort((a, b) => { const ua = [...mouUse].filter(([k]) => k.split('|')[0] === a.country).reduce((m, [, n]) => m + n, 0), ub = [...mouUse].filter(([k]) => k.split('|')[0] === b.country).reduce((m, [, n]) => m + n, 0); return ub - ua || (a.country < b.country ? -1 : 1) || (a.port < b.port ? -1 : 1); }).map(r => { const used = [...mouUse].filter(([k]) => k.split('|')[0] === r.country).reduce((m, [, n]) => m + n, 0); return `<tr class="click" data-mm="${esc(r.country + '|' + (r.port || ''))}"><td>${esc(r.country)}</td><td>${esc(r.port || '（全國）')}</td><td>${mouTag(r.mou)}</td><td class="dim">${esc(r.also || '')}</td><td class="n">${r.port ? '' : used || '–'}</td><td class="dim" style="font-size:12px">${esc(r.note || '')}</td></tr>`; }).join('')}</tbody></table></div></div>
  ${portsCardHTML()}
  <div class="card"><div class="section-head"><h2>船隊資料（事故編號依此帶入公司碼）</h2><button class="btn" type="button" id="v-new">新增船舶 / 異動</button></div>
  ${VV ? `<div class="drop" style="margin-bottom:10px"><div class="frow">${[['vessel', '船名（英文）'], ['imo', 'IMO'], ['chinese', '中文船名'], ['manager', '管理公司全名'], ['pic', '監管人員 PIC'], ['pic_email', 'PIC Email'], ['series', '船型系列'], ['flag', '船旗']].map(([k, l]) => `<div class="field"><label for="vv-${k}">${l}</label><input class="inp" id="vv-${k}" data-vv="${k}" value="${esc(VV[k] || '')}"></div>`).join('')}
  <div class="field"><label for="vv-company">事故編號公司碼</label><select id="vv-company" data-vv="company">${companies.map(c => opt(c, c, VV.company === c)).join('')}</select></div><div class="field"><label for="vv-from">生效日（改名 / 換管理公司時填）</label><input class="inp" type="date" id="vv-from" data-vv="valid_from" value="${esc(VV.valid_from || '')}"></div><div class="field"><label for="vv-to">失效日</label><input class="inp" type="date" id="vv-to" data-vv="valid_to" value="${esc(VV.valid_to || '')}"></div></div>
  <div class="field"><label for="vv-note">備註</label><input class="inp" id="vv-note" data-vv="note" value="${esc(VV.note || '')}"></div><p class="note" style="margin:0">船舶改名或更換管理公司時：把舊資料填上失效日，再新增一筆同 IMO、填生效日的新資料。</p><div class="btnrow"><button class="btn primary" type="button" id="vv-save">儲存</button><button class="btn ghost" type="button" id="vv-cancel">取消</button></div></div>` : ''}
  <div class="tbl-wrap"><table><thead><tr><th>船名</th><th>中文</th><th>IMO</th><th>公司碼</th><th>管理公司</th><th>PIC</th><th>生效</th><th>失效</th><th>備註</th></tr></thead><tbody>${M.vessels.slice().sort((a, b) => a.vessel < b.vessel ? -1 : 1).map((x, i) => `<tr class="click" data-vi="${M.vessels.indexOf(x)}"><td>${esc(x.vessel)}</td><td>${esc(x.chinese)}</td><td class="mono">${esc(x.imo)}</td><td class="mono">${esc(x.company)}</td><td>${esc(x.manager || x.management)}</td><td>${esc(x.pic)}</td><td class="num">${dfmt(x.valid_from)}</td><td class="num">${dfmt(x.valid_to)}</td><td class="dim" style="font-size:12px">${esc(x.note)}</td></tr>`).join('')}</tbody></table></div></div>`;
  $('#dc-run').addEventListener('click', () => {
    const issues = PSC.validateData({ inspections: RAW.inspections, deficiencies: RAW.deficiencies, documents: RAW.documents, incidents: RAW.incidents, vessels: RAW.vessels, mouMap: M.mouMap, rules: M.rules, ports: M.ports });
    $('#dc-out').innerHTML = issues.length ? `<p class="flag">${issues.length} 個問題</p><div class="tbl-wrap"><table><thead><tr><th>等級</th><th>分頁</th><th>鍵值</th><th>問題</th></tr></thead><tbody>${issues.map(i => `<tr><td>${esc(i.level)}</td><td>${esc(i.table)}</td><td class="tn" style="font-size:11.5px;white-space:normal">${esc(i.key)}</td><td>${esc(i.problem)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="note">沒有發現問題</p>';
  });
  let nkShips = null;
  const nkParse = text => { const ships = PSC.parseFleetFile(text); if (!ships.length) throw new Error('檔案裡沒有船舶資料'); return ships; };
  $('#nk-file').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { nkShips = nkParse(await f.text()); $('#nk-text').value = ''; $('#nk-info').textContent = `已讀取 ${f.name}：${nkShips.length} 艘`; }
    catch (err) { nkShips = null; $('#nk-info').textContent = ''; toast('無法讀取：' + err.message, 7000); }
  });
  $('#nk-text').addEventListener('input', () => { nkShips = null; $('#nk-info').textContent = ''; });
  v.querySelectorAll('[data-co]').forEach(tr => tr.addEventListener('click', () => editCompany(M.companies.find(c => c.code === tr.dataset.co))));
  $('#nk-go').addEventListener('click', () => {
    let ships = nkShips;
    if (!ships) { try { ships = nkParse($('#nk-text').value); } catch (e) { toast('格式不正確：' + e.message); return; } }
    const mode = $('#nk-mode').value;
    run(async () => { const r = await api('importNK', { ships, mode }); nkShips = null; await reload(); nkResult(r); }, $('#nk-go'));
  });
  $('#u-new').addEventListener('click', () => { S.adm.user = { email: '', name: '', role: 'editor', active: 'Y' }; render(); });
  v.querySelectorAll('[data-u]').forEach(tr => tr.addEventListener('click', () => { S.adm.user = Object.assign({ _edit: true }, M.users.find(u => u.email === tr.dataset.u)); render(); }));
  if (U) {
    $('#u-cancel').addEventListener('click', () => { S.adm.user = null; render(); });
    $('#u-save').addEventListener('click', () => { const row = { email: $('#u-email').value.trim().toLowerCase(), name: $('#u-name').value, role: $('#u-role').value, active: $('#u-active').value }; if (!/@/.test(row.email)) { toast('請輸入正確的 Email'); return; } run(async () => { await api('saveUser', row); S.adm.user = null; await reload(); toast('已儲存 ' + row.email); }, $('#u-save')); });
  }
  $('#tm-fill').addEventListener('click', () => { v.querySelectorAll('[data-tm]').forEach(el => { const d = PSC.DEFAULT_SETTINGS.find(x => x.key === el.dataset.tm); if (d) el.value = d.value; }); toast('已填入 2026-07-01 ~ 2027-06-30 公告值，按「儲存」生效'); });
  $('#tm-save').addEventListener('click', () => run(async () => {
    const rows = [...v.querySelectorAll('[data-tm]')].map(el => { const d = PSC.DEFAULT_SETTINGS.find(x => x.key === el.dataset.tm); return { key: el.dataset.tm, value: el.value.trim(), note: d ? d.note : '' }; });
    const bad = rows.filter(r => /index$/.test(r.key) && !isFinite(Number(r.value.replace('%', ''))));
    if (bad.length) { toast('平均指數請填數字'); return; }
    const docs = rows.find(r => r.key === 'tmou_high_perf_docs'); docs.value = [...new Set(docs.value.match(/\b\d{7}\b/g) || [])].join(',');
    await api('saveSettings', { rows }); await reload(); toast('已更新 Tokyo MOU 指數與名單');
  }, $('#tm-save')));
  $('#s-save').addEventListener('click', () => run(async () => {
    await api('saveSetting', { key: 'tier2_def_threshold', value: $('#s-th').value, note: '未留置但缺失項數達此數量即升為 Tier 2' });
    await api('saveSetting', { key: 'tier2_on_ism', value: $('#s-ism').value, note: '開出 ISM 缺失（代碼 15xxx）即升為 Tier 2' });
    await api('saveSetting', { key: 'google_client_id', value: $('#s-cid').value.trim(), note: 'Google 登入用 OAuth Client ID（與前端 config.js 相同）' });
    for (const [k, id] of [['bribe_roles', '#s-br'], ['window_alert_days', '#s-ad'], ['alert_emails', '#s-mail']]) {
      const d = PSC.DEFAULT_SETTINGS.find(x => x.key === k); await api('saveSetting', { key: k, value: $(id).value.trim(), note: d ? d.note : '' });
    }
    await reload(); toast('設定已儲存');
  }, $('#s-save')));
  $('#v-new').addEventListener('click', () => { S.adm.vessel = { company: 'FLEET' }; render(); });
  $('#m-new').addEventListener('click', () => { S.adm.mou = { mou: PSC.TOKYO }; render(); });
  v.querySelectorAll('[data-port]').forEach(b => b.addEventListener('click', () => editPort(b.dataset.port)));
  v.querySelectorAll('[data-mm]').forEach(tr => tr.addEventListener('click', () => { const r = M.mouMap.find(x => x.country + '|' + (x.port || '') === tr.dataset.mm); S.adm.mou = Object.assign({ _key: tr.dataset.mm }, r); render(); }));
  const applyM = all => run(async () => { const r = await api('applyMOU', { overwrite: all }); await reload(); toast(`已更新 ${r.updated} 次檢查的 MOU${r.missing.length ? '；對照表沒有：' + r.missing.join('、') : ''}`, 7000); });
  $('#m-apply').addEventListener('click', () => applyM(false));
  $('#m-apply-all').addEventListener('click', () => { if (confirm('會把所有檢查的 MOU 改成對照表的值（包含手動改過的）。確定？')) applyM(true); });
  if (MM) {
    $('#mm-cancel').addEventListener('click', () => { S.adm.mou = null; render(); });
    $('#mm-save').addEventListener('click', () => { const row = { country: $('#mm-country').value, port: $('#mm-port').value, mou: $('#mm-mou').value, also: $('#mm-also').value, note: $('#mm-note').value, old_key: MM._key || '' }; if (!row.country.trim()) { toast('請填港口國'); return; } run(async () => { await api('saveMOU', row); S.adm.mou = null; await reload(); toast('已儲存 ' + row.country.toUpperCase()); }, $('#mm-save')); });
    const del = $('#mm-del'); if (del) del.addEventListener('click', () => run(async () => { await api('saveMOU', { country: MM.country, port: MM.port, old_key: MM._key, remove: true }); S.adm.mou = null; await reload(); toast('已刪除'); }, del));
  }
  v.querySelectorAll('[data-vi]').forEach(tr => tr.addEventListener('click', () => { S.adm.vessel = Object.assign({}, M.vessels[+tr.dataset.vi]); render(); window.scrollTo({ top: v.querySelector('.drop') ? v.querySelector('.drop').offsetTop - 80 : 0 }); }));
  if (VV) {
    $('#vv-cancel').addEventListener('click', () => { S.adm.vessel = null; render(); });
    $('#vv-save').addEventListener('click', () => { const row = {}; v.querySelectorAll('[data-vv]').forEach(el => { row[el.dataset.vv] = el.value.trim(); }); row.vessel = row.vessel.toUpperCase(); row.management = PSC.COMPANY_TO_MGMT[row.company] || ''; if (!row.vessel || !row.imo) { toast('船名與 IMO 必填'); return; } run(async () => { await api('saveVessel', row); S.adm.vessel = null; await reload(); toast('已儲存 ' + row.vessel); }, $('#vv-save')); });
  }
}

/* ---------- view: Tokyo MOU inspection window ---------- */
const prioPill = r => r.priority === 'I' ? '<span class="stp stp-over">Priority I</span>' : r.priority === 'II' ? '<span class="stp stp-miss">Priority II</span>' : r.opening_soon ? '<span class="stp stp-open">即將進入</span>' : '<span class="stp stp-nil">未進入</span>';
const srpPill = x => x ? `<span class="tier ${x === 'HIGH' ? 'tier-2' : x === 'LOW' ? 'tier-3' : ''}" style="${x === 'STANDARD' ? 'background:var(--accent-soft);color:var(--accent)' : ''}">${esc(x)}</span>` : '<span class="dim">—</span>';
function distText(r) {
  if (r.priority === 'I') return `已過窗口 ${-r.days_to_close} 天`;
  if (r.priority === 'II') return `${r.days_to_close} 天後關閉`;
  if (r.days_to_open !== '') return `${r.days_to_open} 天後進入`;
  return '—';
}
function windowRows() {
  const db = { settings: M.settings, vessels: M.vessels, inspections: RAW.inspections, riskProfiles: M.risk, nkStatus: M.nk, mouMap: M.mouMap };
  return PSC.windowReport(db, today()).filter(r => (!S.mgmt || r.management === S.mgmt) && (!S.vessel || String(r.imo) === S.vessel));
}
function vWindow(v) {
  const rows = windowRows(), asOf = M.risk.reduce((m, r) => r.as_of > m ? r.as_of : m, '');
  const k = { p1: rows.filter(r => r.priority === 'I').length, p2: rows.filter(r => r.priority === 'II').length, soon: rows.filter(r => r.opening_soon).length, mis: rows.filter(r => r.srp_mismatch).length, nk: rows.filter(r => r.nk_alerts.length).length };
  v.innerHTML = `<div class="kpis"><div class="kpi ${k.p1 ? 'crit' : ''}"><div class="k">Priority I（已過窗口）</div><div class="v num">${k.p1}</div><div class="d">應優先安排 PSC 準備</div></div><div class="kpi"><div class="k">Priority II（窗口內）</div><div class="v num">${k.p2}</div><div class="d">可能被選中檢查</div></div><div class="kpi"><div class="k">${esc(M.settings.window_alert_days || 30)} 天內進入窗口</div><div class="v num">${k.soon}</div><div class="d">提前安排自查</div></div><div class="kpi"><div class="k">官方與估算 SRP 不一致</div><div class="v num">${k.mis}</div><div class="d">請核對公司績效</div></div><div class="kpi"><div class="k">NK 檢驗 / 證書提醒</div><div class="v num">${k.nk}</div><div class="d">已匯入 NK 資料的船</div></div></div>
  <div class="card"><div class="section-head"><div><h2>Tokyo MOU 檢查窗口</h2><p class="sub" style="margin:2px 0 0">依資料庫內最近一次 MOU 區域為 Tokyo MOU 的檢查推算，每天自動更新；HRS 2–4、SRS 5–8、LRS 9–18 個月。官方 SRP 最近匯入：${dfmt(asOf)}${M.settings.risk_inbox_folder_id ? '；每日 07:00 自動匯入 Drive「Tokyo MOU 收件匣」的 CSV' : ''}</p></div>
  <div class="btnrow">${can('editor') ? '<input type="file" id="risk-file" accept=".csv,text/csv" hidden><button class="btn" type="button" id="risk-btn">匯入官方窗口檔（CSV）</button>' : ''}</div></div>
  <div class="tbl-wrap"><table><thead><tr><th>優先等級</th><th>船舶</th><th>官方 SRP</th><th>估算 SRP</th><th>公司績效</th><th>最近 Tokyo MOU 檢查</th><th>窗口</th><th>距離</th><th>提醒</th></tr></thead><tbody>${rows.map(r => `<tr><td>${prioPill(r)}</td><td><a href="#vessels" class="vlink" data-v="${esc(r.imo)}">${esc(r.vessel)}</a><div class="dim" style="font-size:12px">${esc(r.company)} · ${esc(r.chinese || '')}</div></td>
  <td>${srpPill(r.srp)}</td><td title="${esc(r.srp_reasons.join('；') + (r.lrs_missing.length ? '｜未達 LRS：' + r.lrs_missing.join('、') : ''))}">${srpPill(r.srp_est)} <span class="dim" style="font-size:11.5px">${r.srp_points} 點</span>${r.srp_mismatch ? '<div class="flag">⚠ 與官方不同</div>' : ''}</td><td>${esc(r.company_performance || '—')}</td>
  <td class="num">${dfmt(r.last_tmou_date)}<div class="dim" style="font-size:12px">${esc(r.last_tmou_port)}</div>${r.last_any_date && r.last_any_date !== r.last_tmou_date ? `<div class="dim" style="font-size:11.5px">之後另有 ${dfmt(r.last_any_date)} ${esc(r.last_any_port)}（${esc(r.last_any_mou || '非 Tokyo MOU')}，不重算）</div>` : ''}</td>
  <td class="num" style="white-space:nowrap">${r.from ? dfmt(r.from) + ' ~ ' + dfmt(r.to) : esc(r.note)}</td><td style="white-space:nowrap">${distText(r)}</td><td style="font-size:12.5px">${r.nk_alerts.map(a => `<div class="flag">${esc(a)}</div>`).join('') || '<span class="dim">—</span>'}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">沒有資料</td></tr>'}</tbody></table></div>
  <p class="note">估算 SRP 依 Tokyo MOU NIR 參數（船型、船齡、船旗、公司績效、36 個月內缺失與留置）計算，只用來核對官方等級；滑過可看計分。窗口只認 MOU 區域為 Tokyo MOU 的檢查（依 MOU 對照表；例如加拿大大西洋岸港口屬 Paris MOU，就不重算）。</p></div>`;
  wireLinks(v);
  const rb = $('#risk-btn');
  if (rb) { rb.addEventListener('click', () => $('#risk-file').click()); $('#risk-file').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; run(async () => { const p = PSC.parseRiskCSV(await f.text(), f.name, today()); const r = await api('importRisk', p); await reload(); toast(`已匯入 ${r.updated} 艘船的官方 SRP${r.missing.length ? '；找不到：' + r.missing.join('、') : ''}`, 7000); }); }); }
}
/* ---------- PSC 檢查: 地圖（2D 平面 / 3D 地球；長條 / 熱力） ---------- */
const MAP_METRICS = [['defs', '缺失項數'], ['insp', '檢查次數'], ['avg', '平均缺失／次'], ['det', '留置次數'], ['bribe_n', '索賄發生次數', 1], ['bribe_rate', '索賄發生率', 1], ['bribe_usd', '索賄實付金額（USD）', 1]];
let WORLD = null, WORLD_P = null;
function topoFeatures(topo, name) {
  const tf = topo.transform;
  const arcs = topo.arcs.map(arc => { let x = 0, y = 0; return arc.map(p => { if (!tf) return [p[0], p[1]]; x += p[0]; y += p[1]; return [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]]; }); });
  const ring = ids => { const pts = []; ids.forEach(i => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; a.forEach((p, j) => { if (j === 0 && pts.length) return; pts.push(p); }); }); return pts; };
  return topo.objects[name].geometries.map(g => ({ type: 'Feature', properties: Object.assign({}, g.properties, { key: PSC.normCountry(String((g.properties || {}).name || '')) }),
    geometry: g.type === 'Polygon' ? { type: 'Polygon', coordinates: g.arcs.map(ring) } : g.type === 'MultiPolygon' ? { type: 'MultiPolygon', coordinates: g.arcs.map(p => p.map(ring)) } : null })).filter(f => f.geometry);
}
function loadWorld() {
  if (WORLD) return Promise.resolve(WORLD);
  if (!WORLD_P) WORLD_P = (window.PSC_WORLD ? Promise.resolve(window.PSC_WORLD) : fetch('assets/world-110m.json').then(r => { if (!r.ok) throw new Error('world'); return r.json(); }))
    .then(t => (WORLD = topoFeatures(t, 'countries')));
  return WORLD_P;
}
function mapState() { return S.map || (S.map = { dim: '2d', metric: 'defs', mode: 'bars', sel: null, rot: [-120, -15], zoom3: 1, brush: false }); }
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function mapData() {
  const c = current(), pt = PSC.portTable(M.ports), byPort = {};
  const cnt = new Map(); c.defs.forEach(d => cnt.set(d.insp, (cnt.get(d.insp) || 0) + 1));
  c.insp.forEach(I => {
    const k = I.port || '?', o = byPort[k] || (byPort[k] = { port: k, country: I.country, mou: I.mou, insp: 0, defs: 0, nil: 0, det: 0, bn: 0, busd: 0, paid: [], list: [] });
    o.insp++; o.defs += cnt.get(I) || 0; if (!I.defs.length) o.nil++; if (I.det) o.det++; o.list.push(I);
    if (M.canBribe && (I.bribe_flag === 'Y' || I.bribe_flag === 'R')) { o.bn++; const pd = Number(I.bribe_paid_usd) || 0; o.busd += pd; if (pd > 0) o.paid.push(pd); }
  });
  const ports = Object.values(byPort).map(o => { const p = pt[PSC.up(o.port)]; return Object.assign(o, p ? { lat: +p.lat, lng: +p.lng, approx: false } : { lat: null, lng: null, approx: true }); });
  return { ports, c };
}
function metricVal(o, m) { return m === 'defs' ? o.defs : m === 'insp' ? o.insp : m === 'avg' ? (o.insp ? o.defs / o.insp : 0) : m === 'det' ? o.det : m === 'bribe_n' ? o.bn : m === 'bribe_rate' ? (o.insp ? o.bn / o.insp : 0) : m === 'bribe_usd' ? o.busd : 0; }
function metricFmt(v, m) { return m === 'avg' ? v.toFixed(2) : m === 'bribe_rate' ? Math.round(v * 100) + '%' : m === 'bribe_usd' ? '$' + fmt(Math.round(v)) : fmt(v); }
function sumGroup(list) { const o = { port: '', insp: 0, defs: 0, nil: 0, det: 0, bn: 0, busd: 0, paid: [] }; list.forEach(p => { ['insp', 'defs', 'nil', 'det', 'bn', 'busd'].forEach(k => o[k] += p[k]); o.paid = o.paid.concat(p.paid); }); return o; }
function vMap(v) {
  const ms = mapState(); if (!M.canBribe && /^bribe/.test(ms.metric)) ms.metric = 'defs';
  const mouList = [...new Set(M.insp.map(I => I.mou).filter(Boolean))].sort((a, b) => a === PSC.TOKYO ? -1 : b === PSC.TOKYO ? 1 : a < b ? -1 : 1);
  v.innerHTML = `<div class="card map-card"><div class="map-tools">
    <div class="seg" role="group" aria-label="2D 或 3D">${[['2d', '2D 平面'], ['3d', '3D 地球']].map(([k, l]) => `<button type="button" data-dim="${k}" aria-pressed="${ms.dim === k}">${l}</button>`).join('')}</div>
    <div class="seg" role="group" aria-label="呈現方式">${[['bars', '長條'], ['heat', '熱力']].map(([k, l]) => `<button type="button" data-mode="${k}" aria-pressed="${ms.mode === k}">${l}</button>`).join('')}</div>
    <select class="sel" id="mp-metric" aria-label="指標">${MAP_METRICS.filter(x => !x[2] || M.canBribe).map(([k, l]) => opt(k, l, ms.metric === k)).join('')}</select>
    ${ms.dim === '2d' ? `<button type="button" class="btn sm ${ms.brush ? 'primary' : ''}" id="mp-brush">${ms.brush ? '框選中（拖曳地圖）' : '框選範圍'}</button>` : ''}
    <span style="flex:1"></span><span class="dim" style="font-size:12px">MOU 區域：</span>${mouList.map(m => `<button type="button" class="chip" data-mou-sel="${esc(m)}" aria-pressed="${!!ms.sel && ms.sel.kind === 'mou' && ms.sel.key === m}">${esc(m.replace(' MOU', ''))}</button>`).join('')}
  </div>
  <div class="map-grid"><div class="map-stage" id="mp-stage"><div class="empty">地圖載入中…</div></div><aside class="map-side" id="mp-side"></aside></div>
  <div class="map-foot"><div id="mp-legend"></div><div class="dim" style="font-size:12px" id="mp-note"></div></div></div>`;
  v.querySelectorAll('[data-dim]').forEach(b => b.addEventListener('click', () => { ms.dim = b.dataset.dim; ms.brush = false; vMap(v); }));
  v.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { ms.mode = b.dataset.mode; vMap(v); }));
  $('#mp-metric').addEventListener('change', e => { ms.metric = e.target.value; vMap(v); });
  const bb = $('#mp-brush'); if (bb) bb.addEventListener('click', () => { ms.brush = !ms.brush; vMap(v); });
  v.querySelectorAll('[data-mou-sel]').forEach(b => b.addEventListener('click', () => { const m = b.dataset.mouSel; ms.sel = ms.sel && ms.sel.kind === 'mou' && ms.sel.key === m ? null : { kind: 'mou', key: m, label: m }; vMap(v); }));
  if (!window.d3) { $('#mp-stage').innerHTML = '<div class="empty">地圖元件（d3）載入失敗，請確認網路可連到 cdn.jsdelivr.net。</div>'; return; }
  loadWorld().then(w => { if (S.tab === 'map' && document.body.contains(v)) drawMap(v, w); }).catch(() => { $('#mp-stage').innerHTML = '<div class="empty">世界地圖資料（assets/world-110m.json）載入失敗。</div>'; });
}
function drawMap(v, world) {
  const ms = mapState(), d3 = window.d3, stage = $('#mp-stage');
  const { ports } = mapData();
  const cen = {}; world.forEach(f => { cen[f.properties.key] = d3.geoCentroid(f); });
  ports.forEach(p => { if (p.lat == null && cen[p.country]) { p.lng = cen[p.country][0]; p.lat = cen[p.country][1]; } });
  const placed = ports.filter(p => p.lat != null);
  const m = ms.metric; placed.forEach(p => { p.v = metricVal(p, m); });
  const inSel = p => !ms.sel || (ms.sel.kind === 'port' ? p.port === ms.sel.key : ms.sel.kind === 'country' ? p.country === ms.sel.key : ms.sel.kind === 'mou' ? (p.mou || '') === ms.sel.key : ms.sel.kind === 'box' ? ms.sel.ports.includes(p.port) : true);
  const shown = placed.filter(p => p.v > 0);
  const max = Math.max(1e-9, ...shown.map(p => p.v));
  const byC = {}; placed.forEach(p => { (byC[p.country] = byC[p.country] || []).push(p); });
  const cVal = {}; Object.entries(byC).forEach(([k, l]) => { cVal[k] = metricVal(sumGroup(l), m); });
  const cMax = Math.max(1e-9, ...Object.values(cVal));
  const ramp = d3.interpolateRgbBasis(['--heat-1', '--heat-2', '--heat-3', '--heat-4', '--heat-5'].map(cssVar));
  const col = x => ramp(0.12 + 0.88 * Math.sqrt(Math.max(0, x)));
  const W = Math.max(320, stage.clientWidth || 800), H = ms.dim === '3d' ? Math.min(600, Math.max(340, W * 0.78)) : Math.min(560, Math.max(260, W * 0.56));
  const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'map-svg').attr('role', 'img').attr('aria-label', 'PSC 地點地圖');
  const defs = svg.append('defs');
  defs.append('filter').attr('id', 'mp-blur').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%').append('feGaussianBlur').attr('stdDeviation', 5);
  const glob = defs.append('radialGradient').attr('id', 'mp-globe').attr('cx', '38%').attr('cy', '32%').attr('r', '75%');
  glob.append('stop').attr('offset', '0%').attr('stop-color', cssVar('--surface')); glob.append('stop').attr('offset', '100%').attr('stop-color', cssVar('--sea'));
  const shade = defs.append('radialGradient').attr('id', 'mp-shade').attr('cx', '35%').attr('cy', '30%').attr('r', '80%');
  shade.append('stop').attr('offset', '60%').attr('stop-color', '#000').attr('stop-opacity', 0); shade.append('stop').attr('offset', '100%').attr('stop-color', '#000').attr('stop-opacity', 0.22);
  const proj = ms.dim === '3d' ? d3.geoOrthographic().rotate(ms.rot).clipAngle(90) : d3.geoNaturalEarth1();
  proj.fitExtent([[10, 10], [W - 10, H - 10]], { type: 'Sphere' });
  const baseScale = proj.scale(); if (ms.dim === '3d') proj.scale(baseScale * ms.zoom3);
  const path = d3.geoPath(proj), grat = d3.geoGraticule10();
  const gMap = svg.append('g'), gMarks = svg.append('g'), gLab = svg.append('g').attr('class', 'mp-lab');
  const tipHTML = p => { const g = p.port ? p : null; return `<b>${esc(p.port || p.label)}</b>${g ? ` <span class="dim">${esc(p.country)}</span>` : ''}<div class="row"><span>MOU</span><span>${esc(p.mou || '—')}</span></div><div class="row"><span>檢查</span><span>${p.insp} 次</span></div><div class="row"><span>缺失</span><span>${p.defs} 項（${p.insp ? (p.defs / p.insp).toFixed(2) : '–'}／次）</span></div><div class="row"><span>NIL 率</span><span>${pct(p.nil, p.insp)}</span></div>${p.det ? `<div class="row"><span>留置</span><span>${p.det}</span></div>` : ''}${M.canBribe ? `<div class="row"><span>索賄</span><span>${p.bn} 次${p.busd ? '・$' + fmt(p.busd) : ''}</span></div>` : ''}${p.approx ? '<div class="dim">座標未設定，暫用國家中心點</div>' : ''}`; };
  let zt = d3.zoomIdentity;
  const P = p => { const xy = proj([p.lng, p.lat]); return xy ? zt.apply(xy) : null; };
  const visible = p => ms.dim === '2d' || d3.geoDistance([p.lng, p.lat], [-proj.rotate()[0], -proj.rotate()[1]]) < Math.PI / 2 - 0.02;
  function drawBase() {
    gMap.selectAll('*').remove();
    gMap.attr('transform', ms.dim === '2d' ? zt.toString() : null);
    gMap.append('path').datum({ type: 'Sphere' }).attr('d', path).attr('fill', ms.dim === '3d' ? 'url(#mp-globe)' : cssVar('--sea')).attr('stroke', cssVar('--line-2')).attr('vector-effect', 'non-scaling-stroke');
    gMap.append('path').datum(grat).attr('d', path).attr('fill', 'none').attr('stroke', cssVar('--line')).attr('stroke-width', 0.6).attr('vector-effect', 'non-scaling-stroke');
    gMap.append('g').selectAll('path').data(world).join('path').attr('d', path).attr('class', 'mp-country')
      .attr('fill', f => cVal[f.properties.key] ? d3.color(col(cVal[f.properties.key] / cMax)).copy({ opacity: ms.sel && ms.sel.kind === 'country' && ms.sel.key !== f.properties.key ? 0.25 : 0.55 }) : cssVar('--land'))
      .attr('stroke', f => ms.sel && ms.sel.kind === 'country' && ms.sel.key === f.properties.key ? cssVar('--ink') : cssVar('--land-line')).attr('stroke-width', f => ms.sel && ms.sel.kind === 'country' && ms.sel.key === f.properties.key ? 1.6 : 0.6).attr('vector-effect', 'non-scaling-stroke')
      .on('mousemove', (e, f) => { const l = byC[f.properties.key]; if (l) showTip(e, tipHTML(Object.assign(sumGroup(l), { label: f.properties.key, mou: l[0].mou }))); else showTip(e, `<b>${esc(f.properties.key)}</b><div class="dim">篩選範圍內沒有檢查</div>`); })
      .on('mouseleave', hideTip)
      .on('click', (e, f) => { if (ms.brush) return; if (!byC[f.properties.key]) return; ms.sel = ms.sel && ms.sel.kind === 'country' && ms.sel.key === f.properties.key ? null : { kind: 'country', key: f.properties.key, label: f.properties.key }; vMap(v); });
    if (ms.dim === '3d') gMap.append('path').datum({ type: 'Sphere' }).attr('d', path).attr('fill', 'url(#mp-shade)').attr('pointer-events', 'none');
  }
  function drawMarks(animate) {
    gMarks.selectAll('*').remove(); gLab.selectAll('*').remove();
    const list = shown.filter(visible).sort((a, b) => a.v - b.v);
    const sel = p => inSel(p);
    if (ms.mode === 'heat') {
      const g = gMarks.append('g').attr('filter', 'url(#mp-blur)').style('mix-blend-mode', cssVar('--bg').startsWith('#1') ? 'screen' : 'multiply');
      g.selectAll('circle').data(list).join('circle').attr('cx', p => P(p)[0]).attr('cy', p => P(p)[1]).attr('fill', p => col(p.v / max)).attr('fill-opacity', p => sel(p) ? 0.85 : 0.18)
        .attr('r', animate ? 0 : p => 10 + 34 * Math.sqrt(p.v / max)).call(s => animate && s.transition().duration(600).ease(d3.easeCubicOut).attr('r', p => 10 + 34 * Math.sqrt(p.v / max)));
    } else if (ms.dim === '2d') {
      const g = gMarks.append('g');
      const h = p => 6 + 78 * Math.sqrt(p.v / max);
      g.selectAll('rect').data(list).join('rect').attr('x', p => P(p)[0] - 4.5).attr('width', 9).attr('rx', 3).attr('fill', p => col(p.v / max)).attr('stroke', cssVar('--surface')).attr('stroke-width', 0.8).attr('opacity', p => sel(p) ? 1 : 0.22)
        .attr('y', p => P(p)[1] - (animate ? 0 : h(p))).attr('height', p => animate ? 0 : h(p))
        .call(s => animate && s.transition().duration(650).ease(d3.easeCubicOut).delay((p, i) => i * 8).attr('y', p => P(p)[1] - h(p)).attr('height', h));
    } else {
      // 3D：在地球表面立起柱體（螢幕向上），背面的點不顯示
      const g = gMarks.append('g'), h = p => 8 + 90 * Math.sqrt(p.v / max), w = 10;
      const cols = g.selectAll('g').data(list).join('g').attr('opacity', p => sel(p) ? 1 : 0.22);
      cols.append('rect').attr('x', p => P(p)[0] - w / 2).attr('width', w).attr('fill', p => col(p.v / max))
        .attr('y', p => P(p)[1] - (animate ? 0 : h(p))).attr('height', p => animate ? 0 : h(p))
        .call(s2 => animate && s2.transition().duration(650).ease(d3.easeCubicOut).attr('y', p => P(p)[1] - h(p)).attr('height', h));
      cols.append('rect').attr('x', p => P(p)[0]).attr('width', w / 2).attr('fill', '#000').attr('fill-opacity', 0.18)
        .attr('y', p => P(p)[1] - (animate ? 0 : h(p))).attr('height', p => animate ? 0 : h(p))
        .call(s2 => animate && s2.transition().duration(650).ease(d3.easeCubicOut).attr('y', p => P(p)[1] - h(p)).attr('height', h));
      cols.append('ellipse').attr('cx', p => P(p)[0]).attr('rx', w / 2).attr('ry', 2.6).attr('fill', p => d3.color(col(p.v / max)).brighter(0.6))
        .attr('cy', p => P(p)[1] - (animate ? 0 : h(p))).call(s2 => animate && s2.transition().duration(650).ease(d3.easeCubicOut).attr('cy', p => P(p)[1] - h(p)));
      cols.append('ellipse').attr('cx', p => P(p)[0]).attr('cy', p => P(p)[1]).attr('rx', w / 2).attr('ry', 2.6).attr('fill', p => d3.color(col(p.v / max)).darker(0.5));
    }
    // 所有有檢查的港口都標點（即使指標為 0）
    gMarks.append('g').selectAll('circle').data(placed.filter(visible)).join('circle').attr('cx', p => P(p)[0]).attr('cy', p => P(p)[1]).attr('r', p => p.v > 0 ? 2.2 : 3.2)
      .attr('fill', p => p.v > 0 ? cssVar('--ink') : cssVar('--surface')).attr('stroke', cssVar('--ink-2')).attr('stroke-width', p => p.v > 0 ? 0 : 1).attr('opacity', p => inSel(p) ? 0.85 : 0.25);
    // hit targets + labels
    gMarks.append('g').selectAll('circle').data(placed.filter(visible)).join('circle').attr('cx', p => P(p)[0]).attr('cy', p => P(p)[1]).attr('r', 11).attr('fill', 'transparent').style('cursor', 'pointer')
      .on('mousemove', (e, p) => showTip(e, tipHTML(p))).on('mouseleave', hideTip)
      .on('click', (e, p) => { e.stopPropagation(); ms.sel = ms.sel && ms.sel.kind === 'port' && ms.sel.key === p.port ? null : { kind: 'port', key: p.port, label: p.port + ', ' + p.country }; vMap(v); });
    const boxes = [], labs = (ms.sel ? placed.filter(visible).filter(sel).filter(p => p.v > 0) : list).slice().sort((a, b) => b.v - a.v).filter(p => {
      const q = P(p), t = `${p.port} ${metricFmt(p.v, m)}`, bx = [q[0] + 8, q[1] - 8, q[0] + 12 + t.length * 6.6, q[1] + 6];
      if (boxes.some(o => !(bx[2] < o[0] || bx[0] > o[2] || bx[3] < o[1] || bx[1] > o[3]))) return false; boxes.push(bx); return true;
    }).slice(0, ms.sel ? 12 : 7);
    gLab.selectAll('text').data(labs).join('text').attr('x', p => P(p)[0] + 8).attr('y', p => P(p)[1] + 4).attr('font-size', 11).attr('font-weight', 600).attr('fill', cssVar('--ink'))
      .attr('stroke', cssVar('--surface')).attr('stroke-width', 3).attr('paint-order', 'stroke').text(p => `${p.port} ${metricFmt(p.v, m)}`);
  }
  drawBase(); drawMarks(true);
  if (ms.dim === '2d') {
    const zoom = d3.zoom().scaleExtent([1, 14]).translateExtent([[0, 0], [W, H]]).on('zoom', e => { zt = e.transform; gMap.attr('transform', zt.toString()); drawMarks(false); });
    if (!ms.brush) svg.call(zoom);
    if (ms.zt) { zt = ms.zt; svg.call(zoom.transform, zt); }
    // zoom to selection
    const selPts = ms.sel ? placed.filter(inSel).map(p => proj([p.lng, p.lat])).filter(Boolean) : [];
    if (selPts.length && !ms.brush) {
      const xs = selPts.map(q => q[0]), ys = selPts.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const k = Math.min(8, 0.6 / Math.max((x1 - x0 + 40) / W, (y1 - y0 + 80) / H));
      const t = d3.zoomIdentity.translate(W / 2, H / 2 + 20).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
      svg.transition().duration(REDUCED ? 0 : 750).ease(d3.easeCubicInOut).call(zoom.transform, t);
    } else if (!ms.sel && !ms.brush) svg.call(zoom.transform, d3.zoomIdentity);
    if (ms.brush) {
      svg.append('g').attr('class', 'mp-brush').call(d3.brush().extent([[0, 0], [W, H]]).on('end', e => {
        if (!e.selection) return; const [[a, b], [c, d]] = e.selection;
        const got = placed.filter(p => { const q = P(p); return q && q[0] >= a && q[0] <= c && q[1] >= b && q[1] <= d; }).map(p => p.port);
        ms.brush = false; ms.sel = got.length ? { kind: 'box', key: 'box', ports: got, label: `框選範圍（${got.length} 個港口）` } : null; vMap(v);
      }));
    }
  } else {
    if (ms.sel) { const pts = placed.filter(inSel); if (pts.length) { const c = d3.geoCentroid({ type: 'MultiPoint', coordinates: pts.map(p => [p.lng, p.lat]) }); const r0 = ms.rot.slice(), r1 = [-c[0], -c[1] * 0.8]; if (Math.abs(r0[0] - r1[0]) + Math.abs(r0[1] - r1[1]) > 1) { const it = d3.interpolate(r0, r1); d3.transition().duration(REDUCED ? 0 : 900).ease(d3.easeCubicInOut).tween('rot', () => t => { ms.rot = it(t); proj.rotate(ms.rot); drawBase(); drawMarks(false); }); } } }
    let raf = 0;
    svg.call(d3.drag().on('drag', e => { ms.rot = [ms.rot[0] + e.dx * 0.35, Math.max(-80, Math.min(80, ms.rot[1] - e.dy * 0.35))]; proj.rotate(ms.rot); if (!raf) raf = requestAnimationFrame(() => { raf = 0; drawBase(); drawMarks(false); }); }));
    svg.on('wheel', e => { e.preventDefault(); ms.zoom3 = Math.max(0.8, Math.min(4, ms.zoom3 * (e.deltaY < 0 ? 1.1 : 0.9))); proj.scale(baseScale * ms.zoom3); drawBase(); drawMarks(false); }, { passive: false });
  }
  stage.innerHTML = ''; stage.appendChild(svg.node());
  // legend + note
  const unplaced = ports.filter(p => p.approx && p.v > 0);
  $('#mp-legend').innerHTML = `<div class="ramp"><span>${esc(MAP_METRICS.find(x => x[0] === m)[1])}</span><i style="background:linear-gradient(90deg,${[0, .25, .5, .75, 1].map(t => col(t)).join(',')})"></i><span class="num">0 – ${metricFmt(max === 1e-9 ? 0 : max, m)}</span></div>`;
  $('#mp-note').textContent = `${shown.length} 個港口有資料；國家底色依國家合計${ms.dim === '2d' ? '；滾輪縮放、拖曳平移' : '；拖曳旋轉地球、滾輪縮放'}${unplaced.length ? `；${unplaced.length} 個港口沒有座標，暫用國家中心點（系統管理 → 港口座標）` : ''}`;
  mapSide(v, placed.filter(inSel), m);
}
function mapSide(v, sel, m) {
  const ms = mapState(), g = sumGroup(sel), side = $('#mp-side');
  const bribeM = /^bribe/.test(m);
  const med = a => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y), i = Math.floor(b.length / 2); return b.length % 2 ? b[i] : (b[i - 1] + b[i]) / 2; };
  side.innerHTML = `<div class="section-head" style="margin-bottom:6px"><div><div class="eyebrow">${ms.sel ? '選取範圍' : '全部地點'}</div><h2 style="font-size:16px">${esc(ms.sel ? ms.sel.label : '依上方篩選條件')}</h2></div>${ms.sel ? '<button class="btn sm" type="button" id="mp-clear">清除選取</button>' : ''}</div>
  <div class="mini-kpis"><div><b class="num">${fmt(g.insp)}</b><span>檢查</span></div><div><b class="num">${fmt(g.defs)}</b><span>缺失</span></div><div><b class="num">${g.insp ? (g.defs / g.insp).toFixed(2) : '–'}</b><span>平均／次</span></div><div><b class="num">${pct(g.nil, g.insp)}</b><span>NIL 率</span></div>${g.det ? `<div><b class="num" style="color:var(--crit)">${g.det}</b><span>留置</span></div>` : ''}${M.canBribe ? `<div><b class="num">${g.bn}</b><span>索賄（${pct(g.bn, g.insp)}）</span></div><div><b class="num">${g.busd ? '$' + fmt(g.busd) : '–'}</b><span>實付合計${g.paid.length ? '・中位 $' + fmt(med(g.paid)) : ''}</span></div>` : ''}</div>
  <h3 class="side-h">港口排名：${esc(MAP_METRICS.find(x => x[0] === m)[1])}</h3><div class="bars" id="mp-b1"></div>
  <h3 class="side-h">${bribeM ? '各年度索賄' : '缺失類別'}</h3><div class="bars" id="mp-b2"></div>
  ${!ms.sel ? '<p class="note">點地圖上的港口或國家、選 MOU 區域，或用「框選範圍」，地圖會拉近並顯示該範圍的長條／熱力分布。</p>' : ''}`;
  const r1 = sel.filter(p => metricVal(p, m) > 0).sort((a, b) => metricVal(b, m) - metricVal(a, m)).slice(0, 12);
  bars($('#mp-b1'), r1.map(p => ({ k: p.port, v: Math.max(0.001, metricVal(p, m)), lab: `${esc(p.port)} <span class="dim">${esc(p.country)}</span>`, extra: metricFmt(metricVal(p, m), m).replace(/^\d.*$/, '') })), { onClick: it => { ms.sel = { kind: 'port', key: it.k, label: it.k }; vMap(v); } });
  $('#mp-b1').querySelectorAll('.val').forEach((el, i) => { el.innerHTML = metricFmt(metricVal(r1[i], m), m); });
  if (bribeM) {
    const by = {}; sel.forEach(p => p.list.forEach(I => { if (I.bribe_flag === 'Y' || I.bribe_flag === 'R') { const o = by[I.y] || (by[I.y] = { n: 0, usd: 0 }); o.n++; o.usd += Number(I.bribe_paid_usd) || 0; } }));
    bars($('#mp-b2'), Object.entries(by).sort().map(([y, o]) => ({ k: y, v: o.n, lab: y, extra: o.usd ? '$' + fmt(o.usd) : '' })));
  } else {
    const c = current(), set = new Set(sel.flatMap(p => p.list)), cats = countBy(c.defs.filter(d => set.has(d.insp)), d => d.cat || '—');
    bars($('#mp-b2'), [...cats].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => ({ k, v: n, lab: `<span class="mono">${k}</span>${esc(CAT[k] || '無代碼')}` })), { onClick: it => { if (it.k !== '—') { S.cat = it.k; render(); } } });
  }
  const cl = $('#mp-clear'); if (cl) cl.addEventListener('click', () => { ms.sel = null; vMap(v); });
}

/* ---------- view: bribe analysis ---------- */
const median = a => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y), m = Math.floor(b.length / 2); return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const usd = n => n == null || isNaN(n) ? '—' : '$' + Math.round(n).toLocaleString('en-US');
function bribeAgg(list) {
  const occ = list.filter(I => I.bribe_flag === 'Y' || I.bribe_flag === 'R'), paid = occ.map(I => Number(I.bribe_paid_usd) || 0).filter(x => x > 0);
  const dem = occ.filter(I => Number(I.bribe_demanded_usd) > 0);
  return { n: list.length, occ: occ.length, paidN: paid.length, sum: paid.reduce((a, b) => a + b, 0), min: paid.length ? Math.min(...paid) : null, max: paid.length ? Math.max(...paid) : null, med: median(paid),
    kind: occ.filter(I => I.bribe_cig || I.bribe_goods).length, nilShare: occ.length ? occ.filter(I => !I.defs.length).length / occ.length : null, refused: occ.filter(I => I.bribe_flag === 'R').length, dem };
}
function vBribe(v) {
  if (!M.canBribe) { v.innerHTML = '<div class="card empty">您的角色沒有查看索賄資料的權限</div>'; return; }
  const list = M.insp.filter(inspMatch), A = bribeAgg(list);
  const group = (keyf) => { const g = {}; list.forEach(I => { const k = keyf(I); (g[k] = g[k] || []).push(I); }); return Object.entries(g).map(([k, l]) => [k, bribeAgg(l)]).filter(([, a]) => a.occ).sort((a, b) => b[1].occ - a[1].occ || b[1].sum - a[1].sum); };
  const byMou = group(I => I.mou || '未標示'), byC = group(I => I.country), byP = group(I => I.port + '｜' + I.country), byY = Object.entries((() => { const g = {}; list.forEach(I => (g[I.y] = g[I.y] || []).push(I)); return g; })()).map(([y, l]) => [y, bribeAgg(l)]).sort();
  const maxRate = Math.max(0.01, ...byC.map(([, a]) => a.occ / a.n));
  const row = (k, a, link) => `<tr${link ? ` class="click" data-c="${esc(k)}"` : ''}><td>${esc(k.replace('｜', ', '))}</td><td class="n">${a.n}</td><td class="n">${a.occ}</td><td class="num"><span class="inline-bar" style="width:${(a.occ / a.n / maxRate * 70).toFixed(0)}px;background:var(--crit)"></span>${pct(a.occ, a.n)}</td><td class="num" style="white-space:nowrap">${a.min != null ? usd(a.min) + ' – ' + usd(a.max) : '—'}</td><td class="n">${usd(a.med)}</td><td class="n">${usd(a.sum)}</td><td class="n">${a.kind || '–'}</td><td class="n">${a.nilShare == null ? '—' : Math.round(a.nilShare * 100) + '%'}</td></tr>`;
  const head = '<thead><tr><th></th><th class="n">檢查</th><th class="n">發生</th><th>發生率</th><th>實付範圍</th><th class="n">中位數</th><th class="n">合計</th><th class="n">實物</th><th class="n">發生時 NIL 比例</th></tr></thead>';
  const occList = list.filter(I => I.bribe_flag === 'Y' || I.bribe_flag === 'R');
  v.innerHTML = `<div class="callout" style="background:var(--crit-soft);color:var(--crit);display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><span>機密資料：只有 ${esc(M.settings.bribe_roles || 'admin,editor')} 角色看得到。統計範圍依上方篩選條件。</span><button class="btn sm" type="button" id="b-map">在地圖上看索賄分布</button></div>
  <div class="kpis"><div class="kpi"><div class="k">檢查次數</div><div class="v num">${fmt(A.n)}</div><div class="d">篩選範圍</div></div><div class="kpi crit"><div class="k">發生次數</div><div class="v num">${fmt(A.occ)}</div><div class="d">發生率 ${pct(A.occ, A.n)}${A.refused ? `，其中拒付 ${A.refused}` : ''}</div></div><div class="kpi"><div class="k">現金合計</div><div class="v num">${usd(A.sum)}</div><div class="d">${A.paidN} 次付現</div></div><div class="kpi"><div class="k">單次金額</div><div class="v num">${usd(A.med)}</div><div class="d">中位數；範圍 ${A.min != null ? usd(A.min) + ' – ' + usd(A.max) : '—'}</div></div><div class="kpi"><div class="k">含香菸 / 實物</div><div class="v num">${fmt(A.kind)}</div><div class="d">次</div></div></div>
  <div class="grid g2" style="margin-bottom:16px"><div class="card"><h2>依港口國</h2><p class="sub">發生率 = 有付出或被索取的檢查 ÷ 該國檢查次數；點一下即篩選</p><div class="tbl-wrap"><table id="t-bc">${head.replace('<th></th>', '<th>港口國</th>')}<tbody>${byC.map(([k, a]) => row(k, a, true)).join('') || '<tr><td colspan="9" class="empty">篩選範圍內沒有紀錄</td></tr>'}</tbody></table></div></div>
  <div class="card"><h2>依年度</h2><p class="sub">看趨勢是否改善</p><div class="tbl-wrap"><table>${head.replace('<th></th>', '<th>年度</th>')}<tbody>${byY.map(([k, a]) => row(k, a)).join('')}</tbody></table></div>
  <h2 style="margin-top:16px">談判價碼</h2>${A.dem.length ? `<div class="tbl-wrap"><table><thead><tr><th>日期</th><th>船舶 / 港口</th><th class="n">要求</th><th class="n">實付</th><th class="n">降幅</th></tr></thead><tbody>${A.dem.map(I => `<tr><td class="num">${dfmt(I.date)}</td><td>${esc(I.vessel)}<div class="dim">${esc(I.port)}</div></td><td class="n">${usd(+I.bribe_demanded_usd)}</td><td class="n">${usd(+I.bribe_paid_usd || 0)}</td><td class="n">${pct(+I.bribe_demanded_usd - (+I.bribe_paid_usd || 0), +I.bribe_demanded_usd)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="note">歷史資料只記錄實付金額。之後登錄 PSC 檢查時填「對方要求金額」，這裡就會顯示開價與實付的差距。</p>'}</div></div>
  <div class="card" style="margin-bottom:16px"><h2>依 MOU 區域</h2><p class="sub">同一區域的港口國索賄習慣往往相近</p><div class="tbl-wrap"><table>${head.replace('<th></th>', '<th>MOU 區域</th>')}<tbody>${byMou.map(([k, a]) => row(k, a)).join('') || '<tr><td colspan="9" class="empty">篩選範圍內沒有紀錄</td></tr>'}</tbody></table></div></div>
  <div class="card" style="margin-bottom:16px"><h2>依港口（前 15）</h2><div class="tbl-wrap"><table>${head.replace('<th></th>', '<th>港口</th>')}<tbody>${byP.slice(0, 15).map(([k, a]) => row(k, a)).join('')}</tbody></table></div></div>
  <div class="card"><div class="section-head"><h2>紀錄明細（${occList.length}）</h2><button class="btn" type="button" id="b-copy">複製結果（CSV）</button></div><div class="tbl-wrap"><table><thead><tr><th>日期</th><th>船舶</th><th>港口 / 港口國</th><th>檢查結果</th><th class="n">要求</th><th class="n">實付</th><th>香菸</th><th>實物</th><th>原始紀錄 / 說明</th></tr></thead><tbody>${occList.map(I => `<tr class="click" data-open="${esc(I.insp_id)}"><td class="num">${dfmt(I.date)}</td><td>${esc(I.vessel)}</td><td>${esc(I.port)}<div class="dim">${esc(I.country)}</div>${mouTag(I.mou)}</td><td>${I.defs.length ? I.defs.length + ' 項缺失' : '<span class="pill nil">NIL</span>'}</td><td class="n">${I.bribe_demanded_usd ? usd(+I.bribe_demanded_usd) : '—'}</td><td class="n">${Number(I.bribe_paid_usd) > 0 ? usd(+I.bribe_paid_usd) : '—'}</td><td>${esc(I.bribe_cig || '—')}</td><td>${esc(I.bribe_goods || '—')}</td><td class="dim" style="font-size:12px">${esc(I.bribe_raw)}${I.bribe_note ? `<div class="flag">${esc(I.bribe_note)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
  $('#b-map').addEventListener('click', () => { mapState().metric = 'bribe_n'; mapState().sel = null; setTab('map'); });
  v.querySelectorAll('#t-bc tr.click').forEach(tr => tr.addEventListener('click', () => { S.country = S.country === tr.dataset.c ? '' : tr.dataset.c; render(); }));
  v.querySelectorAll('[data-open]').forEach(tr => tr.addEventListener('click', () => openCase(tr.dataset.open)));
  $('#b-copy').addEventListener('click', async () => {
    const lines = [['Date', 'Vessel', 'Port', 'Country', 'MOU', 'Deficiencies', 'Flag', 'Demanded USD', 'Paid USD', 'Cigarettes', 'Goods', 'Raw', 'Note'].join(',')].concat(occList.map(I => [I.date, I.vessel, I.port, I.country, I.mou, I.defs.length, I.bribe_flag, I.bribe_demanded_usd, I.bribe_paid_usd, I.bribe_cig, I.bribe_goods, I.bribe_raw, I.bribe_note].map(csvCell).join(',')));
    try { await navigator.clipboard.writeText(lines.join('\n')); toast(`已複製 ${occList.length} 筆`); } catch (e) { toast('瀏覽器不允許自動複製'); }
  });
}

/* ---------- shell ---------- */
async function run(fn, btn) {
  if (btn) btn.disabled = true;
  try { await fn(); } catch (e) { toast(e.message || String(e), 7000); } finally { if (btn && document.body.contains(btn)) btn.disabled = false; }
}
function setTab(t) {
  if (t === 'cases') t = 'inspections';
  if (!TAB_LIST.includes(t)) t = 'inc-overview';
  if ((t === 'admin' && !can('admin')) || (t === 'bribe' && !(M && M.canBribe))) t = 'overview';
  S.tab = t; S.last[secOf(t)] = t;
  renderNav();
  try { history.replaceState(null, '', '#' + t); } catch (e) {}
  render();
}
function renderNav() {
  const sec = secOf(S.tab);
  document.querySelectorAll('.sec').forEach(b => b.setAttribute('aria-selected', b.dataset.sec === sec));
  const tabs = SECTIONS[sec].tabs.filter(([k]) => !(k === 'bribe' && !(M && M.canBribe)));
  $('#tabs').hidden = sec === 'admin';
  $('#tabs').innerHTML = tabs.map(([k, l]) => `<button class="tab" role="tab" type="button" data-tab="${k}" aria-selected="${k === S.tab}">${l}</button>`).join('');
  $('#tabs').querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { clearDetail(); S.page = 0; setTab(b.dataset.tab); }));
}
function clearDetail() { S.caseId = null; S.caseMode = null; S.incId = null; S.closing = false; S.incVessel = null; S.visitNo = null; S.histShip = null; }
let lastKey = '', renderTok = 0;
function render() {
  if (!M) return;
  hideTip();
  const key = [S.tab, S.caseId, S.caseMode, S.incId, S.profile, S.incVessel, S.visitNo, S.histShip].join('|'), v = $('#view');
  if (key !== lastKey && lastKey && v.children.length && !REDUCED) {
    const tok = ++renderTok; lastKey = key;
    fxOut(v).then(() => { if (tok === renderTok) { doRender(); fxIn(v, true); } });
    return;
  }
  const changed = key !== lastKey; lastKey = key; ++renderTok;
  doRender(); if (changed) fxIn(v, true);
}
function doRender() {
  const detail = S.caseMode || S.caseId || S.incId;
  $('#filters').hidden = S.tab === 'admin' || S.tab === 'inc-rules' || S.tab === 'report' || secOf(S.tab) === 'vf' || (S.tab === 'inc-vessels' && !!S.incVessel) || ((S.tab === 'inspections' || S.tab === 'incidents') && detail);
  const VIS = { window: ['#f-mgmt', '#f-vessel'], bribe: ['#f-years', '#f-mgmt', '#f-vessel', '#f-mou', '#f-country'], incidents: ['#f-years', '#f-mgmt', '#f-vessel', '#f-q'], 'inc-vessels': ['#f-years', '#f-mgmt', '#f-vessel', '#f-q'], 'inc-overview': ['#f-years', '#f-mgmt', '#f-vessel', '#f-q'], map: ['#f-years', '#f-mgmt', '#f-vessel', '#f-mou', '#f-cat', '#f-q'] }[S.tab];
  ['#f-years', '#f-mgmt', '#f-vessel', '#f-mou', '#f-country', '#f-cat', '#f-q'].forEach(sel => { $(sel).hidden = !!VIS && !VIS.includes(sel); });
  syncFilterUI();
  const v = $('#view');
  ({ 'inc-overview': vIncOverview, 'inc-vessels': vIncVessels, report: vReport, 'vf-overview': vVfOverview, visits: vVisits, 'vf-items': vVfItems, 'vf-ships': vVfShips, incidents: vIncidents, 'inc-rules': vIncRules, map: vMap, overview: vOverview, inspections: vInspections, records: vRecords, vessels: vVessels, codes: vCodes, window: vWindow, bribe: vBribe, admin: vAdmin }[S.tab] || vIncOverview)(v);
}
function header() {
  $('#m-asof').textContent = dfmt(M.asof);
  const io = M.incidents.filter(x => x.status === ST.OPEN).length, ov = M.incidents.filter(x => x.over).length;
  $('#m-inc').textContent = `${fmt(M.incidents.length)} 件 · 進行中 ${io}${ov ? ` · 逾期 ${ov}` : ''}`;
  $('#m-psc').textContent = `${fmt(M.insp.length)} 次檢查 · ${fmt(M.recs.length)} 項缺失`;
  if ($('#m-vf')) { const vs = PSC.visitStats(M.vitems, today()); $('#m-vf').textContent = `${M.visits.length} 次訪船 · 未關閉 ${vs.open + vs.submitted}${vs.overdue ? ` · 逾期 ${vs.overdue}` : ''}`; }
  $('#sec-admin').hidden = !can('admin');
  renderThemes();
  if (S.tab === 'admin' && !can('admin')) S.tab = 'inc-overview';
  if (S.tab === 'bribe' && !M.canBribe) S.tab = 'overview';
  renderNav();
  $('#userbox').innerHTML = USER ? `<span><b>${esc(USER.name || USER.email)}</b> <span class="dim">${esc(USER.email)}</span></span><span class="role">${esc(USER.role)}</span>${CFG.demo ? '' : '<button class="btn ghost" type="button" id="logout">登出</button>'}` : '';
  const lo = $('#logout'); if (lo) lo.addEventListener('click', signOut);
}
async function reload() {
  RAW = await api('bootstrap');
  USER = RAW.user; M = buildModel(RAW);
  header();
  const keep = { years: new Set(S.years) };
  buildFilters(); S.years = keep.years; syncFilterUI();
  render();
}
async function start() {
  hideChrome(false);
  $('#view').innerHTML = '<div class="empty">載入資料中…</div>';
  try { await reload(); }
  catch (e) { if (CFG.demo) { $('#view').innerHTML = `<div class="card err">${esc(e.message)}</div>`; } else showLogin(e.message); }
}

(() => { const adm = $('#sec-admin'); if (!adm || document.querySelector('[data-sec="vf"]')) return; const b = document.createElement('button'); b.className = 'sec'; b.setAttribute('role', 'tab'); b.type = 'button'; b.dataset.sec = 'vf'; b.innerHTML = '<b>訪船缺失</b><small id="m-vf">—</small>'; adm.parentNode.insertBefore(b, adm); })();
/* ---------- wire global controls ---------- */
document.querySelectorAll('.sec').forEach(b => b.addEventListener('click', () => { const sec = b.dataset.sec; clearDetail(); S.page = 0; setTab(S.last[sec] || SECTIONS[sec].tabs[0][0]); }));
$('#f-years').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; const y = +b.dataset.y; S.years.has(y) ? S.years.delete(y) : S.years.add(y); S.page = 0; render(); });
[['#f-mgmt', 'mgmt'], ['#f-vessel', 'vessel'], ['#f-mou', 'mou'], ['#f-country', 'country'], ['#f-cat', 'cat']].forEach(([s, k]) => $(s).addEventListener('change', e => { S[k] = e.target.value; S.page = 0; if (k === 'vessel' && S.tab === 'vessels') S.profile = e.target.value || null; render(); }));
let qT; $('#f-q').addEventListener('input', e => { clearTimeout(qT); qT = setTimeout(() => { S.q = e.target.value.trim(); S.page = 0; render(); }, 200); });
$('#f-clear').addEventListener('click', () => { S.years = new Set(); S.mgmt = S.vessel = S.mou = S.country = S.cat = S.code = S.q = ''; S.cStatus = ''; S.incF = { co: '', tier: '', type: '', status: '', src: '' }; S.page = 0; render(); });
$('#f-note').addEventListener('click', e => { const b = e.target.closest('[data-clear]'); if (b) { S[b.dataset.clear] = ''; S.page = 0; render(); } });
let rT; addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { if (S.tab === 'overview' && M) monthChart(current()); if (S.tab === 'inc-overview' && M) incMonth($('#ch-inc-month'), incList()); }, 150); });

/* ---------- boot ---------- */
$('#org').textContent = CFG.orgName + ' · Fleet Incident & PSC';
(() => { const mr = document.querySelector('.mast-right'); if (!mr || $('#rp-quick')) return; const b = document.createElement('button'); b.type = 'button'; b.id = 'rp-quick'; b.className = 'btn sm rp-quick'; b.textContent = '週報／月報'; b.hidden = true; b.addEventListener('click', () => { if (!M) return; clearDetail(); setTab('report'); window.scrollTo({ top: 0 }); }); mr.insertBefore(b, mr.firstChild); })();
renderThemes();
$('#sysname').textContent = CFG.systemName; document.title = CFG.systemName;
const h = (location.hash || '').slice(1);
if (TAB_LIST.includes(h)) S.tab = h; else if (h === 'cases') S.tab = 'inspections';
if (CFG.demo) {
  Demo.init(window.PSC_DEMO_SEED || {});
  const bar = $('#demo-bar'); bar.hidden = false; bar.className = 'demo-bar';
  bar.innerHTML = '<b>示範模式</b><span>資料只存在這個瀏覽器分頁，重新整理就會還原；上傳的檔案不會離開您的電腦。</span><label>切換角色 <select id="demo-role"><option value="admin">admin</option><option value="editor">editor</option><option value="viewer">viewer</option></select></label>';
  $('#demo-role').addEventListener('change', e => { Demo.user.role = e.target.value; if (S.tab === 'admin' && e.target.value !== 'admin') S.tab = 'inc-overview'; reload(); });
  start();
} else if (!CFG.apiUrl || !CFG.googleClientId) {
  hideChrome(true);
  $('#view').innerHTML = '<div class="card setup"><h2>系統尚未設定</h2><p>請在 <code>config.js</code> 填入 <code>apiUrl</code>（Apps Script 網頁應用程式網址）與 <code>googleClientId</code>（Google OAuth Client ID），詳細步驟見 README。</p></div>';
} else {
  let tok = null; try { tok = sessionStorage.getItem('psc-token'); } catch (e) {}
  const p = tok ? jwtPayload(tok) : {};
  if (tok && p.exp && Date.now() / 1000 < p.exp - 60) { Object.assign(Auth, { token: tok, email: p.email, name: p.name, exp: p.exp }); start(); }
  else showLogin();
}
window.__PSCAPP = { get M() { return M; }, S, api, reload };
})();
