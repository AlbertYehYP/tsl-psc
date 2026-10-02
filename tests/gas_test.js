// Run Code.gs + core.js against mocked Apps Script services
const fs=require('fs'), vm=require('vm'), assert=require('assert');
function mkSheet(name){ const data=[]; return {
  name, data,
  getLastRow(){ let n=data.length; while(n>0 && data[n-1].every(v=>v===''||v==null)) n--; return n; },
  getLastColumn(){ return data.reduce((m,r)=>Math.max(m,r.length),0); },
  getMaxRows(){ return Math.max(1000,data.length); },
  getRange(r,c,nr,nc){ nr=nr||1; nc=nc||1; return {
    getDisplayValues(){ const out=[]; for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++){const v=(data[r-1+i]||[])[c-1+j];row.push(v==null?'':String(v))}out.push(row)} return out; },
    setValues(v){ for(let i=0;i<nr;i++){ while(data.length<r+i) data.push([]); for(let j=0;j<nc;j++){ data[r-1+i][c-1+j]=v[i][j]; } } return this; },
    setNumberFormat(){return this}, setFontWeight(){return this}, setBackground(){return this}, setFontColor(){return this} } },
  deleteRow(r){ data.splice(r-1,1); }, setFrozenRows(){}, clearContents(){ data.length=0; } }; }
const sheets={};
const ss={ getSheetByName:n=>sheets[n]||null, insertSheet:n=>(sheets[n]=mkSheet(n)) };
let fid=0; const allFolders=[]; function mkFolder(name){ const f={name,folders:[],files:[],id:'D'+(++fid),
  getFiles(){const h=this.files.slice();let i=0;return {hasNext:()=>i<h.length,next:()=>h[i++]}},
  getFoldersByName(n){const h=this.folders.filter(x=>x.name===n);let i=0;return {hasNext:()=>i<h.length,next:()=>h[i++]}},
  createFolder(n){const c=mkFolder(n);this.folders.push(c);return c},
  getFilesByName(n){const h=this.files.filter(x=>x.name===n);let i=0;return {hasNext:()=>i<h.length,next:()=>h[i++]}},
  createFile(b){const fl={name:b.name,size:b.bytes.length,getId:()=>'FILE'+(++fid),getUrl:()=>'https://drive.google.com/file/'+fid};this.files.push(fl);return fl},
  getId(){return this.id} }; allFolders.push(f); return f; }
function mkCsvFile(folder,name,text,mime){ const fl={name,parent:folder,getName(){return this.name},getMimeType:()=>mime||'text/csv',getLastUpdated:()=>new Date('2026-10-01T09:00:00Z'),
  getBlob:()=>({getDataAsString:()=>text}),setName(n){this.name=n;return this},moveTo(d){this.parent.files=this.parent.files.filter(x=>x!==this);d.files.push(this);this.parent=d;return this}}; folder.files.push(fl); return fl; }
const roots=[];
let tokenInfo={aud:'CID',email:'editor@tsl.com',email_verified:'true',name:'Ed'};
const ctx={
  console, JSON, Date, Math, String, Number, Object, Array, Error, parseInt, parseFloat, isNaN, encodeURIComponent,
  SpreadsheetApp:{getActiveSpreadsheet:()=>ss},
  DriveApp:{createFolder:n=>{const f=mkFolder(n);roots.push(f);return f},getFolderById:id=>allFolders.find(f=>f.id===id)},
  Utilities:{base64Decode:s=>Buffer.from(s,'base64'),newBlob:(bytes,mime,name)=>({bytes,mime,name}),computeDigest:(a,s)=>[...Buffer.from(s)],base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),
    DigestAlgorithm:{SHA_256:1},formatDate:(d,tz,f)=> f==='yyyy-MM-dd'?'2026-10-02':'2026-10-02T12:00:00+08:00'},
  CacheService:{getScriptCache:()=>({get:()=>null,put:()=>{}})},
  UrlFetchApp:{fetch:()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(tokenInfo)})},
  Session:{getEffectiveUser:()=>({getEmail:()=>'owner@gmail.com'})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({t,setMimeType(){return this}})},
  Logger:{log:()=>{}}
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('../assets/core.js','utf8').replace("if (typeof module !== 'undefined') module.exports = PSC;",''),ctx);
vm.runInContext(fs.readFileSync('../apps-script/Code.gs','utf8'),ctx);
vm.runInContext('setup()',ctx);
assert.ok(sheets.Inspections && sheets.Users.data.length===2);
// set client id and add vessel + editor user
const set=sheets.Settings.data; set.find(r=>r[0]==='google_client_id')[1]='CID';
sheets.Vessels.data.push(['TS KOBE','9868182','德翔神戶','FLEET','FLEET','FML','Alan Liu','','','','6. 支線型系列','Marshall','']);
sheets.Users.data.push(['editor@tsl.com','Ed','editor','Y']);
const call=(action,payload,tok='T')=>JSON.parse(vm.runInContext(`doPost({postData:{contents:${JSON.stringify(JSON.stringify({idToken:tok,action,payload}))}}})`,ctx).t);
let r=call('saveInspection',{inspection:{vessel:'TS KOBE',date:'2026-09-11',port:'OSAKA',country:'JAPAN'},deficiencies:[{code:'01306',nature:'a',action:'17'},{code:'04114',nature:'b',action:'17'}]});
assert.ok(r.ok,r.error); assert.equal(r.data.inspection.tracking_no,'FLEET-TS KOBE-20260911-3O-01');
assert.equal(sheets.Deficiencies.data.length,3); assert.equal(sheets.Incidents.data.length,2);
r=call('saveInspection',{inspection:{insp_id:'PSC-20260911-9868182',vessel:'TS KOBE',date:'2026-09-11',port:'OSAKA'},deficiencies:[{def_id:'FLEET-TS KOBE-20260911-3O-01-D02',code:'04114',nature:'b',action:'17'}]});
assert.ok(r.ok,r.error); assert.equal(sheets.Deficiencies.getLastRow(),2,'replaceWhere should leave 1 data row');
r=call('uploadDocument',{insp_id:'PSC-20260911-9868182',doc_type:'RECT',original_name:'Rectification.pdf',mime:'application/pdf',base64:Buffer.from('hello').toString('base64')});
assert.ok(r.ok,r.error); assert.equal(r.data.file_name,'FLEET-TS KOBE-20260911-3O-01_RECT_01.pdf');
const root=roots[0]; assert.equal(root.folders[0].name,'PSC'); assert.equal(root.folders[0].folders[0].folders[0].name,'FLEET-TS KOBE-20260911-3O-01');
r=call('bootstrap',{}); assert.ok(r.ok); assert.equal(r.data.user.role,'editor'); assert.ok(!r.data.users);
tokenInfo={aud:'OTHER',email:'x@y',email_verified:'true'}; r=call('bootstrap',{}); assert.equal(r.ok,false); assert.match(r.error,/不屬於本系統/);
tokenInfo={aud:'CID',email:'stranger@y.com',email_verified:'true'}; r=call('bootstrap',{}); assert.match(r.error,/尚未開通/);
tokenInfo={aud:'CID',email:'owner@gmail.com',email_verified:'true'}; r=call('bootstrap',{}); assert.equal(r.data.user.role,'admin'); assert.ok(r.data.users);
r=call('bootstrap',{},''); assert.match(r.error,/請先用 Google/);
console.log('Apps Script mock tests passed');
// co-editing menu functions
ctx.MailApp={sent:[],sendEmail(o){this.sent.push(o)}};
ctx.ScriptApp={triggers:[],getProjectTriggers(){return this.triggers},deleteTrigger(){},newTrigger(fn){const self=this;const b={timeBased(){return b},everyDays(){return b},atHour(){return b},inTimezone(){return b},create(){self.triggers.push({fn,getHandlerFunction:()=>fn})}};return b}};
// manual edit in sheet: date typed with slashes and code without leading zero
sheets.Deficiencies.data.push(['X-D01','NOPE','', '1','7109','','typed by hand','17','2026/10/2','N','','','','','']);
const n=vm.runInContext('runDataCheck()',ctx); assert.ok(n>=1); assert.ok(sheets.DataCheck.data.some(r=>String(r[4]).includes('找不到對應檢查 NOPE')));
sheets.RiskProfiles.data.push(['9868182','TS KOBE','HIGH','High','2026-10-02','test','']);
sheets.Settings.data.find(r=>r[0]==='alert_emails')[1]='psc@tsl.test';
vm.runInContext('dailyWindowAlert()',ctx);
assert.ok(sheets.PSCWindow.data.length>=2); assert.equal(ctx.MailApp.sent.length,1); assert.match(ctx.MailApp.sent[0].body,/TS KOBE/);
vm.runInContext('installDailyTrigger()',ctx); assert.equal(ctx.ScriptApp.triggers[0].fn,'dailyJob');
console.log('co-editing helpers passed');
// MOUMap seeded by setup(); inspection saved through the API gets its MOU
assert.ok(sheets.MOUMap.data.length>50);
tokenInfo={aud:'CID',email:'editor@tsl.com',email_verified:'true',name:'Ed'};
r=call('saveInspection',{inspection:{vessel:'TS KOBE',date:'2026-09-20',port:'LOME',country:'TOGO'},deficiencies:[]}); assert.ok(r.ok,r.error); assert.equal(r.data.inspection.mou,'Abuja MOU');
// Tokyo MOU window inbox: CSV dropped in Drive -> imported by the daily job, moved to 已匯入, reported in the e-mail
const setId=k=>sheets.Settings.data.find(x=>x[0]===k);
const inboxId=setId('risk_inbox_folder_id')[1]; assert.ok(inboxId,'inbox folder created by installDailyTrigger');
const inbox=allFolders.find(f=>f.id===inboxId); const done=inbox.folders.find(f=>f.name==='已匯入');
mkCsvFile(inbox,'PSC_Window.csv','PSC Inspection Window,,,,,,,,,,,,FLEET,1601573\nSTATUS,VESSEL NAME,X,RISK,PRIORITY,,,,,COMPANY PERFORMANCE\n,TS KOBE,,LOW,,,,,,High\n');
mkCsvFile(inbox,'notes.xlsx','x','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
ctx.MailApp.sent=[];
vm.runInContext('dailyJob()',ctx);
assert.equal(done.files.length,1); assert.equal(done.files[0].name,'2026-10-02_PSC_Window.csv'); assert.equal(inbox.files.length,1,'non-CSV stays in the inbox');
assert.equal(sheets.RiskProfiles.data.find(x=>x[0]==='9868182')[2],'LOW');
assert.match(ctx.MailApp.sent[0].body,/✓ PSC_Window.csv：更新 1 艘/); assert.match(ctx.MailApp.sent[0].body,/✗ notes.xlsx：不是 CSV/);
vm.runInContext('applyMOUBlank()',ctx);
console.log('Tokyo MOU inbox / MOU map passed');
