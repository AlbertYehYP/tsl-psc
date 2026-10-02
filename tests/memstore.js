// In-memory store implementing the core storage interface (also used by the browser demo)
function MemStore(seed, opts){
  opts=opts||{};
  const T={}; Object.keys(seed||{}).forEach(k=>T[k]=(seed[k]||[]).map(r=>Object.assign({},r)));
  const files=[]; let clock=opts.clock||null;
  const tbl=n=>T[n]||(T[n]=[]);
  return {
    tables:T, files,
    all:n=>tbl(n).map(r=>Object.assign({},r)),
    insert:(n,o)=>{tbl(n).push(Object.assign({},o))},
    update:(n,k,v,p)=>{tbl(n).forEach(r=>{if(String(r[k])===String(v))Object.assign(r,p)})},
    updateWhere:(n,f,p)=>{tbl(n).forEach(r=>{if(f(r))Object.assign(r,p)})},
    replaceWhere:(n,k,v,rows)=>{T[n]=tbl(n).filter(r=>String(r[k])!==String(v)).concat(rows.map(r=>Object.assign({},r)))},
    putFile:(path,name,mime,b64)=>{const id='F'+(files.length+1);files.push({id,path:path.join('/'),name,mime,size:b64.length});return {id,url:'https://drive.example/'+id}},
    now:()=>clock?clock():new Date().toISOString(),
    lock:fn=>fn()
  };
}
if(typeof module!=='undefined') module.exports=MemStore;
