/* TSL PSC System — front-end (GitHub Pages). Requires config.js and assets/core.js. */
(function () {
'use strict';
const CFG = Object.assign({ apiUrl: '', googleClientId: '', demo: false, orgName: '德翔海技 TSL MARTEC' }, window.PSC_CONFIG || {});
const CAT = PSC.CATEGORIES, ACT = PSC.ACTIONS, ST = PSC.STATUS;
const SECTIONS = {
  inc: { tabs: [['inc-overview', '事故分析'], ['incidents', '事故登錄與處理']] },
  psc: { tabs: [['overview', '總覽'], ['inspections', '檢查登錄'], ['records', '缺失查詢'], ['vessels', '船舶檔案'], ['window', 'PSC 窗口'], ['bribe', '索賄分析'], ['codes', '代碼參考']] },
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
function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toast._t); toast._t = setTimeout(() => t.style.display = 'none', ms || 4500); }
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
  const r = await fetch(CFG.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ idToken: Auth.token, action, payload: payload || {} }) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || '伺服器錯誤');
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
function hideChrome(h) { ['#sections', '#tabs', '#filters'].forEach(s => { $(s).hidden = h; }); if (h) $('#userbox').innerHTML = ''; }

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
    const I = x.insp_id ? byId.get(x.insp_id) : null, dl = PSC.incidentDeadlines(x);
    return Object.assign({}, x, dl, { I, y: +String(x.date).slice(0, 4), ym: String(x.date).slice(0, 7), psc: x.source === 'PSC' || !!I,
      mgmt: I ? I.mgmt : (PSC.COMPANY_TO_MGMT[x.company] || x.company || '—'), docs: I ? I.docs : (docsByNo[x.tracking_no] || []),
      over: x.status === ST.OPEN && !!dl.rca_due && dl.rca_due < td });
  }).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const incByNo = new Map(incidents.map(x => [x.tracking_no, x]));
  const lastInc = incidents.length ? incidents[0].date : '';
  return { insp, recs, vreg, byId, incidents, incByNo, asof: [insp.length ? insp[0].date : '', lastInc].sort().pop(), settings: raw.settings || {}, users: raw.users || [], vessels: raw.vessels || [],
    companies: raw.companies || [], risk: raw.riskProfiles || [], nk: raw.nkStatus || [], mouMap: raw.mouMap || [], canBribe: !!raw.canBribe };
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
function vVessels(v) {
  const c = current(), agg = {};
  c.insp.forEach(I => { const k = vkey(I); const o = agg[k] || (agg[k] = { n: 0, nil: 0, d: 0, last: '', det: 0, open: 0 }); o.n++; if (!I.defs.length) o.nil++; if (I.det) o.det++; if (I.status === ST.OPEN) o.open++; if (I.date > o.last) o.last = I.date; });
  c.defs.forEach(d => { const k = vkey(d); if (agg[k]) agg[k].d++; });
  let html = '';
  if (S.profile && M.vreg[S.profile]) html += profileHTML(S.profile, c);
  const list = Object.entries(agg).map(([k, o]) => ({ k, o, V: M.vreg[k] })).sort((a, b) => b.o.d - a.o.d || b.o.n - a.o.n || (a.V.name < b.V.name ? -1 : 1));
  html += `<div class="toolbar" style="margin-top:${S.profile ? '18px' : '0'}"><span><b class="num">${list.length}</b> 艘船有 PSC 紀錄（依篩選條件）· 依缺失件數排序</span></div><div class="vgrid">` +
    (list.length ? list.map(({ k, o, V }) => `<button type="button" class="vcard" data-vc="${esc(k)}"><span class="nm">${esc(V.name)}${o.det ? ` <span class="pill det">留置 ${o.det}</span>` : ''}${o.open ? ` <span class="stp stp-open">進行中 ${o.open}</span>` : ''}</span><span class="zh">${esc(V.zh)}${V.former.length ? ` · 前 ${esc(V.former.join('、'))}` : ''}${V.cur ? ` · ${esc(V.cur.company)}` : ''}</span><span class="st"><span><b class="num">${o.n}</b> 次檢查</span><span><b class="num">${o.d}</b> 項缺失</span><span>NIL ${pct(o.nil, o.n)}</span></span><span class="st dim">最近 ${dfmt(o.last)}</span></button>`).join('') : '<div class="empty">沒有符合條件的船舶</div>') + '</div>';
  v.innerHTML = html;
  v.querySelectorAll('.vcard').forEach(b => b.addEventListener('click', () => openVessel(b.dataset.vc)));
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
    ['建造日期', cur.date_of_build ? dfmt(cur.date_of_build) : '—'], ['造船廠', cur.builder || '—'], ['船級 / 船級號', [cur.class_society, cur.class_number].filter(Boolean).join(' ') || '—'], ['GT / DWT', [cur.gross_tonnage, cur.deadweight].filter(Boolean).map(fmt).join(' / ') || '—'], ['TEU', cur.teu ? fmt(cur.teu) : '—'], ['登記船東', cur.registered_owner || '—'], ['NK 資料日期', cur.nk_data_date ? dfmt(cur.nk_data_date) : '未匯入']];
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
function docTypesFor(psc) { return PSC.DOC_TYPES.filter(t => psc ? !t.inc : !t.psc); }
function uploadHTML(base, psc) {
  const types = docTypesFor(psc); if (!types.some(t => t.code === S.upType)) S.upType = psc ? 'PSC-B' : 'RPT';
  return `<div class="drop" style="margin-bottom:12px"><div class="frow"><div class="field"><label for="up-type">文件類別</label><select id="up-type">${types.map(t => opt(t.code, `${t.code}　${t.name}`, S.upType === t.code)).join('')}</select></div><div class="field"><label for="up-file">檔案（單檔 ${MAX_MB} MB 以內）</label><input class="inp" type="file" id="up-file" multiple></div><div class="field"><label for="up-note">說明（選填）</label><input class="inp" id="up-note" placeholder="例如：Form B 第 2 頁補件"></div></div><div class="btnrow"><button class="btn primary" type="button" id="up-go">上傳並歸檔</button><span class="dim" id="up-preview" style="font-size:12.5px"></span></div></div>`;
}
function docListHTML(docs, psc) {
  const groups = docTypesFor(psc).concat(PSC.DOC_TYPES.filter(t => !docTypesFor(psc).includes(t))).map(t => ({ t, docs: docs.filter(d => d.doc_type === t.code).sort((a, b) => +a.seq - +b.seq) })).filter(g => g.docs.length);
  return groups.length ? groups.map(g => `<div class="docgroup"><h3>${esc(g.t.code)}　${esc(g.t.name)}</h3>${g.docs.map(d => `<div class="doc"><div><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.file_name)}</a>${d.note ? ` <span class="dim">· ${esc(d.note)}</span>` : ''}<div class="dim" style="font-size:12px">原檔名 ${esc(d.original_name)}</div></div><div class="m">${esc(d.uploaded_by)}<br>${dfmt(d.uploaded_at)}</div></div>`).join('')}</div>`).join('') : '<div class="empty">尚未上傳文件</div>';
}
function wireUpload(base, docs, target) {
  const ub = $('#up-go'); if (!ub) return;
  const prev = () => { const t = $('#up-type').value, n = docs.filter(d => d.doc_type === t).reduce((m, d) => Math.max(m, +d.seq || 0), 0) + 1; const f = $('#up-file').files[0]; $('#up-preview').textContent = '將存為 ' + PSC.documentFileName(PSC.documentId(base, t, n), f ? f.name : '.pdf') + ($('#up-file').files.length > 1 ? ` 等 ${$('#up-file').files.length} 個檔案` : ''); };
  $('#up-type').addEventListener('change', () => { S.upType = $('#up-type').value; prev(); }); $('#up-file').addEventListener('change', prev); prev();
  ub.addEventListener('click', () => {
    const files = [...$('#up-file').files]; if (!files.length) { toast('請先選擇檔案'); return; }
    const big = files.find(f => f.size > MAX_MB * 1048576); if (big) { toast(`${big.name} 超過 ${MAX_MB} MB，請壓縮後再上傳`); return; }
    run(async () => {
      const names = [];
      for (const f of files) {
        const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('讀取檔案失敗')); r.readAsDataURL(f); });
        const d = await api('uploadDocument', Object.assign({ doc_type: $('#up-type').value, original_name: f.name, mime: f.type, size: f.size, base64: b64, note: $('#up-note').value }, target));
        names.push(d.file_name);
      }
      await reload(); toast('已歸檔：' + names.join('、'), 6000);
    }, ub);
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
  const inc = I.tracking_no ? M.incidents.find(x => x.tracking_no === I.tracking_no) : null;
  const ed = can('editor');
  const base = I.tracking_no || I.insp_id;
  const rectified = I.defs.filter(d => d.rectified === 'Y').length;
  const mh = PSC.resolveMOU(M.mouMap, I.country, I.port);
  v.innerHTML = `<button class="backlink" type="button" id="back">← 回到${S.tab === 'incidents' ? '事故' : '檢查'}列表</button>
  <div class="card" style="margin-bottom:16px"><div class="vprof-head"><div style="min-width:0"><div class="eyebrow">${I.tracking_no ? '事故追蹤編號（PSC 檢查有缺失）' : '檢查編號（NIL 不立事故編號）'}</div><div class="tn-lg">${esc(base)}</div>
  <div class="btnrow" style="margin-top:6px">${statusPill(I)}${I.tracking_no ? tierPill(I.tier) : ''}${I.det ? '<span class="pill det">留置</span>' : ''}<span class="dim" style="font-size:13px">${esc(I.tier_reason || '')}</span></div></div>
  <div class="btnrow"><button class="btn" type="button" id="copy-no">複製編號</button>${ed ? '<button class="btn" type="button" id="edit">編輯檢查內容</button>' : ''}${ed && I.tracking_no ? (I.status === ST.CLOSED ? '<button class="btn" type="button" id="reopen">重新開啟</button>' : '<button class="btn primary" type="button" id="close">結案</button>') : ''}</div></div>
  <dl class="facts"><div><dt>檢查日期</dt><dd>${dfmt(I.date)}</dd></div><div><dt>船舶</dt><dd><a href="#vessels" class="vlink" data-v="${esc(vkey(I))}">${esc(I.vessel)}</a> <span class="dim">IMO ${esc(I.imo)}</span></dd></div><div><dt>港口 / 港口國</dt><dd>${esc(I.port)}, ${esc(I.country)}</dd></div><div><dt>MOU 區域</dt><dd>${esc(I.mou || '—')}${mh.also ? ` <span class="dim">（${esc(I.country)} 也是 ${esc(mh.also)} 成員）</span>` : ''}</dd></div><div><dt>公司碼 / 管理</dt><dd>${esc(I.company || '—')} / ${esc(I.mgmt)}</dd></div><div><dt>監管人員 PIC</dt><dd>${esc(I.pic || '—')}</dd></div>${I.closed_date ? `<div><dt>結案日</dt><dd>${dfmt(I.closed_date)}</dd></div>` : ''}</dl>
  ${I.tracking_no ? docChecklist(I, true) : ''}
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
function incList() { return M.incidents.filter(incMatch); }
function vIncOverview(v) {
  const L = incList(), n = L.length, psc = L.filter(x => x.psc).length, open = L.filter(x => x.status === ST.OPEN), over = L.filter(x => x.over);
  const t12 = L.filter(x => x.tier === '1' || x.tier === '2').length, t1 = L.filter(x => x.tier === '1').length;
  const miss = M.insp.filter(inspMatch).filter(I => I.status === '未立案');
  const pscN = M.insp.filter(inspMatch), pscDef = pscN.filter(I => I.defs.length && I.status !== ST.HIST);
  const first = M.incidents.length ? M.incidents[M.incidents.length - 1].date : '';
  v.innerHTML = `<div class="callout" style="margin-bottom:14px">事故登錄器是主軸：所有事故（含 PSC 有缺失的檢查，類型一律 O）都在這裡編號與追蹤期限。PSC 檢查的完整統計（含 ${fmt(M.insp.filter(I => I.status === ST.NIL).length)} 次 NIL）在「PSC 檢查」分頁。事故登錄自 ${dfmt(first)} 起建檔。</div>
  <div class="kpis"><div class="kpi"><div class="k">事故件數</div><div class="v num">${fmt(n)}</div><div class="d">PSC ${psc} 件 · 其他 ${n - psc} 件</div></div>
  <div class="kpi"><div class="k">進行中</div><div class="v num">${fmt(open.length)}</div><div class="d">已完成 ${fmt(L.filter(x => x.status === ST.CLOSED).length)} 件</div></div>
  <div class="kpi ${over.length ? 'crit' : ''}"><div class="k">RCA 期限已過仍未結案</div><div class="v num">${fmt(over.length)}</div><div class="d">${over.length ? '請追蹤調查報告' : '皆在期限內'}</div></div>
  <div class="kpi ${t1 ? 'crit' : ''}"><div class="k">Tier 1 / Tier 2</div><div class="v num">${t1} / ${t12 - t1}</div><div class="d">重大 / 中等事故</div></div>
  <div class="kpi ${miss.length ? 'crit' : ''}"><div class="k">PSC 有缺失未立案</div><div class="v num">${fmt(miss.length)}</div><div class="d">${miss.length ? '點下方清單補發編號' : `${fmt(pscDef.length)} 次有缺失檢查皆已立案或為歷史資料`}</div></div></div>
  ${miss.length ? `<div class="card" style="margin-bottom:16px;border-left:3px solid var(--crit)"><h2>PSC 有缺失但未立案（${miss.length}）</h2><p class="sub">開啟後按「編輯檢查內容」→ 儲存，系統即補發事故編號</p><div class="tbl-wrap"><table><thead><tr><th>檢查日</th><th>船舶</th><th>港口</th><th class="n">缺失</th><th>檢查編號</th></tr></thead><tbody>${miss.map(I => `<tr class="click" data-open="${esc(I.insp_id)}"><td class="num">${dfmt(I.date)}</td><td>${esc(I.vessel)}</td><td>${esc(I.port)}, ${esc(I.country)}</td><td class="n">${I.defs.length}</td><td class="tn">${esc(I.insp_id)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
  <div class="card" style="margin-bottom:16px"><div class="card-head"><div><h2>每月事故</h2><p class="sub">依事故日期；PSC = PSC 檢查有缺失自動立案</p></div><div class="legend"><span><i class="k-psc"></i>PSC</span><span><i class="k-oth"></i>其他事故</span></div></div><div class="chart" id="ch-inc-month"></div></div>
  <div class="card" style="margin-bottom:16px"><div class="section-head"><h2>待處理事故（${open.length}）</h2><span class="dim" style="font-size:12.5px">依 RCA 期限排序；點一下開啟事故</span></div><div class="tbl-wrap"><table id="t-open"><thead><tr><th>事故編號</th><th>船舶</th><th>等級</th><th>立即通報</th><th>初步報告</th><th>RCA</th><th>PIC</th><th>簡述</th></tr></thead><tbody>${open.slice().sort((a, b) => (a.rca_due || '9') < (b.rca_due || '9') ? -1 : 1).map(x => { const has = t => x.docs.some(d => d.doc_type === t); return `<tr class="click" data-incrow="${esc(x.tracking_no)}"><td><span class="tn">${esc(x.tracking_no)}</span> ${srcPill(x)}</td><td>${esc(x.vessel)}</td><td style="white-space:nowrap">${tierPill(x.tier)} <span class="mono">${esc(x.type)}</span></td><td>${x.source === 'REGISTER' && !has('FLASH') ? '<span class="dim" style="font-size:12px">匯入，未追蹤</span>' : dueCell(x.flash_due, has('FLASH'), true)}</td><td>${x.source === 'REGISTER' && !has('INIT') ? '<span class="dim" style="font-size:12px">匯入，未追蹤</span>' : dueCell(x.initial_due, has('INIT'), true)}</td><td>${dueCell(x.rca_due, has('RCA'), true)}</td><td>${esc(x.pic)}</td><td class="nature" style="min-width:220px">${incSum(x)}</td></tr>`; }).join('') || '<tr><td colspan="8" class="empty">沒有進行中的事故</td></tr>'}</tbody></table></div><p class="note">從事故登錄器匯入的事故沒有通報文件紀錄，所以立即通報 / 初步報告顯示「未追蹤」；RCA 期限依事故日期與等級推算。在事故頁上傳 FLASH / INIT / RCA 文件後即顯示已歸檔。</p></div>
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
  let list = incList().filter(x => (!F.co || x.company === F.co) && (!F.tier || x.tier === F.tier) && (!F.type || x.type === F.type) && (!F.src || (F.src === 'PSC' ? x.psc : !x.psc)));
  const base = list;
  if (F.status === 'over') list = list.filter(x => x.over); else if (F.status) list = list.filter(x => x.status === F.status);
  const cos = [...new Set(M.incidents.map(x => x.company))].sort();
  const flagged = list.filter(x => x.check_notes).length;
  const pages = Math.max(1, Math.ceil(list.length / PAGE)); S.page = Math.min(S.page, pages - 1);
  const chips = [['', '全部', base.length], [ST.OPEN, '進行中', base.filter(x => x.status === ST.OPEN).length], ['over', 'RCA 逾期', base.filter(x => x.over).length], [ST.CLOSED, '已完成', base.filter(x => x.status === ST.CLOSED).length]];
  v.innerHTML = `<div class="grid" style="grid-template-columns:minmax(0,1fr)">${S.incForm ? incidentForm() : ''}
  <div class="card"><div class="section-head"><div><h2>事故登錄器</h2><p class="sub" style="margin:2px 0 0">點一下開啟事故處理頁（期限、文件歸檔、結案）。PSC 事故會開啟對應的檢查與缺失矯正。</p></div><div class="btnrow">${can('editor') && !S.incForm ? '<button class="btn" type="button" id="i-psc">登錄 PSC 檢查</button><button class="btn primary" type="button" id="i-new">新增其他事故</button>' : ''}</div></div>
  <div class="toolbar"><div class="yrs">${chips.map(([k, l, c]) => `<button type="button" class="chip" data-is="${k}" aria-pressed="${F.status === k}">${l} <span class="num">${c}</span></button>`).join('')}</div></div>
  <div class="toolbar"><select class="sel" id="i-co">${opt('', '全部公司碼')}${cos.map(c => opt(c, c, F.co === c)).join('')}</select><select class="sel" id="i-tier">${opt('', '全部等級')}${['1', '2', '3'].map(t => opt(t, `Tier ${t} ${PSC.TIERS[t].en}`, F.tier === t)).join('')}</select>
  <select class="sel" id="i-type">${opt('', '全部類型')}${Object.entries(PSC.TYPES).map(([k, x]) => opt(k, `${k} ${x}`, F.type === k)).join('')}</select>
  <select class="sel" id="i-src">${opt('', 'PSC 與其他')}${opt('PSC', '只看 PSC', F.src === 'PSC')}${opt('OTHER', '只看非 PSC', F.src === 'OTHER')}</select><span style="flex:1"></span><span><b class="num">${list.length}</b> 筆 · ${flagged} 筆有檢核註記</span></div>
  <div class="tbl-wrap"><table><thead><tr><th>事故編號</th><th>日期</th><th>船舶</th><th>等級</th><th>單位</th><th>狀態</th><th>RCA 期限</th><th class="n">文件</th><th>事故簡述</th></tr></thead><tbody>${list.slice(S.page * PAGE, (S.page + 1) * PAGE).map(x => `<tr class="click" data-incrow="${esc(x.tracking_no)}"><td><span class="tn">${esc(x.tracking_no)}</span> ${srcPill(x)}${x.tracking_no_std && x.tracking_no_std !== x.tracking_no ? `<div class="dim tn" style="font-size:11.5px">建議：${esc(x.tracking_no_std)}</div>` : ''}${x.check_notes ? `<div class="flag" title="${esc(x.check_notes)}">⚠ ${esc(x.check_notes.split('；')[0])}${x.check_notes.split('；').length > 1 ? ` 等 ${x.check_notes.split('；').length} 項` : ''}</div>` : ''}</td><td class="num">${dfmt(x.date)}</td><td>${esc(x.vessel)}</td><td style="white-space:nowrap">${tierPill(x.tier)} <span class="mono">${esc(x.type)}</span></td><td style="white-space:nowrap">${esc(x.unit)}</td><td>${x.over ? '<span class="stp stp-over">進行中・RCA 逾期</span>' : `<span class="stp stp-${x.status === ST.OPEN ? 'open' : 'closed'}">${esc(x.status)}</span>`}${x.closed_date ? `<div class="dim">${dfmt(x.closed_date)}</div>` : ''}</td><td>${x.status === ST.OPEN ? dueCell(x.rca_due, x.docs.some(d => d.doc_type === 'RCA'), true) : '<span class="dim">—</span>'}</td><td class="n">${x.docs.length || '–'}</td><td class="nature" style="min-width:240px">${incSum(x)}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">沒有符合條件的事故</td></tr>'}</tbody></table></div><div class="pager" id="i-pager"></div></div>
  <div class="card"><h2>編號規則速查</h2><p class="sub">[公司碼]-[船名]-[YYYYMMDD]-[等級][類型]-[序號]；序號為同船同日序號 01–99（PSC 與其他事故共用）</p><div class="grid g2"><div class="tbl-wrap"><table class="ref"><thead><tr><th>等級</th><th>判定</th><th>通報 / 初報 / RCA</th></tr></thead><tbody><tr><td>${tierPill('1')} Major</td><td>人員死亡、全損、重大污染、擱淺碰撞、主機失效影響航行</td><td>2 小時 / 24 小時 / 14 天</td></tr><tr><td>${tierPill('2')} Moderate</td><td>嚴重傷害、重要設備故障、PSC 留置、PSC 缺失 ≥ ${esc(M.settings.tier2_def_threshold || 6)} 項或有 ISM 缺失、輕微污染、港口罰款</td><td>2 小時 / 24 小時 / 14 天</td></tr><tr><td>${tierPill('3')} Minor</td><td>輕傷、一般設備故障、Near Miss、PSC 缺失</td><td>12 小時 / 48 小時 / 21 天</td></tr></tbody></table></div>
  <div class="tbl-wrap"><table class="ref"><thead><tr><th>類型</th><th>說明</th></tr></thead><tbody>${Object.entries(PSC.TYPES).map(([k, x]) => `<tr><td class="mono">${k}</td><td>${esc(x)}${k === 'O' ? '（PSC 檢查一律用 O）' : ''}</td></tr>`).join('')}</tbody></table></div></div></div></div>`;
  [['#i-co', 'co'], ['#i-tier', 'tier'], ['#i-type', 'type'], ['#i-src', 'src']].forEach(([s, k]) => $(s).addEventListener('change', e => { F[k] = e.target.value; S.page = 0; render(); }));
  v.querySelectorAll('[data-is]').forEach(b => b.addEventListener('click', () => { F.status = b.dataset.is; S.page = 0; render(); }));
  v.querySelectorAll('[data-incrow]').forEach(tr => tr.addEventListener('click', () => openIncident(tr.dataset.incrow)));
  $('#i-pager').innerHTML = pages > 1 ? `<button class="btn" type="button" data-p="-1" ${S.page ? '' : 'disabled'}>上一頁</button><span class="num">${S.page + 1} / ${pages}</span><button class="btn" type="button" data-p="1" ${S.page < pages - 1 ? '' : 'disabled'}>下一頁</button>` : '';
  $('#i-pager').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { S.page += +b.dataset.p; render(); }));
  const nb = $('#i-new'); if (nb) nb.addEventListener('click', () => { S.incForm = { imo: '', date: today(), tier: '3', type: 'M', unit: '海技', pic: '', summary: '' }; render(); });
  const pb = $('#i-psc'); if (pb) pb.addEventListener('click', () => { S.form = null; S.caseMode = 'new'; S.caseId = null; render(); window.scrollTo({ top: 0 }); });
  if (S.incForm) wireIncidentForm();
}
function incidentDetail(v, x) {
  const ed = can('editor'), base = x.tracking_no, open = x.status === ST.OPEN, E = S.incEdit;
  const V = M.vreg[String(x.imo || x.vessel)];
  v.innerHTML = `<button class="backlink" type="button" id="back">← 回到事故列表</button>
  <div class="card" style="margin-bottom:16px"><div class="vprof-head"><div style="min-width:0"><div class="eyebrow">事故追蹤編號</div><div class="tn-lg">${esc(base)}</div>
  <div class="btnrow" style="margin-top:6px">${x.over ? '<span class="stp stp-over">進行中・RCA 逾期</span>' : `<span class="stp stp-${open ? 'open' : 'closed'}">${esc(x.status)}</span>`}${tierPill(x.tier)}<span class="mono">${esc(x.type)}</span><span class="dim" style="font-size:13px">${esc(PSC.TYPES[x.type] || '')} · ${esc((PSC.TIERS[x.tier] || {}).zh || '')}</span></div></div>
  <div class="btnrow"><button class="btn" type="button" id="copy-no">複製編號</button>${ed && !E ? '<button class="btn" type="button" id="i-edit">編輯內容</button>' : ''}${ed ? (open ? '<button class="btn primary" type="button" id="close">結案</button>' : '<button class="btn" type="button" id="reopen">重新開啟</button>') : ''}</div></div>
  <dl class="facts"><div><dt>事故日期</dt><dd>${dfmt(x.date)}</dd></div><div><dt>船舶</dt><dd>${V ? `<a href="#vessels" class="vlink" data-v="${esc(String(x.imo || x.vessel))}">${esc(x.vessel)}</a>` : esc(x.vessel)} <span class="dim">IMO ${esc(x.imo || '—')}</span></dd></div><div><dt>公司碼 / 管理</dt><dd>${esc(x.company)} / ${esc(x.mgmt)}</dd></div><div><dt>TSL 責任單位</dt><dd>${esc(x.unit || '—')}</dd></div><div><dt>監管人員 PIC</dt><dd>${esc(x.pic || '—')}</dd></div><div><dt>來源</dt><dd>${x.source === 'MANUAL' ? '本系統新增' : '事故登錄器匯入'}</dd></div>${x.closed_date ? `<div><dt>結案日</dt><dd>${dfmt(x.closed_date)}</dd></div>` : ''}</dl>
  ${docChecklist(x, false)}
  ${S.closing ? closeBoxHTML('結案前請確認已歸檔 RCA（Template 4）或結案確認（Template 5C）。') : ''}
  ${x.check_notes ? `<div class="callout" style="margin-top:14px">檢核註記：${esc(x.check_notes)}</div>` : ''}
  ${E ? `<div class="drop" style="margin-top:14px"><div class="frow"><div class="field"><label for="ie-unit">TSL 責任單位</label><select id="ie-unit">${['海技', '工務', '物料', '船員', '運務'].map(u => opt(u, u, x.unit === u)).join('')}</select></div><div class="field"><label for="ie-pic">監管人員 PIC</label><input class="inp" id="ie-pic" value="${esc(x.pic)}"></div></div><div class="field"><label for="ie-sum">事故簡述</label><textarea class="inp" id="ie-sum" rows="4">${esc(x.summary)}</textarea></div><div class="field"><label for="ie-ca">矯正 / 預防措施</label><textarea class="inp" id="ie-ca" rows="3">${esc(x.corrective_action || '')}</textarea></div><p class="note" style="margin:0">事故編號、日期、船名與等級不在這裡修改；等級判定錯誤請在檢核註記說明並依規則重新編號。</p><div class="btnrow"><button class="btn primary" type="button" id="ie-save">儲存</button><button class="btn ghost" type="button" id="ie-cancel">取消</button></div></div>`
    : `<div class="note" style="white-space:pre-wrap">事故簡述：${esc(x.summary)}</div>${x.corrective_action ? `<div class="note" style="white-space:pre-wrap">矯正 / 預防措施：${esc(x.corrective_action)}</div>` : ''}`}</div>
  <div class="card"><div class="section-head"><h2>文件歸檔（${x.docs.length}）</h2><span class="dim" style="font-size:12.5px">命名規則：${esc(base)}_[文件代碼]_[序號]；Drive：${esc(PSC.folderPath({ date: x.date, tracking_no: base, source: x.source }).join(' / '))}</span></div>
  ${ed ? uploadHTML(base, false) : ''}${docListHTML(x.docs, false)}</div>`;
  $('#back').addEventListener('click', () => { S.incId = null; S.closing = false; S.incEdit = false; render(); });
  $('#copy-no').addEventListener('click', async () => { try { await navigator.clipboard.writeText(base); toast('已複製 ' + base); } catch (e) { toast(base); } });
  wireLinks(v);
  const eb = $('#i-edit'); if (eb) eb.addEventListener('click', () => { S.incEdit = true; render(); });
  if (E) {
    $('#ie-cancel').addEventListener('click', () => { S.incEdit = false; render(); });
    $('#ie-save').addEventListener('click', () => run(async () => { await api('updateIncident', { tracking_no: base, fields: { unit: $('#ie-unit').value, pic: $('#ie-pic').value, summary: $('#ie-sum').value, corrective_action: $('#ie-ca').value } }); S.incEdit = false; await reload(); toast('已儲存 ' + base); }, $('#ie-save')));
  }
  wireClose({ tracking_no: base }, base);
  wireUpload(base, x.docs, { tracking_no: base });
}
function incidentForm() {
  const f = S.incForm;
  return `<div class="card" id="inc-form"><h2 style="margin-bottom:12px">新增事故編號（非 PSC 事故）</h2><div class="form"><div class="frow"><div class="field"><label for="n-date">事故日期</label><input class="inp" type="date" id="n-date" data-n="date" value="${esc(f.date)}"></div><div class="field"><label for="n-ves">船舶</label><select id="n-ves" data-n="imo">${vesselOptions(f.date, f.imo)}</select></div>
  <div class="field"><label for="n-tier">嚴重程度</label><select id="n-tier" data-n="tier">${['1', '2', '3'].map(t => opt(t, `${t} ${PSC.TIERS[t].zh}`, f.tier === t)).join('')}</select></div><div class="field"><label for="n-type">事故性質</label><select id="n-type" data-n="type">${Object.entries(PSC.TYPES).map(([k, x]) => opt(k, `${k} ${x}`, f.type === k)).join('')}</select></div></div>
  <div class="frow"><div class="field"><label for="n-unit">TSL 單位</label><select id="n-unit" data-n="unit">${['海技', '工務', '物料', '船員', '運務'].map(u => opt(u, u, f.unit === u)).join('')}</select></div><div class="field"><label for="n-pic">監管人員 PIC</label><input class="inp" id="n-pic" data-n="pic" value="${esc(f.pic)}"></div></div>
  <div class="field"><label for="n-sum">事故簡述</label><textarea class="inp" id="n-sum" data-n="summary" rows="3">${esc(f.summary)}</textarea></div>
  <div class="drop"><div class="eyebrow">編號預覽</div><div class="tn-lg" id="n-prev" style="font-size:16px">—</div><div class="note" style="margin:0" id="n-dl"></div><div class="note" style="margin:0">PSC 檢查請改用「登錄 PSC 檢查」，系統會自動判定等級。</div></div>
  <div id="n-err" class="err"></div><div class="btnrow"><button class="btn primary" type="button" id="n-save">取得編號並登錄</button><button class="btn ghost" type="button" id="n-cancel">取消</button></div></div></div>`;
}
function wireIncidentForm() {
  const f = S.incForm;
  const prev = () => {
    const v = f.imo ? PSC.vesselAt(M.vessels, f.imo, f.date || today()) : null;
    $('#n-prev').textContent = v && f.date ? PSC.buildTrackingNo(v.company, v.vessel, f.date, f.tier, f.type, PSC.nextSeq(M.incidents, v.vessel, f.date)) : '選擇船舶與日期後產生';
    const T = PSC.TIERS[f.tier], dl = f.date ? PSC.deadlines(f.date, f.tier) : null;
    $('#n-dl').textContent = dl ? `期限：立即通報 ${T.flashH} 小時內、初步報告 ${T.initialH} 小時內、RCA ${dfmt(dl.rca_due)}（${T.rcaD} 天）` : '';
  };
  document.querySelectorAll('[data-n]').forEach(el => el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', () => {
    f[el.dataset.n] = el.value;
    if (el.dataset.n === 'imo' && !f.pic) { const v = PSC.vesselAt(M.vessels, f.imo, f.date); if (v) { f.pic = v.pic || ''; $('#n-pic').value = f.pic; } }
    if (el.dataset.n === 'date') $('#n-ves').innerHTML = vesselOptions(f.date, f.imo);
    prev();
  }));
  $('#n-cancel').addEventListener('click', () => { S.incForm = null; render(); });
  $('#n-save').addEventListener('click', () => {
    if (!f.imo || !f.date) { $('#n-err').textContent = '請選擇船舶與日期'; return; }
    if (!f.summary.trim()) { $('#n-err').textContent = '請填寫事故簡述'; return; }
    run(async () => { const r = await api('saveIncident', f); S.incForm = null; await reload(); S.incId = r.tracking_no; render(); toast('已登錄：' + r.tracking_no, 7000); }, $('#n-save'));
  });
  prev();
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
  <div class="field"><label for="s-white">Tokyo MOU 白名單船旗（估算 SRP）</label><input class="inp" id="s-white" value="${esc(set.tmou_white_flags || '')}"></div>
  <div class="btnrow"><button class="btn primary" type="button" id="s-save">儲存設定</button></div><p class="note" style="margin:0">變更門檻只影響之後新登錄的案件；已發出的編號不會變更。</p></div></div></div>
  <div class="grid g2" style="margin-bottom:16px"><div class="card"><div class="section-head"><h2>資料檢核</h2><button class="btn" type="button" id="dc-run">執行檢核</button></div><p class="sub">組員直接編輯 Google 試算表後，用這裡檢查編號重複、找不到對應、格式錯誤等問題。試算表選單「TSL PSC → 檢核資料」結果相同。</p><div id="dc-out"></div></div>
  <div class="card"><h2>匯入 NK 船舶資料</h2><p class="sub">貼上或選擇船舶履歷監控系統的 SHIP JSON（survey-status-schema v2），可一次多艘；會更新船隊資料的 NK 欄位與檢驗 / 證書到期。</p><div class="form"><input class="inp" type="file" id="nk-file" accept=".json,application/json"><textarea class="inp mono" id="nk-text" rows="4" placeholder='{"vessel_master": {"imo_number": "9967512", ...}, "certificates": [...], "surveys": [...]}'></textarea><div class="btnrow"><button class="btn primary" type="button" id="nk-go">匯入</button></div></div>
  <h2 style="margin-top:14px">管理公司（Tokyo MOU 績效）</h2><div class="tbl-wrap"><table><thead><tr><th>公司碼</th><th>名稱</th><th>DOC 公司 IMO</th><th>績效</th><th>日期</th><th>備註</th></tr></thead><tbody>${M.companies.map(c => `<tr><td class="mono">${esc(c.code)}</td><td>${esc(c.name)}</td><td class="mono">${esc(c.doc_imo)}</td><td>${esc(c.tmou_performance)}</td><td class="num">${dfmt(c.perf_as_of)}</td><td class="dim" style="font-size:12px">${esc(c.note)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">尚未匯入</td></tr>'}</tbody></table></div></div></div>
  <div class="card" style="margin-bottom:16px"><div class="section-head"><div><h2>MOU 對照表（港口國 → 檢查區域）</h2><p class="sub" style="margin:2px 0 0">新登錄的 PSC 檢查依港口國（與港口）自動帶入 MOU；有填港口的列優先。只有 MOU = Tokyo MOU 的檢查會重算 Tokyo MOU 窗口。Google 試算表的「MOUMap」分頁也可以直接編輯。</p></div><div class="btnrow"><button class="btn" type="button" id="m-new">新增一列</button><button class="btn" type="button" id="m-apply">補標空白的檢查</button><button class="btn" type="button" id="m-apply-all">全部依對照表重新套用</button></div></div>
  ${MM ? `<div class="drop" style="margin-bottom:10px"><div class="frow"><div class="field"><label for="mm-country">港口國</label><input class="inp" id="mm-country" value="${esc(MM.country || '')}" placeholder="UAE"></div><div class="field"><label for="mm-port">港口（選填）</label><input class="inp" id="mm-port" value="${esc(MM.port || '')}" placeholder="空白 = 全國"></div><div class="field"><label for="mm-mou">MOU 區域</label><select id="mm-mou">${PSC.MOU_NAMES.map(m => opt(m, m, MM.mou === m)).join('')}</select></div><div class="field"><label for="mm-also">也是哪些 MOU 成員</label><input class="inp" id="mm-also" value="${esc(MM.also || '')}" placeholder="例如 Indian Ocean MOU"></div></div><div class="field"><label for="mm-note">備註</label><input class="inp" id="mm-note" value="${esc(MM.note || '')}"></div><div class="btnrow"><button class="btn primary" type="button" id="mm-save">儲存</button>${MM._key ? '<button class="btn danger" type="button" id="mm-del">刪除這一列</button>' : ''}<button class="btn ghost" type="button" id="mm-cancel">取消</button></div></div>` : ''}
  <div class="tbl-wrap" style="max-height:420px"><table><thead><tr><th>港口國</th><th>港口</th><th>MOU 區域</th><th>也是成員</th><th class="n">檢查次數</th><th>備註</th></tr></thead><tbody>${M.mouMap.slice().sort((a, b) => { const ua = [...mouUse].filter(([k]) => k.split('|')[0] === a.country).reduce((m, [, n]) => m + n, 0), ub = [...mouUse].filter(([k]) => k.split('|')[0] === b.country).reduce((m, [, n]) => m + n, 0); return ub - ua || (a.country < b.country ? -1 : 1) || (a.port < b.port ? -1 : 1); }).map(r => { const used = [...mouUse].filter(([k]) => k.split('|')[0] === r.country).reduce((m, [, n]) => m + n, 0); return `<tr class="click" data-mm="${esc(r.country + '|' + (r.port || ''))}"><td>${esc(r.country)}</td><td>${esc(r.port || '（全國）')}</td><td>${mouTag(r.mou)}</td><td class="dim">${esc(r.also || '')}</td><td class="n">${r.port ? '' : used || '–'}</td><td class="dim" style="font-size:12px">${esc(r.note || '')}</td></tr>`; }).join('')}</tbody></table></div></div>
  <div class="card"><div class="section-head"><h2>船隊資料（事故編號依此帶入公司碼）</h2><button class="btn" type="button" id="v-new">新增船舶 / 異動</button></div>
  ${VV ? `<div class="drop" style="margin-bottom:10px"><div class="frow">${[['vessel', '船名（英文）'], ['imo', 'IMO'], ['chinese', '中文船名'], ['manager', '管理公司全名'], ['pic', '監管人員 PIC'], ['pic_email', 'PIC Email'], ['series', '船型系列'], ['flag', '船旗']].map(([k, l]) => `<div class="field"><label for="vv-${k}">${l}</label><input class="inp" id="vv-${k}" data-vv="${k}" value="${esc(VV[k] || '')}"></div>`).join('')}
  <div class="field"><label for="vv-company">事故編號公司碼</label><select id="vv-company" data-vv="company">${companies.map(c => opt(c, c, VV.company === c)).join('')}</select></div><div class="field"><label for="vv-from">生效日（改名 / 換管理公司時填）</label><input class="inp" type="date" id="vv-from" data-vv="valid_from" value="${esc(VV.valid_from || '')}"></div><div class="field"><label for="vv-to">失效日</label><input class="inp" type="date" id="vv-to" data-vv="valid_to" value="${esc(VV.valid_to || '')}"></div></div>
  <div class="field"><label for="vv-note">備註</label><input class="inp" id="vv-note" data-vv="note" value="${esc(VV.note || '')}"></div><p class="note" style="margin:0">船舶改名或更換管理公司時：把舊資料填上失效日，再新增一筆同 IMO、填生效日的新資料。</p><div class="btnrow"><button class="btn primary" type="button" id="vv-save">儲存</button><button class="btn ghost" type="button" id="vv-cancel">取消</button></div></div>` : ''}
  <div class="tbl-wrap"><table><thead><tr><th>船名</th><th>中文</th><th>IMO</th><th>公司碼</th><th>管理公司</th><th>PIC</th><th>生效</th><th>失效</th><th>備註</th></tr></thead><tbody>${M.vessels.slice().sort((a, b) => a.vessel < b.vessel ? -1 : 1).map((x, i) => `<tr class="click" data-vi="${M.vessels.indexOf(x)}"><td>${esc(x.vessel)}</td><td>${esc(x.chinese)}</td><td class="mono">${esc(x.imo)}</td><td class="mono">${esc(x.company)}</td><td>${esc(x.manager || x.management)}</td><td>${esc(x.pic)}</td><td class="num">${dfmt(x.valid_from)}</td><td class="num">${dfmt(x.valid_to)}</td><td class="dim" style="font-size:12px">${esc(x.note)}</td></tr>`).join('')}</tbody></table></div></div>`;
  $('#dc-run').addEventListener('click', () => {
    const issues = PSC.validateData({ inspections: RAW.inspections, deficiencies: RAW.deficiencies, documents: RAW.documents, incidents: RAW.incidents, vessels: RAW.vessels, mouMap: M.mouMap });
    $('#dc-out').innerHTML = issues.length ? `<p class="flag">${issues.length} 個問題</p><div class="tbl-wrap"><table><thead><tr><th>等級</th><th>分頁</th><th>鍵值</th><th>問題</th></tr></thead><tbody>${issues.map(i => `<tr><td>${esc(i.level)}</td><td>${esc(i.table)}</td><td class="tn" style="font-size:11.5px;white-space:normal">${esc(i.key)}</td><td>${esc(i.problem)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="note">沒有發現問題</p>';
  });
  $('#nk-file').addEventListener('change', async e => { const f = e.target.files[0]; if (f) $('#nk-text').value = await f.text(); });
  $('#nk-go').addEventListener('click', () => { let j; try { j = JSON.parse($('#nk-text').value); } catch (e) { toast('JSON 格式不正確：' + e.message); return; } run(async () => { const r = await api('importNK', { ships: Array.isArray(j) ? j : (j.ships || [j]) }); await reload(); toast('已匯入：' + r.imported.join('、'), 7000); }, $('#nk-go')); });
  $('#u-new').addEventListener('click', () => { S.adm.user = { email: '', name: '', role: 'editor', active: 'Y' }; render(); });
  v.querySelectorAll('[data-u]').forEach(tr => tr.addEventListener('click', () => { S.adm.user = Object.assign({ _edit: true }, M.users.find(u => u.email === tr.dataset.u)); render(); }));
  if (U) {
    $('#u-cancel').addEventListener('click', () => { S.adm.user = null; render(); });
    $('#u-save').addEventListener('click', () => { const row = { email: $('#u-email').value.trim().toLowerCase(), name: $('#u-name').value, role: $('#u-role').value, active: $('#u-active').value }; if (!/@/.test(row.email)) { toast('請輸入正確的 Email'); return; } run(async () => { await api('saveUser', row); S.adm.user = null; await reload(); toast('已儲存 ' + row.email); }, $('#u-save')); });
  }
  $('#s-save').addEventListener('click', () => run(async () => {
    await api('saveSetting', { key: 'tier2_def_threshold', value: $('#s-th').value, note: '未留置但缺失項數達此數量即升為 Tier 2' });
    await api('saveSetting', { key: 'tier2_on_ism', value: $('#s-ism').value, note: '開出 ISM 缺失（代碼 15xxx）即升為 Tier 2' });
    await api('saveSetting', { key: 'google_client_id', value: $('#s-cid').value.trim(), note: 'Google 登入用 OAuth Client ID（與前端 config.js 相同）' });
    for (const [k, id] of [['bribe_roles', '#s-br'], ['window_alert_days', '#s-ad'], ['alert_emails', '#s-mail'], ['tmou_white_flags', '#s-white']]) {
      const d = PSC.DEFAULT_SETTINGS.find(x => x.key === k); await api('saveSetting', { key: k, value: $(id).value.trim(), note: d ? d.note : '' });
    }
    await reload(); toast('設定已儲存');
  }, $('#s-save')));
  $('#v-new').addEventListener('click', () => { S.adm.vessel = { company: 'FLEET' }; render(); });
  $('#m-new').addEventListener('click', () => { S.adm.mou = { mou: PSC.TOKYO }; render(); });
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
  v.innerHTML = `<div class="callout" style="background:var(--crit-soft);color:var(--crit)">機密資料：只有 ${esc(M.settings.bribe_roles || 'admin,editor')} 角色看得到。統計範圍依上方篩選條件。</div>
  <div class="kpis"><div class="kpi"><div class="k">檢查次數</div><div class="v num">${fmt(A.n)}</div><div class="d">篩選範圍</div></div><div class="kpi crit"><div class="k">發生次數</div><div class="v num">${fmt(A.occ)}</div><div class="d">發生率 ${pct(A.occ, A.n)}${A.refused ? `，其中拒付 ${A.refused}` : ''}</div></div><div class="kpi"><div class="k">現金合計</div><div class="v num">${usd(A.sum)}</div><div class="d">${A.paidN} 次付現</div></div><div class="kpi"><div class="k">單次金額</div><div class="v num">${usd(A.med)}</div><div class="d">中位數；範圍 ${A.min != null ? usd(A.min) + ' – ' + usd(A.max) : '—'}</div></div><div class="kpi"><div class="k">含香菸 / 實物</div><div class="v num">${fmt(A.kind)}</div><div class="d">次</div></div></div>
  <div class="grid g2" style="margin-bottom:16px"><div class="card"><h2>依港口國</h2><p class="sub">發生率 = 有付出或被索取的檢查 ÷ 該國檢查次數；點一下即篩選</p><div class="tbl-wrap"><table id="t-bc">${head.replace('<th></th>', '<th>港口國</th>')}<tbody>${byC.map(([k, a]) => row(k, a, true)).join('') || '<tr><td colspan="9" class="empty">篩選範圍內沒有紀錄</td></tr>'}</tbody></table></div></div>
  <div class="card"><h2>依年度</h2><p class="sub">看趨勢是否改善</p><div class="tbl-wrap"><table>${head.replace('<th></th>', '<th>年度</th>')}<tbody>${byY.map(([k, a]) => row(k, a)).join('')}</tbody></table></div>
  <h2 style="margin-top:16px">談判價碼</h2>${A.dem.length ? `<div class="tbl-wrap"><table><thead><tr><th>日期</th><th>船舶 / 港口</th><th class="n">要求</th><th class="n">實付</th><th class="n">降幅</th></tr></thead><tbody>${A.dem.map(I => `<tr><td class="num">${dfmt(I.date)}</td><td>${esc(I.vessel)}<div class="dim">${esc(I.port)}</div></td><td class="n">${usd(+I.bribe_demanded_usd)}</td><td class="n">${usd(+I.bribe_paid_usd || 0)}</td><td class="n">${pct(+I.bribe_demanded_usd - (+I.bribe_paid_usd || 0), +I.bribe_demanded_usd)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="note">歷史資料只記錄實付金額。之後登錄 PSC 檢查時填「對方要求金額」，這裡就會顯示開價與實付的差距。</p>'}</div></div>
  <div class="card" style="margin-bottom:16px"><h2>依 MOU 區域</h2><p class="sub">同一區域的港口國索賄習慣往往相近</p><div class="tbl-wrap"><table>${head.replace('<th></th>', '<th>MOU 區域</th>')}<tbody>${byMou.map(([k, a]) => row(k, a)).join('') || '<tr><td colspan="9" class="empty">篩選範圍內沒有紀錄</td></tr>'}</tbody></table></div></div>
  <div class="card" style="margin-bottom:16px"><h2>依港口（前 15）</h2><div class="tbl-wrap"><table>${head.replace('<th></th>', '<th>港口</th>')}<tbody>${byP.slice(0, 15).map(([k, a]) => row(k, a)).join('')}</tbody></table></div></div>
  <div class="card"><div class="section-head"><h2>紀錄明細（${occList.length}）</h2><button class="btn" type="button" id="b-copy">複製結果（CSV）</button></div><div class="tbl-wrap"><table><thead><tr><th>日期</th><th>船舶</th><th>港口 / 港口國</th><th>檢查結果</th><th class="n">要求</th><th class="n">實付</th><th>香菸</th><th>實物</th><th>原始紀錄 / 說明</th></tr></thead><tbody>${occList.map(I => `<tr class="click" data-open="${esc(I.insp_id)}"><td class="num">${dfmt(I.date)}</td><td>${esc(I.vessel)}</td><td>${esc(I.port)}<div class="dim">${esc(I.country)}</div>${mouTag(I.mou)}</td><td>${I.defs.length ? I.defs.length + ' 項缺失' : '<span class="pill nil">NIL</span>'}</td><td class="n">${I.bribe_demanded_usd ? usd(+I.bribe_demanded_usd) : '—'}</td><td class="n">${Number(I.bribe_paid_usd) > 0 ? usd(+I.bribe_paid_usd) : '—'}</td><td>${esc(I.bribe_cig || '—')}</td><td>${esc(I.bribe_goods || '—')}</td><td class="dim" style="font-size:12px">${esc(I.bribe_raw)}${I.bribe_note ? `<div class="flag">${esc(I.bribe_note)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
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
function clearDetail() { S.caseId = null; S.caseMode = null; S.incId = null; S.closing = false; S.incEdit = false; }
function render() {
  if (!M) return;
  hideTip();
  const detail = S.caseMode || S.caseId || S.incId;
  $('#filters').hidden = S.tab === 'admin' || ((S.tab === 'inspections' || S.tab === 'incidents') && detail);
  const VIS = { window: ['#f-mgmt', '#f-vessel'], bribe: ['#f-years', '#f-mgmt', '#f-vessel', '#f-mou', '#f-country'], incidents: ['#f-years', '#f-mgmt', '#f-vessel', '#f-q'], 'inc-overview': ['#f-years', '#f-mgmt', '#f-vessel', '#f-q'] }[S.tab];
  ['#f-years', '#f-mgmt', '#f-vessel', '#f-mou', '#f-country', '#f-cat', '#f-q'].forEach(sel => { $(sel).hidden = !!VIS && !VIS.includes(sel); });
  syncFilterUI();
  const v = $('#view');
  ({ 'inc-overview': vIncOverview, incidents: vIncidents, overview: vOverview, inspections: vInspections, records: vRecords, vessels: vVessels, codes: vCodes, window: vWindow, bribe: vBribe, admin: vAdmin }[S.tab] || vIncOverview)(v);
}
function header() {
  $('#m-asof').textContent = dfmt(M.asof);
  const io = M.incidents.filter(x => x.status === ST.OPEN).length, ov = M.incidents.filter(x => x.over).length;
  $('#m-inc').textContent = `${fmt(M.incidents.length)} 件 · 進行中 ${io}${ov ? ` · 逾期 ${ov}` : ''}`;
  $('#m-psc').textContent = `${fmt(M.insp.length)} 次檢查 · ${fmt(M.recs.length)} 項缺失`;
  $('#sec-admin').hidden = !can('admin');
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

/* ---------- wire global controls ---------- */
document.querySelectorAll('.sec').forEach(b => b.addEventListener('click', () => { const sec = b.dataset.sec; clearDetail(); S.page = 0; setTab(S.last[sec] || SECTIONS[sec].tabs[0][0]); }));
$('#f-years').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; const y = +b.dataset.y; S.years.has(y) ? S.years.delete(y) : S.years.add(y); S.page = 0; render(); });
[['#f-mgmt', 'mgmt'], ['#f-vessel', 'vessel'], ['#f-mou', 'mou'], ['#f-country', 'country'], ['#f-cat', 'cat']].forEach(([s, k]) => $(s).addEventListener('change', e => { S[k] = e.target.value; S.page = 0; if (k === 'vessel' && S.tab === 'vessels') S.profile = e.target.value || null; render(); }));
let qT; $('#f-q').addEventListener('input', e => { clearTimeout(qT); qT = setTimeout(() => { S.q = e.target.value.trim(); S.page = 0; render(); }, 200); });
$('#f-clear').addEventListener('click', () => { S.years = new Set(); S.mgmt = S.vessel = S.mou = S.country = S.cat = S.code = S.q = ''; S.cStatus = ''; S.incF = { co: '', tier: '', type: '', status: '', src: '' }; S.page = 0; render(); });
$('#f-note').addEventListener('click', e => { const b = e.target.closest('[data-clear]'); if (b) { S[b.dataset.clear] = ''; S.page = 0; render(); } });
let rT; addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { if (S.tab === 'overview' && M) monthChart(current()); if (S.tab === 'inc-overview' && M) incMonth($('#ch-inc-month'), incList()); }, 150); });

/* ---------- boot ---------- */
$('#org').textContent = CFG.orgName + ' · Port State Control';
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
