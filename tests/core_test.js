const PSC=require('../assets/core.js'); const MemStore=require('./memstore.js');
const assert=require('assert');
const vessels=[ // sample data only
 {vessel:'TS KOBE',imo:'9868182',company:'FLEET',management:'FLEET',pic:'Alan Liu'},
 {vessel:'TS SHENZHEN',imo:'9868170',company:'FLEET',management:'FLEET',valid_to:'2026-01-17'},
 {vessel:'TEH PEACE',imo:'9868170',company:'TEH',management:'SELF',valid_from:'2026-01-18'},
 {vessel:'TS PENANG',imo:'9948877',company:'TSL',management:'SELF'}];
const incidents=[{tracking_no:'FLEET-TS KOBE-20260911-2O-01'},{tracking_no:'TSL- TS PENANG-20260918-3O-01'}];
const st=MemStore({Vessels:vessels,Incidents:incidents,Settings:[],Inspections:[],Deficiencies:[],Documents:[],AuditLog:[]});
const U={email:'ed@x',role:'editor'};
// 1. new PSC, 2 defs, same vessel/day as existing incident -> seq 02, tier 3
let r=PSC.handle(st,U,'saveInspection',{inspection:{vessel:'TS KOBE',date:'2026/09/11',port:'osaka',country:'japan'},deficiencies:[{code:'7199',nature:'a',action:'17'},{code:'14616',nature:'b',action:'99'}]});
assert.equal(r.inspection.tracking_no,'FLEET-TS KOBE-20260911-3O-02'); assert.equal(r.inspection.tier,'3');
assert.equal(r.deficiencies[0].def_id,'FLEET-TS KOBE-20260911-3O-02-D01'); assert.equal(r.deficiencies[1].category,'防止污染');
assert.equal(r.inspection.rca_due,'2026-10-02'); assert.equal(r.inspection.insp_id,'PSC-20260911-9868182');
// 2. existing incident with stray spaces counted for seq
r=PSC.handle(st,U,'saveInspection',{inspection:{vessel:'TS PENANG',date:'2026-09-18',port:'HONG KONG',country:'CHINA'},deficiencies:[{code:'6107',nature:'x',action:'17'}]});
assert.equal(r.inspection.tracking_no,'TSL-TS PENANG-20260918-3O-02');
// 3. six defs -> tier 2 ; ISM -> tier 2 ; detention -> tier 2
const six=Array.from({length:6},(_,i)=>({code:'0710'+i,nature:'n'+i,action:'17'}));
assert.equal(PSC.pscTier({deficiencies:six,threshold:6}).tier,'2');
assert.equal(PSC.pscTier({deficiencies:[{code:'15107'}],threshold:6}).tier,'2');
assert.equal(PSC.pscTier({deficiencies:[{code:'15107'}],threshold:6,ismEscalate:false}).tier,'3');
assert.equal(PSC.pscTier({deficiencies:[{code:'1101',action:'30'}]}).tier,'2');
// 4. NIL -> no tracking number, no incident
const before=st.all('Incidents').length;
r=PSC.handle(st,U,'saveInspection',{inspection:{vessel:'TS KOBE',date:'2026-09-30',port:'X'},deficiencies:[]});
assert.equal(r.inspection.tracking_no,''); assert.equal(r.inspection.status,'NIL'); assert.equal(st.all('Incidents').length,before);
// 5. rename rule: TS SHENZHEN name after 2026-01-18 -> TEH PEACE / TEH company
r=PSC.handle(st,U,'saveInspection',{inspection:{vessel:'TS SHENZHEN',date:'2026-03-19',port:'TOKYO'},deficiencies:[{code:'7105',nature:'door',action:'17'}]});
assert.equal(r.inspection.tracking_no,'TEH-TEH PEACE-20260319-3O-01'); assert.equal(r.inspection.management,'SELF');
r=PSC.handle(st,U,'saveInspection',{inspection:{vessel:'TEH PEACE',date:'2025-10-02',port:'OSAKA'},deficiencies:[{code:'7105',nature:'door',action:'17'}]});
assert.equal(r.inspection.tracking_no,'FLEET-TS SHENZHEN-20251002-3O-01');
// 6. documents numbering
const id='PSC-20260911-9868182';
let d1=PSC.handle(st,U,'uploadDocument',{insp_id:id,doc_type:'PSC-B',original_name:'Form B.PDF',mime:'application/pdf',base64:'QUJD'});
let d2=PSC.handle(st,U,'uploadDocument',{insp_id:id,doc_type:'PSC-B',original_name:'formB-2.pdf',base64:'QUJD'});
let d3=PSC.handle(st,U,'uploadDocument',{insp_id:id,doc_type:'RECT',original_name:'rect.docx',base64:'QUJD'});
assert.equal(d1.file_name,'FLEET-TS KOBE-20260911-3O-02_PSC-B_01.pdf'); assert.equal(d2.doc_id,'FLEET-TS KOBE-20260911-3O-02_PSC-B_02'); assert.equal(d3.file_name,'FLEET-TS KOBE-20260911-3O-02_RECT_01.docx');
assert.equal(st.files[0].path,'PSC/2026/FLEET-TS KOBE-20260911-3O-02');
let dn=PSC.handle(st,U,'uploadDocument',{insp_id:'PSC-20260930-9868182',doc_type:'PSC-A',original_name:'a.pdf',base64:'QUJD'});
assert.equal(dn.file_name,'PSC-20260930-9868182_PSC-A_01.pdf'); assert.equal(st.files[3].path,'PSC/2026/NIL/PSC-20260930-9868182');
// 7. edit inspection: add a deficiency keeps IDs, appends D03
const cur=st.all('Deficiencies').filter(x=>x.insp_id===id);
r=PSC.handle(st,U,'saveInspection',{inspection:{insp_id:id,vessel:'TS KOBE',date:'2026-09-11',port:'OSAKA',country:'JAPAN'},deficiencies:cur.concat([{code:'4114',nature:'new',action:'17'}])});
assert.deepEqual(r.deficiencies.map(x=>x.def_id.slice(-3)),['D01','D02','D03']); assert.equal(r.inspection.tracking_no,'FLEET-TS KOBE-20260911-3O-02');
// 8. closing requires rectification
assert.throws(()=>PSC.handle(st,U,'setCaseStatus',{insp_id:id,status:'已完成'}),/未標記改正/);
r.deficiencies.forEach(d=>PSC.handle(st,U,'updateDeficiency',{def_id:d.def_id,fields:{rectified:'Y',rectified_date:'2026-09-12'}}));
const c=PSC.handle(st,U,'setCaseStatus',{insp_id:id,status:'已完成',closed_date:'2026-09-20'});
assert.equal(c.status,'已完成'); assert.equal(st.all('Incidents').find(i=>i.tracking_no==='FLEET-TS KOBE-20260911-3O-02').status,'已完成');
// 9. generic incident
const inc=PSC.handle(st,U,'saveIncident',{vessel:'TS KOBE',date:'2026-09-11',tier:'2',type:'M',summary:'ME'});
assert.equal(inc.tracking_no,'FLEET-TS KOBE-20260911-2M-03');
// 10. permissions
assert.throws(()=>PSC.handle(st,{email:'v',role:'viewer'},'saveIncident',{}),/權限不足/);
assert.throws(()=>PSC.handle(st,U,'saveUser',{email:'a'}),/權限不足/);
console.log('core tests passed; audit rows',st.all('AuditLog').length);
// 11. 未立案 -> editing issues a number; 歷史資料 -> never issues a number
const st2=MemStore({Vessels:vessels,Incidents:[],Settings:[],Inspections:[
 {insp_id:'PSC-20260129-9868182',tracking_no:'',date:'2026-01-29',port:'SHENZHEN',vessel:'TS KOBE',imo:'9868182',status:'未立案'},
 {insp_id:'PSC-20250129-9868182',tracking_no:'',date:'2025-01-29',port:'SHENZHEN',vessel:'TS KOBE',imo:'9868182',status:'歷史資料'}],Deficiencies:[],Documents:[],AuditLog:[]});
let a=PSC.handle(st2,U,'saveInspection',{inspection:{insp_id:'PSC-20260129-9868182',imo:'9868182',date:'2026-01-29',port:'SHENZHEN'},deficiencies:[{code:'7110',nature:'x',action:'17'}]});
assert.equal(a.inspection.tracking_no,'FLEET-TS KOBE-20260129-3O-01'); assert.equal(a.inspection.status,'進行中');
let h=PSC.handle(st2,U,'saveInspection',{inspection:{insp_id:'PSC-20250129-9868182',imo:'9868182',date:'2025-01-29',port:'SHENZHEN'},deficiencies:[{code:'7110',nature:'x',action:'17'}]});
assert.equal(h.inspection.tracking_no,''); assert.equal(h.inspection.status,'歷史資料'); assert.equal(st2.all('Incidents').length,1);
console.log('status rules passed');
// 12. bribe parsing, permissions, Tokyo MOU window, SRP estimate, data check, imports
assert.deepEqual(PSC.parseBribe('$ 1200 + 4 cigarettes'),{bribe_flag:'Y',bribe_paid_usd:'1200',bribe_cig:'4',bribe_goods:'',bribe_raw:'$ 1200 + 4 cigarettes'});
assert.equal(PSC.parseBribe('40 Cig+Paint').bribe_goods,'Paint'); assert.equal(PSC.parseBribe('$0').bribe_flag,'N');
assert.equal(PSC.bribeFlag({bribe_demanded_usd:'500',bribe_paid_usd:'0'}),'R');
const st3=MemStore({Vessels:[{vessel:'TS KOBE',imo:'9868182',company:'FLEET',management:'FLEET',flag:'Marshall',date_of_build:'2020-07-09'}],Incidents:[],Settings:PSC.DEFAULT_SETTINGS,Inspections:[],Deficiencies:[],Documents:[],AuditLog:[],RiskProfiles:[],Companies:[],NKStatus:[]});
PSC.handle(st3,{email:'a',role:'admin'},'saveInspection',{inspection:{imo:'9868182',date:'2026-01-10',port:'LOME',country:'TOGO',bribe_demanded_usd:'800',bribe_paid_usd:'300'},deficiencies:[]});
PSC.handle(st3,{email:'a',role:'admin'},'saveInspection',{inspection:{imo:'9868182',date:'2025-12-01',port:'OSAKA',country:'JAPAN'},deficiencies:[]});
assert.equal(st3.all('Inspections')[0].bribe_flag,'Y');
assert.ok(!('bribe_paid_usd' in PSC.handle(st3,{email:'v',role:'viewer'},'bootstrap').inspections[0]));
assert.ok('bribe_paid_usd' in PSC.handle(st3,{email:'e',role:'editor'},'bootstrap').inspections[0]);
let w=PSC.tmouWindow(st3.all('Inspections'),'9868182','STANDARD','2026-06-02');
assert.equal(w.last_tmou_date,'2025-12-01'); assert.equal(w.from,'2026-05-01'); assert.equal(w.to,'2026-08-01'); assert.equal(w.priority,'II');
assert.equal(PSC.tmouWindow(st3.all('Inspections'),'9868182','HIGH','2026-06-02').priority,'I');
assert.equal(PSC.addMonths('2025-08-31',6),'2026-02-28');
const e1=PSC.estimateSRP({imo:'9868182',today:'2026-06-02',inspections:[{imo:'9868182',date:'2026-01-01',country:'JAPAN',def_count:'7'},{imo:'9868182',date:'2025-01-01',country:'CHINA',def_count:'6'}],date_of_build:'2010-01-01',flag:'MARSHALL',whiteFlags:['MARSHALL'],company_performance:'High'});
assert.equal(e1.level,'HIGH'); assert.equal(e1.points,5);
assert.equal(PSC.estimateSRP({imo:'1',today:'2026-06-02',inspections:[{imo:'1',date:'2026-01-01',country:'JAPAN',def_count:'2'}],date_of_build:'2023-01-01',flag:'MARSHALL',whiteFlags:['MARSHALL'],company_performance:'High'}).level,'LOW');
let ri=PSC.handle(st3,{email:'a',role:'admin'},'importRisk',{as_of:'2026-10-02',vessels:[{vessel:'TS KOBE',srp:'standard',company_performance:'High'},{vessel:'NOPE',srp:'LOW'}],companies:[{code:'FLEET',doc_imo:'1601573'}]});
assert.equal(ri.updated,1); assert.deepEqual(ri.missing,['NOPE']);
PSC.handle(st3,{email:'a',role:'admin'},'importNK',{ships:[{vessel_master:{vessel_name:'TS KOBE',imo_number:"'9868182",class_number:'123',gross_tonnage:9000,data_source_date:'30 Sep 2026'},surveys:[{label:'SE',kind:'Annual',next:true,from:'2026-05-01',to:'2026-06-10'}],certificates:[],conditions:{class:'Nil'}}]});
assert.equal(st3.all('Vessels')[0].class_number,'123'); assert.equal(st3.all('NKStatus').length,2);
const rep=PSC.windowReport({settings:PSC.DEFAULT_SETTINGS.reduce((m,x)=>(m[x.key]=x.value,m),{}),vessels:st3.all('Vessels'),inspections:st3.all('Inspections'),riskProfiles:st3.all('RiskProfiles'),nkStatus:st3.all('NKStatus')},'2026-06-02');
assert.equal(rep[0].priority,'II'); assert.ok(rep[0].nk_alerts[0].includes('SE'));
assert.equal(PSC.normalizeRow('Deficiencies',{code:'7109',date:'2026/10/2'}).code,'07109'); assert.equal(PSC.normalizeRow('Inspections',{date:'2026/10/2'}).date,'2026-10-02');
const iss=PSC.validateData({inspections:[{insp_id:'A',date:'2026-01-01',port:'X',imo:'9',def_count:'1',nil:'Y',status:'進行中',tracking_no:''}],deficiencies:[{def_id:'A-D01',insp_id:'A',code:'7109'},{def_id:'A-D01',insp_id:'B',code:'07109'}],documents:[],incidents:[],vessels:[{imo:'1',company:'XX',vessel:'V'}]});
['def_id 重複','IMO 不在船隊資料','標為 NIL 卻有缺失','缺失代碼需為 5 碼','找不到對應檢查 B','公司碼不在清單'].forEach(t=>assert.ok(iss.some(i=>i.problem.includes(t)),t));
console.log('bribe / window / SRP / import / data-check tests passed');
// 13. MOU regions: map lookup, port override, auto-fill on save, window only counts Tokyo MOU
assert.equal(PSC.resolveMOU([],'United Arab Emirates','JEBEL ALI').mou,'Riyadh MOU');
assert.equal(PSC.resolveMOU([],'TOGO','LOME').mou,'Abuja MOU');
assert.equal(PSC.resolveMOU([],'USA','LONG BEACH').mou,'USCG');
assert.equal(PSC.resolveMOU([],'CANADA','PRINCE RUPERT').mou,'Tokyo MOU');
assert.equal(PSC.resolveMOU([],'CANADA','HALIFAX').mou,'Paris MOU');
assert.equal(PSC.resolveMOU([],'AUSTRALIA','SYDNEY').also,'Indian Ocean MOU');
assert.equal(PSC.resolveMOU([],'ATLANTIS','X').found,false);
const st4=MemStore({Vessels:[{vessel:'TS KOBE',imo:'9868182',company:'FLEET',management:'FLEET'}],MOUMap:PSC.DEFAULT_MOU,Incidents:[],Settings:PSC.DEFAULT_SETTINGS,Inspections:[],Deficiencies:[],Documents:[],AuditLog:[]});
const A={email:'a',role:'admin'};
let m1=PSC.handle(st4,A,'saveInspection',{inspection:{imo:'9868182',date:'2026-01-10',port:'DAR ES SALAAM',country:'tanzania'},deficiencies:[]});
assert.equal(m1.inspection.mou,'Indian Ocean MOU');
let m2=PSC.handle(st4,A,'saveInspection',{inspection:{imo:'9868182',date:'2026-02-10',port:'HALIFAX',country:'CANADA'},deficiencies:[]});
assert.equal(m2.inspection.mou,'Paris MOU');
let m3=PSC.handle(st4,A,'saveInspection',{inspection:{imo:'9868182',date:'2025-11-01',port:'KEELUNG',country:'Taiwan',mou:''},deficiencies:[]});
assert.equal(m3.inspection.mou,'Taiwan MPB');
PSC.handle(st4,A,'saveInspection',{inspection:{imo:'9868182',date:'2025-10-01',port:'OSAKA',country:'JAPAN'},deficiencies:[]});
let w4=PSC.tmouWindow(st4.all('Inspections'),'9868182','STANDARD','2026-03-01',[]);
assert.equal(w4.last_tmou_date,'2025-10-01','Canada Atlantic (Paris MOU) and Tanzania must not restart the Tokyo window'); assert.equal(w4.last_any_mou,'Paris MOU');
let m4=PSC.handle(st4,A,'saveInspection',{inspection:{imo:'9868182',date:'2026-02-20',port:'X',country:'ATLANTIS'},deficiencies:[]});
assert.equal(m4.inspection.mou,''); assert.ok(m4.warnings.some(w=>w.includes('ATLANTIS')));
PSC.handle(st4,A,'saveMOU',{country:'atlantis',mou:'Paris MOU',note:'test'});
assert.equal(PSC.resolveMOU(st4.all('MOUMap'),'ATLANTIS','').mou,'Paris MOU');
PSC.handle(st4,A,'saveMOU',{country:'ATLANTIS',mou:'Riyadh MOU',old_key:'ATLANTIS|'});
assert.equal(st4.all('MOUMap').filter(r=>r.country==='ATLANTIS').length,1);
let ap=PSC.handle(st4,A,'applyMOU',{}); assert.equal(ap.updated,1); assert.equal(st4.all('Inspections').find(r=>r.country==='ATLANTIS').mou,'Riyadh MOU');
st4.update('Inspections','country','TANZANIA',{mou:'V'});
assert.equal(PSC.handle(st4,A,'applyMOU',{}).updated,1);
assert.ok(PSC.validateData({inspections:[{insp_id:'Z',date:'2026-01-01',port:'LOME',country:'TOGO',mou:'Tokyo MOU',imo:'9',def_count:'0',status:'NIL'}],deficiencies:[],documents:[],incidents:[],vessels:[{imo:'9',company:'FLEET'}],mouMap:PSC.DEFAULT_MOU}).some(i=>i.problem.includes('對照表 TOGO 為 Abuja MOU')));
PSC.handle(st4,A,'saveMOU',{country:'ATLANTIS',old_key:'ATLANTIS|',remove:true}); assert.ok(!st4.all('MOUMap').some(r=>r.country==='ATLANTIS'));
assert.throws(()=>PSC.handle(st4,{email:'e',role:'editor'},'applyMOU',{}),/權限不足/);
console.log('MOU tests passed');
// 14. non-PSC incidents: deadlines, documents in 事故/ folder, edit, close needs RCA
const st5=MemStore({Vessels:[{vessel:'TS KOBE',imo:'9868182',company:'FLEET',management:'FLEET',pic:'Alan'}],Incidents:[],Settings:[],Inspections:[],Deficiencies:[],Documents:[],AuditLog:[]});
const inc5=PSC.handle(st5,U,'saveIncident',{imo:'9868182',date:'2026-09-01',tier:'3',type:'M',summary:'pump'});
assert.equal(inc5.rca_due,'2026-09-22'); assert.equal(inc5.initial_due,'2026-09-03');
const dd=PSC.handle(st5,U,'uploadDocument',{tracking_no:inc5.tracking_no,doc_type:'RPT',original_name:'Master report.pdf',base64:'QUJD'});
assert.equal(dd.file_name,inc5.tracking_no+'_RPT_01.pdf'); assert.equal(dd.insp_id,''); assert.equal(st5.files[0].path,'事故/2026/'+inc5.tracking_no);
assert.throws(()=>PSC.handle(st5,U,'uploadDocument',{tracking_no:inc5.tracking_no,doc_type:'PSC-B',original_name:'b.pdf',base64:'QUJD'}),/PSC 專用/);
assert.throws(()=>PSC.handle(st5,U,'setCaseStatus',{tracking_no:inc5.tracking_no,status:'已完成'}),/尚未歸檔 RCA/);
PSC.handle(st5,U,'uploadDocument',{tracking_no:inc5.tracking_no,doc_type:'RCA',original_name:'rca.pdf',base64:'QUJD'});
assert.equal(PSC.handle(st5,U,'setCaseStatus',{tracking_no:inc5.tracking_no,status:'已完成',closed_date:'2026-09-20'}).status,'已完成');
PSC.handle(st5,U,'updateIncident',{tracking_no:inc5.tracking_no,fields:{summary:'pump seal leak',corrective_action:'renewed seal',tracking_no:'HACK'}});
const i5=st5.all('Incidents')[0]; assert.equal(i5.summary,'pump seal leak'); assert.equal(i5.tracking_no,inc5.tracking_no);
assert.equal(PSC.validateData({inspections:[],deficiencies:[],documents:st5.all('Documents'),incidents:st5.all('Incidents'),vessels:[{imo:'9868182',company:'FLEET'}]}).filter(i=>i.table!=='Vessels').length,0);
assert.deepEqual(PSC.incidentDeadlines({date:'2026-01-10',tier:'2'}),{flash_due:'2026-01-10',initial_due:'2026-01-11',rca_due:'2026-01-24'});
// PSC incident inserted with deadlines
const st6=MemStore({Vessels:[{vessel:'TS KOBE',imo:'9868182',company:'FLEET',management:'FLEET'}],Incidents:[],Settings:[],Inspections:[],Deficiencies:[],Documents:[],AuditLog:[]});
PSC.handle(st6,U,'saveInspection',{inspection:{imo:'9868182',date:'2026-09-11',port:'OSAKA',country:'JAPAN'},deficiencies:[{code:'7109',nature:'x',action:'17'}]});
assert.equal(st6.all('Incidents')[0].rca_due,'2026-10-02'); assert.equal(st6.all('Inspections')[0].mou,'Tokyo MOU');
// 15. shared Tokyo MOU window CSV parser (quoted fields, BOM, company DOC numbers)
const csv='﻿PSC Inspection Window,,,,,,,,,,,,FLEET,1601573\r\nSTATUS,VESSEL NAME,X,RISK,PRIORITY,,,,,COMPANY PERFORMANCE\r\nOPEN,TS KOBE,,STANDARD,"Priority II, in window",,,,,High\r\n,,,,\r\n';
const pr=PSC.parseRiskCSV(csv,'w.csv','2026/10/02');
assert.equal(pr.vessels.length,1); assert.equal(pr.vessels[0].note,'檔案狀態 OPEN / Priority II, in window'); assert.equal(pr.companies[0].doc_imo,'1601573'); assert.equal(pr.as_of,'2026-10-02');
assert.throws(()=>PSC.parseRiskCSV('a,b\n1,2','x.csv'),/VESSEL NAME/);
console.log('incident / CSV tests passed');
