# 版本紀錄（CHANGELOG）

> 新的紀錄寫在最上面。Claude 與 Gemini 每次改完都在這裡留一段，格式見 GEMINI.md 第 11 節。

## v1.16.0 — 2026-10-27 — Claude
- 台灣港口國檢查（MOU 值 `Taiwan MPB`，`PSC.TAIWAN_PSC`）：列入統計與各船紀錄，不計入 Tokyo MOU 窗口、SRP、36 個月績效。
- core：`isTokyo` 對台灣一律回傳 false；`resolveMOU` 台灣固定 Taiwan MPB；`saveInspection` 台灣強制 Taiwan MPB、中文港名轉英文（`twPort`、`TW_PORTS` 10 港）；國名別名加「台灣、臺灣、中華民國」；`validateData` 檢出台灣檢查 MOU 錯誤；`applyMOU` 新增 `country` 參數只改指定國家；`DEFAULT_PORTS` 補 7 個台灣港口座標。
- app：檢查表單台灣港口快選；MOU 標籤顯示「台灣 航港局」；總覽 MOU 表說明；船舶檔案註記台灣檢查次數；系統管理「修正台灣檢查的 MOU」；`perfBase` 與船舶績效 36 個月改用 `isTmou`（`PSC.isTokyo`）。
- 測試：npm test 全部 passed（33 段）。

## v1.15.0 — 2026-10-26 — Claude
- 綜合資訊（草稿）主分頁：事故、PSC、訪船三欄重點、每月動態圖、需要處理清單、需要關注的船舶；開站預設顯示。
- 右側快速連結（`qnavInit`、`qnavBuild`、`qnavSpy`）：依頁面區塊標題產生，捲動標示目前位置；窄螢幕改「目錄」按鈕。
- 文件可修改（類別、說明）與刪除（軟刪除＋Drive 移到「已刪除文件」），原因必填，`history` 欄留修改紀錄；admin 可還原。core：`updateDocument`、`deleteDocument`、`restoreDocument`；Code.gs store 新增 `moveToDeleted`。
- 事故「管理公司更新紀錄」（新分頁 `IncidentUpdates`）：`saveIncidentUpdate`、`deleteIncidentUpdate`；`evidenceDocs` 把更新紀錄視同該階段文件計入通報時限。
- `multiLineChart` 新增 `tickFmt` 選項（每月刻度）。
- 測試：npm test 全部 passed（32 段）。

## v1.14.0 — 2026-10-18 — Claude
- 線圖動畫：比較趨勢、港口比較、船隊／單船趨勢圖的線條依序「畫出來」，點在線畫到時跳出；電腦設定「減少動態效果」時不播放，圖例切換時不重播。
- 比較趨勢改用船型區間（TEU）：0–2,000、2,000–4,000、4,000–6,000、7,000 以上（設定 `teu_bands` 可改；落在區間之間的船自成一組）。船對船的篩選從「同型」改為「船型區間」；新增「船型區間」模式，各區間在同一張圖比較（事故分數除以該區間船數）。
- 卡片可拖移排序：港口卡片（拖移把手或標題列；圖的線色與順序跟著卡片）、PSC 船舶卡片、船舶事故卡片、船舶履歷、訪船紀錄。手機長按後拖、鍵盤 Alt＋方向鍵；排列記在瀏覽器，可「恢復預設排列」。
- 新增 GEMINI.md（AI 協作指南）、CLAUDE.md、CHANGELOG.md、tools/build_demo.py（可攜的示範版打包工具）；.gitignore 加 dist/。
- 檔案：core.js（`teuBands`、`teuBand`、設定 `teu_bands`）、app.js（`drawLineIn`、`sortableCards`、`multiLineChart`、`trendChart`、比較趨勢、港口卡片、四組船舶卡片）、app.css。
- 測試：npm test 全部 passed（31 段）。

## v1.13.0 — 2026-10-17 — Claude
- MOU 年報統計：內建已核對的 Tokyo MOU 2025（22 個主管機關、全區、貨櫃船、31 類缺失、最常見留置缺失）與 Paris MOU 2025（全區、貨櫃船、29 類缺失、Top 5）。
- 上傳年報 PDF 解析匯入（各欄加總、留置率＝留置 ÷ 初次檢查、類別合計全部核對才匯入）；更新時空白欄不覆蓋。
- Apps Script 每季自動檢查兩個 MOU 官網年報頁（`installMouWatch`、`mou_watch_months`），新年報存 Drive、可解析就匯入，否則提示「讀取並匯入」並寄信。
- 港口卡片與單船報告「前往港口」加入 MOU 年報參考。

## v1.12.0 — 2026-10-17 — Claude
- 外部 PSC 資料庫（PortPSC、PortStats）：檔案／貼上／網址匯入；港口別名；港口／國家比較（最多 5 個）。
- 單船報告「前往港口」PSC 重點；比較趨勢（船對船、管理公司）；Vessels 新增 `service`（航線）。

## v1.11.0 — 2026-10-17 — Claude
- 單船綜合報告：期間內事故、PSC、訪船＋Tokyo MOU 窗口／SRP、綜合風險、中英注意事項、趨勢圖，列印 PDF／複製到 Outlook；RightShip 紀錄表。

## v1.8.0 – v1.10.2 — 2026-10-15～16 — Claude
- VIR 報告 PDF 自動匯入並核對缺失數：FML（Paris）、V.Ships（Shipsure）、BSM（含沒有附錄缺失單的報告）；超過 20 MB 自動壓縮照片；版本號與快取警示。

## v1.7.0 — 2026-10-15 — Claude
- 訪船缺失管理：逐項追蹤 待改善→待確認→已關閉、批次關閉、逾期提醒、管理公司矯正表現、船舶履歷。

## v1.0 – v1.6 — 2026-10 — Claude
- PSC 檢查與事故管理（事故編號 v2.0、Tier 1–3、期限）、Tokyo MOU 窗口與 SRP、管理公司績效、地圖、索賄分析、NK 資料、回信範本、船舶事故趨勢、週報／月報。
