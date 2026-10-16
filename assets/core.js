/*
 * TSL PSC System — shared core logic
 * Runs unchanged in the browser (demo mode) and in Google Apps Script (copied as core.gs).
 * Implements the TSL Incident Tracking Number System v2.0 (2026-02-12) for PSC cases:
 *   [COMPANY]-[VESSEL]-[YYYYMMDD]-[TIER][TYPE]-[SEQ]
 * plus PSC inspection IDs, deficiency IDs and document filing names.
 * Plain ES2017 (no modules, no optional chaining) so Apps Script V8 accepts it.
 */
var PSC = (function () {
  'use strict';

  var VERSION = '1.8.0';

  /* ---------------- reference data ---------------- */
  var TIERS = {
    '1': { en: 'Major', zh: '第一級（重大）', flashH: 2, initialH: 24, rcaD: 14 },
    '2': { en: 'Moderate', zh: '第二級（中等）', flashH: 2, initialH: 24, rcaD: 14 },
    '3': { en: 'Minor', zh: '第三級（輕微）', flashH: 12, initialH: 48, rcaD: 21 }
  };
  var TYPES = {
    M: '機械 Machinery', N: '航行 Navigation', C: '貨物 Cargo', P: '人員 Personnel', E: '環境 Environmental',
    S: '保安 Security', F: '火災 Fire', T: '結構 sTructural', O: '其他 Others'
  };
  var PSC_TYPE = 'O';
  var CATEGORIES = {
    '01': '證書與文件', '02': '結構狀況', '03': '水密 / 風雨密', '04': '應急系統', '05': '無線電通訊', '06': '貨物作業',
    '07': '防火安全', '08': '警報', '09': '工作與生活條件', '10': '航行安全', '11': '救生設備', '12': '危險貨物',
    '13': '推進與輔助機械', '14': '防止污染', '15': 'ISM 安全管理', '16': 'ISPS 保全', '18': 'MLC 2006 海事勞工', '99': '其他'
  };
  var ACTIONS = {
    '10': '缺失已改正', '15': '下一港改正', '16': '14 天內改正', '17': '開航前改正', '18': '3 個月內改正（ISM 不符合事項）',
    '21': '依 PSC 報告（ISM 矯正措施）', '30': '留置依據', '99': '其他（依報告說明）'
  };
  var DOC_TYPES = [
    { code: 'PSC-A', name: 'PSC 檢查報告（Form A）', psc: true },
    { code: 'PSC-B', name: 'PSC 缺失清單（Form B）', psc: true },
    { code: 'RPT', name: '船方事故報告', inc: true },
    { code: 'VIR', name: '訪船報告（VIR / 登輪報告）', visit: true },
    { code: 'RECT', name: '船舶矯正報告' },
    { code: 'EVID', name: '矯正佐證（照片 / 證書）' },
    { code: 'FLASH', name: '立即通報（Template 1）' },
    { code: 'INIT', name: '正式初步報告（Template 2）' },
    { code: 'UPD', name: '進度更新（Template 3）' },
    { code: 'RCA', name: '最終調查報告 RCA（Template 4）' },
    { code: 'CLOSE', name: '結案確認（Template 5C）' },
    { code: 'CORR', name: '往來信件' },
    { code: 'OTH', name: '其他' }
  ];
  var COMPANY_TO_MGMT = { FLEET: 'FLEET', VSHIPS: 'V-SHIP', BSM: 'BSM', TSL: 'SELF', TEH: 'SELF' };
  var STATUS = { OPEN: '進行中', CLOSED: '已完成', NIL: 'NIL', HIST: '歷史資料', MISSING: '未立案', VOID: '作廢' };

  /* ---------------- PSC regimes (MOU) ---------------- */
  var TOKYO = 'Tokyo MOU';
  var MOU_NAMES = ['Tokyo MOU', 'Paris MOU', 'Indian Ocean MOU', 'Abuja MOU', 'Riyadh MOU', 'Mediterranean MOU', 'Black Sea MOU',
    'Viña del Mar', 'Caribbean MOU', 'USCG', 'Taiwan MPB'];
  /** 國名別名 → 系統用名（港口國欄位一律用系統用名） */
  var COUNTRY_ALIAS = { 'UNITED ARAB EMIRATES': 'UAE', 'U.A.E.': 'UAE', 'KOREA': 'SOUTH KOREA', 'REPUBLIC OF KOREA': 'SOUTH KOREA', 'KOREA, REPUBLIC OF': 'SOUTH KOREA',
    'VIET NAM': 'VIETNAM', 'UNITED STATES': 'USA', 'UNITED STATES OF AMERICA': 'USA', 'U.S.A.': 'USA', 'US': 'USA', 'IVORY COAST': "COTE D'IVOIRE",
    "CÔTE D'IVOIRE": "COTE D'IVOIRE", 'P.R. CHINA': 'CHINA', "PEOPLE'S REPUBLIC OF CHINA": 'CHINA', 'PRC': 'CHINA', 'RUSSIAN FEDERATION': 'RUSSIA',
    'HONG KONG, CHINA': 'HONG KONG', 'HONGKONG': 'HONG KONG', 'KSA': 'SAUDI ARABIA', 'UK': 'UNITED KINGDOM', 'TAIWAN, CHINA': 'TAIWAN', 'R.O.C.': 'TAIWAN' };
  function normCountry(c) { var k = up(c).replace(/’/g, "'"); return COUNTRY_ALIAS[k] || k; }
  /**
   * 港口國 → 檢查體系預設對照（寫入 MOUMap 分頁，組員可增修）。
   * port 欄空白 = 全國適用；有填港口的列優先（例如加拿大大西洋岸港口屬 Paris MOU）。
   * also = 同時是哪些 MOU 的成員（只做說明，統計用 mou 欄）。
   */
  var OK_ = '已核對 2026-10', CHK_ = '預設值，請依該 MOU 官網核對';
  var DEFAULT_MOU = [
    ['AUSTRALIA', '', TOKYO, 'Indian Ocean MOU', OK_], ['CANADA', '', TOKYO, 'Paris MOU', OK_ + '；太平洋岸港口'],
    ['CANADA', 'HALIFAX', 'Paris MOU', TOKYO, '大西洋岸港口報 Paris MOU'], ['CANADA', 'MONTREAL', 'Paris MOU', TOKYO, '大西洋 / 聖勞倫斯河港口報 Paris MOU'],
    ['CHILE', '', TOKYO, 'Viña del Mar', OK_], ['CHINA', '', TOKYO, '', OK_], ['FIJI', '', TOKYO, '', OK_], ['HONG KONG', '', TOKYO, '', OK_],
    ['INDONESIA', '', TOKYO, '', OK_], ['JAPAN', '', TOKYO, '', OK_], ['SOUTH KOREA', '', TOKYO, '', OK_], ['MALAYSIA', '', TOKYO, '', OK_],
    ['MARSHALL ISLANDS', '', TOKYO, '', OK_], ['MEXICO', '', TOKYO, 'Viña del Mar', OK_ + '；墨西哥灣港口請依 PSC 報告抬頭確認'],
    ['NEW ZEALAND', '', TOKYO, '', OK_], ['PANAMA', '', TOKYO, 'Viña del Mar', OK_], ['PAPUA NEW GUINEA', '', TOKYO, '', OK_],
    ['PERU', '', TOKYO, 'Viña del Mar', OK_], ['PHILIPPINES', '', TOKYO, '', OK_], ['RUSSIA', '', TOKYO, 'Black Sea MOU', OK_ + '；遠東港口'],
    ['RUSSIA', 'NOVOROSSIYSK', 'Black Sea MOU', TOKYO, '黑海港口'], ['SINGAPORE', '', TOKYO, '', OK_], ['THAILAND', '', TOKYO, '', OK_],
    ['VANUATU', '', TOKYO, '', OK_], ['VIETNAM', '', TOKYO, '', OK_],
    ['INDIA', '', 'Indian Ocean MOU', '', OK_], ['TANZANIA', '', 'Indian Ocean MOU', '', OK_], ['SRI LANKA', '', 'Indian Ocean MOU', '', OK_],
    ['BANGLADESH', '', 'Indian Ocean MOU', '', OK_], ['MYANMAR', '', 'Indian Ocean MOU', '', OK_], ['KENYA', '', 'Indian Ocean MOU', '', OK_],
    ['MOZAMBIQUE', '', 'Indian Ocean MOU', '', OK_], ['MAURITIUS', '', 'Indian Ocean MOU', '', OK_], ['MALDIVES', '', 'Indian Ocean MOU', '', OK_],
    ['IRAN', '', 'Indian Ocean MOU', '', OK_], ['YEMEN', '', 'Indian Ocean MOU', '', OK_], ['SUDAN', '', 'Indian Ocean MOU', '', OK_],
    ['ERITREA', '', 'Indian Ocean MOU', '', OK_], ['MADAGASCAR', '', 'Indian Ocean MOU', '', OK_], ['SEYCHELLES', '', 'Indian Ocean MOU', '', OK_],
    ['COMOROS', '', 'Indian Ocean MOU', '', OK_], ['SOUTH AFRICA', '', 'Indian Ocean MOU', 'Abuja MOU', OK_],
    ['UAE', '', 'Riyadh MOU', '', OK_], ['SAUDI ARABIA', '', 'Riyadh MOU', '', OK_], ['BAHRAIN', '', 'Riyadh MOU', '', OK_],
    ['KUWAIT', '', 'Riyadh MOU', '', OK_], ['QATAR', '', 'Riyadh MOU', '', OK_], ['OMAN', '', 'Riyadh MOU', 'Indian Ocean MOU', OK_ + '；兩邊都是成員，請依 PSC 報告抬頭'],
    ['TOGO', '', 'Abuja MOU', '', OK_], ["COTE D'IVOIRE", '', 'Abuja MOU', '', OK_], ['NIGERIA', '', 'Abuja MOU', '', OK_],
    ['GHANA', '', 'Abuja MOU', '', OK_], ['BENIN', '', 'Abuja MOU', '', OK_], ['CAMEROON', '', 'Abuja MOU', '', OK_], ['ANGOLA', '', 'Abuja MOU', '', OK_],
    ['CONGO', '', 'Abuja MOU', '', OK_], ['GABON', '', 'Abuja MOU', '', OK_], ['SENEGAL', '', 'Abuja MOU', '', OK_], ['GUINEA', '', 'Abuja MOU', '', OK_],
    ['LIBERIA', '', 'Abuja MOU', '', OK_], ['SIERRA LEONE', '', 'Abuja MOU', '', OK_], ['MAURITANIA', '', 'Abuja MOU', '', OK_],
    ['EQUATORIAL GUINEA', '', 'Abuja MOU', '', OK_], ['GAMBIA', '', 'Abuja MOU', '', OK_], ['CAPE VERDE', '', 'Abuja MOU', '', OK_],
    ['USA', '', 'USCG', '', '美國不屬於任何 MOU，由 USCG 依自己的制度執行'], ['TAIWAN', '', 'Taiwan MPB', '', '台灣不屬於任何 MOU，由交通部航港局執行'],
    ['NETHERLANDS', '', 'Paris MOU', '', CHK_], ['BELGIUM', '', 'Paris MOU', '', CHK_], ['GERMANY', '', 'Paris MOU', '', CHK_], ['FRANCE', '', 'Paris MOU', '', CHK_],
    ['SPAIN', '', 'Paris MOU', '', CHK_], ['ITALY', '', 'Paris MOU', 'Mediterranean MOU', CHK_], ['UNITED KINGDOM', '', 'Paris MOU', '', CHK_],
    ['GREECE', '', 'Paris MOU', '', CHK_], ['PORTUGAL', '', 'Paris MOU', '', CHK_], ['MALTA', '', 'Paris MOU', 'Mediterranean MOU', CHK_],
    ['CYPRUS', '', 'Paris MOU', 'Mediterranean MOU', CHK_], ['POLAND', '', 'Paris MOU', '', CHK_], ['SWEDEN', '', 'Paris MOU', '', CHK_],
    ['DENMARK', '', 'Paris MOU', '', CHK_], ['NORWAY', '', 'Paris MOU', '', CHK_], ['FINLAND', '', 'Paris MOU', '', CHK_],
    ['ROMANIA', '', 'Paris MOU', 'Black Sea MOU', CHK_], ['BULGARIA', '', 'Paris MOU', 'Black Sea MOU', CHK_], ['TURKEY', '', 'Mediterranean MOU', 'Black Sea MOU', CHK_],
    ['EGYPT', '', 'Mediterranean MOU', '', CHK_], ['ISRAEL', '', 'Mediterranean MOU', '', CHK_], ['MOROCCO', '', 'Mediterranean MOU', '', CHK_],
    ['BRAZIL', '', 'Viña del Mar', '', CHK_], ['ARGENTINA', '', 'Viña del Mar', '', CHK_], ['COLOMBIA', '', 'Viña del Mar', '', CHK_],
    ['ECUADOR', '', 'Viña del Mar', '', CHK_], ['URUGUAY', '', 'Viña del Mar', '', CHK_], ['JAMAICA', '', 'Caribbean MOU', '', CHK_]
  ].map(function (r) { return { country: r[0], port: r[1], mou: r[2], also: r[3], note: r[4] }; });
  /** 依對照表判定一次檢查屬於哪個 MOU：先找「國家＋港口」，再找國家 */
  function resolveMOU(map, country, port) {
    var c = normCountry(country), p = up(port), rows = (map && map.length ? map : DEFAULT_MOU).filter(function (r) { return normCountry(r.country) === c; });
    var hit = rows.filter(function (r) { return s(r.port) && (p === up(r.port) || p.indexOf(up(r.port)) >= 0); })[0] || rows.filter(function (r) { return !s(r.port); })[0];
    return hit ? { mou: s(hit.mou), also: s(hit.also), note: s(hit.note), found: true } : { mou: '', also: '', note: '', found: false };
  }
  /** 這次檢查會不會重算 Tokyo MOU 窗口：看 MOU 欄；MOU 欄空白才退回用成員國清單 */
  function isTokyo(insp, members) {
    var m = s(insp.mou);
    if (m && m !== 'V') return up(m) === up(TOKYO);
    return (members || []).indexOf(normCountry(insp.country)) >= 0;
  }
  /* ---------------- incident rules (3-TSTB-VSL-P002 第 2 版) — editable in the Rules sheet ----------------
   * 規範不寫死：通報分級與時限、4.1 重大事件分級、事故性質代碼、參數都存在 Rules 分頁，
   * 依 valid_from 分版本；每件事故依「事故日期當時有效」的規範計算。Rules 分頁空白時才用下面的預設值。 */
  var RULESET_DEFAULT = 'P002 第 2 版（草稿）';
  var DEFAULT_RULES = [
    { kind: 'tier', code: '1', name: '第一級', name_en: 'Tier 1 - Major', flash_h: '2', initial_h: '24', progress_d: '7', rca_d: '14', criteria: '人員死亡、船舶全損、重大污染、擱淺、碰撞，或主機失效致影響航行安全', ref: '4.2.1、6.4.2、附件 8.3' },
    { kind: 'tier', code: '2', name: '第二級', name_en: 'Tier 2 - Moderate', flash_h: '2', initial_h: '24', progress_d: '7', rca_d: '14', criteria: '人員嚴重傷害、重要設備故障、港口國管制扣船、輕微污染或港口罰款', ref: '4.2.2、6.4.2、附件 8.3' },
    { kind: 'tier', code: '3', name: '第三級', name_en: 'Tier 3 - Minor', flash_h: '12', initial_h: '48', progress_d: '', rca_d: '21', criteria: '輕微傷害、一般設備故障、虛驚事件（Near Miss）或港口國管制缺失', ref: '4.2.3、6.4.2、附件 8.3' },
    { kind: 'major', code: '1', name: '一級狀況', ert_chair: '總經理', min_tier: '1', loss_usd_min: '1000000', deaths_min: '3', criteria: '海損約 100 萬美金以上或死亡 3 人以上；船隻被盜匪劫持；危險品災害或海洋污染擴大到海洋且難以控制', ref: '4.1.1、4.2.4' },
    { kind: 'major', code: '2', name: '二級狀況', ert_chair: '督導副總', min_tier: '2', loss_usd_min: '500000', deaths_min: '1', criteria: '海損約 50–100 萬美金或死亡 1–3 人；船隻遭盜匪攻擊有財產損失或人員傷亡；污染擴大到海洋但已即時控制', ref: '4.1.2、4.2.4' },
    { kind: 'major', code: '3', name: '三級狀況', ert_chair: '船務部主管', min_tier: '3', delay_h_min: '48', injury_min: '1', criteria: '海損約 50 萬美金以下且延誤船期 48 小時以上，或有人受傷；曾遭盜匪攻擊無損失；污染在船上已控制', ref: '4.1.3、4.2.4' },
    { kind: 'type', code: 'M', name: '機械', name_en: 'Machinery', criteria: '主機、輔機、推進系統故障', ref: '4.3' },
    { kind: 'type', code: 'N', name: '航行', name_en: 'Navigation', criteria: '碰撞、擱淺、航行設備故障', ref: '4.3' },
    { kind: 'type', code: 'C', name: '貨物', name_en: 'Cargo', criteria: '貨損、貨差、繫固問題', ref: '4.3' },
    { kind: 'type', code: 'P', name: '人員', name_en: 'Personnel', criteria: '工傷、疾病、失蹤', ref: '4.3' },
    { kind: 'type', code: 'E', name: '環境', name_en: 'Environmental', criteria: '油污、垃圾、有害物質洩漏', ref: '4.3' },
    { kind: 'type', code: 'S', name: '保安', name_en: 'Security', criteria: '海盜、偷渡、走私', ref: '4.3' },
    { kind: 'type', code: 'F', name: '火災', name_en: 'Fire', criteria: '火災、爆炸、危險品事故', ref: '4.3' },
    { kind: 'type', code: 'T', name: '結構', name_en: 'sTructural', criteria: '船體、艙蓋、管系破損', ref: '4.3' },
    { kind: 'type', code: 'O', name: '其他', name_en: 'Others', criteria: '無法歸類之事故；PSC 檢查一律用 O', ref: '4.3' },
    { kind: 'param', code: 'ontime_target', name: '通報時限準時率目標（%）', value: '95', ref: '委外管理評比表、6.5.5' },
    { kind: 'param', code: 'progress_major_d', name: '4.1 重大事件進度更新最長間隔（日）', value: '7', ref: '6.4.2.3' },
    { kind: 'param', code: 'retention_years', name: '紀錄保存年限（年）', value: '5', ref: '6.7' },
    { kind: 'param', code: 'close_docs', name: '非 PSC 事故結案前須歸檔的文件（任一）', value: 'RCA,CLOSE', ref: '6.6.4.4' }
  ].map(function (r) {
    var o = { rule_set: RULESET_DEFAULT, valid_from: '2000-01-01', active: 'Y', note: '' };
    ['kind', 'code', 'name', 'name_en', 'flash_h', 'initial_h', 'progress_d', 'rca_d', 'loss_usd_min', 'deaths_min', 'delay_h_min', 'injury_min', 'ert_chair', 'min_tier', 'value', 'criteria', 'ref'].forEach(function (c) { o[c] = r[c] === undefined ? '' : r[c]; });
    return o;
  });
  function ruleRows(rows) { return rows && rows.length ? rows : DEFAULT_RULES; }
  /** 某日期有效的規範：每個 kind+code 取 valid_from ≤ 日期 中最新的一列 */
  function rulesAt(rows, date) {
    var d = isoDate(date) || '9999-12-31', pick = {};
    ruleRows(rows).forEach(function (r) {
      if (up(r.active) === 'N') return;
      var vf = isoDate(r.valid_from) || '2000-01-01';
      if (vf > d) return;
      var k = s(r.kind) + '|' + up(r.code);
      if (!pick[k] || vf >= (isoDate(pick[k].valid_from) || '2000-01-01')) pick[k] = r;
    });
    var out = { set: '', tiers: {}, major: {}, types: {}, params: {} };
    Object.keys(pick).forEach(function (k) {
      var r = pick[k], code = up(r.code);
      if (r.kind === 'tier') out.tiers[code] = r; else if (r.kind === 'major') out.major[code] = r;
      else if (r.kind === 'type') out.types[code] = r; else if (r.kind === 'param') out.params[s(r.code)] = s(r.value);
      if (!out.set || (isoDate(r.valid_from) || '') > (out.setFrom || '')) { out.set = s(r.rule_set); out.setFrom = isoDate(r.valid_from) || ''; }
    });
    if (!Object.keys(out.tiers).length) DEFAULT_RULES.filter(function (r) { return r.kind === 'tier'; }).forEach(function (r) { out.tiers[r.code] = r; });
    if (!Object.keys(out.types).length) DEFAULT_RULES.filter(function (r) { return r.kind === 'type'; }).forEach(function (r) { out.types[r.code] = r; });
    return out;
  }
  function numOr(v, d) { var n = parseFloat(s(v)); return isNaN(n) ? d : n; }
  /** 依規範計算各階段期限（日期；時數換算為事故日起算的日曆日，2 / 12 小時 = 當日） */
  function ruleDeadlines(date, tier, R) {
    var t = (R && R.tiers[s(tier)]) || (R && R.tiers['3']) || null;
    if (!t || !isoDate(date)) return deadlines(date, tier);
    return { flash_due: addDays(date, Math.floor(numOr(t.flash_h, 2) / 24)), initial_due: addDays(date, Math.floor(numOr(t.initial_h, 24) / 24)), rca_due: addDays(date, numOr(t.rca_d, 14)) };
  }
  /** 依 4.1 數值條件建議重大事件等級（劫持、污染等文字條件須人工判斷）；數字包含本數（7.2） */
  function suggestMajor(inc, R) {
    var loss = numOr(inc.loss_usd, 0), deaths = numOr(inc.deaths, 0), inj = numOr(inc.injuries, 0), delay = numOr(inc.delay_h, 0);
    var lv = ['1', '2', '3'];
    for (var i = 0; i < lv.length; i++) {
      var m = R.major[lv[i]]; if (!m) continue;
      var why = [];
      if (s(m.loss_usd_min) && loss >= numOr(m.loss_usd_min, Infinity)) why.push('海損 USD ' + loss + ' ≥ ' + m.loss_usd_min);
      if (s(m.deaths_min) && deaths >= numOr(m.deaths_min, Infinity)) why.push('死亡 ' + deaths + ' 人 ≥ ' + m.deaths_min);
      if (s(m.delay_h_min) && delay >= numOr(m.delay_h_min, Infinity)) why.push('延誤 ' + delay + ' 小時 ≥ ' + m.delay_h_min);
      if (s(m.injury_min) && inj >= numOr(m.injury_min, Infinity)) why.push('受傷 ' + inj + ' 人');
      if (why.length) return { level: lv[i], reasons: why, chair: s(m.ert_chair), min_tier: s(m.min_tier) };
    }
    return { level: '', reasons: [], chair: '', min_tier: '' };
  }
  /** 各階段報告：期限、實際提交日（欄位優先，其次為最早歸檔文件的上傳日）、狀態 */
  var STAGES = [{ k: 'flash', doc: 'FLASH', label: '立即通報' }, { k: 'initial', doc: 'INIT', label: '初步報告' }, { k: 'rca', doc: 'RCA', label: '最終調查報告 RCA' }];
  function reportTimeliness(inc, docs, today) {
    var t = isoDate(today), fm = yes(inc.force_majeure);
    // 從事故登錄器匯入、完全沒有填報日期也沒有文件的舊事故：標為「未填報」，不算逾期，也不計入準時率
    var untracked = (s(inc.source) === 'REGISTER' || s(inc.created_by) === 'import') && !STAGES.some(function (st) { return isoDate(inc[st.k + '_at']); }) && !(docs || []).some(function (d) { return STAGES.some(function (st) { return d.doc_type === st.doc; }); });
    return STAGES.map(function (st) {
      var due = s(inc[st.k + '_due']), at = isoDate(inc[st.k + '_at']), src = at ? '填報' : '';
      if (!at) { var ds = (docs || []).filter(function (d) { return d.doc_type === st.doc; }).map(function (d) { return isoDate(d.uploaded_at); }).filter(Boolean).sort(); if (ds.length) { at = ds[0]; src = '文件'; } }
      var state = at ? (due && at > due ? 'late' : 'ontime') : (due && t > due ? 'overdue' : 'pending');
      if (fm && state !== 'ontime') state = 'exempt';
      if (untracked && state !== 'ontime') state = 'untracked';
      return { stage: st.k, label: st.label, due: due, at: at, src: src, state: state };
    });
  }
  /** 事故的規範檢核（顯示在事故頁與資料檢核） */
  function incidentChecks(inc, docs, rulesRows, today) {
    var R = rulesAt(rulesRows, inc.date), out = [], t = isoDate(today);
    if (s(inc.status) === STATUS.VOID) return out;
    var m = R.major[s(inc.major_level)];
    if (m && s(m.min_tier) && TIERS[s(inc.tier)] && Number(inc.tier) > Number(m.min_tier)) out.push('4.2.4.2：屬 4.1 ' + m.name + '，通報分級不得低於第' + m.min_tier + '級（目前 Tier ' + inc.tier + '）');
    if (m && !yes(inc.ert)) out.push('4.2.4.1：屬 4.1 ' + m.name + '，應成立緊急應變小組（由' + m.ert_chair + '主持）');
    var sug = suggestMajor(inc, R);
    if (sug.level && (!s(inc.major_level) || Number(sug.level) < Number(inc.major_level))) out.push('4.1：數值符合' + (R.major[sug.level] || {}).name + '（' + sug.reasons.join('、') + '），請確認是否為重大事件');
    if (s(inc.status) === STATUS.OPEN) {
      reportTimeliness(inc, docs, t).forEach(function (x) { if (x.state === 'overdue') out.push(x.label + '已逾期（期限 ' + x.due + '）'); });
      var pd = m ? numOr(R.params.progress_major_d, 7) : numOr((R.tiers[s(inc.tier)] || {}).progress_d, 0);
      if (pd && isoDate(inc.date)) {
        var lastUpd = [isoDate(inc.progress_at)].concat((docs || []).filter(function (d) { return d.doc_type === 'UPD'; }).map(function (d) { return isoDate(d.uploaded_at); })).filter(Boolean).sort().pop() || isoDate(inc.date);
        if (daysBetween(lastUpd, t) > pd) out.push('6.4.2.3：進度更新超過 ' + pd + ' 天（最近 ' + lastUpd + '）');
      }
    }
    if (s(inc.status) === STATUS.CLOSED && s(inc.close_checks).replace(/[^Y]/g, '').length < 4) out.push('6.6.4：結案確認四項未全部勾選');
    return out;
  }
  /** 通報時限達成率（6.5.5、評比表 ≥95%）；不可抗力不計入 */
  function ontimeStats(incidents, docsByNo, keyf) {
    var g = {};
    (incidents || []).forEach(function (inc) {
      if (s(inc.status) === STATUS.VOID) return;
      var k = keyf ? keyf(inc) : 'all', o = g[k] || (g[k] = { due: 0, ontime: 0, late: 0, overdue: 0, exempt: 0, untracked: 0 });
      reportTimeliness(inc, (docsByNo || {})[inc.tracking_no] || [], inc._today).forEach(function (x) {
        if (x.state === 'exempt' || x.state === 'untracked') { o[x.state]++; return; }
        if (x.state === 'pending') return;
        o.due++; o[x.state]++;
      });
    });
    Object.keys(g).forEach(function (k) { var o = g[k]; o.rate = o.due ? o.ontime / o.due : null; });
    return g;
  }

  /* ---------------- port coordinates (map) — editable in the Ports sheet ---------------- */
  var DEFAULT_PORTS = [
    ['ABIDJAN', "COTE D'IVOIRE", 5.29, -4.01], ['BALBOA', 'PANAMA', 8.95, -79.57], ['BANGKOK', 'THAILAND', 13.70, 100.57], ['BRISBANE', 'AUSTRALIA', -27.38, 153.17],
    ['BUSAN', 'SOUTH KOREA', 35.10, 129.04], ['CHENNAI', 'INDIA', 13.10, 80.30], ['DAMMAN', 'SAUDI ARABIA', 26.50, 50.20], ['DAR ES SALAAM', 'TANZANIA', -6.83, 39.29],
    ['GUANGZHOU', 'CHINA', 22.76, 113.62], ['HAI PHONG', 'VIETNAM', 20.86, 106.75], ['HO CHI MINH', 'VIETNAM', 10.77, 106.75], ['HONG KONG', 'CHINA', 22.34, 114.12],
    ['HOUSTON', 'USA', 29.61, -95.01], ['INCHEON', 'SOUTH KOREA', 37.46, 126.62], ['JEBEL ALI', 'UAE', 25.01, 55.06], ['KEELUNG', 'TAIWAN', 25.15, 121.74],
    ['KHORFAKKAN', 'UAE', 25.35, 56.36], ['KOBE', 'JAPAN', 34.67, 135.20], ['LAEM CHABANG', 'THAILAND', 13.08, 100.89], ['LOME', 'TOGO', 6.13, 1.28],
    ['LONG BEACH', 'USA', 33.76, -118.21], ['LOS ANGELES', 'USA', 33.74, -118.26], ['MANILA', 'PHILIPPINES', 14.60, 120.95], ['MANZANILLO', 'MEXICO', 19.06, -104.30],
    ['MELBOURNE', 'AUSTRALIA', -37.82, 144.92], ['MUNDRA', 'INDIA', 22.75, 69.70], ['NAGOYA', 'JAPAN', 35.05, 136.85], ['NINGBO', 'CHINA', 29.93, 121.85],
    ['ONNE', 'NIGERIA', 4.70, 7.15], ['OSAKA', 'JAPAN', 34.63, 135.43], ['PENANG', 'MALAYSIA', 5.41, 100.35], ['PORT KLANG', 'MALAYSIA', 3.00, 101.37],
    ['PRINCE RUPERT', 'CANADA', 54.30, -130.34], ['QINGDAO', 'CHINA', 36.02, 120.21], ['SHANGHAI', 'CHINA', 30.63, 122.07], ['SHEKOU', 'CHINA', 22.48, 113.91],
    ['SHENZHEN', 'CHINA', 22.57, 114.27], ['SI RACHA', 'THAILAND', 13.17, 100.92], ['SUBIC', 'PHILIPPINES', 14.81, 120.28], ['SURABAYA', 'INDONESIA', -7.20, 112.73],
    ['SYDNEY', 'AUSTRALIA', -33.97, 151.22], ['TIANJIN', 'CHINA', 38.97, 117.79], ['TOKYO', 'JAPAN', 35.62, 139.79], ['XIAMEN', 'CHINA', 24.48, 118.07],
    ['YOKOHAMA', 'JAPAN', 35.45, 139.66], ['SINGAPORE', 'SINGAPORE', 1.26, 103.84], ['KAOHSIUNG', 'TAIWAN', 22.61, 120.28], ['TAICHUNG', 'TAIWAN', 24.29, 120.51],
    ['COLOMBO', 'SRI LANKA', 6.95, 79.84], ['NHAVA SHEVA', 'INDIA', 18.95, 72.95], ['KARACHI', 'PAKISTAN', 24.84, 66.98], ['CHITTAGONG', 'BANGLADESH', 22.31, 91.80]
  ].map(function (r) { return { port: r[0], country: r[1], lat: String(r[2]), lng: String(r[3]), note: '' }; });
  /** 港口座標：Ports 分頁優先，沒有的用預設值 */
  function portTable(rows) {
    var m = {};
    DEFAULT_PORTS.forEach(function (r) { m[up(r.port)] = r; });
    (rows || []).forEach(function (r) { if (s(r.port) && !isNaN(parseFloat(r.lat)) && !isNaN(parseFloat(r.lng))) m[up(r.port)] = { port: up(r.port), country: normCountry(r.country), lat: s(r.lat), lng: s(r.lng), note: s(r.note) }; });
    return m;
  }


  var SCHEMA = {
    Inspections: ['insp_id', 'tracking_no', 'date', 'port', 'country', 'mou', 'vessel', 'imo', 'company', 'management',
      'nil', 'detention', 'def_count', 'tier', 'type', 'tier_reason', 'status', 'pic', 'flash_due', 'initial_due', 'rca_due',
      'closed_date', 'remarks', 'bribe_flag', 'bribe_demanded_usd', 'bribe_paid_usd', 'bribe_cig', 'bribe_goods', 'bribe_note', 'bribe_raw',
      'created_by', 'created_at', 'updated_by', 'updated_at'],
    Deficiencies: ['def_id', 'insp_id', 'tracking_no', 'seq', 'code', 'category', 'nature', 'action', 'deadline',
      'rectified', 'rectified_date', 'corrective_action', 'remarks', 'updated_by', 'updated_at'],
    Documents: ['doc_id', 'insp_id', 'tracking_no', 'doc_type', 'seq', 'file_name', 'original_name', 'mime', 'size',
      'file_id', 'url', 'note', 'uploaded_by', 'uploaded_at'],
    Incidents: ['tracking_no', 'tracking_no_std', 'date', 'company', 'vessel', 'imo', 'tier', 'type', 'priority', 'unit',
      'status', 'pic', 'summary', 'closed_date', 'source', 'insp_id', 'check_notes', 'flash_due', 'initial_due', 'rca_due',
      'corrective_action', 'created_by', 'created_at', 'updated_by', 'updated_at',
      'location', 'major_level', 'loss_usd', 'deaths', 'injuries', 'delay_h', 'ert', 'ert_chair', 'force_majeure', 'fm_note',
      'flash_at', 'initial_at', 'progress_at', 'rca_at', 'due_note', 'close_checks', 'former_no', 'rule_set', 'reply_log'],
    Vessels: ['vessel', 'imo', 'chinese', 'company', 'management', 'manager', 'pic', 'pic_email', 'valid_from', 'valid_to',
      'series', 'flag', 'note', 'doc_company_imo', 'class_society', 'class_number', 'flag_code', 'port_of_registry', 'ship_type',
      'ism_company', 'registered_owner', 'date_of_build', 'gross_tonnage', 'deadweight', 'teu', 'builder', 'nk_data_date'],
    Companies: ['code', 'name', 'doc_imo', 'tmou_performance', 'perf_as_of', 'note', 'greeting', 'email_to', 'email_cc'],
    RiskProfiles: ['imo', 'vessel', 'srp', 'company_performance', 'as_of', 'source', 'note'],
    MOUMap: ['country', 'port', 'mou', 'also', 'note'],
    Rules: ['rule_set', 'valid_from', 'kind', 'code', 'name', 'name_en', 'flash_h', 'initial_h', 'progress_d', 'rca_d',
      'loss_usd_min', 'deaths_min', 'delay_h_min', 'injury_min', 'ert_chair', 'min_tier', 'value', 'criteria', 'ref', 'active', 'note'],
    Ports: ['port', 'country', 'lat', 'lng', 'note'],
    NKStatus: ['imo', 'kind', 'code', 'label', 'next', 'due', 'from', 'to', 'alt_from', 'alt_to', 'expiry', 'last', 'source_date'],
    Users: ['email', 'name', 'role', 'active'],
    Settings: ['key', 'value', 'note'],
    Templates: ['code', 'stage', 'name', 'subject', 'body', 'sort', 'active', 'note'],
    Visits: ['visit_no', 'vessel', 'imo', 'company', 'party', 'vtype', 'date_from', 'date_to', 'port', 'inspector', 'report_date', 'score', 'reported_defects', 'report_url', 'pic', 'note',
      'created_by', 'created_at', 'updated_by', 'updated_at', 'reported_breakdown', 'tasks', 'report_status'],
    VisitItems: ['item_id', 'visit_no', 'seq', 'ref', 'area', 'section', 'finding', 'action_required', 'due_date', 'risk', 'status', 'corrective_action', 'submitted_at', 'closed_at', 'closed_by',
      'verify_note', 'history', 'created_at', 'updated_by', 'updated_at', 'question', 'pms_code', 'psc_code', 'viq_code', 'score'],
    AuditLog: ['ts', 'user', 'action', 'ref', 'detail']
  };
  /* ---------------- 回信範本（管理公司各階段通報後的回覆信） ---------------- */
  /** 預設範本；試算表「Templates」分頁同 code 的列會覆蓋，新 code 會新增，active = N 隱藏 */
  var DEFAULT_TEMPLATES = [ { "code": "ack", "stage": "flash", "sort": "10", "name": "收到立即通報：立案與編號通知", "subject": "[{{tracking_no}}] M/V {{vessel}} - Incident Acknowledgement & Tracking Number", "body": "Dear {{greeting}},\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nINCIDENT ACKNOWLEDGEMENT & TRACKING NUMBER\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nIncident Number: {{tracking_no}}\nVessel: M/V {{vessel}}\nIncident: {{incident}}\nDate / Location: {{date}}{{location_sep}}{{location}}\nClassification: {{tier_en}} / {{type_en}}\nStatus: OPEN / REGISTERED\nTSL PIC: {{pic}}\n\nGood day.\n\nTSL Marine Technical Department acknowledges receipt of the Flash Report{{flash_at_txt}} from {{company}} and the Master regarding the above incident.\n\nThis incident has been registered under the Incident Number above. Please quote this number in the subject line of all subsequent reports and correspondence.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nREPORTING REQUIREMENTS (3-TSTB-VSL-P002)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nInitial Report: within {{initial_h}} hours of the incident (due {{initial_due}})\nProgress Updates: {{progress_txt}}\nRoot Cause Analysis (RCA): within {{rca_d}} days of the incident (due {{rca_due}})\nWhere the Ship Management Agreement specifies shorter time limits, the Agreement shall prevail.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nIMMEDIATE ACTIONS REQUESTED\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n【請填寫：要求船方立即執行的事項，例如確認人員安全、穩定船況、保全證據（VDR、航海日誌、照片）、通知船級／P&I】\n\nPlease contact the undersigned at any time should Owner's support be required.\n\nBest regards,\n\n{{pic}}\nMarine Technical Department (MARTEC)\nT.S. Lines Ltd.", "note": "6.4.3：確認收到通報後產生追蹤編號並回覆通報人", "active": "Y" }, { "code": "initial", "stage": "initial", "sort": "20", "name": "收到初步報告：狀態更新與督導", "subject": "[{{tracking_no}}] M/V {{vessel}} - Incident Status Update & Oversight", "body": "Dear {{greeting}},\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nINCIDENT STATUS UPDATE & OVERSIGHT\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nIncident Number: {{tracking_no}}\nVessel: M/V {{vessel}}\nIncident: {{incident}}\nDate / Location: {{date}}{{location_sep}}{{location}}\nClassification: {{tier_en}} / {{type_en}}\nStatus: OPEN / UNDER ACTIVE MONITORING\nTSL PIC: {{pic}}\n\nGood day.\n\nTSL Marine Technical Department has reviewed the Initial Report and the chronological updates provided by {{company}} and the Master regarding the {{incident}} on {{date}}.\n\n【請填寫：人員、船舶、貨物與環境的現況，例如 all crew members are safe; the vessel resumed her voyage at 1918 LT】\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nTSL SUMMARY OF EXECUTION (Based on {{company}} Reports)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nAccording to your reports, TSL has logged the following operational timeline for our management archives:\n\n【請填寫：依管理公司報告整理的處置時間軸，每段一個重點（初期控制、處置、結果）】\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nTSL MANDATORY DIRECTIVES & NEXT PORT PREPARATION\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n{{company}} must strictly supervise and execute the following Owner's directives:\n\n【請填寫：船東指示事項；如有相關技術通告，請註明通告編號（TSL-MARTEC-字別-年度-序號）】\n\nEvidence Preservation: The Master must compile and preserve all objective evidence (Statement of Facts, time sheets, photographs/videos, log extracts) as required by TSL Legal and Insurance teams.\n\nNext Reports: progress update {{progress_txt_short}}; RCA due {{rca_due}}.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nPERFORMANCE EVALUATION (TSL Feedback)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nOnboard Response & Leadership: 【EXCELLENT / GOOD / SATISFACTORY / NEEDS IMPROVEMENT】\n\nShore Support & Communication: 【EXCELLENT / GOOD / SATISFACTORY / NEEDS IMPROVEMENT】\n\nOversight Statement:\nTSL Marine Technical Department officially records this incident as OPEN under active monitoring.\n\nBest regards,\n\n{{pic}}\nMarine Technical Department (MARTEC)\nT.S. Lines Ltd.", "note": "範本格式取自 VSHIPS-TS SHANGHAI-20260712-1F-01 回信", "active": "Y" }, { "code": "progress", "stage": "progress", "sort": "30", "name": "收到進度更新：追蹤與待辦", "subject": "[{{tracking_no}}] M/V {{vessel}} - Progress Follow-up", "body": "Dear {{greeting}},\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nINCIDENT PROGRESS FOLLOW-UP\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nIncident Number: {{tracking_no}}\nVessel: M/V {{vessel}}\nIncident: {{incident}}\nDate / Location: {{date}}{{location_sep}}{{location}}\nClassification: {{tier_en}} / {{type_en}}\nStatus: OPEN / UNDER ACTIVE MONITORING\nTSL PIC: {{pic}}\n\nGood day.\n\nTSL Marine Technical Department acknowledges the progress update{{progress_at_txt}} from {{company}} regarding the above incident.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSTATUS NOTED\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n【請填寫：本次進度更新的重點】\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nOUTSTANDING ITEMS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n【請填寫：仍待管理公司提供或完成的事項，例如 surveyor report, class attendance, repair plan】\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nNEXT DEADLINES\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nNext Progress Update: {{progress_txt_short}}\nRoot Cause Analysis (RCA): due {{rca_due}}\n\nTSL Marine Technical Department continues to monitor this incident.\n\nBest regards,\n\n{{pic}}\nMarine Technical Department (MARTEC)\nT.S. Lines Ltd.", "note": "6.4.2.3：重大事件每 7 天至少更新一次", "active": "Y" }, { "code": "rca", "stage": "rca", "sort": "40", "name": "收到 RCA：審查意見與結案條件", "subject": "[{{tracking_no}}] M/V {{vessel}} - RCA Review", "body": "Dear {{greeting}},\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nROOT CAUSE ANALYSIS (RCA) REVIEW\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nIncident Number: {{tracking_no}}\nVessel: M/V {{vessel}}\nIncident: {{incident}}\nDate / Location: {{date}}{{location_sep}}{{location}}\nClassification: {{tier_en}} / {{type_en}}\nStatus: OPEN / RCA UNDER REVIEW\nTSL PIC: {{pic}}\n\nGood day.\n\nTSL Marine Technical Department acknowledges receipt of the Root Cause Analysis{{rca_at_txt}} and has completed the review below.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nTSL REVIEW COMMENTS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nRoot Cause Identification: 【ACCEPTED / REVISION REQUIRED】\n【請填寫：對根本原因分析的意見】\n\nCorrective & Preventive Actions (CAPA): 【ACCEPTED / REVISION REQUIRED】\n{{corrective_action}}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nPREREQUISITES FOR CLOSURE (P002 6.6.4)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n1. All investigation procedures completed\n2. Reporting time limits under the Agreement and P002 complied with\n3. Compliance with the ISM Code confirmed\n4. All related documents filed\n\n【請填寫：結案前仍需補交的文件或說明；若無，請寫 No further documents are required.】\n\nBest regards,\n\n{{pic}}\nMarine Technical Department (MARTEC)\nT.S. Lines Ltd.", "note": "6.6：RCA 審查；6.6.4 結案四項確認", "active": "Y" }, { "code": "close", "stage": "close", "sort": "50", "name": "結案通知", "subject": "[{{tracking_no}}] M/V {{vessel}} - Incident Closure Notice", "body": "Dear {{greeting}},\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nINCIDENT CLOSURE NOTICE\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nIncident Number: {{tracking_no}}\nVessel: M/V {{vessel}}\nIncident: {{incident}}\nDate / Location: {{date}}{{location_sep}}{{location}}\nClassification: {{tier_en}} / {{type_en}}\nStatus: CLOSED\nTSL PIC: {{pic}}\n\nGood day.\n\nFollowing review of the Root Cause Analysis and the Corrective & Preventive Actions submitted by {{company}}, TSL Marine Technical Department hereby formally closes this incident{{closed_date_txt}}.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCLOSURE CONFIRMATION (P002 6.6.4)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n{{close_checks_txt}}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCORRECTIVE & PREVENTIVE ACTIONS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n{{corrective_action}}\n\n【請填寫：需要船隊分享的經驗教訓（Lessons Learned），或請管理公司在其他船舶落實的事項】\n\nAll incident records will be retained for {{retention_years}} years in accordance with P002 6.7. We thank {{company}} and the Master for their cooperation.\n\nBest regards,\n\n{{pic}}\nMarine Technical Department (MARTEC)\nT.S. Lines Ltd.", "note": "6.6.4：以正式信文通知結案", "active": "Y" }, { "code": "reminder", "stage": "overdue", "sort": "60", "name": "逾期催報", "subject": "[{{tracking_no}}] M/V {{vessel}} - Overdue Report Reminder", "body": "Dear {{greeting}},\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nOVERDUE REPORT REMINDER\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nIncident Number: {{tracking_no}}\nVessel: M/V {{vessel}}\nIncident: {{incident}}\nDate / Location: {{date}}{{location_sep}}{{location}}\nClassification: {{tier_en}} / {{type_en}}\nStatus: OPEN / REPORT OVERDUE\nTSL PIC: {{pic}}\n\nGood day.\n\nAccording to TSL records, the following report(s) for the above incident have not been received within the time limits of 3-TSTB-VSL-P002:\n\n{{overdue_txt}}\n\nPlease submit the outstanding report(s) within 【24 hours】, or advise the reason for the delay. Where communication was interrupted by force majeure, please state the reason and the actual time of the incident (P002 6.4.2.5).\n\nPlease note that reporting timeliness is included in the annual evaluation of the management company (P002 6.5).\n\nBest regards,\n\n{{pic}}\nMarine Technical Department (MARTEC)\nT.S. Lines Ltd.", "note": "6.5：時限達成率納入年度評比", "active": "Y" } ];
  var MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function enDate(d) { d = isoDate(d); if (!d) return ''; var p = d.split('-'); return p[2] + '-' + MON_EN[+p[1] - 1] + '-' + p[0]; }
  var CO_TEAM = { FLEET: 'FML Management Team', VSHIPS: 'V.Ships Management Team', BSM: 'BSM Management Team', TSL: 'T.S. Lines Fleet Management Team', TEH: 'Teh Shipping Management Team' };
  var CO_EN = { FLEET: 'FML', VSHIPS: 'V.Ships', BSM: 'BSM', TSL: 'T.S. Lines', TEH: 'Teh Shipping' };
  var STAGE_EN = { flash: 'Flash Report', initial: 'Initial Report', rca: 'Root Cause Analysis (RCA)' };
  var CLOSE_EN = ['All investigation procedures completed', 'Reporting time limits complied with', 'Compliance with the ISM Code confirmed', 'All related documents filed'];
  function templatesOf(rows) {
    var by = {}, order = [];
    DEFAULT_TEMPLATES.forEach(function (t) { by[t.code] = Object.assign({ builtin: 'Y' }, t); order.push(t.code); });
    (rows || []).forEach(function (r) { var c = s(r.code); if (!c) return; var t = by[c] ? Object.assign({}, by[c]) : (order.push(c), { builtin: 'N', subject: '', body: '', name: c, active: 'Y' }); Object.keys(r).forEach(function (k) { if (s(r[k]) !== '') t[k] = r[k]; }); by[c] = t; });
    return order.map(function (c) { return by[c]; }).sort(function (a, b) { return (Number(a.sort) || 99) - (Number(b.sort) || 99); });
  }
  /** 依事故目前進度建議用哪一個範本 */
  function replyStage(inc, docs, today) {
    if (s(inc.status) === STATUS.CLOSED) return 'close';
    var tl = reportTimeliness(inc, docs, today), at = {};
    tl.forEach(function (x) { at[x.stage] = x.at; });
    if (tl.some(function (x) { return x.state === 'overdue'; })) return 'reminder';
    if (at.rca) return 'rca';
    if (isoDate(inc.progress_at)) return 'progress';
    if (at.initial) return 'initial';
    return 'ack';
  }
  /** 範本變數；o = { rules, company, docs, today, master, pic, incident_en, team } */
  function replyVars(inc, o) {
    o = o || {};
    var R = rulesAt(o.rules, inc.date), tier = R.tiers[s(inc.tier)] || {}, m = R.major[s(inc.major_level)], co = o.company || {}, code = s(inc.company);
    var today = isoDate(o.today) || isoDate(new Date());
    var pd = m ? numOr(R.params.progress_major_d, 7) : numOr(tier.progress_d, 0);
    var lastUpd = [isoDate(inc.progress_at)].concat((o.docs || []).filter(function (d) { return d.doc_type === 'UPD'; }).map(function (d) { return isoDate(d.uploaded_at); })).filter(Boolean).sort().pop() || isoDate(inc.date) || today;
    var tl = reportTimeliness(inc, o.docs, today), over = tl.filter(function (x) { return x.state === 'overdue'; }).map(function (x) { return '- ' + STAGE_EN[x.stage] + ': due ' + enDate(x.due); });
    if (s(inc.status) === STATUS.OPEN && pd && daysBetween(lastUpd, today) > pd) over.push('- Progress Update: required at least every ' + pd + ' days (last update ' + enDate(lastUpd) + ')');
    var team = s(o.team) || s(co.greeting) || CO_TEAM[code] || ((CO_EN[code] || code) + ' Management Team');
    var cc = s(inc.close_checks);
    return {
      greeting: (s(o.master) ? 'Capt. ' + s(o.master) : 'Master') + ' and ' + team,
      tracking_no: s(inc.tracking_no), vessel: up(inc.vessel), incident: s(o.incident_en) || ('【請填寫事故英文名稱；中文簡述：' + s(inc.summary) + '】'), date: enDate(inc.date),
      location: s(inc.location), location_sep: s(inc.location) ? ', ' : '',
      tier_en: s(tier.name_en) || ('Tier ' + s(inc.tier)), type_en: s((R.types[s(inc.type)] || {}).name_en) || s(inc.type),
      company: CO_EN[code] || s(co.name) || code, pic: s(o.pic) || s(inc.pic),
      initial_h: s(tier.initial_h), rca_d: s(tier.rca_d), initial_due: enDate(inc.initial_due), rca_due: enDate(inc.rca_due),
      progress_txt: pd ? 'at least every ' + pd + ' days until closure' : 'as requested by TSL',
      progress_txt_short: pd ? 'within ' + pd + ' days (by ' + enDate(addDays(lastUpd, pd)) + ')' : 'as requested by TSL',
      flash_at_txt: isoDate(inc.flash_at) ? ' received on ' + enDate(inc.flash_at) : '',
      progress_at_txt: isoDate(inc.progress_at) ? ' of ' + enDate(inc.progress_at) : '',
      rca_at_txt: isoDate(inc.rca_at) ? ' dated ' + enDate(inc.rca_at) : '',
      closed_date_txt: ' effective ' + enDate(inc.closed_date || today),
      corrective_action: s(inc.corrective_action) || '【請填寫：矯正與預防措施】',
      close_checks_txt: CLOSE_EN.map(function (t, i) { return (cc.charAt(i) === 'Y' ? '[x] ' : '[ ] ') + t; }).join('\n'),
      overdue_txt: over.length ? over.join('\n') : '【目前沒有逾期項目，請確認是否改用其他範本】',
      retention_years: s(R.params.retention_years) || '5'
    };
  }
  function fillTemplate(text, vars) { return s(text).replace(/\{\{(\w+)\}\}/g, function (all, k) { return vars && vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : all; }); }
  /** 還沒填的地方：【…】提示與沒有對應的 {{變數}} */
  function pendingMarks(text) { return (s(text).match(/【[^】]*】|\{\{\w+\}\}/g) || []); }
  function logReply(store, user, p) {
    need(user, 'editor');
    var no = s(p.tracking_no), inc = store.all('Incidents').filter(function (x) { return s(x.tracking_no) === no; })[0];
    if (!inc) throw new Error('找不到事故 ' + no);
    var t = new Date(store.now()), stamp = isNaN(t) ? s(store.now()) : t.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    var line = stamp + '｜' + s(p.code) + (s(p.name) ? ' ' + s(p.name) : '') + '｜' + user.email;
    store.updateWhere('Incidents', function (x) { return s(x.tracking_no) === no; }, { reply_log: s(inc.reply_log) ? s(inc.reply_log) + '\n' + line : line });
    audit(store, user, 'reply', no, s(p.code) + (s(p.subject) ? '：' + s(p.subject) : ''));
    return { line: line };
  }

  var DEFAULT_SETTINGS = [
    { key: 'tier2_def_threshold', value: '6', note: '未留置但缺失項數達此數量即升為 Tier 2' },
    { key: 'tier2_on_ism', value: 'Y', note: '開出 ISM 缺失（代碼 15xxx）即升為 Tier 2' },
    { key: 'google_client_id', value: '', note: 'Google 登入用 OAuth Client ID（與前端 config.js 相同）' },
    { key: 'drive_root_folder_id', value: '', note: '歸檔根資料夾 ID；空白時系統自動建立「TSL PSC System」' },
    { key: 'bribe_roles', value: 'admin,editor', note: '可以查看與登錄 Bribe（索賄）資料的角色' },
    { key: 'tmou_members', value: 'AUSTRALIA,CANADA,CHILE,CHINA,FIJI,HONG KONG,INDONESIA,JAPAN,SOUTH KOREA,MALAYSIA,MARSHALL ISLANDS,MEXICO,NEW ZEALAND,PANAMA,PAPUA NEW GUINEA,PERU,PHILIPPINES,RUSSIA,SINGAPORE,THAILAND,VANUATU,VIETNAM', note: '備援用：檢查的 MOU 欄空白時，才用這份 Tokyo MOU 成員國清單判定（正式判定看 MOUMap 對照表）' },
    { key: 'risk_inbox_folder_id', value: '', note: 'Tokyo MOU 窗口檔收件匣資料夾 ID；空白時第一次執行自動建立「Tokyo MOU 收件匣」' },
    { key: 'tmou_white_flags', value: 'Kuwait; Antigua and Barbuda; United States of America; Tuvalu; United Kingdom (UK); France; Indonesia; Cyprus; Panama; Viet Nam; Bermuda (UK); Thailand; Portugal; Germany; Saudi Arabia; Cayman Islands (UK); Liberia; Japan; Greece; Denmark; Malta; Philippines; Malaysia; Bahamas; Marshall Islands; Norway; Isle of Man (UK); Taiwan, China; Korea, Republic of; Singapore; Hong Kong, China; China', note: 'Tokyo MOU 船旗績效 High 名單（2026-07-01 ~ 2027-06-30；估算 SRP 用；以分號分隔；每年 7 月依 Tokyo MOU 公告更新）' },
    { key: 'tmou_black_flags', value: 'Gambia; Saint Kitts and Nevis; Cameroon; Togo; Tanzania; Sao Tome and Principe; Palau; Iran; Cook Islands; Sierra Leone; Comoros; Mongolia; Sint Maarten; Djibouti; Belize', note: 'Tokyo MOU 船旗績效 Low 名單（2026-07-01 ~ 2027-06-30；估算 SRP 用；以分號分隔）' },
    { key: 'tmou_ro_high', value: 'Biro Klasifikasi Indonesia; Indian Register of Shipping; Overseas Marine Certification Services; Panama Maritime Documentation Services; Intermaritime Certification Services, S.A.; Russian Maritime Register of Shipping; Isthmus Bureau of Shipping; Vietnam Register; CR Classification Society; RINA Services S.p.A.; Nippon Kaiji Kyokai; Bureau Veritas; Lloyd\'s Register; DNV AS; Korean Register; China Classification Society; American Bureau of Shipping', note: 'Tokyo MOU RO 績效 High（2026-07-01 ~ 2027-06-30；以分號分隔；船級簡稱 NK、LR、DNV、CR 等會自動對應）' },
    { key: 'tmou_ro_low', value: 'Cosmos Marine Bureau; Union Bureau of Shipping; Asia Shipping Certification Services', note: 'Tokyo MOU RO 績效 Low（2026-07-01 ~ 2027-06-30）' },
    { key: 'inc_risk_weights', value: 'tier1=10; tier2=4; tier3=1; major=5; psc=0.5', note: '事故風險計分：每件事故依通報分級計分（tier1 / tier2 / tier3），屬 4.1 重大事件再加 major；由 PSC 檢查產生的事故乘以 psc 係數；作廢不計' },
    { key: 'inc_risk_levels', value: '15; 8; 3', note: '事故風險分級門檻（近 12 個月或單一年度分數）：≥ 第 1 個值為高風險、≥ 第 2 個為偏高、≥ 第 3 個為一般，其餘為低風險' },
    { key: 'tmou_avg_detention_index', value: '3.84', note: 'Tokyo MOU 平均留置指數（%），公司績效與船舶風險色標用；2027-06-30 前有效，每年 7 月依 NIR 頁更新' },
    { key: 'tmou_avg_deficiency_index', value: '2.64', note: 'Tokyo MOU 平均缺失指數，公司績效與船舶風險色標用；2027-06-30 前有效' },
    { key: 'tmou_index_valid', value: '2026-07-01 ~ 2027-06-30', note: '上面兩個平均指數與船旗 / RO 名單的適用期間（顯示用）' },
    { key: 'tmou_high_perf_docs', value: '0002568,0033914,0064704,0081371,0101856,0104949,0175853,0198232,0217944,0235574,0237394,0255909,0260422,0261139,0283257,0283610,0296139,0296519,0297888,0301095,0310062,0340747,0349961,0367129,0415893,0516936,0525801,0601831,0606585,0645521,0694657,0717669,0724192,0770470,0798451,0919307,0993927,1015045,1038073,1039244,1043989,1069901,1070250,1092934,1125205,1138807,1204098,1249148,1314037,1314173,1321453,1335815,1393349,1425380,1474936,1475280,1509526,1520088,1540341,1546779,1562592,1578540,1595534,1601573,1618912,1626767,1627986,1636114,1648580,1677771,1708734,1724178,1743141,1834165,1866320,1870450,1881539,1889477,1890038,1966806,1983906,4090777,4115119,4157892,5011009,5014361,5034289,5045513,5070349,5077381,5088399,5089202,5104797,5105614,5113282,5122042,5146431,5148424,5177178,5177491,5184254,5193283,5193805,5197683,5199852,5201298,5201369,5203250,5230767,5261954,5280724,5281268,5290080,5291397,5307331,5315756,5332992,5348114,5356321,5362413,5370149,5373608,5375992,5634079,5676362,5757212,5762575,5762592,5778037,5796603,5801998,5805298,5816037,5829126,5875611,5879984,5880559,5887220,5900552,5903614,5912498,5926452,5936683,5946751,5993395,6018114,6018202,6028124,6028950,6050128,6050193,6055146,6059872,6071296,6091771,6100545,6137904,6146902,6156311,6161966,6197791,6200394,6241591,6253841,6264452,6271128,6280758,6292031,6301781,6324712,6325358,6350563,6368083,6369974,6376154,6406769,6410094,6411089,6427243,6427416,6431581,6464624,6483266,6487842', note: 'Tokyo MOU 高績效公司名單（ISM DOC 公司 IMO，逗號分隔）' },
    { key: 'tmou_high_perf_period', value: '2026 Q3', note: '高績效公司名單的季度（顯示用）' },
    { key: 'window_alert_days', value: '30', note: '窗口提醒：幾天內將進入窗口或關閉時提醒' },
    { key: 'alert_emails', value: '', note: '每日 PSC 窗口提醒收件人（逗號分隔）；空白不寄信' },
    { key: 'nk_class_fields', value: 'class_society,class_number,flag,flag_code,port_of_registry,registered_owner,ism_company,date_of_build,gross_tonnage,deadweight,teu', note: '匯入船舶主檔時以船級（Class）資料為準的欄位：與系統不同時直接改成 Class 的值（例如裝脫硫塔後 TEU 略減）。改名 / 換管理前的舊列只更新建造日期、GT、DWT、TEU' }
  ];

  /* ---------------- small helpers ---------------- */
  function s(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function up(v) { return s(v).replace(/\s+/g, ' ').toUpperCase(); }
  function pad2(n) { n = Number(n); return (n < 10 ? '0' : '') + n; }
  function isoDate(v) {
    if (v === null || v === undefined || v === '') return '';
    if (Object.prototype.toString.call(v) === '[object Date]') {
      if (isNaN(v)) return '';
      return v.getFullYear() + '-' + pad2(v.getMonth() + 1) + '-' + pad2(v.getDate());
    }
    var m = String(v).trim().match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    return m ? m[1] + '-' + pad2(+m[2]) + '-' + pad2(+m[3]) : '';
  }
  function ymd(date) { return isoDate(date).replace(/-/g, ''); }
  function addDays(date, d) {
    var p = isoDate(date).split('-');
    var t = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + d));
    return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
  }
  function normCode(v) {
    var t = s(v); if (!t || t === '-') return '';
    var n = parseInt(parseFloat(t), 10); if (isNaN(n)) return '';
    var c = String(n); while (c.length < 5) c = '0' + c; return c;
  }
  function normAction(v) {
    var t = s(v); if (!t || t === '-') return '';
    return t.split('/').map(function (p) { var n = parseFloat(p); return isNaN(n) ? p.trim() : String(Math.round(n)); }).join('/');
  }
  function mainAction(a) { var n = parseInt(s(a), 10); return isNaN(n) ? null : n; }
  function yes(v) { var t = up(v); return t === 'Y' || t === 'YES' || t === 'V' || t === 'TRUE' || t === '1'; }
  function safeName(name) { return s(name).replace(/[\\\/:*?"<>|#%]+/g, '_'); }
  function ext(name) { var m = s(name).match(/\.([A-Za-z0-9]{1,8})$/); return m ? '.' + m[1].toLowerCase() : ''; }

  /* ---------------- numbering rules ---------------- */
  function buildTrackingNo(company, vessel, date, tier, type, seq) {
    return up(company).replace(/\s+/g, '') + '-' + up(vessel) + '-' + ymd(date) + '-' + s(tier) + up(type) + '-' + pad2(seq);
  }
  /** Lenient parse of an existing number (tolerates stray spaces / lower case). */
  function parseTrackingNo(no) {
    var m = s(no).match(/^\s*([A-Za-z\-]+?)\s*-\s*(.+?)\s*-\s*(\d{8})\s*-\s*([0-9A-Z])([A-Z])\s*-\s*(\d{2})\s*$/i);
    if (!m) return null;
    return { company: up(m[1]), vessel: up(m[2]), ymd: m[3], tier: m[4].toUpperCase(), type: m[5].toUpperCase(), seq: +m[6] };
  }
  /** SEQ = 同船同日序號，計算所有已登錄事故（含非 PSC），避免與事故登錄器撞號。 */
  function nextSeq(incidents, vessel, date) {
    var v = up(vessel), d = ymd(date), max = 0;
    (incidents || []).forEach(function (i) {
      var p = parseTrackingNo(i.tracking_no) || parseTrackingNo(i.tracking_no_std);
      if (p && p.vessel.replace(/\s/g, '') === v.replace(/\s/g, '') && p.ymd === d) max = Math.max(max, p.seq);
    });
    return max + 1;
  }
  function inspectionId(date, imo, vessel) { return 'PSC-' + ymd(date) + '-' + (s(imo) || up(vessel).replace(/\s+/g, '')); }
  function deficiencyId(base, n) { return base + '-D' + pad2(n); }
  function documentId(base, docType, n) { return base + '_' + docType + '_' + pad2(n); }
  function documentFileName(docId, originalName) { return safeName(docId) + ext(originalName); }
  function folderPath(insp) {
    var year = s(insp.date).slice(0, 4) || 'unknown';
    if (insp.source === 'VISIT') return ['訪船', year, safeName(insp.tracking_no)];
    if (insp.source && insp.source !== 'PSC' && insp.tracking_no) return ['事故', year, safeName(insp.tracking_no)];
    return insp.tracking_no ? ['PSC', year, safeName(insp.tracking_no)] : ['PSC', year, 'NIL', safeName(insp.insp_id)];
  }
  function deadlines(date, tier) {
    var t = TIERS[s(tier)] || TIERS['3'];
    return {
      flash_due: addDays(date, Math.floor(t.flashH / 24)),
      initial_due: addDays(date, Math.floor(t.initialH / 24)),
      rca_due: addDays(date, t.rcaD)
    };
  }
  /**
   * PSC 嚴重程度：留置 → Tier 2；未留置但缺失數 ≥ 門檻、或有 ISM（15xxx）缺失 → Tier 2；其餘有缺失 → Tier 3；無缺失 → NIL（不立案）。
   */
  function pscTier(opts) {
    var defs = opts.deficiencies || [];
    var threshold = Number(opts.threshold) || 6;
    var ismRule = opts.ismEscalate !== false;
    var detained = !!opts.detention || defs.some(function (d) { return mainAction(d.action) === 30; });
    if (!defs.length && !detained) return { tier: '', reason: '無缺失（NIL），不立事故編號' };
    if (detained) return { tier: '2', reason: 'PSC 留置（扣船）→ Tier 2' };
    if (defs.length >= threshold) return { tier: '2', reason: '缺失 ' + defs.length + ' 項，達升級門檻 ' + threshold + ' 項 → Tier 2' };
    var ism = defs.filter(function (d) { return normCode(d.code).slice(0, 2) === '15'; });
    if (ismRule && ism.length) return { tier: '2', reason: '開出 ISM 缺失（' + ism.map(function (d) { return normCode(d.code); }).join('、') + '）→ Tier 2' };
    return { tier: '3', reason: 'PSC 缺失 ' + defs.length + ' 項，未留置 → Tier 3' };
  }
  /** Vessel record valid on a date (handles renames such as TS SHENZHEN → TEH PEACE on 2026-01-18). */
  function vesselAt(vessels, key, date) {
    var k = up(key), d = isoDate(date);
    var rows = (vessels || []).filter(function (v) { return s(v.imo) === s(key) || up(v.vessel) === k; });
    if (rows.length && s(rows[0].imo)) {
      var imo = s(rows[0].imo);
      rows = (vessels || []).filter(function (v) { return s(v.imo) === imo; });
    }
    var hit = rows.filter(function (v) { return (!s(v.valid_from) || s(v.valid_from) <= d) && (!s(v.valid_to) || d <= s(v.valid_to)); });
    return hit[0] || rows[0] || null;
  }
  function pscSummary(n, port, country, detained) {
    return 'Port State Control (PSC) Inspection – ' + n + ' Deficienc' + (n === 1 ? 'y' : 'ies') +
      (detained ? ' / DETENTION' : '') + ' (' + [port, country].filter(Boolean).join(', ') + ')';
  }

  /* ---------------- actions ---------------- */
  var ROLE_RANK = { viewer: 1, editor: 2, admin: 3 };
  function need(user, role) {
    if (!user || (ROLE_RANK[user.role] || 0) < ROLE_RANK[role]) throw new Error('權限不足：此操作需要「' + role + '」角色');
  }
  function settingsMap(store) {
    var m = {};
    store.all('Settings').forEach(function (r) { m[r.key] = r.value; });
    DEFAULT_SETTINGS.forEach(function (d) { if (!(d.key in m)) m[d.key] = d.value; });
    return m;
  }
  function audit(store, user, action, ref, detail) {
    store.insert('AuditLog', { ts: store.now(), user: user.email, action: action, ref: ref, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
  }

  function saveInspection(store, user, p) {
    need(user, 'editor');
    var inp = p.inspection || {};
    var date = isoDate(inp.date);
    if (!date) throw new Error('請填寫檢查日期');
    var vessels = store.all('Vessels');
    var v = vesselAt(vessels, inp.imo || inp.vessel, date);
    if (!v) throw new Error('船隊資料找不到這艘船：' + (inp.vessel || inp.imo));
    var set = settingsMap(store);
    var defsIn = (p.deficiencies || []).filter(function (d) { return s(d.code) || s(d.nature); });
    var tierInfo = pscTier({ deficiencies: defsIn, detention: yes(inp.detention), threshold: set.tier2_def_threshold, ismEscalate: yes(set.tier2_on_ism) });
    if (p.overrideTier && tierInfo.tier) tierInfo = { tier: s(p.overrideTier), reason: '人工調整：' + s(p.overrideReason || '未填原因') };
    var nil = !tierInfo.tier;
    var all = store.all('Inspections');
    var existing = inp.insp_id ? all.filter(function (r) { return r.insp_id === inp.insp_id; })[0] : null;
    var now = store.now();
    var rec = existing ? JSON.parse(JSON.stringify(existing)) : {
      insp_id: '', tracking_no: '', created_by: user.email, created_at: now, status: ''
    };
    var vname = up(v.vessel);
    rec.date = date; rec.port = up(inp.port); rec.country = normCountry(inp.country);
    var mouHit = resolveMOU(store.all('MOUMap'), rec.country, rec.port);
    rec.mou = s(inp.mou) && s(inp.mou) !== 'V' ? s(inp.mou) : mouHit.mou;
    rec.vessel = vname; rec.imo = s(v.imo); rec.company = up(v.company); rec.management = s(v.management) || COMPANY_TO_MGMT[up(v.company)] || '';
    rec.nil = nil ? 'Y' : 'N'; rec.detention = yes(inp.detention) ? 'Y' : 'N'; rec.def_count = String(defsIn.length);
    rec.pic = s(inp.pic) || s(v.pic); rec.remarks = s(inp.remarks);
    if (canBribe(user, set)) {
      rec.bribe_demanded_usd = num(inp.bribe_demanded_usd); rec.bribe_paid_usd = num(inp.bribe_paid_usd);
      rec.bribe_cig = s(inp.bribe_cig); rec.bribe_goods = s(inp.bribe_goods); rec.bribe_note = s(inp.bribe_note);
      rec.bribe_raw = rec.bribe_raw || '';
      rec.bribe_flag = bribeFlag(rec);
    }
    rec.updated_by = user.email; rec.updated_at = now;
    if (!rec.insp_id) {
      var id = inspectionId(date, v.imo, vname), n = 1, base = id;
      while (all.some(function (r) { return r.insp_id === id; })) { n++; id = base + '-' + n; }
      rec.insp_id = id;
    }
    var warnings = [];
    if (!rec.mou) warnings.push('MOU 對照表找不到港口國「' + rec.country + '」，請在系統管理補上');
    var hist = !!existing && existing.status === STATUS.HIST;
    if (hist) {
      // 2026 年以前的歷史資料：可以修正內容，但不補發事故編號
      rec.tier = tierInfo.tier; rec.type = ''; rec.nil = nil ? 'Y' : 'N';
    } else if (!nil) {
      if (!rec.tracking_no) {
        var incidents = store.all('Incidents');
        var seq = nextSeq(incidents, vname, date);
        rec.tracking_no = buildTrackingNo(rec.company, vname, date, tierInfo.tier, PSC_TYPE, seq);
        store.insert('Incidents', {
          tracking_no: rec.tracking_no, tracking_no_std: rec.tracking_no, date: date, company: rec.company, vessel: vname, imo: rec.imo,
          tier: tierInfo.tier, type: PSC_TYPE, priority: TIERS[tierInfo.tier].en, unit: '海技', status: STATUS.OPEN, pic: rec.pic,
          summary: pscSummary(defsIn.length, rec.port, rec.country, rec.detention === 'Y'), closed_date: '', source: 'PSC',
          insp_id: rec.insp_id, check_notes: '', created_by: user.email, created_at: now
        });
        var Rp = rulesAt(store.all('Rules'), date);
        store.update('Incidents', 'tracking_no', rec.tracking_no, Object.assign(ruleDeadlines(date, tierInfo.tier, Rp), { rule_set: Rp.set }));
      } else {
        var cur = parseTrackingNo(rec.tracking_no);
        if (cur && cur.tier !== tierInfo.tier) warnings.push('依目前缺失計算為 Tier ' + tierInfo.tier + '，但編號已發出為 Tier ' + cur.tier + '；編號不變更，請在事故登錄器註記');
        store.update('Incidents', 'tracking_no', rec.tracking_no, { tier: tierInfo.tier, priority: TIERS[tierInfo.tier].en, summary: pscSummary(defsIn.length, rec.port, rec.country, rec.detention === 'Y') });
      }
      rec.tier = tierInfo.tier; rec.type = PSC_TYPE;
      var dl = ruleDeadlines(date, tierInfo.tier, rulesAt(store.all('Rules'), date));
      rec.flash_due = dl.flash_due; rec.initial_due = dl.initial_due; rec.rca_due = dl.rca_due;
      if (!rec.status || rec.status === STATUS.NIL || rec.status === STATUS.MISSING) rec.status = STATUS.OPEN;
    } else {
      if (rec.tracking_no) throw new Error('此案件已有事故編號 ' + rec.tracking_no + '，不能改成無缺失；請改用結案');
      rec.tier = ''; rec.type = ''; rec.flash_due = rec.initial_due = rec.rca_due = ''; rec.status = STATUS.NIL;
    }
    rec.tier_reason = tierInfo.reason;
    if (existing) store.update('Inspections', 'insp_id', rec.insp_id, rec); else store.insert('Inspections', rec);

    // deficiencies: keep existing IDs, number new ones after the highest
    var base = rec.tracking_no || rec.insp_id;
    var old = store.all('Deficiencies').filter(function (d) { return d.insp_id === rec.insp_id; });
    var maxN = 0;
    old.forEach(function (d) { var m = s(d.def_id).match(/-D(\d+)$/); if (m) maxN = Math.max(maxN, +m[1]); });
    var rows = defsIn.map(function (d, i) {
      var keep = d.def_id && old.some(function (o) { return o.def_id === d.def_id; });
      var defId = keep ? d.def_id : deficiencyId(base, ++maxN);
      var code = normCode(d.code);
      return {
        def_id: defId, insp_id: rec.insp_id, tracking_no: rec.tracking_no, seq: String(i + 1), code: code,
        category: CATEGORIES[code.slice(0, 2)] || '', nature: s(d.nature), action: normAction(d.action), deadline: isoDate(d.deadline),
        rectified: yes(d.rectified) ? 'Y' : 'N', rectified_date: isoDate(d.rectified_date), corrective_action: s(d.corrective_action),
        remarks: s(d.remarks), updated_by: user.email, updated_at: now
      };
    });
    store.replaceWhere('Deficiencies', 'insp_id', rec.insp_id, rows);
    audit(store, user, existing ? 'update_inspection' : 'create_inspection', rec.insp_id, { tracking_no: rec.tracking_no, tier: rec.tier, defs: rows.length });
    return { inspection: rec, deficiencies: rows, warnings: warnings };
  }

  function updateDeficiency(store, user, p) {
    need(user, 'editor');
    var d = store.all('Deficiencies').filter(function (r) { return r.def_id === p.def_id; })[0];
    if (!d) throw new Error('找不到缺失 ' + p.def_id);
    var f = p.fields || {}, patch = { updated_by: user.email, updated_at: store.now() };
    if ('rectified' in f) patch.rectified = yes(f.rectified) ? 'Y' : 'N';
    if ('rectified_date' in f) patch.rectified_date = isoDate(f.rectified_date);
    if ('corrective_action' in f) patch.corrective_action = s(f.corrective_action);
    if ('remarks' in f) patch.remarks = s(f.remarks);
    store.update('Deficiencies', 'def_id', p.def_id, patch);
    audit(store, user, 'update_deficiency', p.def_id, patch);
    return Object.assign({}, d, patch);
  }

  /** 找出文件要掛在哪裡：PSC 檢查（insp_id）或非 PSC 事故（tracking_no） */
  function docOwner(store, p) {
    if (s(p.insp_id)) {
      var insp = store.all('Inspections').filter(function (r) { return r.insp_id === p.insp_id; })[0];
      if (!insp) throw new Error('找不到檢查紀錄 ' + p.insp_id);
      return insp;
    }
    var vis = null; try { vis = store.all('Visits').filter(function (r) { return up(r.visit_no) === up(p.tracking_no); })[0]; } catch (e) { vis = null; }
    if (vis) return { insp_id: '', tracking_no: vis.visit_no, date: vis.date_from || vis.report_date, source: 'VISIT' };
    var inc = store.all('Incidents').filter(function (r) { return r.tracking_no === s(p.tracking_no); })[0];
    if (!inc) throw new Error('找不到事故 ' + p.tracking_no);
    if (inc.insp_id) return docOwner(store, { insp_id: inc.insp_id });
    return { insp_id: '', tracking_no: inc.tracking_no, date: inc.date, source: inc.source || 'REGISTER' };
  }
  function uploadDocument(store, user, p) {
    need(user, 'editor');
    var insp = docOwner(store, p);
    var type = s(p.doc_type);
    if (!DOC_TYPES.some(function (t) { return t.code === type; })) throw new Error('文件類別不正確：' + type);
    if (!p.base64) throw new Error('沒有收到檔案內容');
    var base = insp.tracking_no || insp.insp_id;
    var docs = store.all('Documents').filter(function (d) { return (d.tracking_no || d.insp_id) === base && d.doc_type === type; });
    if (!insp.insp_id && DOC_TYPES.some(function (t) { return t.code === type && t.psc; })) throw new Error(type + ' 是 PSC 專用文件類別');
    var n = 0;
    docs.forEach(function (d) { n = Math.max(n, Number(d.seq) || 0); });
    n += 1;
    var docId = documentId(base, type, n);
    var fileName = documentFileName(docId, p.original_name);
    var file = store.putFile(folderPath(insp), fileName, s(p.mime) || 'application/octet-stream', p.base64);
    var row = {
      doc_id: docId, insp_id: insp.insp_id, tracking_no: insp.tracking_no, doc_type: type, seq: String(n), file_name: fileName,
      original_name: s(p.original_name), mime: s(p.mime), size: String(p.size || ''), file_id: file.id, url: file.url,
      note: s(p.note), uploaded_by: user.email, uploaded_at: store.now()
    };
    store.insert('Documents', row);
    audit(store, user, 'upload_document', docId, { file: fileName, original: p.original_name });
    return row;
  }

  function setCaseStatus(store, user, p) {
    need(user, 'editor');
    if (!s(p.insp_id) && s(p.tracking_no)) {
      var inc = store.all('Incidents').filter(function (r) { return r.tracking_no === s(p.tracking_no); })[0];
      if (!inc) throw new Error('找不到事故 ' + p.tracking_no);
      if (inc.insp_id) return setCaseStatus(store, user, { insp_id: inc.insp_id, status: p.status, closed_date: p.closed_date, force: p.force });
      var closingI = p.status === STATUS.CLOSED;
      var cdI = closingI ? (isoDate(p.closed_date) || store.now().slice(0, 10)) : '';
      var need_ = listOf(rulesAt(store.all('Rules'), inc.date).params.close_docs || 'RCA,CLOSE');
      if (closingI && !p.force && need_.length && !store.all('Documents').some(function (d) { return d.tracking_no === inc.tracking_no && need_.indexOf(up(d.doc_type)) >= 0; }))
        throw new Error('尚未歸檔 ' + need_.join(' 或 ') + ' 文件（6.6.4.4）');
      var pI = { status: closingI ? STATUS.CLOSED : STATUS.OPEN, closed_date: cdI, updated_by: user.email, updated_at: store.now() };
      store.update('Incidents', 'tracking_no', inc.tracking_no, pI);
      audit(store, user, closingI ? 'close_incident' : 'reopen_incident', inc.tracking_no, cdI);
      return Object.assign({}, inc, pI);
    }
    var insp = store.all('Inspections').filter(function (r) { return r.insp_id === p.insp_id; })[0];
    if (!insp) throw new Error('找不到檢查紀錄 ' + p.insp_id);
    if (!insp.tracking_no) throw new Error('無缺失（NIL）檢查沒有案件狀態');
    var closing = p.status === STATUS.CLOSED;
    var cd = closing ? (isoDate(p.closed_date) || store.now().slice(0, 10)) : '';
    if (closing) {
      var open = store.all('Deficiencies').filter(function (d) { return d.insp_id === insp.insp_id && d.rectified !== 'Y'; });
      if (open.length && !p.force) throw new Error('還有 ' + open.length + ' 項缺失未標記改正完成（' + open.map(function (d) { return d.def_id; }).join('、') + '）');
    }
    var patch = { status: closing ? STATUS.CLOSED : STATUS.OPEN, closed_date: cd, updated_by: user.email, updated_at: store.now() };
    store.update('Inspections', 'insp_id', insp.insp_id, patch);
    store.update('Incidents', 'tracking_no', insp.tracking_no, { status: patch.status, closed_date: cd });
    audit(store, user, closing ? 'close_case' : 'reopen_case', insp.tracking_no, cd);
    return Object.assign({}, insp, patch);
  }

  var INC_TEXT = ['summary', 'pic', 'unit', 'corrective_action', 'check_notes', 'location', 'ert_chair', 'fm_note', 'due_note', 'close_checks'];
  var INC_NUM = ['loss_usd', 'deaths', 'injuries', 'delay_h'];
  var INC_DATE = ['flash_due', 'initial_due', 'rca_due', 'flash_at', 'initial_at', 'progress_at', 'rca_at'];
  var INC_FLAG = ['ert', 'force_majeure'];
  function incidentExtras(f, patch) {
    INC_TEXT.forEach(function (k) { if (k in f) patch[k] = s(f[k]); });
    INC_NUM.forEach(function (k) { if (k in f) { var t = s(f[k]); if (t && num(t) === '') throw new Error(k + ' 需為數字：' + t); patch[k] = num(t); } });
    INC_DATE.forEach(function (k) { if (k in f) patch[k] = isoDate(f[k]); });
    INC_FLAG.forEach(function (k) { if (k in f) patch[k] = yes(f[k]) ? 'Y' : 'N'; });
    if ('major_level' in f) { var m = s(f.major_level); if (m && !TIERS[m]) throw new Error('4.1 重大事件等級需為 1、2、3 或空白'); patch.major_level = m; }
    return patch;
  }
  function saveIncident(store, user, p) {
    need(user, 'editor');
    var date = isoDate(p.date); if (!date) throw new Error('請填寫事故日期');
    var R = rulesAt(store.all('Rules'), date);
    var tier = s(p.tier); if (!TIERS[tier]) throw new Error('通報分級需為 1、2 或 3');
    var type = up(p.type); if (!R.types[type]) throw new Error('事故性質代碼不在規範內：' + type);
    var v = vesselAt(store.all('Vessels'), p.imo || p.vessel, date);
    if (!v) throw new Error('船隊資料找不到這艘船：' + (p.vessel || p.imo));
    var incidents = store.all('Incidents');
    var no = buildTrackingNo(v.company, v.vessel, date, tier, type, nextSeq(incidents, v.vessel, date));
    var row = {
      tracking_no: no, tracking_no_std: no, date: date, company: up(v.company), vessel: up(v.vessel), imo: s(v.imo), tier: tier, type: type,
      priority: TIERS[tier].en, unit: s(p.unit) || '海技', status: STATUS.OPEN, pic: s(p.pic) || s(v.pic), summary: s(p.summary),
      closed_date: '', source: 'MANUAL', insp_id: '', check_notes: '', created_by: user.email, created_at: store.now(), rule_set: R.set
    };
    Object.assign(row, ruleDeadlines(date, tier, R));
    incidentExtras(p, row);
    if (s(p.major_level) && !s(row.ert_chair) && R.major[s(p.major_level)]) row.ert_chair = s(R.major[s(p.major_level)].ert_chair);
    store.insert('Incidents', row);
    audit(store, user, 'create_incident', no, p.summary);
    return row;
  }

  /**
   * 修改事故的任何欄位（給舊帳修正用）。
   * - 事故編號預設不變；管理員勾選 renumber 才依新內容重新編號，舊號留在 former_no，並同步更新檢查、缺失、文件的 tracking_no。
   * - PSC 事故的日期、船名、簡述由對應的 PSC 檢查決定，這裡不改。
   * - 期限欄可以直接改（例如合約期限較短），原因寫在 due_note；清空期限 + recalc 會依規範重算。
   */
  function updateIncident(store, user, p) {
    need(user, 'editor');
    var inc = store.all('Incidents').filter(function (r) { return r.tracking_no === s(p.tracking_no); })[0];
    if (!inc) throw new Error('找不到事故 ' + p.tracking_no);
    var f = p.fields || {}, patch = { updated_by: user.email, updated_at: store.now() }, warnings = [];
    var psc = inc.source === 'PSC' || !!s(inc.insp_id);
    incidentExtras(f, patch);
    if (psc) delete patch.summary;
    if ('date' in f && isoDate(f.date) !== inc.date) { if (psc) throw new Error('PSC 事故的日期請在 PSC 檢查修改'); patch.date = isoDate(f.date); if (!patch.date) throw new Error('日期格式不正確'); }
    if (('imo' in f || 'vessel' in f) && !psc) {
      var d0 = patch.date || inc.date, v = vesselAt(store.all('Vessels'), f.imo || f.vessel, d0);
      if (!v) throw new Error('船隊資料找不到這艘船：' + (f.vessel || f.imo));
      if (s(v.imo) !== s(inc.imo) || up(v.vessel) !== up(inc.vessel)) { patch.imo = s(v.imo); patch.vessel = up(v.vessel); }
    }
    if ('company' in f && up(f.company) && up(f.company) !== up(inc.company)) { if (!COMPANY_TO_MGMT[up(f.company)]) throw new Error('公司碼不在清單：' + f.company); patch.company = up(f.company); }
    if ('tier' in f && s(f.tier) !== s(inc.tier)) { if (!TIERS[s(f.tier)]) throw new Error('通報分級需為 1、2 或 3'); patch.tier = s(f.tier); patch.priority = TIERS[patch.tier].en; }
    var R = rulesAt(store.all('Rules'), patch.date || inc.date);
    if ('type' in f && up(f.type) !== up(inc.type)) { if (!R.types[up(f.type)]) throw new Error('事故性質代碼不在規範內：' + f.type); patch.type = up(f.type); }
    if ('status' in f && s(f.status) !== s(inc.status)) {
      var st = s(f.status);
      if ([STATUS.OPEN, STATUS.CLOSED, STATUS.VOID].indexOf(st) < 0) throw new Error('狀態只能是 進行中 / 已完成 / 作廢');
      if (st === STATUS.VOID) { need(user, 'admin'); if (psc) throw new Error('PSC 事故不能作廢；請修改對應的 PSC 檢查'); }
      patch.status = st;
      patch.closed_date = st === STATUS.CLOSED ? (isoDate(f.closed_date) || isoDate(inc.closed_date) || store.now().slice(0, 10)) : '';
    } else if ('closed_date' in f && s(inc.status) === STATUS.CLOSED) patch.closed_date = isoDate(f.closed_date);
    if (p.recalc) { var dl = ruleDeadlines(patch.date || inc.date, patch.tier || inc.tier, R); INC_DATE.slice(0, 3).forEach(function (k) { patch[k] = dl[k]; }); patch.rule_set = R.set; }
    var keyChanged = ['date', 'vessel', 'tier', 'type', 'company'].some(function (k) { return k in patch; });
    var newNo = inc.tracking_no;
    if (p.renumber) {
      need(user, 'admin');
      var others = store.all('Incidents').filter(function (r) { return r.tracking_no !== inc.tracking_no; });
      var vv = patch.vessel || inc.vessel, dd = patch.date || inc.date;
      newNo = buildTrackingNo(patch.company || inc.company, vv, dd, patch.tier || inc.tier, patch.type || inc.type, nextSeq(others, vv, dd));
      if (newNo !== inc.tracking_no) { patch.former_no = [s(inc.former_no), inc.tracking_no].filter(Boolean).join('；'); patch.tracking_no = newNo; patch.tracking_no_std = newNo; }
    } else if (keyChanged) warnings.push('編號沒有跟著變更（仍為 ' + inc.tracking_no + '）；需要時請由管理員勾選「重新編號」');
    store.update('Incidents', 'tracking_no', inc.tracking_no, patch);
    if (newNo !== inc.tracking_no) {
      ['Inspections', 'Deficiencies', 'Documents'].forEach(function (t) { store.updateWhere(t, function (r) { return r.tracking_no === inc.tracking_no; }, { tracking_no: newNo }); });
    }
    if (psc && 'status' in patch && patch.status !== STATUS.VOID) store.update('Inspections', 'insp_id', inc.insp_id, { status: patch.status, closed_date: patch.closed_date });
    if (psc && patch.tier) store.update('Inspections', 'insp_id', inc.insp_id, { tier: patch.tier, tier_reason: '人工調整：' + (s(f.tier_reason) || '於事故頁修改') });
    audit(store, user, p.renumber ? 'renumber_incident' : 'update_incident', inc.tracking_no, patch);
    var out = Object.assign({}, inc, patch);
    return { incident: out, warnings: warnings.concat(incidentChecks(out, [], store.all('Rules'), store.now().slice(0, 10)).filter(function (w) { return /4\.2\.4/.test(w); })) };
  }
  /** 事故期限：已存（或人工調整）的優先，否則依事故日期當時有效的規範推算（匯入的舊資料） */
  function incidentDeadlines(inc, rulesRows) {
    var d = isoDate(inc.date), t = TIERS[s(inc.tier)] ? s(inc.tier) : '3';
    var calc = d ? ruleDeadlines(d, t, rulesAt(rulesRows, d)) : { flash_due: '', initial_due: '', rca_due: '' };
    return { flash_due: s(inc.flash_due) || calc.flash_due, initial_due: s(inc.initial_due) || calc.initial_due, rca_due: s(inc.rca_due) || calc.rca_due };
  }

  /* ---------------- rules & ports maintenance (admin) ---------------- */
  function ruleKey(r) { return s(r.rule_set) + '|' + (isoDate(r.valid_from) || '') + '|' + s(r.kind) + '|' + up(r.code); }
  function saveRule(store, user, p) {
    need(user, 'admin');
    var row = {}; SCHEMA.Rules.forEach(function (c) { row[c] = s(p[c]); });
    row.valid_from = isoDate(row.valid_from); row.code = s(row.kind) === 'param' ? s(row.code) : up(row.code);
    if (!row.rule_set || !row.valid_from || !row.kind || !row.code) throw new Error('版本名稱、生效日、類別、代碼都要填');
    if (['tier', 'major', 'type', 'param'].indexOf(row.kind) < 0) throw new Error('類別只能是 tier / major / type / param');
    ['flash_h', 'initial_h', 'progress_d', 'rca_d', 'loss_usd_min', 'deaths_min', 'delay_h_min', 'injury_min'].forEach(function (k) { if (row[k] && num(row[k]) === '') throw new Error(k + ' 需為數字'); });
    if (!row.active) row.active = 'Y';
    var all = store.all('Rules');
    if (!all.length) all = DEFAULT_RULES.map(function (r) { return Object.assign({}, r); });
    var k = ruleKey(row), oldK = s(p.old_key) || k;
    var keep = all.filter(function (r) { return ruleKey(r) !== oldK && ruleKey(r) !== k; });
    if (!p.remove) keep.push(row);
    ['tier', 'major', 'type', 'param'].forEach(function (kd) { store.replaceWhere('Rules', 'kind', kd, keep.filter(function (r) { return r.kind === kd; })); });
    audit(store, user, p.remove ? 'delete_rule' : 'save_rule', k, row);
    return row;
  }
  /** 以某天有效的規範為底，複製成新版本（例如第 2 版正式發行、或第 3 版） */
  function newRuleSet(store, user, p) {
    need(user, 'admin');
    var vf = isoDate(p.valid_from), name = s(p.rule_set);
    if (!vf || !name) throw new Error('請填新版本名稱與生效日');
    var all = store.all('Rules'); if (!all.length) all = DEFAULT_RULES.map(function (r) { return Object.assign({}, r); });
    if (all.some(function (r) { return s(r.rule_set) === name; })) throw new Error('已經有同名的版本：' + name);
    var base = rulesAt(all, isoDate(p.base_date) || vf), rows = [];
    ['tiers', 'major', 'types'].forEach(function (g) { Object.keys(base[g]).forEach(function (c) { rows.push(Object.assign({}, base[g][c], { rule_set: name, valid_from: vf, note: '由「' + base.set + '」複製' })); }); });
    ruleRows(all).filter(function (r) { return r.kind === 'param'; }).forEach(function (r) { if (base.params[s(r.code)] === s(r.value) && !rows.some(function (x) { return x.kind === 'param' && x.code === r.code; })) rows.push(Object.assign({}, r, { rule_set: name, valid_from: vf, note: '由「' + base.set + '」複製' })); });
    var keep = all.concat(rows);
    ['tier', 'major', 'type', 'param'].forEach(function (kd) { store.replaceWhere('Rules', 'kind', kd, keep.filter(function (r) { return r.kind === kd; })); });
    audit(store, user, 'new_rule_set', name, { valid_from: vf, rows: rows.length });
    return { rule_set: name, rows: rows.length };
  }
  function savePort(store, user, p) {
    need(user, 'editor');
    var row = { port: up(p.port), country: normCountry(p.country), lat: s(p.lat), lng: s(p.lng), note: s(p.note) };
    if (!row.port) throw new Error('請填港口');
    var la = parseFloat(row.lat), lo = parseFloat(row.lng);
    if (isNaN(la) || isNaN(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) throw new Error('緯度需在 -90～90、經度需在 -180～180');
    if (store.all('Ports').some(function (r) { return up(r.port) === row.port; })) store.update('Ports', 'port', row.port, row); else store.insert('Ports', row);
    audit(store, user, 'save_port', row.port, row);
    return row;
  }

  /* ---------------- MOU map maintenance ---------------- */
  function saveMOU(store, user, p) {
    need(user, 'admin');
    var row = { country: normCountry(p.country), port: up(p.port), mou: s(p.mou), also: s(p.also), note: s(p.note) };
    if (!row.country) throw new Error('請填港口國');
    var key = function (r) { return normCountry(r.country) + '|' + up(r.port); }, k = key(row), oldK = s(p.old_key) || k;
    if (!p.remove && !row.mou) throw new Error('請選擇 MOU');
    var keep = store.all('MOUMap').filter(function (r) { return key(r) !== oldK && key(r) !== k; });
    if (!p.remove) keep.push(row);
    var cs = [oldK.split('|')[0], row.country].filter(function (c, i, a) { return a.indexOf(c) === i; });
    cs.forEach(function (c) { store.replaceWhere('MOUMap', 'country', c, keep.filter(function (r) { return normCountry(r.country) === c; })); });
    audit(store, user, p.remove ? 'delete_mou' : 'save_mou', k, row);
    return row;
  }
  /** 依對照表重新標示所有檢查的 MOU；overwrite = false 只補空白或 'V' */
  function applyMOU(store, user, p) {
    need(user, 'admin');
    var map = store.all('MOUMap'), groups = {}, missing = {};
    store.all('Inspections').forEach(function (r) {
      var hit = resolveMOU(map, r.country, r.port);
      if (!hit.found) { missing[normCountry(r.country) || '(空白)'] = 1; return; }
      var cur = s(r.mou);
      if (cur === hit.mou && normCountry(r.country) === r.country) return;
      if (cur && cur !== 'V' && !(p && p.overwrite)) return;
      var k = normCountry(r.country) + '|' + hit.mou;
      (groups[k] = groups[k] || { country: normCountry(r.country), mou: hit.mou, ids: {} }).ids[r.insp_id] = 1;
    });
    var n = 0;
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      store.updateWhere('Inspections', function (r) { return !!g.ids[r.insp_id]; }, { mou: g.mou, country: g.country });
      n += Object.keys(g.ids).length;
    });
    audit(store, user, 'apply_mou', String(n), { missing: Object.keys(missing) });
    return { updated: n, missing: Object.keys(missing) };
  }

  function previewNumber(store, user, p) {
    var date = isoDate(p.date), v = vesselAt(store.all('Vessels'), p.imo || p.vessel, date);
    if (!date || !v) return { tracking_no: '', vessel: null };
    var seq = nextSeq(store.all('Incidents'), v.vessel, date);
    var tier = s(p.tier), type = up(p.type || PSC_TYPE);
    return { tracking_no: tier ? buildTrackingNo(v.company, v.vessel, date, tier, type, seq) : '', vessel: v, seq: seq };
  }

  /* ---------------- bribe (facilitation payment) records ---------------- */
  var BRIBE_FIELDS = ['bribe_flag', 'bribe_demanded_usd', 'bribe_paid_usd', 'bribe_cig', 'bribe_goods', 'bribe_note', 'bribe_raw'];
  function num(v) { var t = s(v).replace(/[$,\s]|USD/gi, ''); if (!t) return ''; var n = parseFloat(t); return isNaN(n) ? '' : String(n); }
  var CIG_RE = /^(\d+)\s*(cig|cigs|cigarette|cigarettes|carton|cartons|條|包|香菸|菸)\b/i;
  /** 解析原始紀錄，例如 "$ 1200 + 4 cigarettes"、"40 Cig+Paint"、"$1,800"、1400 */
  function parseBribe(raw) {
    var t = s(raw);
    var out = { bribe_flag: '', bribe_paid_usd: '', bribe_cig: '', bribe_goods: '', bribe_raw: t };
    if (!t) return out;
    var usd = 0, cig = 0, cigAny = false, goods = [];
    t.split('+').map(function (p) { return p.trim(); }).forEach(function (p) {
      var m = p.match(CIG_RE);
      if (m) { cig += Number(m[1]); cigAny = true; return; }
      if (/^(cig|cigs|cigarette|cigarettes|香菸|菸)$/i.test(p)) { cigAny = true; return; }
      var n = p.replace(/[$,\s]|USD/gi, '');
      if (/^\d+(\.\d+)?$/.test(n)) { usd += Number(n); return; }
      if (p) goods.push(p);
    });
    out.bribe_paid_usd = String(usd);
    out.bribe_cig = cig ? String(cig) : (cigAny ? '有（未記數量）' : '');
    out.bribe_goods = goods.join(' + ');
    out.bribe_flag = (usd > 0 || cigAny || goods.length) ? 'Y' : 'N';
    return out;
  }
  /** Y = 有付出（現金或實物）；R = 有索取但未付；N = 無 */
  function bribeFlag(r) {
    if (Number(r.bribe_paid_usd) > 0 || s(r.bribe_cig) || s(r.bribe_goods)) return 'Y';
    if (Number(r.bribe_demanded_usd) > 0) return 'R';
    return 'N';
  }
  function canBribe(user, set) {
    var roles = s((set || {}).bribe_roles || 'admin,editor').split(/[,;\s]+/);
    return !!user && roles.indexOf(user.role) >= 0;
  }

  /* ---------------- Tokyo MOU inspection window & ship risk profile ---------------- */
  var SRP_WINDOW = { HIGH: [2, 4], STANDARD: [5, 8], LOW: [9, 18] };
  function listOf(v) { return s(v).split(/[,;\n]/).map(up).filter(function (x) { return x; }); }
  function addMonths(date, m) {
    var p = isoDate(date).split('-'), y = +p[0], mo = +p[1] - 1 + m, d = +p[2];
    y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
    var last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    return y + '-' + pad2(mo + 1) + '-' + pad2(Math.min(d, last));
  }
  function daysBetween(a, b) { var A = isoDate(a).split('-'), B = isoDate(b).split('-'); return Math.round((Date.UTC(+B[0], +B[1] - 1, +B[2]) - Date.UTC(+A[0], +A[1] - 1, +A[2])) / 864e5); }
  /**
   * 依資料庫最近一次「Tokyo MOU 成員國」檢查日 + SRP 等級，推算下一次檢查窗口。
   * HRS 2–4 個月、SRS 5–8 個月、LRS 9–18 個月；今天超過窗口關閉日 = Priority I，在窗口內 = Priority II。
   */
  function tmouWindow(inspections, imo, srp, today, members) {
    var mem = members && members.length ? members : listOf(DEFAULT_SETTINGS.filter(function (d) { return d.key === 'tmou_members'; })[0].value);
    var ins = (inspections || []).filter(function (i) { return s(i.imo) === s(imo); }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    var lastAny = ins[0] || null;
    var lastT = ins.filter(function (i) { return isTokyo(i, mem); })[0] || null;
    var out = { last_any_date: lastAny ? lastAny.date : '', last_any_port: lastAny ? lastAny.port + ', ' + lastAny.country : '', last_any_mou: lastAny ? s(lastAny.mou) : '',
      last_tmou_date: lastT ? lastT.date : '', last_tmou_port: lastT ? lastT.port + ', ' + lastT.country : '', from: '', to: '', priority: '', days_to_open: '', days_to_close: '', note: '' };
    var w = SRP_WINDOW[up(srp)];
    if (!w) { out.note = '缺少 SRP 風險等級'; return out; }
    if (!lastT) { out.note = '資料庫內沒有 Tokyo MOU 檢查紀錄'; out.priority = 'I'; return out; }
    out.from = addMonths(lastT.date, w[0]); out.to = addMonths(lastT.date, w[1]);
    var t = isoDate(today);
    out.priority = t > out.to ? 'I' : (t >= out.from ? 'II' : '');
    out.days_to_open = daysBetween(t, out.from); out.days_to_close = daysBetween(t, out.to);
    return out;
  }
  /* ---------------- 訪船缺失管理（船管 / 船東 / 其他單位登輪報告的缺失追蹤） ---------------- */
  var VSTATUS = { OPEN: '待改善', SUBMITTED: '待確認', CLOSED: '已關閉', CANCELLED: '撤銷' };
  /** 檢查方（同登輪系統編號）：船名-年度-序號-檢查方-類別 */
  var VISIT_PARTY = { MGR: '管理公司', OWN: '船東 TSL', CLS: '船級', FLG: '船旗國', PSC: 'PSC', VET: 'Vetting / 租家', INS: '保險 / P&I', OTH: '其他' };
  var VISIT_TYPE = { VIR: '船舶檢查（VIR）', VST: '訪船', ISA: '內部稽核（ISM/ISPS/MLC）', SUR: '檢驗', NAV: '航行稽核', DDK: '塢修', OTH: '其他' };
  /** FML VIR 章節：缺失編號的第一段 → 章節名稱 */
  var VIR_SECTIONS = { '2': 'Documentation', '3': 'Crew Management', '4': 'Radio/Navigation', '5': 'Safety / LSA / FFA', '6': 'Environmental', '7': 'Maritime Security', '9': 'Mooring', '10': 'Technical', '11': 'Deck', '12': 'Miscellaneous' };
  function virSection(ref) { var k = s(ref).split('.')[0]; return VIR_SECTIONS[k] || ''; }
  var MON_IDX = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
  /** 2026/10/31、2026-10-31、31 Oct 2026、31-Oct-2026 → 2026-10-31 */
  function parseAnyDate(t) {
    t = s(t); var m;
    if ((m = t.match(/(\d{4})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})/))) return m[1] + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[3]).padStart(2, '0');
    if ((m = t.match(/(\d{1,2})[\s\-]([A-Za-z]{3})[a-z]*[\s\-,]+(\d{4})/)) && MON_IDX[up(m[2])]) return m[3] + '-' + String(MON_IDX[up(m[2])]).padStart(2, '0') + '-' + String(+m[1]).padStart(2, '0');
    return '';
  }
  /** 解析登輪編號：TEH-VICTORY-2026-01-MGR-VIR → { vessel, year, seq, party, vtype } */
  function parseVisitNo(no) {
    var m = up(no).match(/^(.+)-(\d{4})-(\d{1,3})-([A-Z]{2,4})-([A-Z]{2,4})$/);
    return m ? { vessel: m[1].replace(/-/g, ' '), year: m[2], seq: m[3], party: m[4], vtype: m[5] } : null;
  }
  function nextVisitNo(visits, vessel, year, party, vtype) {
    var base = up(vessel).replace(/\s+/g, '-') + '-' + year + '-', n = 0;
    (visits || []).forEach(function (v) { var p = parseVisitNo(v.visit_no); if (p && up(v.visit_no).indexOf(base) === 0) n = Math.max(n, +p.seq); });
    return base + String(n + 1).padStart(2, '0') + '-' + up(party || 'OWN') + '-' + up(vtype || 'VST');
  }
  /**
   * 貼上的缺失清單 → [{ ref, area, finding, action_required, due_date }]
   * 支援：(1) 從 Excel / VIR 匯出貼上的表格（Tab 分隔，可有標題列）；(2) 條列文字（「項目 4.016 (BNWAS)」＋缺失說明／矯正要求／改善期限，或英文 Remark / Action Required / Due）。
   */
  function parseVisitItems(text) {
    text = s(text).replace(/\r/g, '');
    var lines = text.split('\n'), out = [];
    var tabRows = lines.filter(function (l) { return l.indexOf('\t') >= 0; });
    if (tabRows.length >= 1 && tabRows.length >= lines.filter(function (l) { return s(l); }).length * 0.6) {
      var rows = tabRows.map(function (l) { return l.split('\t').map(function (c) { return s(c); }); }), head = rows[0].map(function (c) { return c.toLowerCase(); });
      var find = function (re) { for (var i = 0; i < head.length; i++) if (re.test(head[i])) return i; return -1; };
      var hasHead = head.some(function (c) { return /(remark|finding|缺失|說明|description|action|矯正|due|期限|item|項目|編號|ref)/.test(c); });
      var ix = hasHead ? { ref: find(/^(no\.?|ref\.?|編號|項目編號|缺失編號|sr\.? ?no\.?|item no\.?|code)$/), area: find(/^(item|area|項目|項目名稱|設備|類別|category|equipment)$/), finding: find(/(remark|finding|缺失|observation)/), action: find(/(action|矯正|改善要求)/), due: find(/(due|期限|deadline)/), desc: find(/(description|說明|檢查項)/) }
        : { ref: 0, area: 1, finding: 2, action: 3, due: 4, desc: -1 };
      if (hasHead && ix.finding < 0) ix.finding = ix.desc;
      rows.slice(hasHead ? 1 : 0).forEach(function (r) {
        var g = function (i) { return i >= 0 ? s(r[i]) : ''; };
        var it = { ref: g(ix.ref), area: g(ix.area), finding: g(ix.finding), action_required: g(ix.action), due_date: parseAnyDate(g(ix.due)) };
        if (it.finding || it.action_required) out.push(it);
      });
      return out.map(function (it) { if (!it.section) it.section = virSection(it.ref); return it; });
    }
    var cur = null, clean = function (l) { return s(l).replace(/^[>\s]*[-*•‧·]\s*/, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim(); };
    var label = function (l, re) { var m = l.match(re); return m ? s(l.slice(m[0].length)).replace(/[。.]$/, '') : null; };
    lines.forEach(function (raw) {
      var l = clean(raw); if (!l) return;
      var h = l.match(/^(?:項目|Item|No\.?)?\s*(\d{1,2}\.\d{2,3})\s*[（(]?([^)）:：]*)[)）]?\s*[:：]?\s*$/i);
      if (h) { cur = { ref: h[1], area: s(h[2]), finding: '', action_required: '', due_date: '' }; out.push(cur); return; }
      if (!cur) return;
      var v;
      if ((v = label(l, /^(缺失說明|缺失內容|缺失|說明|Remark|Finding|Observation)\s*[:：]\s*/i)) !== null) cur.finding = v;
      else if ((v = label(l, /^(矯正要求|矯正措施要求|改善要求|Action Required|Action)\s*[:：]\s*/i)) !== null) cur.action_required = v;
      else if ((v = label(l, /^(改善期限|期限|完成期限|Due Date|Due)\s*[:：]\s*/i)) !== null) cur.due_date = parseAnyDate(v);
      else if (!cur.finding) cur.finding = l; else if (!cur.action_required) cur.action_required = l;
    });
    return out.filter(function (it) { return it.finding || it.action_required; }).map(function (it) { it.section = virSection(it.ref); return it; });
  }
  /**
   * FML Paris VIR PDF：以文字座標重建表格。pages = [{ page, items: [{ str, x, y, w }] }]（y 由上往下）
   * 回傳 summary（封面摘要：缺失總數、任務數、各章節缺失數、評分、日期、檢查人員、地點、型態）、
   * defects（DEFECT SUMMARY 章節逐項，含章節與設備小標）、detail（各章節內評分 ≤ 3 的題目，用來交叉比對）
   */
  function parseVirPages(pages) {
    var sum = { defects: null, tasks: null, score: '', categories: {}, date: '', by: '', at: '', type: '', vessel: '', status: '' };
    var defects = [], detail = [], section = '', area = '', cols = null, cur = null, inSummary = false;
    var HEAD = /^(Sr\.?|No\.?|N|o\.|\.|Description|Remark|Action Required|Due|Date|Due Date|Dat e|PMS|PMS Code|PSC|PSC Code|VIQ|VIQ Code|Code|Score|Scor e|Scor|e|re)$/;
    var join = function (items) { items.sort(function (a, b) { return a.x - b.x; }); var out = '', end = -1; items.forEach(function (t) { if (out && t.x - end > 1.2) out += ' '; out += t.str; end = t.x + (t.w || 0); }); return out.replace(/\s+/g, ' ').trim(); };
    var lines = function (items) { var ls = []; items.slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; }).forEach(function (t) { var l = null; for (var i = 0; i < ls.length; i++) if (Math.abs(ls[i].y - t.y) < 2.5) { l = ls[i]; break; } if (l) l.items.push(t); else ls.push({ y: t.y, items: [t] }); }); return ls.sort(function (a, b) { return a.y - b.y; }); };
    var catKey = function (n) { return s(n).replace(/\s+/g, '').toUpperCase(); };
    (pages || []).forEach(function (pg, pi) {
      var items = (pg.items || []).filter(function (t) { return s(t.str); }), ls = lines(items), txt = ls.map(function (l) { return join(l.items); });
      if (pi < 3) {
        var all = txt.join('\n'), m;
        if (sum.defects === null && (m = all.match(/(\d+)\s+Defects?\s*\(out of\s*(\d+)\s*Tasks?\)/i))) {
          sum.defects = +m[1]; sum.tasks = +m[2];
          var rest = all.slice(all.indexOf(m[0]) + m[0].length).split('\n');
          rest[0] = rest[0].replace(/^\s*/, '');
          for (var i = 0; i < rest.length; i++) { var mm = s(rest[i]).match(/^([A-Za-z][A-Za-z\/ &,-]+?)\s+(\d+)$/); if (mm) sum.categories[s(mm[1]).replace(/\s*\/\s*/g, ' / ')] = +mm[2]; else if (/©|Page \d|^Weighted/.test(rest[i])) break; }
        }
        if (!sum.score && (m = all.match(/Overall Score\s*([\d.]+)/))) sum.score = m[1];
        if (!sum.date && (m = all.match(/Date\s+(\d{1,2} \w{3,9} \d{4})\s+Made by\s+(.+?)\s+While at\s+(.+?)\s+Type\s+(\w+)/))) { sum.date = parseAnyDate(m[1]); sum.by = s(m[2]); sum.at = s(m[3]); sum.type = s(m[4]); }
        if (!sum.vessel && (m = all.match(/Vessel Inspection Report\s+(.+)/))) sum.vessel = s(m[1]);
        if (!sum.status && (m = all.match(/Report,\s*[^,]+,\s*([A-Za-z ]+),/))) sum.status = s(m[1]);
      }
      // 表頭位置（同一頁可能有好幾個表）
      var heads = items.filter(function (t) { return s(t.str) === 'Description'; }).map(function (hd) {
        var near = items.filter(function (t) { return Math.abs(t.y - hd.y) < 12; }), f = function (re) { var r = near.filter(function (t) { return re.test(s(t.str)); }); return r.length ? r[0].x - 2 : null; };
        var due = f(/^Due( Date)?$/), pms = f(/^PMS( Code)?$/);
        return { y: hd.y, c: { desc: hd.x - 6, remark: f(/^Remark$/), action: f(/^Action Required$/), due: due, pms: pms, psc: f(/^PSC( Code)?$/), viq: f(/^VIQ( Code)?$/), score: f(/^Scor(e)?$/) } };
      }).filter(function (h) { return h.c.remark && h.c.action && h.c.score; });
      var colOf = function (x) { var c = cols; if (!c) return null; return x < c.desc ? 'sr' : x < c.remark ? 'desc' : x < c.action ? 'remark' : x < (c.due || c.pms || c.score) ? 'action' : x < (c.pms || c.psc || c.score) ? 'due' : x < (c.psc || c.viq || c.score) ? 'pms' : x < (c.viq || c.score) ? 'psc' : x < c.score ? 'viq' : 'score'; };
      ls.forEach(function (l, li) {
        var t = txt[li];
        if (/DEFECT SUMMARY/.test(t)) { inSummary = true; cur = null; return; }
        if (/^Summary of Requirements/.test(t)) { inSummary = false; cur = null; return; }
        var sm = t.match(/^(?:Section \d+ - )?(.+?)\s*Section score\s*[\d.]*/); if (sm) { section = s(sm[1]); area = ''; cur = null; return; }
        if ((sum.by && t === sum.by) || /^(Document generated|©|VIR - )/.test(t) || /Page \d+\/\d+/.test(t) || /generated by Paris/.test(t)) return;
        var h = heads.filter(function (hh) { return Math.abs(l.y - hh.y) < 12; })[0];
        if (h) { cols = h.c; cur = null; return; }
        if (/Summary of Requirements|Next Intermediate|Renewal Due/.test(t)) { cur = null; if (/Summary of Requirements/.test(t)) inSummary = false; return; }
        var nextHead = heads.filter(function (hh) { return hh.y > l.y && hh.y - l.y < 52; })[0], x0 = Math.min.apply(null, l.items.map(function (it) { return it.x; }));
        if (nextHead && x0 < nextHead.c.desc - 6 + 4 && !/^\d+$/.test(t) && !/^\d{1,2}\.\d{3}/.test(t) && !HEAD.test(t)) { area = t; cur = null; return; }
        if (!cols) return;
        var cells = {}; l.items.forEach(function (it) { if (HEAD.test(s(it.str))) return; var c = colOf(it.x); (cells[c] = cells[c] || []).push(it); });
        var desc = cells.desc ? join(cells.desc) : '', code = desc.match(/^(\d{1,2}\.\d{3})\b/);
        if (code) { cur = { ref: code[1], section: section, area: area, page: pg.page, question: '', finding: '', action_required: '', due: '', pms_code: '', psc_code: '', viq_code: '', score: '' }; (inSummary ? defects : detail).push(cur); }
        if (!cur) return;
        [['desc', 'question'], ['remark', 'finding'], ['action', 'action_required'], ['due', 'due'], ['pms', 'pms_code'], ['psc', 'psc_code'], ['viq', 'viq_code'], ['score', 'score']].forEach(function (p) { if (cells[p[0]]) cur[p[1]] = (cur[p[1]] + ' ' + join(cells[p[0]])).trim(); });
      });
    });
    var code = function (v) { return s(v).replace(/\s*\bNext\b.*$/, '').replace(/(\S)\s+(\.\S)/g, '$1$2').replace(/(\.\d+)\s+(\d+)\b/g, '$1$2').replace(/^-$/, '').replace(/^CODE\s*/, ''); };
    var fin = function (r) { r.question = r.question.replace(/^\d{1,2}\.\d{3}\s*/, ''); r.pms_code = code(r.pms_code); r.psc_code = code(r.psc_code); r.viq_code = code(r.viq_code); r.due_date = parseAnyDate(r.due + ' ' + (r.due.match(/\d{4}/) ? '' : (r.pms_code.match(/\b20\d\d\b/) || [''])[0])); r.score = (r.score.match(/\b([1-4]|N\/A)\b/) || [''])[0]; return r; };
    defects.forEach(fin); detail.forEach(fin);
    var detailDefects = detail.filter(function (r) { return /^[123]$/.test(r.score); });
    // 交叉比對：封面摘要 vs DEFECT SUMMARY vs 各章節題目
    var bySec = {}; defects.forEach(function (r) { var k = catKey(r.section); bySec[k] = (bySec[k] || 0) + 1; });
    var rec = Object.keys(sum.categories).map(function (n) { return { section: n, report: sum.categories[n], found: bySec[catKey(n)] || 0 }; });
    Object.keys(bySec).forEach(function (k) { if (!rec.some(function (x) { return catKey(x.section) === k; })) rec.push({ section: defects.filter(function (r) { return catKey(r.section) === k; })[0].section, report: 0, found: bySec[k] }); });
    var inSum = {}; defects.forEach(function (r) { inSum[r.ref] = 1; });
    var onlyDetail = detailDefects.filter(function (r) { return !inSum[r.ref]; });
    return { summary: sum, defects: defects, detailDefects: detailDefects, onlyInDetail: onlyDetail, reconcile: rec,
      ok: sum.defects !== null && sum.defects === defects.length && rec.every(function (x) { return x.report === x.found; }) };
  }

  function visitStamp(store) { var t = new Date(store.now()); return isNaN(t) ? s(store.now()) : t.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'; }
  function saveVisit(store, user, p) {
    need(user, 'editor');
    var no = up(p.visit_no).replace(/\s+/g, '-'), all = store.all('Visits'), old = all.filter(function (v) { return up(v.visit_no) === no; })[0];
    if (!no) throw new Error('請填訪船編號（同登輪系統的編號，例 TEH-VICTORY-2026-01-MGR-VIR）');
    if (p.is_new && old) throw new Error('訪船編號 ' + no + ' 已存在');
    var pv = parseVisitNo(no) || {}, vk = s(p.imo) || s(p.vessel) || pv.vessel, date = isoDate(p.date_from) || isoDate(p.report_date) || isoDate(new Date());
    var ves = vesselAt(store.all('Vessels'), vk, date);
    if (!ves) throw new Error('船隊資料找不到船舶：' + vk);
    var row = {};
    SCHEMA.Visits.forEach(function (c) { row[c] = old ? s(old[c]) : ''; });
    ['vessel', 'party', 'vtype', 'date_from', 'date_to', 'port', 'inspector', 'report_date', 'score', 'reported_defects', 'report_url', 'pic', 'note', 'reported_breakdown', 'tasks', 'report_status'].forEach(function (k) { if (p[k] !== undefined) row[k] = DATE_FIELDS[k] ? isoDate(p[k]) : s(p[k]); });
    Object.assign(row, { visit_no: no, vessel: up(ves.vessel), imo: s(ves.imo), company: s(ves.company), party: up(row.party || pv.party || 'MGR'), vtype: up(row.vtype || pv.vtype || 'VIR'), pic: row.pic || s(ves.pic), updated_by: user.email, updated_at: store.now() });
    if (old) store.update('Visits', 'visit_no', old.visit_no, row);
    else { row.created_by = user.email; row.created_at = store.now(); store.insert('Visits', row); }
    audit(store, user, old ? 'update_visit' : 'create_visit', no, row);
    return row;
  }
  function importVisitItems(store, user, p) {
    need(user, 'editor');
    var no = up(p.visit_no), visit = store.all('Visits').filter(function (v) { return up(v.visit_no) === no; })[0];
    if (!visit) throw new Error('找不到訪船紀錄 ' + no);
    var items = store.all('VisitItems').filter(function (x) { return up(x.visit_no) === no; }), seq = 0, added = [], skipped = 0, skippedRefs = [], updated = [];
    items.forEach(function (x) { seq = Math.max(seq, Number(x.seq) || 0); });
    var key = function (x) { return s(x.ref) ? 'R|' + up(x.ref) : 'F|' + up(x.finding).slice(0, 60); }, have = {};
    items.forEach(function (x) { have[key(x)] = 1; });
    (p.items || []).forEach(function (it) {
      if (!s(it.finding) && !s(it.action_required) && !(p.update_existing && have[key(it)])) return;
      if (have[key(it)]) {
        if (p.update_existing && s(it.ref)) {
          var ex = items.filter(function (x) { return key(x) === key(it); })[0], patch = {};
          ['section', 'area', 'question', 'pms_code', 'psc_code', 'viq_code', 'score'].forEach(function (k) { if (s(it[k]) && s(it[k]) !== s(ex[k])) patch[k] = s(it[k]); });
          if (!s(ex.due_date) && it.due_date) patch.due_date = isoDate(it.due_date) || parseAnyDate(it.due_date);
          if (!s(ex.finding) && s(it.finding)) patch.finding = s(it.finding);
          if (!s(ex.action_required) && s(it.action_required)) patch.action_required = s(it.action_required);
          if (Object.keys(patch).length) { patch.history = s(ex.history) + '\n' + visitStamp(store) + '｜依報告補齊（' + Object.keys(patch).join('、') + '）｜' + user.email; patch.updated_by = user.email; patch.updated_at = store.now(); store.updateWhere('VisitItems', function (x) { return s(x.item_id) === s(ex.item_id); }, patch); updated.push(ex.item_id); }
        }
        skipped++; skippedRefs.push(s(it.ref) || s(it.finding).slice(0, 20)); return;
      }
      seq++; have[key(it)] = 1;
      var row = {}; SCHEMA.VisitItems.forEach(function (c) { row[c] = ''; });
      Object.assign(row, { item_id: visit.visit_no + '-' + String(seq).padStart(2, '0'), visit_no: visit.visit_no, seq: String(seq), ref: s(it.ref), area: s(it.area), section: s(it.section) || virSection(it.ref),
        finding: s(it.finding), action_required: s(it.action_required), due_date: isoDate(it.due_date) || parseAnyDate(it.due_date), risk: s(it.risk), status: VSTATUS.OPEN,
        question: s(it.question), pms_code: s(it.pms_code), psc_code: s(it.psc_code), viq_code: s(it.viq_code), score: s(it.score),
        history: visitStamp(store) + '｜登錄｜' + user.email, created_at: store.now(), updated_by: user.email, updated_at: store.now() });
      store.insert('VisitItems', row); added.push(row.item_id);
    });
    audit(store, user, 'import_visit_items', visit.visit_no, '新增 ' + added.length + ' 項' + (skipped ? '、已存在 ' + skipped : '') + (updated.length ? '、補齊 ' + updated.length : ''));
    return { added: added, skipped: skipped, skippedRefs: skippedRefs, updated: updated };
  }
  /** 修改缺失內容（編號、項目、說明、矯正要求、期限、風險） */
  function saveVisitItem(store, user, p) {
    need(user, 'editor');
    var it = store.all('VisitItems').filter(function (x) { return s(x.item_id) === s(p.item_id); })[0];
    if (!it) throw new Error('找不到缺失 ' + p.item_id);
    var patch = {};
    ['ref', 'area', 'section', 'finding', 'action_required', 'due_date', 'risk', 'corrective_action'].forEach(function (k) { if (p[k] !== undefined) patch[k] = k === 'due_date' ? isoDate(p[k]) : s(p[k]); });
    patch.history = s(it.history) + '\n' + visitStamp(store) + '｜修改｜' + user.email + (s(p.note) ? '｜' + s(p.note) : '');
    patch.updated_by = user.email; patch.updated_at = store.now();
    store.updateWhere('VisitItems', function (x) { return s(x.item_id) === s(p.item_id); }, patch);
    audit(store, user, 'update_visit_item', p.item_id, patch);
    return Object.assign({}, it, patch);
  }
  /**
   * 追蹤動作：submit 船管已提交矯正（待確認）、close 確認關閉、reject 退回（回到待改善）、reopen 重新開啟、cancel 撤銷（admin，登錄錯誤時用）
   */
  function visitItemAction(store, user, p) {
    need(user, 'editor');
    var ids = [].concat(p.item_ids || p.item_id || []).map(s).filter(Boolean), act = s(p.action), done = [];
    if (!ids.length) throw new Error('請選擇缺失');
    var all = store.all('VisitItems'), stamp = visitStamp(store), d = isoDate(p.date) || isoDate(store.now()) || isoDate(new Date());
    ids.forEach(function (id) {
      var it = all.filter(function (x) { return s(x.item_id) === id; })[0];
      if (!it) throw new Error('找不到缺失 ' + id);
      var ca = p.fill_only ? (s(it.corrective_action) || s(p.corrective_action)) : (s(p.corrective_action) || s(it.corrective_action)), patch = {}, label;
      if (act === 'submit') { if (!ca) throw new Error(id + '：請填寫矯正措施'); patch = { status: VSTATUS.SUBMITTED, corrective_action: ca, submitted_at: d }; label = '提交矯正'; }
      else if (act === 'close') { if (!ca) throw new Error(id + '：關閉前請填寫矯正措施'); patch = { status: VSTATUS.CLOSED, corrective_action: ca, closed_at: d, closed_by: user.email, verify_note: s(p.note) || s(it.verify_note) }; if (!s(it.submitted_at)) patch.submitted_at = d; label = '確認關閉'; }
      else if (act === 'reject') { patch = { status: VSTATUS.OPEN, verify_note: s(p.note) }; label = '退回'; }
      else if (act === 'reopen') { patch = { status: VSTATUS.OPEN, closed_at: '', closed_by: '' }; label = '重新開啟'; }
      else if (act === 'cancel') { need(user, 'admin'); patch = { status: VSTATUS.CANCELLED, verify_note: s(p.note) }; label = '撤銷'; }
      else throw new Error('不支援的動作：' + act);
      if (act !== 'cancel' && s(it.status) === VSTATUS.CANCELLED && act !== 'reopen') throw new Error(id + ' 已撤銷');
      patch.history = s(it.history) + '\n' + stamp + '｜' + label + '｜' + user.email + (s(p.note) ? '｜' + s(p.note) : '');
      patch.updated_by = user.email; patch.updated_at = store.now();
      store.updateWhere('VisitItems', function (x) { return s(x.item_id) === id; }, patch);
      done.push(id);
    });
    audit(store, user, 'visit_item_' + act, done.join(','), s(p.note));
    return { done: done };
  }
  /** 缺失的追蹤狀態（含逾期、準時） */
  function visitItemState(it, today) {
    var t = isoDate(today) || isoDate(new Date()), st = s(it.status) || VSTATUS.OPEN, due = isoDate(it.due_date);
    var active = st === VSTATUS.OPEN || st === VSTATUS.SUBMITTED;
    var overdue = active && st === VSTATUS.OPEN && !!due && due < t;
    var doneAt = isoDate(it.submitted_at) || isoDate(it.closed_at);
    var ontime = st === VSTATUS.CLOSED || st === VSTATUS.SUBMITTED ? (!due || (doneAt && doneAt <= due)) : null;
    var daysLeft = active && due ? daysBetween(t, due) : null;
    var age = isoDate(it.closed_at) && it.created_at ? daysBetween(isoDate(it.created_at), isoDate(it.closed_at)) : null;
    return { status: st, active: active, overdue: overdue, ontime: ontime, daysLeft: daysLeft, closeDays: age };
  }
  /** 一組缺失的統計 */
  /** 報告摘要各章節缺失數（reported_breakdown「章節=數量; …」）與系統已登錄缺失逐章比對 */
  function breakdownText(cats) { return Object.keys(cats || {}).map(function (k) { return k + '=' + cats[k]; }).join('; '); }
  function visitBreakdown(visit, items) {
    var key = function (n) { return s(n).replace(/\s+/g, '').toUpperCase(); }, rows = [], idx = {};
    var row = function (name) { var k = key(name); if (!idx[k]) { idx[k] = { section: s(name), report: null, found: 0 }; rows.push(idx[k]); } return idx[k]; };
    nameList(visit && visit.reported_breakdown).forEach(function (x) { var p = x.split('='); if (p.length === 2 && s(p[0])) row(p[0]).report = +s(p[1]) || 0; });
    (items || []).filter(function (it) { return s(it.status) !== VSTATUS.CANCELLED; }).forEach(function (it) { row(it.section || '其他').found++; });
    rows.forEach(function (r) { r.diff = r.report === null ? null : r.found - r.report; });
    var found = rows.reduce(function (a, r) { return a + r.found; }, 0), rep = s(visit && visit.reported_defects) ? +visit.reported_defects : (rows.some(function (r) { return r.report !== null; }) ? rows.reduce(function (a, r) { return a + (r.report || 0); }, 0) : null);
    return { rows: rows, report: rep, found: found, hasBreakdown: rows.some(function (r) { return r.report !== null; }), ok: rep === null ? null : rep === found && rows.every(function (r) { return r.diff === null || r.diff === 0; }) };
  }
  function visitStats(items, today) {
    var o = { total: 0, open: 0, submitted: 0, closed: 0, cancelled: 0, overdue: 0, dueSoon: 0, ontime: 0, late: 0 };
    (items || []).forEach(function (it) {
      var x = visitItemState(it, today); if (x.status === VSTATUS.CANCELLED) { o.cancelled++; return; }
      o.total++; if (x.status === VSTATUS.OPEN) o.open++; if (x.status === VSTATUS.SUBMITTED) o.submitted++; if (x.status === VSTATUS.CLOSED) o.closed++;
      if (x.overdue) o.overdue++; if (x.active && x.daysLeft !== null && x.daysLeft >= 0 && x.daysLeft <= 14) o.dueSoon++;
      if (x.ontime === true) o.ontime++; if (x.ontime === false) o.late++;
    });
    o.closeRate = o.total ? o.closed / o.total : null; o.ontimeRate = (o.ontime + o.late) ? o.ontime / (o.ontime + o.late) : null;
    return o;
  }

  /* ---------------- 週報 / 月報 ---------------- */
  /** ISO 週次（週一至週日），例 2026-W42 */
  function isoWeek(d) {
    var p = isoDate(d).split('-'), t = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])), day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)), w = Math.ceil(((t - y0) / 864e5 + 1) / 7);
    return t.getUTCFullYear() + '-W' + String(w).padStart(2, '0');
  }
  /** kind：week 本週、lastweek 上週、month 本月、lastmonth 上月；ref 為基準日 */
  function periodOf(kind, ref) {
    var d = isoDate(ref) || isoDate(new Date()), p = d.split('-'), y = +p[0], m = +p[1];
    if (kind === 'week' || kind === 'lastweek') {
      var t = new Date(Date.UTC(y, m - 1, +p[2])), dow = t.getUTCDay() || 7, mon = addDays(d, 1 - dow - (kind === 'lastweek' ? 7 : 0));
      return { kind: 'week', from: mon, to: addDays(mon, 6), label: isoWeek(mon) };
    }
    if (kind === 'lastmonth') { m -= 1; if (!m) { m = 12; y -= 1; } }
    var from = y + '-' + String(m).padStart(2, '0') + '-01', last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { kind: 'month', from: from, to: y + '-' + String(m).padStart(2, '0') + '-' + String(last).padStart(2, '0'), label: y + '-' + String(m).padStart(2, '0') };
  }
  /**
   * 期間報告：o = { inspections（含 defs）, incidents, from, to, company }
   * 事故依發生日、PSC 依檢查日落在期間內；作廢不計。另列期間內結案的事故。
   */
  function periodReport(o) {
    var from = isoDate(o.from), to = isoDate(o.to), co = s(o.company);
    var inR = function (d) { d = isoDate(d); return d && d >= from && d <= to; };
    var okCo = function (x) { return !co || s(x.company) === co; };
    var incs = (o.incidents || []).filter(function (x) { return s(x.status) !== STATUS.VOID && okCo(x) && inR(x.date); }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var closed = (o.incidents || []).filter(function (x) { return s(x.status) === STATUS.CLOSED && okCo(x) && inR(x.closed_date); }).sort(function (a, b) { return a.closed_date < b.closed_date ? -1 : 1; });
    var ins = (o.inspections || []).filter(function (i) { return okCo(i) && inR(i.date); }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var defs = [], ships = {};
    ins.forEach(function (i) { ships[s(i.imo) || up(i.vessel)] = 1; (i.defs || []).forEach(function (d) { defs.push(Object.assign({ date: i.date, vessel: i.vessel, port: i.port, insp_id: i.insp_id, tracking_no: i.tracking_no }, d)); }); });
    incs.forEach(function (x) { ships[s(x.imo) || up(x.vessel)] = 1; });
    var nDef = function (i) { return Math.max((i.defs || []).length, Number(i.def_count) || 0); };
    var sum = {
      inc: incs.length, t1: 0, t2: 0, t3: 0, incPsc: 0, incOpen: 0, major: 0, closed: closed.length,
      insp: ins.length, nil: ins.filter(function (i) { return !nDef(i); }).length, withDef: ins.filter(function (i) { return nDef(i) > 0; }).length,
      defs: ins.reduce(function (a, i) { return a + nDef(i); }, 0), det: ins.filter(function (i) { return i.det === true || yes(i.detention); }).length,
      ism: defs.filter(function (d) { return normCode(d.code).slice(0, 2) === '15'; }).length, ships: Object.keys(ships).length
    };
    incs.forEach(function (x) { if (sum['t' + s(x.tier)] !== undefined) sum['t' + s(x.tier)]++; if (s(x.source) === 'PSC' || s(x.insp_id)) sum.incPsc++; if (s(x.status) === STATUS.OPEN) sum.incOpen++; if (s(x.major_level)) sum.major++; });
    sum.defRatio = ins.length ? (sum.ism * 5 + (sum.defs - sum.ism)) / ins.length : null;
    return { from: from, to: to, company: co, incidents: incs, closed: closed, inspections: ins, deficiencies: defs, sum: sum };
  }

  /* ---------------- 事故風險（依每年事故嚴重性）與趨勢 ---------------- */
  function kvList(v) { var o = {}; nameList(v).forEach(function (x) { var p = x.split('='); if (p.length === 2 && s(p[0])) o[s(p[0]).toLowerCase()] = parseFloat(p[1]); }); return o; }
  function incRiskCfg(set) {
    set = set || {}; var d = function (k) { return DEFAULT_SETTINGS.filter(function (x) { return x.key === k; })[0].value; };
    var w = Object.assign(kvList(d('inc_risk_weights')), kvList(set.inc_risk_weights));
    var lv = nameList(s(set.inc_risk_levels) || d('inc_risk_levels')).map(Number).filter(function (n) { return !isNaN(n); });
    if (lv.length < 3) lv = nameList(d('inc_risk_levels')).map(Number);
    return { w: w, levels: lv };
  }
  /** 單件事故分數 */
  function incidentScore(x, cfg) {
    cfg = cfg || incRiskCfg();
    if (s(x.status) === STATUS.VOID) return 0;
    var w = cfg.w, v = numOr(w['tier' + s(x.tier)], 0);
    if (s(x.major_level)) v += numOr(w.major, 0);
    if (s(x.source) === 'PSC' || s(x.insp_id) || x.psc === true) v *= numOr(w.psc, 1);
    return Math.round(v * 100) / 100;
  }
  /** 分數 → 等級：H 高風險、E 偏高、M 一般、L 低風險 */
  function incRiskLevel(score, cfg) { var l = (cfg || incRiskCfg()).levels; return score >= l[0] ? 'H' : score >= l[1] ? 'E' : score >= l[2] ? 'M' : 'L'; }
  /** 一艘船（或一組事故）的年度嚴重性與近 12 個月風險 */
  function incidentRisk(incs, cfg, today) {
    cfg = cfg || incRiskCfg(); var t = isoDate(today) || isoDate(new Date()), from = addMonths(t, -12), years = {}, last12 = 0, n12 = 0;
    (incs || []).forEach(function (x) {
      if (s(x.status) === STATUS.VOID) return;
      var d = isoDate(x.date); if (!d) return;
      var sc = incidentScore(x, cfg), y = d.slice(0, 4), o = years[y] || (years[y] = { score: 0, n: 0, t1: 0, t2: 0, t3: 0, major: 0 });
      o.score += sc; o.n++; if (o['t' + s(x.tier)] !== undefined) o['t' + s(x.tier)]++; if (s(x.major_level)) o.major++;
      if (d > from && d <= t) { last12 += sc; n12++; }
    });
    Object.keys(years).forEach(function (y) { years[y].score = Math.round(years[y].score * 100) / 100; years[y].level = incRiskLevel(years[y].score, cfg); });
    last12 = Math.round(last12 * 100) / 100;
    return { years: years, last12: last12, n12: n12, level: incRiskLevel(last12, cfg) };
  }
  /** 加權線性迴歸（x 為年）；回傳斜率（每年）與截距 */
  function linFit(pts) {
    var sw = 0, sx = 0, sy = 0; (pts || []).forEach(function (p) { var w = p.w || 1; sw += w; sx += w * p.x; sy += w * p.y; });
    if (!sw) return { slope: 0, intercept: 0 };
    var mx = sx / sw, my = sy / sw, num = 0, den = 0;
    pts.forEach(function (p) { var w = p.w || 1; num += w * (p.x - mx) * (p.y - my); den += w * (p.x - mx) * (p.x - mx); });
    var slope = den ? num / den : 0; return { slope: slope, intercept: my - slope * mx };
  }
  function yearFrac(d) { d = isoDate(d); var p = d.split('-'), y = +p[0], st = Date.UTC(y, 0, 1), en = Date.UTC(y + 1, 0, 1); return y + (Date.UTC(y, +p[1] - 1, +p[2]) - st) / (en - st); }
  /** 趨勢摘要：points = [{ d, v, w }]；在 from ~ to 之間計算加權平均、斜率（每年）、期間變化量、與基準的差 */
  function trendSummary(points, from, to, baseline, flatBand) {
    var ps = (points || []).filter(function (p) { return (!from || p.d >= from) && (!to || p.d <= to); });
    var sw = 0, sv = 0; ps.forEach(function (p) { sw += p.w || 1; sv += (p.w || 1) * p.v; });
    if (!ps.length) return { n: 0, w: 0, mean: null, slope: 0, change: 0, dir: 'flat', vsBase: null, start: null, end: null };
    var fit = linFit(ps.map(function (p) { return { x: yearFrac(p.d), y: p.v, w: p.w || 1 }; }));
    var x0 = yearFrac(from || ps[0].d), x1 = yearFrac(to || ps[ps.length - 1].d), mean = sv / sw;
    var start = fit.intercept + fit.slope * x0, end = fit.intercept + fit.slope * x1, change = ps.length > 1 ? end - start : 0;
    var band = flatBand === undefined ? 0.25 : flatBand, slope = ps.length > 1 ? fit.slope : 0;
    return { n: ps.length, w: sw, mean: mean, slope: slope, change: change, start: start, end: end, fit: fit,
      dir: Math.abs(slope) < band ? 'flat' : slope > 0 ? 'up' : 'down', vsBase: baseline === undefined || baseline === null ? null : mean - baseline };
  }
  function inspScore(i) {
    var ism = 0, non = 0, ds = i.defs || [];
    ds.forEach(function (d) { if (normCode(d.code).slice(0, 2) === '15') ism++; else non++; });
    var extra = (Number(i.def_count) || 0) - ds.length; if (extra > 0) non += extra;
    return ism * 5 + non;
  }
  /** 每次檢查一點（v = ISM×5 + 其他缺失，即單次檢查的缺失比） */
  function inspTrendPoints(insps) { return (insps || []).filter(function (i) { return isoDate(i.date); }).map(function (i) { return { d: isoDate(i.date), v: inspScore(i), w: 1, ref: i }; }).sort(function (a, b) { return a.d < b.d ? -1 : 1; }); }
  /** 依季彙整（v = 該季缺失比，w = 檢查次數） */
  function quarterTrendPoints(insps) {
    var q = {};
    (insps || []).forEach(function (i) { var d = isoDate(i.date); if (!d) return; var y = +d.slice(0, 4), qq = Math.floor((+d.slice(5, 7) - 1) / 3), k = y + '-Q' + (qq + 1), o = q[k] || (q[k] = { k: k, d: y + '-' + String(qq * 3 + 2).padStart(2, '0') + '-15', sum: 0, n: 0, det: 0, last: '' }); o.sum += inspScore(i); o.n++; if (d > o.last) o.last = d; if (i.det === true || yes(i.detention)) o.det++; });
    var mx = ''; Object.keys(q).forEach(function (k) { if (q[k].last > mx) mx = q[k].last; });
    return Object.keys(q).sort().map(function (k) { var o = q[k]; return { d: o.d > mx ? mx : o.d, v: o.sum / o.n, w: o.n, label: k, det: o.det }; });
  }
  /** 事故嚴重性依季彙整（v = 該季分數合計） */
  function quarterIncidentPoints(incs, cfg) {
    var q = {}, mx = ''; cfg = cfg || incRiskCfg();
    (incs || []).forEach(function (x) { if (s(x.status) === STATUS.VOID) return; var d = isoDate(x.date); if (!d) return; var y = +d.slice(0, 4), qq = Math.floor((+d.slice(5, 7) - 1) / 3), k = y + '-Q' + (qq + 1), o = q[k] || (q[k] = { d: y + '-' + String(qq * 3 + 2).padStart(2, '0') + '-15', v: 0, n: 0 }); o.v += incidentScore(x, cfg); o.n++; if (d > mx) mx = d; });
    return Object.keys(q).sort().map(function (k) { return { d: q[k].d > mx ? mx : q[k].d, v: Math.round(q[k].v * 100) / 100, w: 1, n: q[k].n, label: k }; });
  }

  /** 名單欄位：有分號或換行就用它們分隔（名稱本身可含逗號，如 Taiwan, China），否則用逗號 */
  function nameList(v) { v = s(v); return v.split(/[;\n]/.test(v) ? /[;\n]/ : /,/).map(function (x) { return s(x); }).filter(function (x) { return x; }); }
  var FLAG_ALIAS = { 'MARSHALL': 'MARSHALL ISLANDS', 'MHL': 'MARSHALL ISLANDS', 'TAIWAN, CHINA': 'TAIWAN', 'TAIWAN, REPUBLIC OF CHINA': 'TAIWAN', 'REPUBLIC OF CHINA': 'TAIWAN', 'ROC': 'TAIWAN', 'R.O.C.': 'TAIWAN', 'TWN': 'TAIWAN', 'CHINESE TAIPEI': 'TAIWAN',
    'HONG KONG, CHINA': 'HONG KONG', 'KOREA, REPUBLIC OF': 'KOREA', 'SOUTH KOREA': 'KOREA', 'REPUBLIC OF KOREA': 'KOREA', 'VIET NAM': 'VIETNAM', 'TÜRKIYE': 'TURKIYE', 'TURKEY': 'TURKIYE',
    'UNITED STATES OF AMERICA': 'USA', 'UNITED STATES': 'USA', 'UNITED KINGDOM': 'UK', 'RUSSIAN FEDERATION': 'RUSSIA', 'SGP': 'SINGAPORE' };
  function flagKey(x) { var k = up(x).replace(/\s*\((UK|1)\)\s*/g, ' ').replace(/\s+/g, ' ').trim(); return FLAG_ALIAS[k] || k; }
  var RO_ALIAS = { 'NK': 'NIPPON KAIJI KYOKAI', 'CLASSNK': 'NIPPON KAIJI KYOKAI', 'LR': "LLOYD'S REGISTER", 'DNV': 'DNV AS', 'DNV GL': 'DNV AS', 'CR': 'CR CLASSIFICATION SOCIETY',
    'ABS': 'AMERICAN BUREAU OF SHIPPING', 'BV': 'BUREAU VERITAS', 'KR': 'KOREAN REGISTER', 'CCS': 'CHINA CLASSIFICATION SOCIETY', 'RINA': 'RINA SERVICES S.P.A.', 'VR': 'VIETNAM REGISTER',
    'IRS': 'INDIAN REGISTER OF SHIPPING', 'RS': 'RUSSIAN MARITIME REGISTER OF SHIPPING', 'RMRS': 'RUSSIAN MARITIME REGISTER OF SHIPPING', 'PRS': 'POLSKI REJESTR STATKOW', 'BKI': 'BIRO KLASIFIKASI INDONESIA' };
  function roKey(x) { var k = up(x).replace(/\s+/g, ' ').trim(); return RO_ALIAS[k] || k; }
  /** 船旗 / RO 在 Tokyo MOU 年度名單的績效：HIGH / LOW / MEDIUM（不在兩份名單）/ ''（沒資料） */
  function listPerf(value, high, low, key) {
    if (!s(value)) return '';
    var k = key(value), inList = function (l) { return nameList(l).some(function (x) { return key(x) === k; }); };
    return inList(high) ? 'HIGH' : inList(low) ? 'LOW' : 'MEDIUM';
  }
  function flagPerf(flag, set) { set = set || {}; return listPerf(flag, set.tmou_white_flags, set.tmou_black_flags, flagKey); }
  function roPerf(ro, set) { set = set || {}; return listPerf(ro, set.tmou_ro_high, set.tmou_ro_low, roKey); }
  /** Tokyo MOU 平均指數（設定值；預設 2026-07-01 ~ 2027-06-30 公告值） */
  function tmouAvg(set) {
    set = set || {}; var d = function (k) { return DEFAULT_SETTINGS.filter(function (x) { return x.key === k; })[0].value; };
    var det = Number(s(set.tmou_avg_detention_index).replace('%', '')), def = Number(set.tmou_avg_deficiency_index);
    return { det: isFinite(det) && s(set.tmou_avg_detention_index) !== '' ? det : Number(d('tmou_avg_detention_index')), def: isFinite(def) && s(set.tmou_avg_deficiency_index) !== '' ? def : Number(d('tmou_avg_deficiency_index')), valid: s(set.tmou_index_valid) || d('tmou_index_valid') };
  }
  var PERF_MATRIX = { 'above|above': 'VERY LOW', 'above|average': 'LOW', 'above|below': 'LOW', 'average|above': 'LOW', 'below|above': 'LOW',
    'average|average': 'MEDIUM', 'average|below': 'MEDIUM', 'below|average': 'MEDIUM', 'below|below': 'HIGH' };
  /**
   * Tokyo MOU 公司績效算法（NIR information sheet §3），可用於一艘船、一家管理公司或整個船隊：
   * 缺失比 = (ISM 缺失 × 5 + 非 ISM 缺失) ÷ 檢查次數；留置率 = 留置次數 ÷ 檢查次數。
   * 與 Tokyo MOU 平均比較：缺失比高 / 低於平均 1 以上、留置率高 / 低於平均 1 個百分點以上，為 above / below，其餘 average；
   * 再依績效矩陣得 VERY LOW / LOW / MEDIUM / HIGH。
   * insps：[{ detention:'Y' 或 det:true, def_count, defs:[{code}] }]
   */
  function perfIndex(insps, avg) {
    avg = avg || tmouAvg();
    var n = 0, ism = 0, non = 0, det = 0;
    (insps || []).forEach(function (i) {
      n++; if (i.det === true || yes(i.detention)) det++;
      var ds = i.defs || [];
      ds.forEach(function (d) { if (normCode(d.code).slice(0, 2) === '15') ism++; else non++; });
      var extra = (Number(i.def_count) || 0) - ds.length; if (extra > 0) non += extra;
    });
    if (!n) return { n: 0, ism: 0, non: 0, det: 0, def_ratio: null, det_rate: null, def_level: '', det_level: '', performance: '' };
    var dr = (ism * 5 + non) / n, rate = det / n * 100;
    var lv = function (v, a, band) { return v > a + band ? 'above' : v < a - band ? 'below' : 'average'; };
    var dl = lv(dr, avg.def, 1), tl = lv(rate, avg.det, 1);
    return { n: n, ism: ism, non: non, det: det, def_ratio: dr, det_rate: rate, def_level: dl, det_level: tl, performance: PERF_MATRIX[tl + '|' + dl] };
  }
  /**
   * 估算 SRP（僅供核對，官方等級以 Tokyo MOU 為準）。
   * HRS：貨櫃船 2 點、船齡 > 12 年 1 點、黑名單船旗 1 點、公司績效 Low / Very Low 2 點、36 個月內每一次缺失 > 5 項的檢查 1 點、留置 ≥ 3 次 1 點；合計 ≥ 4 點為 HRS。
   * LRS：白名單船旗、公司績效 High、36 個月內有檢查且每次缺失 ≤ 5 項、無留置。其餘為 SRS。
   */
  function estimateSRP(o) {
    var today = isoDate(o.today), from36 = addMonths(today, -36);
    var mem = o.members && o.members.length ? o.members : listOf(DEFAULT_SETTINGS.filter(function (d) { return d.key === 'tmou_members'; })[0].value);
    var ins = (o.inspections || []).filter(function (i) { return s(i.imo) === s(o.imo) && i.date >= from36 && isTokyo(i, mem); });
    var pts = 2, why = ['貨櫃船 +2'];
    var age = o.date_of_build ? daysBetween(o.date_of_build, today) / 365.25 : null;
    if (age !== null && age > 12) { pts += 1; why.push('船齡 ' + age.toFixed(1) + ' 年 > 12 +1'); }
    var fk = flagKey(o.flag), has = function (l, key, k) { return (l || []).some(function (x) { return key(x) === k; }); };
    var white = has(o.whiteFlags, flagKey, fk), black = has(o.blackFlags, flagKey, fk);
    if (black) { pts += 1; why.push('船旗績效 Low +1'); }
    var rk = roKey(o.ro), roHigh = !s(o.ro) || !(o.roHigh || []).length || has(o.roHigh, roKey, rk), roLow = s(o.ro) && has(o.roLow, roKey, rk);
    if (roLow) { pts += 1; why.push('RO 績效 Low +1'); }
    var cp = up(o.company_performance);
    if (cp === 'LOW' || cp === 'VERY LOW') { pts += 2; why.push('公司績效 ' + o.company_performance + ' +2'); }
    var big = ins.filter(function (i) { return Number(i.def_count) > 5; });
    if (big.length) { pts += big.length; why.push('缺失 > 5 項的檢查 ' + big.length + ' 次 +' + big.length); }
    var det = ins.filter(function (i) { return s(i.detention) === 'Y'; }).length;
    if (det >= 3) { pts += 1; why.push('留置 ' + det + ' 次 +1'); }
    var lrsMiss = [];
    if (!white) lrsMiss.push('船旗不在 High 名單');
    if (!roHigh) lrsMiss.push('船級（RO）不在 High 名單');
    if (cp !== 'HIGH') lrsMiss.push('公司績效不是 High');
    if (!ins.length) lrsMiss.push('36 個月內無 Tokyo MOU 檢查');
    if (big.length) lrsMiss.push('有缺失 > 5 項的檢查');
    if (det) lrsMiss.push('有留置');
    var level = pts >= 4 ? 'HIGH' : (lrsMiss.length ? 'STANDARD' : 'LOW');
    return { level: level, points: pts, reasons: why, lrs_missing: lrsMiss, inspections_36m: ins.length };
  }
  function currentVessels(vessels, today) {
    var by = {};
    (vessels || []).forEach(function (v) { var k = s(v.imo) || up(v.vessel); (by[k] = by[k] || []).push(v); });
    return Object.keys(by).map(function (k) { return vesselAt(by[k], k, today) || null; })
      .filter(function (v) { return v && (!s(v.valid_to) || s(v.valid_to) >= isoDate(today)); });
  }
  /** 全船隊窗口報表（前端「PSC 窗口」頁與 Apps Script 每日提醒共用） */
  function windowReport(db, today) {
    var set = db.settings || {}, mem = listOf(set.tmou_members), alertDays = Number(set.window_alert_days) || 30;
    var risk = {}; (db.riskProfiles || []).forEach(function (r) { risk[s(r.imo)] = r; });
    var nk = {}; (db.nkStatus || []).forEach(function (r) { (nk[s(r.imo)] = nk[s(r.imo)] || []).push(r); });
    var t = isoDate(today), horizon = addDays(t, alertDays);
    return currentVessels(db.vessels, t).map(function (v) {
      var r = risk[s(v.imo)] || {};
      var w = tmouWindow(db.inspections, v.imo, r.srp, t, mem);
      var est = estimateSRP({ imo: v.imo, today: t, inspections: db.inspections, members: mem, date_of_build: v.date_of_build, flag: v.flag,
        whiteFlags: nameList(set.tmou_white_flags), blackFlags: nameList(set.tmou_black_flags), ro: v.class_society, roHigh: nameList(set.tmou_ro_high), roLow: nameList(set.tmou_ro_low),
        company_performance: r.company_performance });
      var alerts = [];
      (nk[s(v.imo)] || []).forEach(function (x) {
        var end = x.kind === 'cert' ? x.expiry : (x.due || x.to);
        if (x.kind === 'condition' && s(x.label) && up(x.label) !== 'NIL') alerts.push('NK 條件：' + x.label);
        else if (end && end <= horizon && (x.kind === 'cert' || yes(x.next))) alerts.push((x.kind === 'cert' ? '證書到期 ' : '檢驗截止 ') + x.label + ' ' + end + (end < t ? '（已逾期）' : ''));
      });
      return { vessel: v.vessel, imo: v.imo, company: v.company, management: v.management, chinese: v.chinese,
        srp: up(r.srp), srp_as_of: s(r.as_of), company_performance: s(r.company_performance), srp_est: est.level, srp_points: est.points,
        srp_reasons: est.reasons, lrs_missing: est.lrs_missing, srp_mismatch: !!r.srp && up(r.srp) !== est.level,
        last_any_date: w.last_any_date, last_any_port: w.last_any_port, last_any_mou: w.last_any_mou, last_tmou_date: w.last_tmou_date, last_tmou_port: w.last_tmou_port,
        from: w.from, to: w.to, priority: w.priority, days_to_open: w.days_to_open, days_to_close: w.days_to_close, note: w.note,
        opening_soon: !w.priority && w.from && w.from <= horizon, nk_alerts: alerts, nk_data_date: s(v.nk_data_date) };
    }).sort(function (a, b) {
      var rank = function (x) { return x.priority === 'I' ? 0 : x.priority === 'II' ? 1 : x.opening_soon ? 2 : 3; };
      return rank(a) - rank(b) || (s(a.to) < s(b.to) ? -1 : 1);
    });
  }

  /* ---------------- data check (for co-edited Google Sheet) ---------------- */
  var DATE_FIELDS = { date: 1, deadline: 1, rectified_date: 1, closed_date: 1, valid_from: 1, valid_to: 1, flash_due: 1, initial_due: 1, rca_due: 1,
    date_of_build: 1, nk_data_date: 1, as_of: 1, perf_as_of: 1, due: 1, from: 1, to: 1, alt_from: 1, alt_to: 1, expiry: 1, last: 1, source_date: 1,
    flash_at: 1, initial_at: 1, progress_at: 1, rca_at: 1, date_from: 1, date_to: 1, report_date: 1, due_date: 1, submitted_at: 1, closed_at: 1 };
  /** 手動在試算表輸入時的格式差異（例如 2026/10/2、7109）在讀取時統一 */
  function normalizeRow(table, row) {
    var o = {};
    Object.keys(row).forEach(function (k) {
      var v = row[k];
      if (DATE_FIELDS[k] && s(v)) v = isoDate(v) || s(v);
      else if (k === 'code' && table === 'Deficiencies') v = normCode(v) || s(v);
      else if ((k === 'vessel' || k === 'port' || k === 'country') && table !== 'Users') v = up(v);
      else v = s(v);
      o[k] = v;
    });
    return o;
  }
  function validateData(db) {
    var out = [];
    function add(level, table, key, msg) { out.push({ level: level, table: table, key: key, problem: msg }); }
    function dup(rows, table, field) {
      var seen = {};
      rows.forEach(function (r) { var k = s(r[field]); if (!k) return; if (seen[k]) add('錯誤', table, k, field + ' 重複'); seen[k] = 1; });
    }
    var ins = db.inspections || [], defs = db.deficiencies || [], docs = db.documents || [], incs = db.incidents || [], ves = db.vessels || [];
    dup(ins, 'Inspections', 'insp_id'); dup(ins.filter(function (r) { return r.tracking_no; }), 'Inspections', 'tracking_no');
    dup(defs, 'Deficiencies', 'def_id'); dup(docs, 'Documents', 'doc_id'); dup(incs, 'Incidents', 'tracking_no');
    var byId = {}; ins.forEach(function (r) { byId[r.insp_id] = r; });
    var imos = {}; ves.forEach(function (v) { imos[s(v.imo)] = 1; });
    var cnt = {}; defs.forEach(function (d) { cnt[d.insp_id] = (cnt[d.insp_id] || 0) + 1; });
    ins.forEach(function (r) {
      var k = r.insp_id || '(無編號)';
      if (!isoDate(r.date)) add('錯誤', 'Inspections', k, '日期格式不正確：' + r.date);
      if (!s(r.port)) add('錯誤', 'Inspections', k, '缺港口');
      if (!imos[s(r.imo)]) add('錯誤', 'Inspections', k, 'IMO 不在船隊資料：' + r.imo);
      var n = cnt[r.insp_id] || 0;
      if (String(n) !== s(r.def_count)) add('提醒', 'Inspections', k, 'def_count ' + r.def_count + ' 與缺失分頁實際 ' + n + ' 項不符');
      if (n && s(r.nil) === 'Y') add('錯誤', 'Inspections', k, '標為 NIL 卻有缺失');
      if (r.tracking_no) {
        var p = parseTrackingNo(r.tracking_no);
        if (!p) add('錯誤', 'Inspections', k, '事故編號格式無法解析：' + r.tracking_no);
        else if (p.vessel.replace(/\s/g, '') !== up(r.vessel).replace(/\s/g, '')) add('提醒', 'Inspections', k, '事故編號船名 ' + p.vessel + ' 與船名欄 ' + r.vessel + ' 不同');
        if (!incs.some(function (i) { return i.tracking_no === r.tracking_no; })) add('錯誤', 'Inspections', k, '事故登錄找不到 ' + r.tracking_no);
      }
      if (['', 'Y', 'R', 'N'].indexOf(s(r.bribe_flag)) < 0) add('錯誤', 'Inspections', k, 'bribe_flag 只能是 Y / R / N');
      ['bribe_demanded_usd', 'bribe_paid_usd'].forEach(function (f) { if (s(r[f]) && num(r[f]) === '') add('錯誤', 'Inspections', k, f + ' 不是數字：' + r[f]); });
      if (Object.keys(STATUS).map(function (x) { return STATUS[x]; }).indexOf(s(r.status)) < 0) add('錯誤', 'Inspections', k, '狀態不正確：' + r.status);
    });
    defs.forEach(function (d) {
      if (!byId[d.insp_id]) add('錯誤', 'Deficiencies', d.def_id, '找不到對應檢查 ' + d.insp_id);
      if (!/^\d{5}$/.test(s(d.code))) add('錯誤', 'Deficiencies', d.def_id, '缺失代碼需為 5 碼：' + d.code);
      if (s(d.action) && !/^\d{2}(\/\d{2})*$/.test(s(d.action))) add('提醒', 'Deficiencies', d.def_id, '處理代碼格式：' + d.action);
      if (s(d.rectified) && ['Y', 'N'].indexOf(s(d.rectified)) < 0) add('錯誤', 'Deficiencies', d.def_id, 'rectified 只能是 Y / N');
    });
    var incNo = {}; incs.forEach(function (i) { incNo[i.tracking_no] = i; });
    docs.forEach(function (d) {
      if (s(d.insp_id) ? !byId[d.insp_id] : !incNo[d.tracking_no]) add('錯誤', 'Documents', d.doc_id, '找不到對應檢查或事故 ' + (d.insp_id || d.tracking_no || '(空白)'));
    });
    var mmap = db.mouMap || [], noMap = {};
    ins.forEach(function (r) {
      var hit = resolveMOU(mmap, r.country, r.port), k = r.insp_id || '(無編號)';
      if (!hit.found) { noMap[normCountry(r.country) || '(空白)'] = (noMap[normCountry(r.country) || '(空白)'] || 0) + 1; return; }
      if (!s(r.mou) || s(r.mou) === 'V') add('提醒', 'Inspections', k, 'MOU 未標示（對照表為 ' + hit.mou + '）');
      else if (s(r.mou) !== hit.mou && (hit.also || '').indexOf(s(r.mou)) < 0) add('提醒', 'Inspections', k, 'MOU 填「' + r.mou + '」，對照表 ' + r.country + ' 為 ' + hit.mou);
      if (MOU_NAMES.indexOf(s(r.mou)) < 0 && s(r.mou) && s(r.mou) !== 'V') add('提醒', 'Inspections', k, 'MOU 名稱不在標準清單：' + r.mou);
    });
    Object.keys(noMap).forEach(function (c) { add('提醒', 'MOUMap', c, 'MOU 對照表沒有這個港口國（' + noMap[c] + ' 次檢查）'); });
    var pt = portTable(db.ports), noPort = {};
    ins.forEach(function (r) { if (s(r.port) && !pt[up(r.port)]) noPort[up(r.port)] = 1; });
    Object.keys(noPort).forEach(function (pp) { add('提醒', 'Ports', pp, '港口沒有座標，地圖會改用國家中心點'); });
    (db.rules || []).forEach(function (r) { ['flash_h', 'initial_h', 'progress_d', 'rca_d', 'loss_usd_min', 'deaths_min', 'delay_h_min', 'injury_min'].forEach(function (k) { if (s(r[k]) && num(r[k]) === '') add('錯誤', 'Rules', ruleKey(r), k + ' 不是數字：' + r[k]); }); if (!isoDate(r.valid_from)) add('錯誤', 'Rules', ruleKey(r), 'valid_from 日期格式不正確'); });
    mmap.forEach(function (m) { if (MOU_NAMES.indexOf(s(m.mou)) < 0) add('錯誤', 'MOUMap', m.country + (m.port ? ' / ' + m.port : ''), 'MOU 名稱不在標準清單：' + m.mou); });
    var byImo = {}; ves.forEach(function (v) { (byImo[s(v.imo)] = byImo[s(v.imo)] || []).push(v); });
    Object.keys(byImo).forEach(function (k) {
      var rows = byImo[k].slice().sort(function (a, b) { return s(a.valid_from) < s(b.valid_from) ? -1 : 1; });
      for (var i = 1; i < rows.length; i++) {
        if (!s(rows[i - 1].valid_to) || !s(rows[i].valid_from) || s(rows[i - 1].valid_to) >= s(rows[i].valid_from)) add('錯誤', 'Vessels', k, '同 IMO 的生效期間重疊或未填：' + rows[i - 1].vessel + ' / ' + rows[i].vessel);
      }
      rows.forEach(function (v) { if (!COMPANY_TO_MGMT[up(v.company)]) add('錯誤', 'Vessels', k, '公司碼不在清單：' + v.company); });
    });
    incs.forEach(function (i) {
      if (!parseTrackingNo(i.tracking_no)) add('提醒', 'Incidents', i.tracking_no, '事故編號格式無法解析');
      if ([STATUS.OPEN, STATUS.CLOSED, STATUS.VOID].indexOf(s(i.status)) < 0) add('錯誤', 'Incidents', i.tracking_no, '狀態只能是 進行中 / 已完成 / 作廢：' + i.status);
      var R_ = rulesAt(db.rules, i.date), m_ = R_.major[s(i.major_level)];
      if (s(i.major_level) && !m_) add('錯誤', 'Incidents', i.tracking_no, 'major_level 只能是 1、2、3 或空白');
      if (m_ && TIERS[s(i.tier)] && Number(i.tier) > Number(m_.min_tier)) add('提醒', 'Incidents', i.tracking_no, '屬 4.1 ' + m_.name + '，通報分級不得低於第' + m_.min_tier + '級（4.2.4.2）');
      if (s(i.type) && !R_.types[up(i.type)]) add('提醒', 'Incidents', i.tracking_no, '事故性質代碼不在規範內：' + i.type);
      INC_NUM.forEach(function (k) { if (s(i[k]) && num(i[k]) === '') add('錯誤', 'Incidents', i.tracking_no, k + ' 不是數字：' + i[k]); });
      if (s(i.status) === STATUS.CLOSED && !isoDate(i.closed_date)) add('提醒', 'Incidents', i.tracking_no, '已完成但沒有結案日');
      if (s(i.insp_id) && !byId[i.insp_id]) add('錯誤', 'Incidents', i.tracking_no, 'insp_id 找不到對應檢查 ' + i.insp_id);
    });
    return out;
  }

  /* ---------------- imports: official risk file & NK survey status ---------------- */
  function importRisk(store, user, p) {
    need(user, 'editor');
    var vessels = store.all('Vessels'), asOf = isoDate(p.as_of) || store.now().slice(0, 10), n = 0, miss = [];
    (p.vessels || []).forEach(function (r) {
      var v = vesselAt(vessels, r.imo || r.vessel, asOf);
      if (!v || !SRP_WINDOW[up(r.srp)]) { miss.push(r.vessel); return; }
      var row = { imo: s(v.imo), vessel: up(v.vessel), srp: up(r.srp), company_performance: s(r.company_performance), as_of: asOf, source: s(p.source), note: s(r.note) };
      if (store.all('RiskProfiles').some(function (x) { return s(x.imo) === row.imo; })) store.update('RiskProfiles', 'imo', row.imo, row); else store.insert('RiskProfiles', row);
      n++;
    });
    (p.companies || []).forEach(function (c) {
      var code = up(c.code), row = { code: code, name: s(c.name), doc_imo: s(c.doc_imo), tmou_performance: s(c.tmou_performance), perf_as_of: asOf, note: s(c.note) };
      if (!code) return;
      if (store.all('Companies').some(function (x) { return up(x.code) === code; })) store.update('Companies', 'code', code, row); else store.insert('Companies', row);
    });
    audit(store, user, 'import_risk', s(p.source), { updated: n, missing: miss });
    return { updated: n, missing: miss };
  }
  /** 解析 Tokyo MOU「PSC Inspection Window」CSV（網頁上傳與 Apps Script 收件匣共用） */
  function csvRows(text) {
    var rows = [], row = [], cur = '', q = false, t = String(text || '').replace(/^\uFEFF/, '');
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (q) { if (ch === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cur.trim()); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cur.trim()); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur.trim()); rows.push(row); }
    return rows;
  }
  var RISK_CO = { 'FLEET': 'FLEET', 'V-SHIP': 'VSHIPS', 'V-SHIPS': 'VSHIPS', 'BSM': 'BSM', 'TEH SHIPPING': 'TEH', 'TS LINE': 'TSL' };
  function parseRiskCSV(text, name, asOf) {
    var rows = csvRows(text);
    var hi = -1;
    rows.some(function (r, i) { if (r.some(function (c) { return /^VESSEL NAME$/i.test(c); })) { hi = i; return true; } return false; });
    if (hi < 0) throw new Error('找不到「VESSEL NAME」欄位，請確認是 PSC Inspection Window 檔');
    var h = rows[hi].map(function (c) { return up(c); }), col = function (n) { return h.indexOf(n); };
    var cv = col('VESSEL NAME'), cr = col('RISK'), cp = col('COMPANY PERFORMANCE'), cs = col('STATUS'), cpr = col('PRIORITY');
    var vessels = rows.slice(hi + 1).filter(function (r) { return s(r[cv]); }).map(function (r) {
      return { vessel: r[cv], srp: cr >= 0 ? r[cr] : '', company_performance: cp >= 0 ? r[cp] : '',
        note: [cs >= 0 && r[cs] ? '檔案狀態 ' + r[cs] : '', cpr >= 0 ? s(r[cpr]) : ''].filter(Boolean).join(' / ') };
    });
    var companies = [];
    rows.forEach(function (r) { r.forEach(function (c, i) { var k = RISK_CO[up(c)]; if (k && /^\d{7}$/.test(s(r[i + 1]))) companies.push({ code: k, name: c, doc_imo: s(r[i + 1]) }); }); });
    return { as_of: isoDate(asOf) || '', source: s(name), vessels: vessels, companies: companies };
  }
  var NK_FIELDS = { class_society: 'class_society', class_number: 'class_number', flag: 'flag', flag_code: 'flag_code', port_of_registry: 'port_of_registry',
    ship_type: 'ship_type', ism_company: 'ism_company', registered_owner: 'registered_owner', date_of_build: 'date_of_build', gross_tonnage: 'gross_tonnage',
    deadweight: 'deadweight', teu: 'teu', builder: 'builder', data_source_date: 'nk_data_date' };
  /** 主檔值與系統現值是否視為相同（數字 37407 = 37407.0；船旗 Marshall = Marshall Islands） */
  function sameNK(field, a, b) {
    a = s(a); b = s(b);
    if (a === b || up(a) === up(b)) return true;
    if (a !== '' && b !== '' && !isNaN(Number(a)) && !isNaN(Number(b))) return Number(a) === Number(b);
    if (field === 'flag' || field === 'port_of_registry') { var x = normCountry(a), y = normCountry(b); return x === y || x.indexOf(y + ' ') === 0 || y.indexOf(x + ' ') === 0; }
    return false;
  }
  /** 船隊監控系統的 fleet-data.js（window.FLEET = {...}）或 SHIP JSON → SHIP 陣列，只留本系統用得到的欄位 */
  function parseFleetFile(text) {
    text = s(text).replace(/^﻿/, '');
    var t = text.trim(), obj = null;
    if (/^[\[{]/.test(t)) { try { obj = JSON.parse(t); } catch (e) { obj = null; } }
    if (!obj) {
      var at = text.search(/window\.FLEET\s*=/);
      if (at < 0) { if (/^[\[{]/.test(t)) JSON.parse(t); throw new Error('看不懂這個檔案：請選 SHIP JSON，或船隊監控系統的 fleet-data.js'); }
      // 逐字掃描：跳過註解、去掉結尾逗號，直到 FLEET 物件的右大括號（字串內的符號不受影響）
      var i = text.indexOf('{', at), depth = 0, out = [], inStr = false, esc = false, c, e, j, start = i, flush = function (to) { if (to > start) out.push(text.slice(start, to)); };
      for (; i < text.length; i++) {
        c = text.charAt(i);
        if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') { inStr = true; continue; }
        if (c === '/' && (text.charAt(i + 1) === '*' || text.charAt(i + 1) === '/')) {
          flush(i); e = text.charAt(i + 1) === '*' ? text.indexOf('*/', i + 2) + 2 : text.indexOf('\n', i);
          if (e < 2) e = text.length; start = e; i = e - 1; continue;
        }
        if (c === '}' || c === ']') {
          flush(i); start = i;
          for (j = out.length - 1; j >= 0; j--) { var tr = out[j].replace(/\s+$/, ''); if (tr === '') { out.pop(); continue; } out[j] = tr.replace(/,$/, ''); break; }
        }
        if (c === '{' || c === '[') depth++;
        else if (c === '}' || c === ']') { depth--; if (depth === 0) { flush(i + 1); break; } }
      }
      obj = JSON.parse(out.join(''));
    }
    var list = Array.isArray(obj) ? obj : obj.vessel_master ? [obj] : Array.isArray(obj.ships) ? obj.ships : Object.keys(obj).map(function (k) { return obj[k]; });
    return list.filter(function (sh) { return sh && sh.vessel_master && s(sh.vessel_master.imo_number); }).map(function (sh) {
      var vm = { vessel_name: sh.vessel_master.vessel_name, imo_number: s(sh.vessel_master.imo_number) };
      Object.keys(NK_FIELDS).forEach(function (k) { if (sh.vessel_master[k] !== undefined) vm[k] = sh.vessel_master[k]; });
      return { vessel_master: vm,
        certificates: (sh.certificates || []).map(function (c) { return { cert_code: c.cert_code, cert_name: c.cert_name, expiry_date: c.expiry_date }; }),
        surveys: (sh.surveys || []).map(function (x) { return { label: x.label, kind: x.kind, next: x.next, due: x.due, from: x.from, to: x.to, alt_from: x.alt_from, alt_to: x.alt_to, last: x.last }; }),
        conditions: sh.conditions || {} };
    });
  }
  var SHIP_CONST = { date_of_build: 1, gross_tonnage: 1, deadweight: 1, teu: 1, builder: 1 };
  /** 匯入船舶履歷監控系統的 NK SHIP 物件（survey-status-schema v2），可一次多艘。
   *  mode 'class'（預設）：設定 nk_class_fields 列的欄位以 Class 資料為準，其餘只補空白；
   *  'fill' 只補空白；'overwrite' 全部以主檔覆蓋。不同值都列入 conflicts（applied 表示已改）。
   *  改名 / 換管理前的舊列（有失效日）只更新船舶本身不變的欄位（建造日期、GT、DWT、TEU、造船廠）。 */
  function importNK(store, user, p) {
    need(user, 'editor');
    var ships = Array.isArray(p.ships) ? p.ships : [p.ships], done = [], skipped = [], conflicts = [], filled = 0, filledBy = {}, nkRows = {};
    var mode = p.mode === 'overwrite' || p.mode === 'fill' ? p.mode : 'class', vessels = store.all('Vessels'), classF = {};
    s(settingsMap(store).nk_class_fields).split(',').forEach(function (f) { if (s(f)) classF[s(f)] = 1; });
    var lastSrc = {}; store.all('NKStatus').forEach(function (r) { if (s(r.source_date) > (lastSrc[r.imo] || '')) lastSrc[r.imo] = s(r.source_date); });
    ships.forEach(function (sh) {
      var vm = (sh && sh.vessel_master) || {}, imo = s(vm.imo_number).replace(/^'/, '');
      if (!imo) return;
      var mine = vessels.filter(function (v) { return s(v.imo) === imo; });
      if (!mine.length) {
        if (ships.length === 1) throw new Error('船隊資料沒有 IMO ' + imo + '（' + vm.vessel_name + '），請先在系統管理新增船舶');
        skipped.push(up(vm.vessel_name) + ' ' + imo); return;
      }
      var master = {};
      Object.keys(NK_FIELDS).forEach(function (k) { if (vm[k] !== undefined && vm[k] !== null && s(vm[k]) !== '') master[NK_FIELDS[k]] = DATE_FIELDS[NK_FIELDS[k]] ? isoDate(vm[k]) : s(vm[k]); });
      var nFill = 0;
      mine.forEach(function (row) {
        var patch = {};
        var old = s(row.valid_to) !== '';
        Object.keys(master).forEach(function (f) {
          var cur = s(row[f]);
          if (f === 'nk_data_date') { if (cur !== master[f]) patch[f] = master[f]; return; }
          if (cur === '') { if (!old || SHIP_CONST[f]) { patch[f] = master[f]; nFill++; filledBy[f] = (filledBy[f] || 0) + 1; } return; }
          if (sameNK(f, cur, master[f])) return;
          var apply = (mode === 'overwrite' || (mode === 'class' && classF[f])) && (!old || SHIP_CONST[f]);
          conflicts.push({ vessel: row.vessel, imo: imo, field: f, current: cur, master: master[f], applied: apply, former: old, minor: !apply && f === 'builder' && /[㐀-鿿]/.test(cur) });
          if (apply) patch[f] = master[f];
        });
        if (Object.keys(patch).length) store.updateWhere('Vessels', function (v) { return s(v.imo) === imo && s(v.vessel) === s(row.vessel) && s(v.valid_from) === s(row.valid_from); }, patch);
      });
      filled += nFill;
      var src = isoDate(vm.data_source_date), rows = [];
      if (src && lastSrc[imo] && src < lastSrc[imo]) { done.push(up(vm.vessel_name) + '（補 ' + nFill + ' 欄；系統的檢驗資料較新，未覆蓋）'); return; }
      (sh.certificates || []).forEach(function (c) { rows.push({ imo: imo, kind: 'cert', code: s(c.cert_code), label: s(c.cert_name), next: '', due: '', from: '', to: '', alt_from: '', alt_to: '', expiry: isoDate(c.expiry_date), last: '', source_date: src }); });
      (sh.surveys || []).forEach(function (x) { rows.push({ imo: imo, kind: 'survey', code: s(x.kind), label: s(x.label), next: x.next ? 'Y' : 'N', due: isoDate(x.due), from: isoDate(x.from), to: isoDate(x.to), alt_from: isoDate(x.alt_from), alt_to: isoDate(x.alt_to), expiry: '', last: isoDate(x.last), source_date: src }); });
      var cond = sh.conditions || {};
      Object.keys(cond).forEach(function (k) { rows.push({ imo: imo, kind: 'condition', code: k, label: s(cond[k]), next: '', due: '', from: '', to: '', alt_from: '', alt_to: '', expiry: '', last: '', source_date: src }); });
      nkRows[imo] = rows;
      done.push(up(vm.vessel_name) + '（補 ' + nFill + ' 欄、' + rows.length + ' 筆檢驗 / 證書）');
    });
    var imos = Object.keys(nkRows);
    if (imos.length && store.replaceMany) store.replaceMany('NKStatus', 'imo', imos, [].concat.apply([], imos.map(function (k) { return nkRows[k]; })));
    else imos.forEach(function (k) { store.replaceWhere('NKStatus', 'imo', k, nkRows[k]); });
    audit(store, user, 'import_nk', mode + '：' + done.length + ' 艘、補 ' + filled + ' 欄、依主檔更新 ' + conflicts.filter(function (c) { return c.applied; }).length + ' 項、未變更差異 ' + conflicts.filter(function (c) { return !c.applied; }).length + ' 項', done.join('、').slice(0, 1800));
    return { imported: done, mode: mode, filled: filled, filledBy: filledBy, conflicts: conflicts, skipped: skipped };
  }

  function bootstrap(store, user) {
    var out = {
      version: VERSION, user: user, settings: settingsMap(store),
      vessels: store.all('Vessels'), inspections: store.all('Inspections'), deficiencies: store.all('Deficiencies'),
      documents: store.all('Documents'), incidents: store.all('Incidents'), companies: store.all('Companies'),
      riskProfiles: store.all('RiskProfiles'), nkStatus: store.all('NKStatus'), mouMap: store.all('MOUMap'),
      rules: store.all('Rules'), ports: store.all('Ports')
    };
    var tplRows = []; try { tplRows = store.all('Templates'); } catch (e) { tplRows = []; }
    out.templates = templatesOf(tplRows);
    try { out.visits = store.all('Visits'); out.visitItems = store.all('VisitItems'); } catch (e) { out.visits = []; out.visitItems = []; }
    if (!out.rules.length) out.rules = DEFAULT_RULES.map(function (r) { return Object.assign({}, r); });
    if (!out.mouMap.length) out.mouMap = DEFAULT_MOU.map(function (r) { return Object.assign({}, r); });
    out.canBribe = canBribe(user, out.settings);
    if (!out.canBribe) out.inspections.forEach(function (r) { BRIBE_FIELDS.forEach(function (f) { delete r[f]; }); });
    if (user.role === 'admin') out.users = store.all('Users');
    return out;
  }

  function adminSave(store, user, table, key, row) {
    need(user, 'admin');
    var clean = {};
    SCHEMA[table].forEach(function (c) { clean[c] = s(row[c]); });
    if (!clean[key]) throw new Error('缺少 ' + key);
    var exists = store.all(table).some(function (r) { return s(r[key]) === clean[key] && (table !== 'Vessels' || s(r.valid_from) === clean.valid_from); });
    if (exists && table !== 'Vessels') store.update(table, key, clean[key], clean);
    else if (exists) store.updateWhere(table, function (r) { return s(r.imo) === clean.imo && s(r.valid_from) === clean.valid_from; }, clean);
    else store.insert(table, clean);
    audit(store, user, 'save_' + table.toLowerCase(), clean[key], clean);
    return clean;
  }

  function handle(store, user, action, payload) {
    payload = payload || {};
    switch (action) {
      case 'whoami': return user;
      case 'bootstrap': return bootstrap(store, user);
      case 'previewNumber': return previewNumber(store, user, payload);
      case 'saveInspection': return store.lock(function () { return saveInspection(store, user, payload); });
      case 'updateDeficiency': return updateDeficiency(store, user, payload);
      case 'uploadDocument': return store.lock(function () { return uploadDocument(store, user, payload); });
      case 'setCaseStatus': return setCaseStatus(store, user, payload);
      case 'saveIncident': return store.lock(function () { return saveIncident(store, user, payload); });
      case 'updateIncident': return store.lock(function () { return updateIncident(store, user, payload); });
      case 'saveRule': return store.lock(function () { return saveRule(store, user, payload); });
      case 'newRuleSet': return store.lock(function () { return newRuleSet(store, user, payload); });
      case 'savePort': return savePort(store, user, payload);
      case 'saveMOU': return store.lock(function () { return saveMOU(store, user, payload); });
      case 'applyMOU': return store.lock(function () { return applyMOU(store, user, payload); });
      case 'saveUser': return adminSave(store, user, 'Users', 'email', payload);
      case 'saveVessel': return adminSave(store, user, 'Vessels', 'imo', payload);
      case 'saveSetting': return adminSave(store, user, 'Settings', 'key', payload);
      case 'saveVisit': return store.lock(function () { return saveVisit(store, user, payload); });
      case 'importVisitItems': return store.lock(function () { return importVisitItems(store, user, payload); });
      case 'saveVisitItem': return store.lock(function () { return saveVisitItem(store, user, payload); });
      case 'visitItemAction': return store.lock(function () { return visitItemAction(store, user, payload); });
      case 'saveTemplate': return adminSave(store, user, 'Templates', 'code', payload);
      case 'saveCompany': return adminSave(store, user, 'Companies', 'code', payload);
      case 'logReply': return store.lock(function () { return logReply(store, user, payload); });
      case 'saveSettings': return (payload.rows || []).map(function (r) { return adminSave(store, user, 'Settings', 'key', r); });
      case 'importRisk': return store.lock(function () { return importRisk(store, user, payload); });
      case 'importNK': return store.lock(function () { return importNK(store, user, payload); });
      case 'validateData': return validateData(bootstrap(store, user));
      default: throw new Error('未知的操作：' + action);
    }
  }

  return {
    VERSION: VERSION, TIERS: TIERS, TYPES: TYPES, PSC_TYPE: PSC_TYPE, CATEGORIES: CATEGORIES, ACTIONS: ACTIONS, DOC_TYPES: DOC_TYPES,
    SCHEMA: SCHEMA, DEFAULT_SETTINGS: DEFAULT_SETTINGS, STATUS: STATUS, COMPANY_TO_MGMT: COMPANY_TO_MGMT,
    isoDate: isoDate, ymd: ymd, addDays: addDays, normCode: normCode, normAction: normAction, mainAction: mainAction, up: up,
    buildTrackingNo: buildTrackingNo, parseTrackingNo: parseTrackingNo, nextSeq: nextSeq, inspectionId: inspectionId,
    deficiencyId: deficiencyId, documentId: documentId, documentFileName: documentFileName, folderPath: folderPath,
    deadlines: deadlines, pscTier: pscTier, vesselAt: vesselAt, handle: handle,
    BRIBE_FIELDS: BRIBE_FIELDS, parseBribe: parseBribe, bribeFlag: bribeFlag, canBribe: canBribe, num: num,
    SRP_WINDOW: SRP_WINDOW, addMonths: addMonths, daysBetween: daysBetween, listOf: listOf, tmouWindow: tmouWindow, estimateSRP: estimateSRP,
    currentVessels: currentVessels, windowReport: windowReport, normalizeRow: normalizeRow, validateData: validateData, NK_FIELDS: NK_FIELDS, parseFleetFile: parseFleetFile, perfIndex: perfIndex, tmouAvg: tmouAvg, VSTATUS: VSTATUS, VISIT_PARTY: VISIT_PARTY, VISIT_TYPE: VISIT_TYPE, VIR_SECTIONS: VIR_SECTIONS, parseVisitNo: parseVisitNo, nextVisitNo: nextVisitNo, parseVisitItems: parseVisitItems, parseVirPages: parseVirPages, visitBreakdown: visitBreakdown, breakdownText: breakdownText, parseAnyDate: parseAnyDate, visitItemState: visitItemState, visitStats: visitStats, virSection: virSection, isoWeek: isoWeek, periodOf: periodOf, periodReport: periodReport, incRiskCfg: incRiskCfg, incidentScore: incidentScore, incRiskLevel: incRiskLevel, incidentRisk: incidentRisk, linFit: linFit, trendSummary: trendSummary, inspScore: inspScore, inspTrendPoints: inspTrendPoints, quarterTrendPoints: quarterTrendPoints, quarterIncidentPoints: quarterIncidentPoints, yearFrac: yearFrac, DEFAULT_TEMPLATES: DEFAULT_TEMPLATES, templatesOf: templatesOf, replyStage: replyStage, replyVars: replyVars, fillTemplate: fillTemplate, pendingMarks: pendingMarks, enDate: enDate, flagPerf: flagPerf, roPerf: roPerf, flagKey: flagKey, roKey: roKey, nameList: nameList, sameNK: sameNK,
    TOKYO: TOKYO, MOU_NAMES: MOU_NAMES, DEFAULT_MOU: DEFAULT_MOU, normCountry: normCountry, resolveMOU: resolveMOU, isTokyo: isTokyo,
    incidentDeadlines: incidentDeadlines, csvRows: csvRows, parseRiskCSV: parseRiskCSV,
    DEFAULT_RULES: DEFAULT_RULES, RULESET_DEFAULT: RULESET_DEFAULT, rulesAt: rulesAt, ruleDeadlines: ruleDeadlines, suggestMajor: suggestMajor,
    STAGES_LIST: STAGES, reportTimeliness: reportTimeliness, incidentChecks: incidentChecks, ontimeStats: ontimeStats, ruleKey: ruleKey, DEFAULT_PORTS: DEFAULT_PORTS, portTable: portTable
  };
})();
if (typeof module !== 'undefined') module.exports = PSC;
