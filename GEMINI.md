# TSL 船隊事故追蹤系統（TSL PSC System）— AI 協作指南

> 給 Gemini 與 Claude 讀的專案說明。讀完這份就能接手修改，不必重新翻整個程式。
> 版本 **v1.16.0**（2026-10-27）。每次改版請一併更新本檔的「版本」與 `CHANGELOG.md`。

---

## 0. 先讀這裡（一分鐘版）

**使用者**：Capt. Albert Yeh，德翔海運（T.S. Lines）船務部海技課 MARTEC 組長。
**語言**：回覆與畫面文字用**繁體中文**；程式識別字、資料欄名用英文；對外文件（寄給船長／管理公司的報告、信）**中英對照**。

**必守規則**

1. `assets/core.js` 和 `apps-script/core.gs` **必須逐字相同**（同一份程式，前端與後端共用）。改了 core.js 就 `cp assets/core.js apps-script/core.gs`。
2. **core.js 只用 ES5 寫法**：`var`、`function`，不用箭頭函式與樣板字串（目前 0 個）。前端 `app.js` 可用 ES2020。
3. **改版要同時改 5 個地方的版本號**：`core.js` 的 `VERSION`、`app.js` 的 `APP_VERSION`、`index.html` 三個 `?v=`、`package.json`、本檔與 `CHANGELOG.md`。版本不一致時網頁頂端會出現紅色或黃色警示，`npm test` 也會失敗。
4. 改完一定跑 `npm test`，全部 passed 才算完成。
5. **repo 不放任何資料**：PSC 紀錄、事故、示範資料（`data/seed.json`）只存在 Google 試算表、Drive 或本機。`.gitignore` 已排除 `*.xlsx *.csv *.pdf seed*.json data/ dist/`。
6. **不寫存取碼**、不寫帶 `?k=` 的網址、不收護照或身分證號碼。
7. **時間一律 UTC 記到分**（`yyyy-MM-dd HH:mm`）；日期欄位存 `yyyy-MM-dd`。
8. **船舶以 IMO 為主鍵**（船名會重複使用：TS SHANGHAI、TS MUMBAI 等有新舊兩艘）。船舶規格（船級、GT／DWT、TEU、建造日期、船旗）以 **Class 資料**為準。
9. 只讀公開資料：MOU 年報可以自動抓；APCIS（Tokyo MOU）、THETIS（Paris MOU）檢查資料庫**不爬取**。
10. 沿用既有架構（Google Sheet＋Apps Script＋GitHub Pages 靜態頁），零授權費；新增功能前先確認系統裡是否已經有。

**改完之後的檢查清單**

- [ ] `npm test` 全部 passed
- [ ] `cmp assets/core.js apps-script/core.gs` 沒有輸出
- [ ] 5 個版本號一致
- [ ] 新增資料表或欄位 → `core.js` 的 `SCHEMA` 已加；提醒使用者在 Apps Script 執行 `setup`
- [ ] 新增設定值 → `DEFAULT_SETTINGS` 已加（含中文 note）
- [ ] README.md 對應章節、CHANGELOG.md 已更新
- [ ] 示範版能開（`python3 tools/build_demo.py` 後開 `dist/local_demo.html`）

---

## 1. 專案背景

- **組織**：海技課 MARTEC（Albert Yeh、HS Wu、Alan Liu、Chloe Huang、Rachel Lin）。協作單位：船員課、法務、企劃、副總。
- **船隊**：44 艘貨櫃船（987–7,092 TEU），6 個系列。管理公司：FML（代碼 `FLEET`）24 艘、V.Ships（`VSHIPS`）13 艘、BSM 2 艘、自管（`TSL`／`TEH`）5 艘。
- **第三方監管**：KPMG 要求船東能證明如何監督管理公司。所以訪船缺失、PSC、事故都要可追溯、有紀錄（AuditLog）。
- **本系統的定位**：海技作業平台的一部分。其他系統：船管登輪審查系統（訪船配號，編號例 `TS-DALIAN-2026-03-MGR-VIR`）、紅海戰險通報、Fleet Monitor（證書與 NK 檢驗）、MARTEC 通告、海技課週報、分工表。各系統各自一份船隊清單，未來要整合成一份主檔。
- **正式網址**：前端 tsl-psc.vercel.app（GitHub repo `AlbertYehYP/tsl-psc`）；後端是綁在試算表 `TSL_PSC_DB` 上的 Apps Script 網頁應用程式。

## 2. 架構

```
瀏覽器（index.html + assets/app.js + assets/core.js + assets/app.css）
   │  Google 登入取得 ID token
   │  POST {idToken, action, payload}  →  Apps Script 網頁應用程式（/exec）
   ▼
apps-script/Code.gs   驗證 token、查 Users 角色 → PSC.handle(store, user, action, payload)
apps-script/core.gs   = assets/core.js（共用的商業邏輯、資料表定義、解析器）
   │  sheetStore_()：以欄名讀寫 Google 試算表各分頁；putFile：存到 Drive
   ▼
Google 試算表 TSL_PSC_DB（每個 SCHEMA 一個分頁）＋ Drive「TSL PSC System」資料夾
```

- **共用核心**：`core.js` 匯出全域物件 `PSC`（瀏覽器）或 `module.exports`（Node 測試）。所有寫入都走 `PSC.handle(store, user, action, payload)`，讀取走 `bootstrap`。
- **Store 介面**：`all(table)`、`insert(table,row)`、`update(table,keyField,key,patch)`、`updateWhere(table,fn,patch)`、`replaceWhere(table,field,value,rows)`、`replaceMany`、`putFile`、`now()`、`lock(fn)`。正式版由 `Code.gs` 的 `sheetStore_()` 實作，測試與示範版由 `tests/memstore.js`、`app.js` 的 `memStore()` 實作。
- **示範模式**：`config.js` 的 `demo: true` 時不連後端，`Demo` 物件用瀏覽器記憶體跑同一份 `PSC.handle`；資料來自 `window.PSC_DEMO_SEED`。
- **外部程式庫**（全部從 CDN 依需要載入）：d3 7.9.0（jsdelivr）、pdf.js（cdnjs，讀 VIR／年報 PDF）、pdf-lib（cdnjs，壓縮 PDF）、SheetJS 0.18.5（cdnjs，讀 Excel）。

## 3. 檔案地圖

| 檔案 | 行數 | 角色 |
|---|---|---|
| `index.html` | ~40 | 外殼；`<!--APP-->` 區塊是畫面骨架；載入 `config.js`、`core.js?v=`、`app.js?v=`、`app.css?v=` |
| `config.js` | 12 | 前端設定：`apiUrl`（Apps Script /exec）、`googleClientId`、`demo`、`orgName`、`systemName`。不放密碼 |
| `assets/core.js` | ~2,550 | 共用核心（ES5）：SCHEMA、預設設定、編號、規則、事故、PSC、窗口、績效、訪船缺失、VIR 解析、單船報告、外部 PSC 資料庫、MOU 年報、比較趨勢、`handle` |
| `assets/app.js` | ~3,200 | 前端（ES2020）：登入、API、狀態 `S`、資料模型 `M`、各分頁畫面 `v*()`、圖表、匯入視窗、報告輸出 |
| `assets/app.css` | ~630 | 樣式；顏色用 `:root` 變數（`--accent`、`--ink`、`--muted`、`--surface`、`--line`、`--rk-*` 風險色），支援深色主題 |
| `assets/world-110m.json` | — | 地圖用 TopoJSON |
| `apps-script/Code.gs` | ~500 | 後端：`doGet`／`doPost`、登入驗證、`sheetStore_`、`setup`、試算表選單、每日排程、Tokyo MOU 窗口收件匣、`fetchUrl_`、MOU 年報每季檢查 |
| `apps-script/core.gs` | — | 與 `assets/core.js` 相同 |
| `apps-script/appsscript.json` | — | V8 runtime、時區 Asia/Taipei |
| `tests/core_test.js` | ~700 | 核心測試（Node `assert`），每段結尾印 `... passed` |
| `tests/gas_test.js` | ~180 | 用 `vm` 模擬 SpreadsheetApp、DriveApp、UrlFetchApp、MailApp 跑 `Code.gs` |
| `tests/memstore.js` | 19 | 測試用記憶體 Store |
| `tests/fixtures_*.json` | — | 去識別化的 VIR 報告 PDF 文字（FML×3、V.Ships、BSM×2），解析器回歸測試用 |
| `tools/build_demo.py` | — | 打包單檔示範版到 `dist/` |
| `docs/NUMBERING.md` | — | 事故追蹤編號規則全文 |
| `README.md` | ~400 | 使用者手冊（部署、各功能說明） |
| `CHANGELOG.md` | — | 版本紀錄與 AI 交接紀錄 |
| `GEMINI.md`／`CLAUDE.md` | — | 本指南（CLAUDE.md 只是引用本檔） |
| `.vercelignore` | 5 | 網站只部署 `index.html`、`config.js`、`assets/`；其他檔案（說明、Apps Script、測試、工具）只在 GitHub，不會出現在網站上。新增網站要用的檔案時，必須放在 `assets/` 或加進這份清單 |

## 4. 前端結構（app.js）

- **全域狀態**：`S`（畫面狀態：目前分頁 `S.tab`、篩選、各功能的子狀態如 `S.cmp`、`S.pi`、`S.dos`、`S.cardOrder`）；`M`（`buildModel(raw)` 把 `bootstrap` 的資料整理成模型：`M.insp`、`M.incidents`、`M.vessels`、`M.vreg`（依 IMO 彙整的船舶）、`M.visits`、`M.portPsc`、`M.portStats`、`M.settings`…）。
- **流程**：`reload()` 呼叫 `api('bootstrap')` → `buildModel` → `render()` 依 `S.tab` 呼叫對應的 `v*()` 畫面函式，整頁 `innerHTML` 重畫後再綁事件。
- **常用工具**：`$`、`esc`（HTML 跳脫，所有插入的文字都要過）、`fmt`（千分位）、`dfmt`（日期 yyyy/mm/dd）、`opt`（`<option>`）、`can(role)`、`api(action,payload)`、`run(fn, btn)`（執行並顯示錯誤）、`toast`、`openModal({title, html, foot, onMount})`、`showTip`／`hideTip`。
- **分頁與畫面函式**（`SECTIONS`）

| 主分頁 | 子分頁 key → 函式 |
|---|---|
| 事故管理 `inc` | `inc-overview` 事故分析 → `vIncOverview`；`inc-vessels` 船舶事故 → `vIncVessels`；`incidents` 事故登錄與處理 → `vIncidents`；`report` 週報／月報 → `vReport`；`inc-rules` 事故規範 → `vIncRules` |
| 訪船缺失 `vf` | `vf-overview` → `vVfOverview`；`visits` 訪船紀錄 → `vVisits`；`vf-items` 缺失追蹤 → `vVfItems`；`vf-ships` 船舶履歷 → `vVfShips`（含 `shipHistory`、單船報告 `vDossier`） |
| PSC 檢查 `psc` | `overview` → `vOverview`；`map` → `vMap`；`inspections` → `vInspections`；`records` → `vRecords`；`vessels` 船舶檔案 → `vVessels`（含船隊趨勢、比較趨勢 `cmpHTML/wireCmp`、管理公司績效）；`window` PSC 窗口 → `vWindow`；`portintel` 港口／國家 → `vPortIntel`；`bribe` → `vBribe`；`codes` → `vCodes` |
| 綜合資訊 `home`（預設首頁） | `home` → `vHome`（草稿：三欄重點、每月動態、需要處理、需要關注的船舶） |
| 系統管理 `admin` | `admin` → `vAdmin` |

- **圖表**：`multiLineChart(el, o)`（多線比較，圖例可切換，滑過顯示當季數值）、`trendChart(card, o)`（單一趨勢＋移動平均＋下方可拖曳時間軸）、`monthChart`（每月長條）、單船報告用的靜態 SVG `dosSvg`（列印與 Outlook 用，不依賴 d3）。
- **v1.14 動畫**：`drawLineIn(svg, path, dots, {delay, dur})` 讓線條依序「畫出來」（實線用 stroke-dashoffset，虛線用遮罩），點在線畫到時跳出；電腦設定「減少動態效果」時不播放；圖例切換時不重播（`o.still`）。
- **v1.14 卡片拖移**：`sortableCards(grid, {key, attr, handle, area, persist, onChange})`。滑鼠直接拖；手機長按 0.38 秒後拖；拖移把手 `.drag-h` 按住即拖；鍵盤 Alt＋方向鍵。排列存在瀏覽器 localStorage（`tsl-psc.order.<key>`），有「恢復預設排列」。用在：港口卡片（`pi`，順序即 `S.pi.targets`，圖的線色跟著卡片）、PSC 船舶卡片（`psc-vessels`）、船舶事故卡片（`inc-vessels`）、船舶履歷（`vf-ships`）、訪船紀錄（`visits`）。改了排序下拉選單會清掉自訂排列。
- **v1.15 右側快速連結**：`qnavInit()`（開站時建立，MutationObserver 監看 `#view`）、`qnavBuild()` 取 `#view` 內最上層、含 `h2` 的 `.card` 當區塊（3 個以上才顯示），`qnavSpy()` 依捲動標示目前區塊。新頁面只要用 `.card` + `h2` 就會自動出現在快速連結。
- **v1.15 文件列表**：`docListHTML(docs, psc, docsDel)` 附修改／刪除／還原按鈕與修改紀錄；按鈕由 document 層級的 click 委派處理（`data-docedit`、`data-docdel`、`data-docrest` → `docModal`）。事故頁 `incUpdatesHTML`、`updModal`、`updDelModal`。
- **雙語報告**：單船報告用 `dosL(lang)`、`dosT(lang)` 產生中文／英文／中英；`lang` 為 `zh`、`en`、`both`。

## 5. 資料表（SCHEMA，每個是試算表的一個分頁）

> 欄位順序就是試算表的欄位順序。`setup()` 只會補缺的分頁與欄位，不會清資料。所有值以文字存（`@` 格式）。

- **Inspections**：insp_id, tracking_no, date, port, country, mou, vessel, imo, company, management, nil, detention, def_count, tier, type, tier_reason, status, pic, flash_due, initial_due, rca_due, closed_date, remarks, bribe_flag, bribe_demanded_usd, bribe_paid_usd, bribe_cig, bribe_goods, bribe_note, bribe_raw, created_by, created_at, updated_by, updated_at
- **Deficiencies**：def_id, insp_id, tracking_no, seq, code, category, nature, action, deadline, rectified, rectified_date, corrective_action, remarks, updated_by, updated_at
- **Documents**：doc_id, insp_id, tracking_no, doc_type, seq, file_name, original_name, mime, size, file_id, url, note, uploaded_by, uploaded_at, status, deleted_by, deleted_at, delete_reason, history, updated_by, updated_at
- **IncidentUpdates**（管理公司更新紀錄）：upd_id, tracking_no, received_at, stage, source, channel, content, entered_by, entered_at, status, history, updated_by, updated_at
- **Incidents**：tracking_no, tracking_no_std, date, company, vessel, imo, tier, type, priority, unit, status, pic, summary, closed_date, source, insp_id, check_notes, flash_due, initial_due, rca_due, corrective_action, created_by, created_at, updated_by, updated_at, location, major_level, loss_usd, deaths, injuries, delay_h, ert, ert_chair, force_majeure, fm_note, flash_at, initial_at, progress_at, rca_at, due_note, close_checks, former_no, rule_set, reply_log
- **Vessels**：vessel, imo, chinese, company, management, manager, pic, pic_email, valid_from, valid_to, series, flag, note, doc_company_imo, class_society, class_number, flag_code, port_of_registry, ship_type, ism_company, registered_owner, date_of_build, gross_tonnage, deadweight, teu, builder, nk_data_date, service
- **Companies**：code, name, doc_imo, tmou_performance, perf_as_of, note, greeting, email_to, email_cc
- **RiskProfiles**：imo, vessel, srp, company_performance, as_of, source, note
- **MOUMap**：country, port, mou, also, note
- **Rules**：rule_set, valid_from, kind, code, name, name_en, flash_h, initial_h, progress_d, rca_d, loss_usd_min, deaths_min, delay_h_min, injury_min, ert_chair, min_tier, value, criteria, ref, active, note
- **Ports**：port, country, lat, lng, note
- **NKStatus**：imo, kind, code, label, next, due, from, to, alt_from, alt_to, expiry, last, source_date
- **Users**：email, name, role, active
- **Settings**：key, value, note
- **Templates**：code, stage, name, subject, body, sort, active, note
- **Visits**：visit_no, vessel, imo, company, party, vtype, date_from, date_to, port, inspector, report_date, score, reported_defects, report_url, pic, note, created_by, created_at, updated_by, updated_at, reported_breakdown, tasks, report_status
- **VisitItems**：item_id, visit_no, seq, ref, area, section, finding, action_required, due_date, risk, status, corrective_action, submitted_at, closed_at, closed_by, verify_note, history, created_at, updated_by, updated_at, question, pms_code, psc_code, viq_code, score, ftype
- **PortPSC**（外部 PSC 檢查／留置紀錄）：rec_id, source, mou, country, port, date, vessel, imo, flag, ship_type, ro, detained, def_count, codes, deficiencies, company, batch, imported_by, imported_at, note
- **PortStats**（MOU 年報統計）：stat_id, source, year, mou, country, port, inspections, with_def, deficiencies, detentions, detention_rate, by_category, batch, imported_by, imported_at, note, kind, ship_type, ships, all_inspections, top_items, ref
- **RightShip**：imo, vessel, as_of, safety_score, indicative, doc_subscore, ghg_rating, source, note, updated_by, updated_at
- **AuditLog**：ts, user, action, ref, detail

**重要語意**

- `Vessels` 同一 IMO 可有多列，用 `valid_from`／`valid_to` 表示改名或換管理公司的期間；`currentVessels(vessels, today)` 取目前有效的。公司碼 `company`：FLEET、VSHIPS、BSM、TSL、TEH。
- 有缺失的 PSC 檢查同時是一件 O 類事故：資料存在 `Inspections`，`Incidents` 只放編號、等級、狀態，用 `insp_id` 連回去。
- `VisitItems.status`：待改善 → 待確認 → 已關閉（或撤銷）；`item_id` = 訪船編號 + `-NN`。
- `PortStats.kind`：`authority`（各主管機關）、`total`（全區，country = TOTAL）、`shiptype`（例：貨櫃船，country = TOTAL、ship_type = CONTAINER）。`by_category`、`top_items` 是 JSON 字串。Tokyo MOU 的 `inspections` 是**初次檢查**數，留置率＝留置 ÷ 初次檢查。
- 更新 PortStats 時，空白欄位**不會**覆蓋原值。
- `Documents.status`、`IncidentUpdates.status` = `已刪除` 表示軟刪除（`PSC.DOC_DELETED`）；不真的刪資料。`history` 欄每行一筆：`yyyy-MM-dd HH:mm UTC｜人員｜動作｜原因：…`（`stampLine`）。修改、刪除一律要原因。
- 通報時限用「證據」判定：`evidenceDocs(docs, updates)` = 未刪除的文件＋未刪除的更新紀錄（階段 flash/initial/progress/rca/close 對應 FLASH/INIT/UPD/RCA/CLOSE，以 received_at 計）。前端事故物件 `x.ev` 就是它，`x.timely`、`x.checks`、回信建議階段都用 `x.ev`。

## 6. 後端動作（`PSC.handle` 的 action）

權限：viewer＜editor＜admin（`need(user, role)`）。

`whoami`、`bootstrap`（讀全部資料）、`previewNumber`、`saveInspection`、`updateDeficiency`、`uploadDocument`、`setCaseStatus`、`saveIncident`、`updateIncident`、`saveRule`、`newRuleSet`、`savePort`、`saveMOU`、`applyMOU`、`saveUser`、`saveVessel`、`saveSetting`、`saveSettings`、`saveVisit`、`importVisitItems`、`saveVisitItem`、`visitItemAction`、`saveTemplate`、`saveCompany`、`logReply`、`importRisk`、`importNK`、`validateData`、`importPortPsc`、`importPortStats`、`deletePortBatch`（admin）、`loadMouData`、`importMouAnnual`、`saveRightShip`、`updateDocument`、`deleteDocument`、`restoreDocument`（admin）、`saveIncidentUpdate`（新增或修改，修改要 reason）、`deleteIncidentUpdate`。

只在 `Code.gs` 處理（不經 core）：`fetchUrl`（editor 以上，後端抓網址，20 MB 上限）、`mouWatchNow`（admin，立即檢查 MOU 官網）、`mouPdf`（讀 Drive 上待匯入的年報 PDF）。示範模式呼叫這三個會顯示「示範模式不連線外部網站」。

**Apps Script 排程與選單**（試算表選單「TSL PSC」）：`setup`（建立分頁與欄位，第一次與每次改版後執行）、`installDailyTrigger`（每日 07:00：匯入 Drive 收件匣的 Tokyo MOU 窗口 CSV、更新 PSCWindow 分頁、寄提醒）、`installMouWatch`（每月 15 日；只在 `mou_watch_months` 月份檢查 Tokyo MOU、Paris MOU 年報）、`runDataCheck`、`refreshWindows`、`applyMOUBlank`、`applySheetRules`。

## 7. 設定值（Settings 分頁；預設值在 `DEFAULT_SETTINGS`）

tier2_def_threshold、tier2_on_ism、google_client_id、drive_root_folder_id、bribe_roles、teu_bands、mou_watch_months、mou_watch_last、mou_watch_status、mou_pending、port_aliases、tmou_members、risk_inbox_folder_id、tmou_white_flags、tmou_black_flags、tmou_ro_high、tmou_ro_low、inc_risk_weights、inc_risk_levels、tmou_avg_detention_index、tmou_avg_deficiency_index、tmou_index_valid、tmou_high_perf_docs、tmou_high_perf_period、window_alert_days、alert_emails、nk_class_fields。每個的中文說明在 `DEFAULT_SETTINGS` 的 `note`。

## 8. 功能模組與關鍵規則

**事故編號與分級**（詳見 `docs/NUMBERING.md`）
- 事故編號 `[公司碼]-[船名]-[YYYYMMDD]-[等級][類型]-[序號]`，例 `FLEET-TS KOBE-20260911-3O-01`。同船同日 01–99，PSC 與非 PSC 合併計；PSC 類型一律 O；NIL 不立事故編號。
- Tier 1 Major（死亡、全損、重大污染、擱淺碰撞、主機失效）；Tier 2 Moderate（PSC 留置、缺失 ≥ 6 項或有 ISM 缺失 15xxx、嚴重傷害…）；Tier 3 其餘。期限：通報 2 小時、初報 24 小時、RCA 14 天（規則表 `Rules`，依事故日期套用有效的規則版本）。
- 函式：`buildTrackingNo`、`parseTrackingNo`、`nextSeq`、`pscTier`、`incidentDeadlines`、`rulesAt`。

**PSC 窗口與績效**
- 台灣港口國檢查（v1.16）：MOU 值 `Taiwan MPB`（`PSC.TAIWAN_PSC`），列入所有一般統計與船舶紀錄，**不得**計入任何 Tokyo MOU 專屬計算。判斷 Tokyo MOU 一律用 `PSC.isTokyo(insp, members)`（前端 `isTmou(I)`），不要直接比對 `I.mou === PSC.TOKYO`。
- Tokyo MOU 窗口：`tmouWindow`、`windowReport`（Priority I 已過窗口／II 窗口內／即將開啟）、`estimateSRP`。
- 缺失比（缺失指數）＝（ISM 缺失 × 5 ＋ 其他缺失）÷ 檢查次數：`inspScore`、`perfIndex`；與 Tokyo MOU 平均（`tmouAvg(settings)`）比較。

**訪船缺失與 VIR PDF 匯入**（`parseInspectionPages` 自動判斷格式）
- FML（Paris 系統）：`parseVirPages`，讀 DEFECT SUMMARY，依座標切欄。沒有題號的 Miscellaneous 列以分數欄 1–4 開頭；表頭可能被拆成「Sco/re」「Cod/e」；跨頁續行；遇到 PHOTO REPORT 停止。
- V.Ships（Shipsure）：`parseShipsurePages`，四項核對（Insp. Ref. 連號、不重複、Cleared 都有 Actions、Actions 都有對應缺失）。
- BSM：`parseBsmPages`（附錄缺失單 Sl No → TSI-01… 並與主文負面答案交叉核對）；沒有附錄時 `bsmBodyOnly` 從主文評語擷取，編號 `Q章節.題號`。
- 已驗證的真實報告：TEH VICTORY 31 項、TS OSAKA 23、TS MUMBAI 45、TS KEELUNG 14、Kota Valparaiso 11、TS HongKong 23。修改解析器後 `tests/fixtures_*.json` 的測試必須仍然通過。
- 超過 20 MB 的 PDF 在瀏覽器用 pdf-lib 重新壓縮照片（`shrinkPdf`、`fitUpload`，目標 19.4 MB）。

**單船綜合報告**（船舶履歷 → 單船報告；`shipDossier`、`vDossier`）
- 期間內事故、PSC、訪船、Tokyo MOU 窗口／SRP、逐項給分的綜合風險（≥8 高、≥5 偏高、≥2 一般）、中英注意事項、趨勢圖；列印 PDF 或複製到 Outlook（圖轉 PNG）。
- 可選「前往港口」（最多 3 個）：該港本船隊與外部紀錄、全國統計、MOU 年報參考、最常開出的類別與中英備檢重點（`CATEGORY_TIPS`）、★ 本船也被開過的代碼。

**港口／國家與外部 PSC 資料庫**（`vPortIntel`、`portProfile`）
- 外部紀錄匯入：檔案、貼上、網址（`portRecordsFrom`、`guessPortColumns`、`importPortPsc`，以批次管理）。
- 港口別名 `port_aliases`（洋山＝上海…）：`portMain`、`portMatch`。
- MOU 年報統計（v1.13）：內建已核對的 Tokyo MOU 2025、Paris MOU 2025（`MOU_DATA`），`loadMouData` 載入；`parseMouAnnual(text)` 解析年報 PDF 文字（`pagesToText` 把 pdf.js 的文字依座標組成列），`mouChecks` 核對各欄加總＝Total、留置率、類別合計，任何一項不符就不匯入。Paris MOU 年報沒有各港口國分項。
- 最多 5 個港口比較；卡片可拖移排序。

**比較趨勢**（船舶檔案；`cmpHTML`、`cmpData`、`cmpRender`）
- 模式：船對船（最多 8 艘）、**船型區間**（v1.14，依 TEU：`teuBand`、設定 `teu_bands` 預設 `0-2000, 2000-4000, 4000-6000, 7000-`；落在兩區間之間的船自成一組）、管理公司。
- 指標：PSC 缺失比（回看 4 季，`rollingPscSeries`）或事故嚴重性（`rollingIncSeries`；管理公司與船型區間除以船數為每船平均）。灰色虛線為船隊平均。

**RightShip**：`RightShip` 分頁手動登錄 Safety Score 1–5、GHG Rating A–E；公開規則只知道組成，精確門檻未公開，待取得帳號資料再接入計分。

## 9. 測試與示範版

```bash
npm test                         # node tests/core_test.js && node tests/gas_test.js（Node 18 以上，無外部套件）
python3 tools/build_demo.py      # 讀 data/seed.json → dist/local_demo.html（直接用瀏覽器開）
python3 tools/build_demo.py --seed 其他.json --out 其他資料夾
```

- 測試是一段段 `{ ... console.log('xxx passed') }`；新增功能請在 `core_test.js` 結尾加一段，涉及 Code.gs 的加在 `gas_test.js`。
- `gas_test.js` 用 `vm` 跑 Code.gs＋core.js，`UrlFetchApp`、`DriveApp`、`MailApp` 都是假的；需要時在測試內暫時覆寫 `ctx.UrlFetchApp.fetch`。
- 示範資料 `data/seed.json`（共同編輯包會附在 repo 外的 data 資料夾）是實際船隊資料，**不要提交**。
- 畫面測試（選用）：Playwright 開 `dist/local_demo.html`；離線環境需把 d3、pdf.js 路由到本機檔。

## 10. 版本與部署

**改版步驟**
1. 改程式 → `cp assets/core.js apps-script/core.gs`。
2. 版本號：`core.js` `VERSION`、`app.js` `APP_VERSION`、`index.html` 三個 `?v=`、`package.json`、本檔頂端、`CHANGELOG.md`。
3. `npm test`。
4. README.md 加對應章節（使用者看的說明）。

**部署（由使用者操作）**
1. GitHub：替換 `index.html`、`assets/core.js`、`assets/app.js`、`assets/app.css`（四個一起換，避免快取混用）。Vercel 自動上線。
2. Apps Script：「core」檔整份換成 `core.gs`、「Code」檔換成 `Code.gs` → 執行 `setup`（有新分頁或欄位時）→「部署 → 管理部署作業 → 編輯 → 新版本 → 部署」（網址不變）。
3. 瀏覽器 Ctrl＋Shift＋R，頁首應顯示新版本號。

## 11. Claude ↔ Gemini 協作方式

目的：簡單、重複性的修改交給 Gemini，Claude 留給複雜的解析器、資料核對與跨系統設計，節省算力。

1. **唯一來源**：以 GitHub repo（或使用者最新給的 zip）為準。開始前先讀 `CHANGELOG.md` 最上面的紀錄，知道上一位改了什麼。
2. **一次一位**：同一時間只由一個 AI 修改；交給另一位前先完成「改完之後的檢查清單」。
3. **小步修改**：只改需要的部分，不要整檔重新排版或改縮排（會讓差異比對失效）。保留既有的命名、中文註解與寫法。
4. **交接紀錄**：在 `CHANGELOG.md` 最上面新增一段，格式：
   ```
   ## v1.x.y — YYYY-MM-DD — Gemini（或 Claude）
   - 改了什麼（使用者看得懂的一句話）
   - 動到的檔案與函式
   - 測試：npm test 全部 passed（N 段）
   - 待確認／未完成：…
   ```
5. **適合 Gemini 的工作**：文字與說明修改、畫面版面與樣式、新增篩選或欄位顯示、README 更新、在既有模式上加一個類似功能、補測試。
   **建議交給 Claude 的工作**：VIR／年報 PDF 解析器、資料一致性核對規則、事故編號與分級規則、Apps Script 權限與排程、跨系統資料整合。
6. 不確定規則時，先查 README.md、`docs/NUMBERING.md` 與本檔，再問使用者；不要自行假設海事規則或數字。
7. 數字（MOU 統計、船舶規格）一律有出處並經核對；查不到就說查不到，不要編造。

## 12. 已知限制與待辦

- 單檔上傳 20 MB（Apps Script 單次請求約 50 MB，base64 增加約 33%）。
- MOU 年報解析器是依官方表格格式寫的，尚未用真正的 PDF 在正式環境驗證；核對不通過就不會匯入。Tokyo MOU 年報 Figure 8（最常見留置缺失）的數字依圖中排序對應名稱。
- Paris MOU 年報缺失類別合計 51,764、全區缺失 51,797（差 33，年報未說明）。
- 本船隊 PSC 紀錄多在 Tokyo MOU、Indian Ocean MOU、Abuja MOU、Riyadh MOU、USCG；可再加入 Indian Ocean MOU 年報。
- RightShip 計分規則待取得。
- 待部署：v1.11–v1.14 尚未上傳正式網站（使用者說明「先持續修改」）。
- 跨系統待整合：共用船隊主檔、公司帳號登入、系統寄件信箱（Gmail 常進垃圾郵件）、登輪系統報告自動轉入訪船缺失。

## 13. 常用修改食譜

**加一個資料欄位**：`SCHEMA` 該表陣列最後面加欄名（不要插在中間，試算表依欄名讀寫但新欄由 `setup` 補在最後）→ 讀寫的函式與畫面 → 測試 → 提醒執行 `setup`。

**加一個後端動作**：core.js 寫 `function xxx(store, user, p) { need(user, 'editor'); … audit(store, user, 'xxx', ref, detail); return {...}; }` → `handle` 的 `switch` 加 `case 'xxx': return store.lock(function () { return xxx(store, user, payload); });` → 前端 `await api('xxx', {...})` → `reload()`。

**加一個設定值**：`DEFAULT_SETTINGS` 加 `{ key, value, note }`（note 寫中文用途）→ 程式用 `settingsMap(store).key` 或前端 `M.settings.key` 讀取。

**加一個分頁**：`SECTIONS` 的 tabs 加 `[key, '中文名']` → 寫 `function vXxx(v) { v.innerHTML = …; 綁事件 }` → 在 render 的對照表加 `key: vXxx`。

**加一張比較圖**：用 `multiLineChart(el, { series: [{ name, color, points: [{label, d, v, n}] }], baseline, baseLabel, fmt })`；動畫自動套用。

**讓一組卡片可拖移**：畫面重畫後呼叫 `sortableCards(gridEl, { key: '唯一名稱', attr: 'data 屬性名（不含 data-）' })`；卡片必須是 grid 的直接子元素並帶該 data 屬性。
