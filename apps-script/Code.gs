/**
 * TSL PSC System — Google Apps Script backend
 *
 * Bound to the Google Sheet "TSL_PSC_DB" (the database) and runs as the designated Google account.
 * The front-end (GitHub Pages) signs users in with Google, sends the ID token with every request,
 * and this script verifies the token, checks the Users sheet, then calls the shared core (core.gs).
 * Files are saved in Google Drive under: <root>/PSC/<YYYY>/<事故編號>/<事故編號>_<文件代碼>_<NN>.<ext>
 * (non-PSC incidents: <root>/事故/<YYYY>/<事故編號>/...)
 * Daily job (installDailyTrigger): import new Tokyo MOU window CSV files dropped in the Drive inbox, refresh PSCWindow, e-mail alerts.
 *
 * Deploy: Deploy > New deployment > Web app; Execute as: Me; Who has access: Anyone.
 * (Access is still restricted: every call must carry a valid Google ID token of a user listed in Users.)
 */

var TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo?id_token=';

function doGet() {
  return json_({ ok: true, data: { service: 'TSL PSC API', version: PSC.VERSION } });
}

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var store = sheetStore_();
    var user = auth_(req.idToken, store);
    var data = PSC.handle(store, user, req.action, req.payload || {});
    return json_({ ok: true, data: data });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- authentication ---------------- */
function auth_(idToken, store) {
  if (!idToken) throw new Error('請先用 Google 帳號登入');
  var cache = CacheService.getScriptCache();
  var key = 'tok_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  var cached = cache.get(key);
  var info;
  if (cached) {
    info = JSON.parse(cached);
  } else {
    var res = UrlFetchApp.fetch(TOKENINFO + encodeURIComponent(idToken), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('登入已過期，請重新登入');
    info = JSON.parse(res.getContentText());
    var clientId = settings_(store).google_client_id;
    if (!clientId) throw new Error('系統尚未設定 google_client_id（Settings 分頁）');
    if (info.aud !== clientId) throw new Error('登入憑證不屬於本系統');
    if (String(info.email_verified) !== 'true') throw new Error('Google 帳號 email 尚未驗證');
    cache.put(key, JSON.stringify({ email: info.email, name: info.name || '' }), 300);
  }
  var email = String(info.email).toLowerCase();
  var owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  var row = store.all('Users').filter(function (u) { return String(u.email).toLowerCase() === email; })[0];
  if (email === owner) return { email: email, name: (row && row.name) || info.name || email, role: 'admin' };
  if (!row || String(row.active).toUpperCase() === 'N') throw new Error('帳號 ' + email + ' 尚未開通，請聯絡系統管理員');
  return { email: email, name: row.name || info.name || email, role: row.role || 'viewer' };
}

function settings_(store) {
  var m = {};
  store.all('Settings').forEach(function (r) { m[r.key] = r.value; });
  return m;
}

/* ---------------- Sheets / Drive store ---------------- */
function sheetStore_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cache = {};

  function sheet(name) {
    var sh = ss.getSheetByName(name);
    if (!sh) throw new Error('資料庫缺少分頁：' + name + '（請執行 setup）');
    return sh;
  }
  function headers(name) {
    var sh = sheet(name);
    return sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getDisplayValues()[0];
  }
  function read(name) {
    if (cache[name]) return cache[name];
    var sh = sheet(name), last = sh.getLastRow();
    var h = headers(name);
    var rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, h.length).getDisplayValues();
    cache[name] = { h: h, rows: rows };
    return cache[name];
  }
  function toObj(h, r) { var o = {}; h.forEach(function (k, i) { o[k] = r[i]; }); return o; }
  function toRow(h, o) { return h.map(function (k) { return o[k] === undefined || o[k] === null ? '' : String(o[k]); }); }
  function invalidate(name) { delete cache[name]; }

  return {
    all: function (name) {
      var t = read(name);
      return t.rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); })
        .map(function (r) { return PSC.normalizeRow(name, toObj(t.h, r)); });
    },
    insert: function (name, obj) {
      var sh = sheet(name), h = headers(name);
      var r = sh.getLastRow() + 1;
      sh.getRange(r, 1, 1, h.length).setNumberFormat('@').setValues([toRow(h, obj)]);
      invalidate(name);
    },
    update: function (name, keyField, keyValue, patch) {
      this.updateWhere(name, function (o) { return String(o[keyField]) === String(keyValue); }, patch);
    },
    updateWhere: function (name, pred, patch) {
      var t = read(name), sh = sheet(name);
      t.rows.forEach(function (r, i) {
        var o = toObj(t.h, r);
        if (pred(PSC.normalizeRow(name, o))) {
          Object.keys(patch).forEach(function (k) { o[k] = patch[k]; });
          sh.getRange(i + 2, 1, 1, t.h.length).setNumberFormat('@').setValues([toRow(t.h, o)]);
        }
      });
      invalidate(name);
    },
    replaceWhere: function (name, field, value, rows) {
      var t = read(name), sh = sheet(name);
      for (var i = t.rows.length - 1; i >= 0; i--) {
        if (String(PSC.normalizeRow(name, toObj(t.h, t.rows[i]))[field]) === String(value)) sh.deleteRow(i + 2);
      }
      if (rows.length) {
        var start = sh.getLastRow() + 1;
        sh.getRange(start, 1, rows.length, t.h.length).setNumberFormat('@')
          .setValues(rows.map(function (o) { return toRow(t.h, o); }));
      }
      invalidate(name);
    },
    putFile: function (path, fileName, mime, base64) {
      var folder = rootFolder_(this);
      path.forEach(function (p) {
        var it = folder.getFoldersByName(p);
        folder = it.hasNext() ? it.next() : folder.createFolder(p);
      });
      var dup = folder.getFilesByName(fileName);
      if (dup.hasNext()) throw new Error('同名檔案已存在：' + fileName);
      var blob = Utilities.newBlob(Utilities.base64Decode(base64), mime, fileName);
      var file = folder.createFile(blob);
      return { id: file.getId(), url: file.getUrl() };
    },
    now: function () { return Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ss+08:00"); },
    lock: function (fn) {
      var lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try { return fn(); } finally { lock.releaseLock(); }
    }
  };
}

function rootFolder_(store) {
  var id = settings_(store).drive_root_folder_id;
  if (id) return DriveApp.getFolderById(id);
  var folder = DriveApp.createFolder('TSL PSC System');
  store.update('Settings', 'key', 'drive_root_folder_id', { value: folder.getId() });
  return folder;
}

/* ---------------- one-time setup (run from the editor) ---------------- */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(PSC.SCHEMA).forEach(function (name) {
    var cols = PSC.SCHEMA[name];
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var cur = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0] : [];
    var missing = cols.filter(function (c) { return cur.indexOf(c) < 0; });
    if (!cur.length || !cur[0]) {
      sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    } else if (missing.length) {
      sh.getRange(1, cur.length + 1, 1, missing.length).setValues([missing]);
    }
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#1F3864').setFontColor('#FFFFFF');
    sh.getRange(2, 1, Math.max(1, sh.getMaxRows() - 1), sh.getLastColumn()).setNumberFormat('@');
  });
  var store = sheetStore_();
  var have = settings_(store);
  PSC.DEFAULT_SETTINGS.forEach(function (d) { if (!(d.key in have)) store.insert('Settings', d); });
  var owner = Session.getEffectiveUser().getEmail();
  if (!store.all('MOUMap').length) PSC.DEFAULT_MOU.forEach(function (r) { store.insert('MOUMap', r); });
  if (!store.all('Users').some(function (u) { return String(u.email).toLowerCase() === owner.toLowerCase(); })) {
    store.insert('Users', { email: owner, name: '系統管理員', role: 'admin', active: 'Y' });
  }
  rootFolder_(store);
  Logger.log('Setup done. Root folder: ' + settings_(sheetStore_()).drive_root_folder_id);
}


/* ---------------- co-editing helpers (menu in the Google Sheet) ---------------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('TSL PSC')
    .addItem('檢核資料（結果寫入 DataCheck 分頁）', 'runDataCheck')
    .addItem('更新 PSC 窗口（寫入 PSCWindow 分頁）', 'refreshWindows')
    .addItem('立即匯入收件匣的 Tokyo MOU 窗口檔', 'importRiskInbox')
    .addItem('依 MOUMap 補標檢查的 MOU', 'applyMOUBlank')
    .addSeparator()
    .addItem('套用欄位下拉選單與保護', 'applySheetRules')
    .addItem('安裝每日 07:00 排程（匯入 + 窗口 + 提醒）', 'installDailyTrigger')
    .addToUi();
}

function ownerDb_() {
  var store = sheetStore_();
  var owner = { email: Session.getEffectiveUser().getEmail(), name: 'system', role: 'admin' };
  return { store: store, db: PSC.handle(store, owner, 'bootstrap', {}) };
}

function writeSheet_(name, header, rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#1F3864').setFontColor('#FFFFFF');
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setNumberFormat('@').setValues(rows);
  sh.setFrozenRows(1);
  return sh;
}

function runDataCheck() {
  var x = ownerDb_();
  var issues = PSC.validateData(x.db);
  var now = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm');
  writeSheet_('DataCheck', ['檢核時間', '等級', '分頁', '鍵值', '問題'],
    issues.map(function (i) { return [now, i.level, i.table, i.key, i.problem]; }));
  return issues.length;
}

function refreshWindows() {
  var x = ownerDb_();
  var today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  var rep = PSC.windowReport(x.db, today);
  writeSheet_('PSCWindow', ['更新日', '船名', 'IMO', '公司碼', '官方 SRP', '估算 SRP', '公司績效', '最近 Tokyo MOU 檢查', '港口', '窗口開始', '窗口結束', '優先等級', '距開始（天）', '距結束（天）', 'NK 提醒', '備註'],
    rep.map(function (r) {
      return [today, r.vessel, r.imo, r.company, r.srp, r.srp_est, r.company_performance, r.last_tmou_date, r.last_tmou_port, r.from, r.to,
        r.priority ? 'Priority ' + r.priority : (r.opening_soon ? '即將進入' : ''), String(r.days_to_open), String(r.days_to_close), r.nk_alerts.join('；'), r.note];
    }));
  return rep;
}

/** 依 MOUMap 補標 MOU 欄空白（或舊資料 'V'）的檢查 */
function applyMOUBlank() {
  var store = sheetStore_();
  var owner = { email: Session.getEffectiveUser().getEmail(), name: 'system', role: 'admin' };
  var r = PSC.handle(store, owner, 'applyMOU', { overwrite: false });
  Logger.log('MOU 已補標 ' + r.updated + ' 筆；對照表缺：' + r.missing.join('、'));
  return r;
}

/* ---------------- Tokyo MOU window file inbox ----------------
 * Tokyo MOU 沒有公開 API，網站資料也不得未經同意轉載，所以不做自動爬取。
 * 做法：同仁從 Tokyo MOU / APCIS 帳號（或收到的通知信）下載「PSC Inspection Window」CSV，
 * 丟進 Drive 的「Tokyo MOU 收件匣」資料夾；每日排程自動匯入官方 SRP 與公司績效，檔案移到「已匯入」。 */
function inboxFolders_(store) {
  var id = settings_(store).risk_inbox_folder_id, inbox;
  if (id) inbox = DriveApp.getFolderById(id);
  else {
    inbox = rootFolder_(store).createFolder('Tokyo MOU 收件匣');
    var has = store.all('Settings').some(function (r) { return r.key === 'risk_inbox_folder_id'; });
    if (has) store.update('Settings', 'key', 'risk_inbox_folder_id', { value: inbox.getId() });
    else store.insert('Settings', { key: 'risk_inbox_folder_id', value: inbox.getId(), note: 'Tokyo MOU 窗口檔收件匣資料夾 ID' });
  }
  var it = inbox.getFoldersByName('已匯入');
  return { inbox: inbox, done: it.hasNext() ? it.next() : inbox.createFolder('已匯入') };
}

function importRiskInbox() {
  var store = sheetStore_();
  var owner = { email: Session.getEffectiveUser().getEmail(), name: 'system', role: 'admin' };
  var f = inboxFolders_(store), files = f.inbox.getFiles(), out = [];
  var list = [];
  while (files.hasNext()) list.push(files.next());
  list.sort(function (a, b) { return a.getLastUpdated() - b.getLastUpdated(); });  // 舊檔先匯入，最新的最後蓋上
  list.forEach(function (file) {
    var name = file.getName();
    if (!/\.csv$/i.test(name) && String(file.getMimeType()) !== 'text/csv') { out.push({ file: name, error: '不是 CSV（請從 Excel 另存為 CSV UTF-8）' }); return; }
    var stamp = Utilities.formatDate(file.getLastUpdated(), 'Asia/Taipei', 'yyyy-MM-dd');
    try {
      var p = PSC.parseRiskCSV(file.getBlob().getDataAsString('UTF-8'), name, stamp);
      var r = PSC.handle(store, owner, 'importRisk', p);
      file.setName(stamp + '_' + name.replace(/^\d{4}-\d{2}-\d{2}_/, ''));
      file.moveTo(f.done);
      out.push({ file: name, updated: r.updated, missing: r.missing });
    } catch (e) {
      out.push({ file: name, error: String((e && e.message) || e) });
    }
  });
  Logger.log(JSON.stringify(out));
  return out;
}

/** 每日排程：收件匣匯入 → 更新窗口分頁 → 寄信給 Settings.alert_emails */
function dailyJob() {
  var imp = [];
  try { imp = importRiskInbox(); } catch (e) { imp = [{ file: '(收件匣)', error: String((e && e.message) || e) }]; }
  dailyWindowAlert(imp);
}

/** 更新窗口分頁，並寄信（Priority I、Priority II、即將進入窗口、NK 到期、收件匣匯入結果） */
function dailyWindowAlert(imported) {
  imported = Array.isArray(imported) ? imported : [];
  var rep = refreshWindows();
  var set = ownerDb_().db.settings;
  var to = String(set.alert_emails || '').trim();
  if (!to) return;
  var hot = rep.filter(function (r) { return r.priority || r.opening_soon || r.nk_alerts.length; });
  var today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  var overdue = (ownerDb_().db.incidents || []).filter(function (x) { var d = PSC.incidentDeadlines(x); return x.status === PSC.STATUS.OPEN && d.rca_due && d.rca_due < today; })
    .sort(function (a, b) { return PSC.incidentDeadlines(a).rca_due < PSC.incidentDeadlines(b).rca_due ? -1 : 1; });
  if (!hot.length && !imported.length && !overdue.length) return;
  var impText = imported.map(function (x) {
    return x.error ? '✗ ' + x.file + '：' + x.error : '✓ ' + x.file + '：更新 ' + x.updated + ' 艘' + (x.missing.length ? '；船隊資料找不到 ' + x.missing.join('、') : '');
  }).join('\n');
  var line = function (r) {
    var p = r.priority === 'I' ? '【Priority I 已過窗口】' : r.priority === 'II' ? '【Priority II 窗口內】' : r.opening_soon ? '【即將進入窗口】' : '【NK 提醒】';
    return p + ' ' + r.vessel + '（' + r.company + '，SRP ' + (r.srp || '?') + '）窗口 ' + (r.from || '—') + ' ~ ' + (r.to || '—') +
      '；最近 Tokyo MOU 檢查 ' + (r.last_tmou_date || '—') + ' ' + (r.last_tmou_port || '') + (r.nk_alerts.length ? '\n    ' + r.nk_alerts.join('\n    ') : '');
  };
  MailApp.sendEmail({
    to: to,
    subject: 'TSL PSC 窗口提醒 ' + Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd') + '：' + hot.filter(function (r) { return r.priority === 'I'; }).length + ' 艘已過窗口',
    body: (impText ? '【Tokyo MOU 窗口檔匯入】\n' + impText + '\n\n' : '') + hot.map(line).join('\n\n') +
      (overdue.length ? '\n\n【事故 RCA 期限已過仍未結案：' + overdue.length + ' 件】\n' + overdue.map(function (x) { return x.tracking_no + '（RCA ' + PSC.incidentDeadlines(x).rca_due + '，PIC ' + (x.pic || '—') + '）'; }).join('\n') : '') +
      '\n\n（SRP 以最近一次匯入的官方等級為準；窗口依資料庫內最近一次 Tokyo MOU 檢查推算。）'
  });
}

function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (['dailyWindowAlert', 'dailyJob'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyJob').timeBased().everyDays(1).atHour(7).inTimezone('Asia/Taipei').create();
  inboxFolders_(sheetStore_());
}

/** 給共同編輯者的保護：標題列與系統編號欄位設為「編輯時顯示警告」，常用欄位加下拉選單 */
function applySheetRules() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lists = {
    Inspections: { status: ['進行中', '已完成', 'NIL', '歷史資料', '未立案'], nil: ['Y', 'N'], detention: ['Y', 'N'], tier: ['1', '2', '3'], type: ['O'], bribe_flag: ['Y', 'R', 'N'], mou: PSC.MOU_NAMES },
    MOUMap: { mou: PSC.MOU_NAMES },
    Deficiencies: { rectified: ['Y', 'N'] },
    Incidents: { tier: ['1', '2', '3'], type: ['M', 'N', 'C', 'P', 'E', 'S', 'F', 'T', 'O'], status: ['進行中', '已完成'] },
    Vessels: { company: ['FLEET', 'VSHIPS', 'BSM', 'TSL', 'TEH'] },
    Users: { role: ['viewer', 'editor', 'admin'], active: ['Y', 'N'] },
    RiskProfiles: { srp: ['HIGH', 'STANDARD', 'LOW'], company_performance: ['High', 'Medium', 'Low', 'Very Low'] }
  };
  var locked = { Inspections: ['insp_id', 'tracking_no', 'created_by', 'created_at'], Deficiencies: ['def_id', 'insp_id', 'tracking_no'],
    Documents: ['doc_id', 'file_id', 'url', 'file_name'], Incidents: ['tracking_no', 'insp_id'], AuditLog: [] };
  Object.keys(PSC.SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name); if (!sh) return;
    var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
    var rows = Math.max(1, sh.getMaxRows() - 1);
    Object.keys(lists[name] || {}).forEach(function (col) {
      var i = h.indexOf(col); if (i < 0) return;
      var rule = SpreadsheetApp.newDataValidation().requireValueInList(lists[name][col], true).setAllowInvalid(false).build();
      sh.getRange(2, i + 1, rows, 1).setDataValidation(rule);
    });
    sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) { if (/^TSL PSC/.test(p.getDescription())) p.remove(); });
    sh.getRange(1, 1, 1, h.length).protect().setDescription('TSL PSC：標題列（系統依欄名讀寫）').setWarningOnly(true);
    (locked[name] || []).forEach(function (col) {
      var i = h.indexOf(col); if (i < 0) return;
      sh.getRange(2, i + 1, rows, 1).protect().setDescription('TSL PSC：系統編號欄 ' + col).setWarningOnly(true);
    });
    if (name === 'AuditLog') sh.getDataRange().protect().setDescription('TSL PSC：操作紀錄').setWarningOnly(true);
  });
}
