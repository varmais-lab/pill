'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=__dirname, DATA=path.join(ROOT,'data.json'), PORT=Number(process.env.PORT||3000), HOST=process.env.HOST||'127.0.0.1';
const PASSWORD=process.env.ADMIN_PASSWORD||'demo123';
const token=crypto.randomBytes(32).toString('hex');
const seed={patients:[{id:'p1',name:'Lakshmi',age:66,relation:'Mother',color:'#ffe8d8'},{id:'p2',name:'Ravi',age:42,relation:'Self',color:'#e2e9fc'}],medicines:[{id:'m1',patientId:'p1',name:'Demo Vitamin',type:'Tablet',dose:'1 tablet',times:['08:00','20:00'],instructions:'After food',active:true},{id:'m2',patientId:'p1',name:'Demo Eye Drops',type:'Eye drops',dose:'1 drop (example only)',times:['09:00','21:00'],instructions:'Follow doctor instructions',active:true},{id:'m3',patientId:'p2',name:'Demo Supplement',type:'Tablet',dose:'1 tablet',times:['13:00'],instructions:'Demo schedule',active:true}],logs:[]};
if(!fs.existsSync(DATA))fs.writeFileSync(DATA,JSON.stringify(seed,null,2));
function read(){return JSON.parse(fs.readFileSync(DATA,'utf8'))} function write(d){const tmp=DATA+'.tmp';fs.writeFileSync(tmp,JSON.stringify(d,null,2));fs.renameSync(tmp,DATA)}
function send(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj))}
function auth(req){return req.headers.authorization==='Bearer '+token}
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>100000){reject(Error('Payload too large'));req.destroy()}});req.on('end',()=>{try{resolve(JSON.parse(s||'{}'))}catch(e){reject(e)}});req.on('error',reject)})}
function str(v,max=100){return typeof v==='string'?v.trim().slice(0,max):''}
function time(v){return /^([01]\d|2[0-3]):[0-5]\d$/.test(v)}
function guard(req,res){if(!auth(req)){send(res,401,{error:'Admin login required'});return false}return true}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');let route=url.pathname;
 if(route==='/api/health')return send(res,200,{ok:true,mode:'local-demo'});
 if(route==='/api/login'&&req.method==='POST'){const b=await body(req);if(typeof b.password==='string'&&crypto.timingSafeEqual(Buffer.from(crypto.createHash('sha256').update(b.password).digest('hex')),Buffer.from(crypto.createHash('sha256').update(PASSWORD).digest('hex'))))return send(res,200,{token});return send(res,401,{error:'Incorrect password'})}
 if(route==='/api/data'&&req.method==='GET')return send(res,200,read());
 if(route==='/api/patients'&&req.method==='POST'){if(!guard(req,res))return;const b=await body(req),d=read();if(!str(b.name))return send(res,400,{error:'Patient name required'});const p={id:crypto.randomUUID(),name:str(b.name),relation:str(b.relation,40)||'Family',age:Math.max(0,Math.min(120,Number(b.age)||0)),color:'#e3f1e8'};d.patients.push(p);write(d);return send(res,201,p)}
 if(route==='/api/medicines'&&req.method==='POST'){if(!guard(req,res))return;const b=await body(req),d=read();if(!d.patients.some(p=>p.id===b.patientId)||!str(b.name)||!Array.isArray(b.times)||!b.times.length||b.times.length>12||!b.times.every(time))return send(res,400,{error:'Patient, medicine name, valid times required'});const m={id:crypto.randomUUID(),patientId:b.patientId,name:str(b.name),type:str(b.type,30)||'Tablet',dose:str(b.dose,70)||'As prescribed',times:[...new Set(b.times)].sort(),instructions:str(b.instructions,160),active:true};d.medicines.push(m);write(d);return send(res,201,m)}
 if(route.startsWith('/api/medicines/')&&req.method==='DELETE'){if(!guard(req,res))return;const id=route.split('/').pop(),d=read();d.medicines=d.medicines.filter(m=>m.id!==id);write(d);return send(res,200,{ok:true})}
 if(route==='/api/logs'&&req.method==='POST'){const b=await body(req),d=read();if(!d.medicines.some(m=>m.id===b.medicineId)||!time(b.time)||!/\d{4}-\d{2}-\d{2}/.test(b.date)||!['taken','skipped','snoozed'].includes(b.status))return send(res,400,{error:'Invalid entry'});const k=x=>x.medicineId===b.medicineId&&x.time===b.time&&x.date===b.date;d.logs=d.logs.filter(x=>!k(x));const log={id:crypto.randomUUID(),medicineId:b.medicineId,date:b.date,time:b.time,status:b.status,recordedAt:new Date().toISOString()};d.logs.push(log);write(d);return send(res,201,log)}
 if(route==='/api/reset'&&req.method==='POST'){if(!guard(req,res))return;write(seed);return send(res,200,{ok:true})}
 if(req.method!=='GET')return send(res,404,{error:'Not found'});
 if(route==='/')route='/index.html';const file=path.resolve(ROOT,'public','.'+route);if(!file.startsWith(path.join(ROOT,'public')+path.sep))return send(res,403,{error:'Forbidden'});
 if(!fs.existsSync(file)||!fs.statSync(file).isFile())return send(res,404,{error:'Not found'});
 const ext=path.extname(file),types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml'};res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','X-Content-Type-Options':'nosniff'});fs.createReadStream(file).pipe(res);
 }catch(e){console.error(e);if(!res.headersSent)send(res,500,{error:'Request failed'})}});
server.listen(PORT,HOST,()=>console.log(`Tablet Reminder ready: http://${HOST}:${PORT} | Admin demo password: ${PASSWORD}`));
