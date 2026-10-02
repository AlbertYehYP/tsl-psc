# TSL PSC 系統

德翔海技 TSL MARTEC 的事故登錄與 PSC（港口國管制）檢查系統。

網站分成兩個主分頁：

- **事故管理（主軸）**：船管公司事故登錄器。所有事故都在這裡編號、追期限、歸檔、結案；PSC 檢查有缺失時自動成為 O 類事故。
- **PSC 檢查**：每一次 PSC 檢查（含 NIL 無缺失）的完整資料與統計。有缺失的檢查同時是一件事故，兩邊用事故編號與檢查編號互相連結。

- **前端**：GitHub Pages（本 repo，純靜態網頁）
- **資料庫**：Google 試算表 `TSL_PSC_DB`（放在指定的 Google 帳號）
- **檔案歸檔**：Google Drive 資料夾 `TSL PSC System`
- **後端**：綁定在試算表上的 Google Apps Script，負責登入驗證、事故編號配號、寫入資料、存檔

> **repo 不放任何資料。** PSC 紀錄、事故登錄、上傳的報告都只存在 Google 試算表與 Drive。GitHub Pages 的網址即使公開，沒有登入也看不到資料。

## 功能

| 主分頁 | 子分頁 | 內容 | 權限 |
|---|---|---|---|
| 事故管理 | 事故分析 | 事故件數、進行中、RCA 逾期、Tier、PSC 有缺失未立案、每月事故（PSC / 其他）、待處理清單、事故性質、責任單位、船舶與管理公司排名 | 全部 |
| 事故管理 | 事故登錄與處理 | 事故登錄器；點開每件事故可看期限、上傳文件（船方報告、Template 1–5C）、編輯簡述與矯正措施、結案。PSC 事故直接開啟對應的檢查與缺失矯正 | 檢視：全部；登錄：editor 以上 |
| PSC 檢查 | 總覽 | 每月檢查、MOU 區域、缺失類別、高頻代碼、港口國、船舶排名、重複缺失 | 全部 |
| PSC 檢查 | 檢查登錄 | 新增／編輯 PSC 檢查（含 NIL）、自動配發事故編號、上傳 PSC 報告與矯正報告 | 檢視：全部；登錄：editor 以上 |
| PSC 檢查 | 缺失查詢 | 所有缺失逐項查詢，可複製成 CSV | 全部 |
| PSC 檢查 | 船舶檔案 | 依 IMO 彙整每艘船的檢查歷史（含改名前紀錄）與 NK 資料 | 全部 |
| PSC 檢查 | PSC 窗口 | Tokyo MOU 檢查窗口與 Priority I / II、官方與估算 SRP、NK 到期提醒 | 全部 |
| PSC 檢查 | 索賄分析 | 依 MOU 區域、港口國、港口、年度的發生率、金額範圍、談判價碼 | 依 `bribe_roles`（預設 admin、editor） |
| PSC 檢查 | 代碼參考 | 缺失類別、處理代碼、已開立過的代碼 | 全部 |
| 系統管理 | — | 使用者、編號設定、MOU 對照表、資料檢核、NK 匯入、船隊資料 | admin |

### 為什麼拆成兩個主分頁

- 每個分頁只對應一組資料表：事故管理 = `Incidents`（+ 非 PSC 事故的 `Documents`）；PSC 檢查 = `Inspections`、`Deficiencies`。組員要改哪一類資料，就去哪個分頁或試算表分頁。
- 有缺失的 PSC 檢查只存一份資料（在 `Inspections`），`Incidents` 只放事故編號、等級與狀態，用 `insp_id` 連回去，不會重複維護。
- 事故的統計（件數、逾期、Tier）和 PSC 的統計（檢查次數、NIL 率、MOU 區域）分開算，分母不會混在一起。

## 編號規則（與事故追蹤編號系統 v2.0 結合）

詳細說明見 [docs/NUMBERING.md](docs/NUMBERING.md)。

- **事故編號**：`[公司碼]-[船名]-[YYYYMMDD]-[等級][類型]-[序號]`，例如 `FLEET-TS KOBE-20260911-3O-01`
  - PSC 案件類型一律為 `O`。
  - 等級：留置為 Tier 2；未留置時，缺失達 6 項或開出 ISM 缺失（15xxx）也是 Tier 2；其餘是 Tier 3。門檻可在「系統管理」調整。
  - 序號：同一艘船同一天的第幾件事故，PSC 和非 PSC 一起計算，不會跟事故登錄器撞號。
- **NIL（無缺失）檢查**：不立事故編號，只有檢查編號 `PSC-[YYYYMMDD]-[IMO]`。
- **缺失編號**：`[事故編號]-D01`、`-D02`…
- **文件命名**：`[事故編號]_[文件代碼]_[序號].[副檔名]`，例如 `FLEET-TS KOBE-20260911-3O-01_RECT_01.pdf`
- **歸檔路徑**：`TSL PSC System/PSC/[年]/[事故編號]/`；NIL 檢查放在 `PSC/[年]/NIL/[檢查編號]/`；非 PSC 事故放在 `事故/[年]/[事故編號]/`
- **期限**：Tier 1、2 為 2 小時 / 24 小時 / 14 天，Tier 3 為 12 小時 / 48 小時 / 21 天。新事故會把期限寫入 Incidents；匯入的舊事故依事故日期與等級推算 RCA 期限。
- **非 PSC 事故結案**：需要先歸檔 RCA（Template 4）或結案確認（Template 5C）；可以選「仍要結案」略過。

## 部署步驟（約 30 分鐘，只需要做一次）

以下全部用**指定的 Google 帳號**操作。

### 1. 建立資料庫試算表

1. 到 Google Drive 上傳 `TSL_PSC_DB.xlsx`（另外提供，不在 repo 內）。
2. 右鍵 →「選擇開啟工具」→ Google 試算表，再用「檔案 → 另存為 Google 試算表」存成原生試算表，命名為 `TSL_PSC_DB`。
3. 確認有以下分頁：Inspections、Deficiencies、Documents、Incidents、Vessels、Companies、RiskProfiles、MOUMap、NKStatus、Users、Settings、AuditLog。

### 2. 安裝 Apps Script 後端

1. 在試算表選「擴充功能 → Apps Script」。
2. 「專案設定」勾選「在編輯器中顯示 appsscript.json 資訊清單檔案」。
3. 建立三個檔案，內容分別貼上本 repo 的：
   - `apps-script/Code.gs`
   - `apps-script/core.gs`（與 `assets/core.js` 內容相同）
   - `apps-script/appsscript.json`
4. 在編輯器選函式 `setup` → 執行，依畫面授權。它會補齊分頁欄位、把您設為 admin，並在 Drive 建立 `TSL PSC System` 資料夾。
   - 授權範圍包含寄信（每日提醒）與排程觸發（每日 07:00）。
5. 重新整理試算表，上方會出現「TSL PSC」選單。執行「套用欄位下拉選單與保護」。

### 3. 建立 Google 登入用的 Client ID

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 建立專案（名稱例如 `tsl-psc`）。
2. 「API 和服務 → OAuth 同意畫面」：
   - 公司是 Google Workspace：使用者類型選「內部」。
   - 個人 Gmail 帳號：選「外部」，把要使用系統的人加入「測試使用者」（最多 100 人）。
   - 範圍只需要 `openid`、`email`、`profile`。
3. 「憑證 → 建立憑證 → OAuth 用戶端 ID」，類型選「網頁應用程式」：
   - 「已授權的 JavaScript 來源」加入 `https://<您的 GitHub 帳號>.github.io`（測試用可再加 `http://localhost:8000`）。
4. 複製產生的 Client ID，貼到試算表 **Settings** 分頁的 `google_client_id`。

### 4. 部署 Apps Script 網頁應用程式

1. Apps Script 編輯器右上「部署 → 新增部署作業 → 類型：網頁應用程式」。
2. 執行身分：**我**；誰可以存取：**所有人**。
   - 這裡的「所有人」只代表網址可以呼叫；每個請求都必須帶有效的 Google 登入憑證，而且帳號要在 Users 分頁中才會被接受。
3. 複製網頁應用程式網址（結尾是 `/exec`）。

### 5. 發布前端到 GitHub Pages

1. 建立 GitHub repo，把本資料夾全部內容推上去。
2. 編輯 `config.js`，填入：
   - `apiUrl`：第 4 步的 `/exec` 網址
   - `googleClientId`：第 3 步的 Client ID
   - 這兩個值不是密碼，可以提交。
3. repo「Settings → Pages」，Source 選 `main` 分支、根目錄 `/`。
4. 等 1–2 分鐘，打開 `https://<帳號>.github.io/<repo>/`。

> GitHub Pages 用在 private repo 需要付費方案（Pro / Team / Enterprise），而且網頁本身一樣是公開網址。資料安全靠 Google 登入與 Users 名單把關，不靠 repo 是否私有。

### 6. 開通使用者與分享資料夾

1. 用 admin 登入網站 →「系統管理」→ 新增使用者，填 Google 帳號 Email 與角色：
   - `viewer`：只能查閱
   - `editor`：可以登錄案件、上傳文件、結案
   - `admin`：另外可以管理使用者、船隊資料與設定
2. 到 Drive 把 `TSL PSC System` 資料夾以「檢視者」分享給同一批人，文件連結才打得開。
   - 上傳是由 Apps Script 以部署者身分寫入，使用者本身不需要 Drive 編輯權限。

## 組員共同編輯 Google 試算表

試算表可以直接分享給組員「編輯」。網站與 Apps Script 每次都即時讀取試算表，所以在試算表改的內容會馬上反映在網站上。

**可以直接改的**
- 各分頁的一般欄位：港口、缺失內容、處理代碼、矯正措施、改正日期、Bribe 欄位等。
- 日期可以打 `2026/10/2` 或 `2026-10-02`，缺失代碼可以打 `7109`；系統讀取時會自動統一成 `2026-10-02`、`07109`。
- 船舶改名、換管理公司：在 Vessels 分頁把舊資料填失效日，再新增一筆同 IMO、填生效日的資料。

**請不要動的**
- 第一列欄位名稱（系統依欄名讀寫）。
- 系統編號欄：`insp_id`、`tracking_no`、`def_id`、`doc_id`、`file_id`、`url`。
- 新案件請用網站登錄，才會自動配號並同步事故登錄器。

**保護與檢核**
- 第一次部署後，在試算表選單「TSL PSC → 套用欄位下拉選單與保護」。
  - 狀態、等級、Y/N 等欄位會變成下拉選單。
  - 標題列與系統編號欄改動時會跳出警告（不會鎖死）。
- 改完後執行「TSL PSC → 檢核資料」，問題會列在 `DataCheck` 分頁。
  - 網站的「系統管理 → 資料檢核」結果相同。
  - 檢核項目：編號重複、缺失找不到對應檢查、NIL 卻有缺失、代碼不是 5 碼、IMO 不在船隊資料、同船生效期間重疊等。
- 每一次修改都可以在試算表的「檔案 → 版本記錄」查到是誰改的；網站上的操作另外記在 AuditLog 分頁。

## 索賄（Bribe）紀錄

- 每次 PSC 檢查可以記：對方要求金額、實付金額（USD）、香菸數量、其他實物、說明。
- 狀態自動判定：`Y` 有付出、`R` 有索取但未付、`N` 無。
- 歷史資料已從原始紀錄解析，例如 `$ 1200 + 4 cigarettes`、`40 Cig+Paint`。
- 只有 Settings 的 `bribe_roles` 列出的角色看得到；其他角色從 API 就拿不到這些欄位。
  - 但試算表本身的編輯者都看得到，分享試算表時請留意。

## MOU 區域（檢查體系）

- 每次 PSC 檢查的 `mou` 欄記錄該港口國歸屬的體系，例如 Tokyo MOU、Indian Ocean MOU、Abuja MOU、Riyadh MOU、Paris MOU、Viña del Mar；美國記為 `USCG`，台灣記為 `Taiwan MPB`（兩者都不屬於任何 MOU）。
- 對照表在 `MOUMap` 分頁（網站：系統管理 → MOU 對照表），組員可以直接增修：
  - `port` 空白代表全國；有填港口的列優先。例如加拿大預設 Tokyo MOU，Halifax、Montreal 屬 Paris MOU。
  - `also` 記錄同時加入的其他 MOU（例如澳洲也是 Indian Ocean MOU 成員），只做說明。
- 新登錄的檢查依港口國自動帶入 MOU，表單上也可以改。
- 改了對照表後，按「補標空白的檢查」或「全部依對照表重新套用」。
- 資料檢核會提醒：MOU 空白、MOU 與對照表不一致、對照表缺國家。
- 原總表的「MOU」欄只是 Tokyo MOU 區域的 V 記號，其中 6 筆有誤（Lome 3 筆、Mundra 1 筆誤標 V；Manzanillo、Sydney 各 1 筆漏標），已改用國家對照。

## Tokyo MOU 檢查窗口與風險提醒

- **窗口**：依資料庫內最近一次 MOU 區域為 Tokyo MOU 的檢查日加上 SRP 等級推算，每天自動重算。
  - HRS 2–4 個月、SRS 5–8 個月、LRS 9–18 個月。
  - 超過窗口是 Priority I，在窗口內是 Priority II。
  - 其他 MOU 的檢查（例如 Lome、Abidjan、Dar es Salaam、美國、中東）不會重算窗口。
- **估算 SRP**：系統依 NIR 參數另外估算，與官方不同時會標記，用來發現資料錯誤。

### 官方 SRP 與公司績效的自動更新（排程）

Tokyo MOU 沒有公開 API。APCIS 需要帳號登入，公開資料庫也註明未經 Tokyo MOU 許可不得轉載或用於其他網站，所以系統**不做自動爬取網站**。可以排程的是「收件匣」：

1. 在 Settings 填 `alert_emails`。
2. 在試算表選單執行「TSL PSC → 安裝每日 07:00 排程（匯入 + 窗口 + 提醒）」。系統會在 Drive 建立 `TSL PSC System/Tokyo MOU 收件匣`。
3. 拿到新的 PSC Inspection Window 檔（格式同 `TSL_PSC_analysisWindow.csv`）時，存成 **CSV UTF-8** 丟進收件匣。
4. 每天 07:00 排程會依序：
   - 匯入收件匣內的 CSV（官方 SRP、公司績效），成功的檔案改名加日期後移到 `已匯入`；
   - 重算所有船的窗口，更新 `PSCWindow` 分頁；
   - 寄出提醒信：匯入結果（成功／失敗原因）、Priority I / II、即將進入窗口、NK 到期、RCA 期限已過仍未結案的事故。
- 不想等排程：試算表選單「立即匯入收件匣的 Tokyo MOU 窗口檔」，或在網站「PSC 窗口」頁直接上傳 CSV。
- 收件匣只接受 CSV；Excel 檔請先另存為 CSV。
- 如果之後取得 Tokyo MOU 書面同意，才考慮改成直接抓取官方資料。

## 與船舶履歷監控系統（NK 資料）共用

- 兩個系統以 **IMO** 串接。
- 在「系統管理 → 匯入 NK 船舶資料」貼上 SHIP JSON（survey-status-schema v2），可一次多艘。系統會：
  - 更新船隊資料的船級號、船旗、建造日期、GT / DWT、登記船東等欄位；
  - 把證書效期、檢驗窗口、Conditions of Class 存進 `NKStatus` 分頁；
  - 在「PSC 窗口」頁與船舶檔案顯示到期提醒。
- 欄位對照見 `TSL_船舶資料共用性與PSC窗口檢核.xlsx`。

## 日常使用

- **各船回傳 PSC 報告**：PSC 檢查 → 檢查登錄 → 新增 PSC 檢查（或事故管理 → 事故登錄與處理 → 登錄 PSC 檢查）→ 填日期、船、港口與缺失 → 儲存。系統會配發事故編號，並同步寫入事故登錄器。
- **其他事故**：事故管理 → 事故登錄與處理 → 新增其他事故，取得編號後在事故頁上傳船方報告與 Template 1–5C，填矯正措施後結案。
- **上傳文件**：在案件頁選文件類別後上傳，系統自動改名並歸檔。文件類別包括 PSC Form A／B、船舶矯正報告、佐證、Template 1–5C。
- **矯正追蹤**：逐項勾選「已改正」、填改正日期與矯正措施。全部改正後按「結案」，事故登錄器同步改為「已完成」。
- **船舶改名或換管理公司**：系統管理 → 船隊資料。舊資料填上失效日，再新增一筆同 IMO、填生效日的資料。之後的事故編號會自動用新船名與新公司碼。
  - 例：TS SHENZHEN 至 2026/01/17，TEH PEACE 自 2026/01/18 起。

## 更新程式

1. 修改 `assets/core.js` 後，同步複製到 `apps-script/core.gs`，貼回 Apps Script；`Code.gs` 有改也要一起貼回。
   - 新版本新增分頁或欄位時，先執行一次 `setup`，它只會補欄位，不會清除資料。
2. 在 Apps Script「部署 → 管理部署作業 → 編輯 → 新版本」。網址不變。
3. 前端推到 GitHub 後自動更新。
4. 執行 `npm test` 可跑核心規則與 Apps Script 模擬測試（需要 Node.js 18 以上）。

## 限制

- 單檔上傳上限 20 MB（Apps Script 單次請求約 50 MB，base64 編碼會增加約 33%）。
- 「資料截至」以最新一次檢查或事故日期為準。
- 從事故登錄器匯入的舊事故沒有通報文件紀錄，立即通報與初步報告顯示「未追蹤」。
- 歷史文件（SharePoint「04-2. Accident Report」）尚未搬入；新案件起由系統歸檔。
