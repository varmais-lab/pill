/* Tablet Reminder 0.2: private Google Sheets records with an authenticated API.
 * Install in Extensions > Apps Script of the database spreadsheet.
 * Run setupTabletReminder once, create the administrator, then deploy a Web app.
 */
const TABLET_VERSION = '0.2.0';
const PASSWORD_ITERATIONS = 600000;
const SESSION_SECONDS = 21600;
const TABLET_HEADERS = {
  Users: ['User_ID','Email','Full_Name','Role','Status','Created_At','Updated_At'],
  Patients: ['Patient_ID','User_ID','Name','Age','Relation','Color','Created_At','Updated_At'],
  Medicines: ['Medicine_ID','User_ID','Patient_ID','Name','Type','Dose','Times','Instructions','Active','Created_At','Updated_At'],
  Dose_Logs: ['Log_ID','User_ID','Medicine_ID','Date','Time','Status','Recorded_At']
};

function setupTabletReminder() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!sheet) throw new Error('Open Apps Script from the Tablet Reminder database spreadsheet.');
  const owner = Session.getActiveUser().getEmail();
  if (!owner) throw new Error('Run setup while signed in as the spreadsheet owner.');
  const props = PropertiesService.getScriptProperties();
  const existing = props.getProperty('spreadsheet_id');
  if (existing && existing !== sheet.getId()) throw new Error('This backend is already bound to another spreadsheet.');
  props.setProperty('spreadsheet_id', sheet.getId());
  if (!props.getProperty('owner_email')) props.setProperty('owner_email', owner.toLowerCase());
  if (!props.getProperty('pepper')) props.setProperty('pepper', random_() + random_());
  Object.keys(TABLET_HEADERS).forEach(name => {
    const tab = sheet.getSheetByName(name);
    if (!tab) throw new Error('Missing database tab: ' + name);
    const actual = tab.getRange(1,1,1,TABLET_HEADERS[name].length).getValues()[0];
    if (JSON.stringify(actual) !== JSON.stringify(TABLET_HEADERS[name])) throw new Error('Unexpected columns in ' + name);
  });
  showAdministratorSetup();
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Tablet Reminder').addItem('Create administrator', 'setupTabletReminder').addToUi();
}

function showAdministratorSetup() {
  const ui = HtmlService.createHtmlOutputFromFile('Setup').setWidth(440).setHeight(500);
  SpreadsheetApp.getUi().showModalDialog(ui, 'Tablet Reminder administrator');
}

// This is deliberately not an HTTP API action. Only the Google-authenticated
// spreadsheet owner can use the bound setup dialog to bootstrap the first admin.
function bootstrapAdmin(input) {
  return locked_(() => {
    const owner = PropertiesService.getScriptProperties().getProperty('owner_email');
    if (!owner || Session.getActiveUser().getEmail().toLowerCase() !== owner) fail_('FORBIDDEN','Only the spreadsheet owner can create the first administrator.');
    if (rows_('Users').some(row => row.Role === 'admin' && row.Status === 'active')) fail_('ALREADY_SETUP','An administrator already exists. Manage accounts in the app.');
    const user = createUser_(input, 'admin');
    PropertiesService.getScriptProperties().setProperty('admin_initialized', 'true');
    return user;
  });
}

function doGet() { return json_({ok:true,data:{service:'Tablet Reminder',version:TABLET_VERSION,setupComplete:ready_()}}); }

function doPost(event) {
  try {
    const text = event && event.postData && event.postData.contents;
    if (!text || text.length > 100000) fail_('BAD_REQUEST','Invalid request size.');
    const request = JSON.parse(text);
    if (!ready_()) fail_('SETUP_REQUIRED','Create the administrator in Apps Script before connecting the app.');
    let result;
    if (request.action === 'challenge') result = challenge_(request.email);
    else if (request.action === 'login') result = locked_(() => login_(request));
    else {
      const actor = authenticate_(request.token);
      switch (request.action) {
        case 'me': result = publicUser_(actor); break;
        case 'logout': CacheService.getScriptCache().remove('session:' + hmac_(request.token)); result = {ok:true}; break;
        case 'data': result = data_(actor, request.userId); break;
        case 'users': admin_(actor); result = rows_('Users').map(publicUser_); break;
        case 'createUser': admin_(actor); result = locked_(() => createUser_(request.payload || {}, null)); break;
        case 'updateUser': admin_(actor); result = locked_(() => updateUser_(actor, request.payload || {})); break;
        case 'resetPassword': admin_(actor); result = locked_(() => resetPassword_(request.payload || {})); break;
        case 'createPatient': result = locked_(() => patient_(actor, request.userId, request.payload || {})); break;
        case 'saveMedicine': result = locked_(() => medicine_(actor, request.userId, request.payload || {})); break;
        case 'deleteMedicine': result = locked_(() => deleteMedicine_(actor, request.userId, request.payload || {})); break;
        case 'saveLog': result = locked_(() => log_(actor, request.userId, request.payload || {})); break;
        default: fail_('BAD_REQUEST','Unknown action.');
      }
    }
    return json_({ok:true,data:result});
  } catch (error) {
    return json_({ok:false,code:error.tabletCode || 'SERVER_ERROR',message:error.tabletCode ? error.message : 'The database request could not be completed.'});
  }
}

function ready_() { return !!PropertiesService.getScriptProperties().getProperty('spreadsheet_id') && !!PropertiesService.getScriptProperties().getProperty('pepper') && PropertiesService.getScriptProperties().getProperty('admin_initialized')==='true'; }
function db_() { const id=PropertiesService.getScriptProperties().getProperty('spreadsheet_id'); if(!id) fail_('SETUP_REQUIRED','Run setupTabletReminder in Apps Script.'); return SpreadsheetApp.openById(id); }
function rows_(name) {
  const sheet=db_().getSheetByName(name), width=TABLET_HEADERS[name].length, last=sheet.getLastRow();
  if(last<2)return [];
  if(last>50000)fail_('CAPACITY','This prototype spreadsheet needs archiving before more records are added.');
  return sheet.getRange(2,1,last-1,width).getValues().map((values,index)=>{
    const row={_row:index+2};
    TABLET_HEADERS[name].forEach((header,col)=>row[header]=values[col]);
    return row;
  }).filter(row=>row[TABLET_HEADERS[name][0]]);
}
function cleanCell_(value) { return typeof value==='string' && /^[=+@-]/.test(value) ? "'"+value : value; }
function position_(name,row) {
  if(row._row)return row._row;
  const sheet=db_().getSheetByName(name),records=rows_(name);
  const next=records.reduce((last,record)=>Math.max(last,record._row),1)+1;
  // Keep a blank tail inside the table; inserting there expands table ranges
  // and overview formulas before a new record reaches the grid boundary.
  if(next>=sheet.getMaxRows())sheet.insertRowsBefore(sheet.getMaxRows(),100);
  return next;
}
function write_(name,row) {
  const sheet=db_().getSheetByName(name), headers=TABLET_HEADERS[name];
  const values=headers.map(header=>cleanCell_(row[header] === undefined ? '' : row[header]));
  sheet.getRange(position_(name,row),1,1,headers.length).setValues([values]);
  SpreadsheetApp.flush();
}
function locked_(operation) { const lock=LockService.getScriptLock(); if(!lock.tryLock(15000))fail_('BUSY','The database is busy. Please retry.'); try{return operation();}finally{lock.releaseLock();} }
function fail_(code,message) { const error=new Error(message); error.tabletCode=code; throw error; }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function str_(value,max) { return typeof value==='string'?value.trim().slice(0,max || 100):''; }
function email_(value) { const email=str_(value,254).toLowerCase(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail_('VALIDATION','Enter a valid email address.'); return email; }
function random_() { return Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,''); }
function hex_(bytes) { return bytes.map(value=>('0'+((value+256)%256).toString(16)).slice(-2)).join(''); }
function hmac_(value) { return hex_(Utilities.computeHmacSha256Signature(String(value),PropertiesService.getScriptProperties().getProperty('pepper'))); }
function same_(a,b) { a=String(a || ''); b=String(b || ''); let diff=a.length^b.length; for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0); return diff===0; }
function auth_(id) { const raw=PropertiesService.getScriptProperties().getProperty('auth:'+id); return raw?JSON.parse(raw):null; }
function password_(payload) { if(!/^[a-f0-9]{64}$/.test(payload.passwordKey || '') || !/^[a-f0-9]{32}$/.test(payload.salt || ''))fail_('VALIDATION','Invalid password setup.'); return {salt:payload.salt,hash:hmac_(payload.passwordKey),version:Utilities.getUuid()}; }
function publicUser_(row) { return {id:row.User_ID,email:row.Email,name:row.Full_Name,role:row.Role,status:row.Status}; }
function admin_(actor) { if(actor.Role!=='admin')fail_('FORBIDDEN','Administrator access required.'); }
function owner_(actor,requested) {
  const id=str_(requested,100) || actor.User_ID;
  if(id!==actor.User_ID)admin_(actor);
  if(!rows_('Users').some(row=>row.User_ID===id))fail_('NOT_FOUND','User not found.');
  return id;
}

function challenge_(input) {
  const email=email_(input), user=rows_('Users').find(row=>String(row.Email).toLowerCase()===email), auth=user && auth_(user.User_ID);
  return {salt:auth?auth.salt:hmac_('unknown:'+email).slice(0,32),iterations:PASSWORD_ITERATIONS};
}

function login_(request) {
  const email=email_(request.email), cache=CacheService.getScriptCache(), rateKey='login:'+hmac_(email);
  const count=Number(cache.get(rateKey)||0);
  if(count>=5)fail_('RATE_LIMIT','Too many sign-in attempts. Try again in 10 minutes.');
  const user=rows_('Users').find(row=>String(row.Email).toLowerCase()===email), auth=user && auth_(user.User_ID);
  if(!user || user.Status!=='active' || !auth || !/^[a-f0-9]{64}$/.test(request.passwordKey || '') || !same_(auth.hash,hmac_(request.passwordKey))) {
    cache.put(rateKey,String(count+1),600);
    fail_('LOGIN_FAILED','Email or password is incorrect, or the account is disabled.');
  }
  cache.remove(rateKey);
  const token=random_(), expiresAt=Date.now()+SESSION_SECONDS*1000;
  cache.put('session:'+hmac_(token),JSON.stringify({userId:user.User_ID,version:auth.version,expiresAt}),SESSION_SECONDS);
  return {token,user:publicUser_(user),expiresAt};
}

function authenticate_(token) {
  if(!/^[a-f0-9]{64}$/.test(token || ''))fail_('AUTH_REQUIRED','Please sign in.');
  const raw=CacheService.getScriptCache().get('session:'+hmac_(token));
  if(!raw)fail_('AUTH_REQUIRED','Your session expired. Please sign in again.');
  const session=JSON.parse(raw), user=rows_('Users').find(row=>row.User_ID===session.userId), auth=auth_(session.userId);
  if(!user || user.Status!=='active' || !auth || auth.version!==session.version || session.expiresAt<Date.now())fail_('AUTH_REQUIRED','Please sign in again.');
  return user;
}

function createUser_(input,forcedRole) {
  const email=email_(input.email), name=str_(input.name,100), role=forcedRole || input.role || 'user';
  if(!name || !['user','admin'].includes(role))fail_('VALIDATION','Name and a valid role are required.');
  if(rows_('Users').some(row=>String(row.Email).toLowerCase()===email))fail_('CONFLICT','That email already has an account.');
  const auth=password_(input), now=new Date(), id=Utilities.getUuid();
  const row={User_ID:id,Email:email,Full_Name:name,Role:role,Status:'active',Created_At:now,Updated_At:now};
  PropertiesService.getScriptProperties().setProperty('auth:'+id,JSON.stringify(auth));
  write_('Users',row);
  write_('Patients',{Patient_ID:Utilities.getUuid(),User_ID:id,Name:name,Age:0,Relation:'Self',Color:'#e3f1e8',Created_At:now,Updated_At:now});
  return publicUser_(row);
}

function updateUser_(actor,input) {
  const users=rows_('Users'), row=users.find(user=>user.User_ID===input.id);
  if(!row)fail_('NOT_FOUND','User not found.');
  const role=input.role || row.Role,status=input.status || row.Status,name=str_(input.name,100) || row.Full_Name;
  if(!['user','admin'].includes(role)||!['active','disabled'].includes(status))fail_('VALIDATION','Choose a valid role and status.');
  if(status==='active' && !auth_(row.User_ID))fail_('VALIDATION','Set a password before activating this account.');
  const remaining=users.filter(user=>user.User_ID!==row.User_ID && user.Role==='admin' && user.Status==='active' && auth_(user.User_ID)).length;
  if(row.Role==='admin' && row.Status==='active' && (role!=='admin'||status!=='active') && remaining===0)fail_('VALIDATION','Keep at least one active administrator.');
  row.Role=role;row.Status=status;row.Full_Name=name;row.Updated_At=new Date();write_('Users',row);
  return publicUser_(row);
}

function resetPassword_(input) {
  const user=rows_('Users').find(row=>row.User_ID===input.id);
  if(!user)fail_('NOT_FOUND','User not found.');
  PropertiesService.getScriptProperties().setProperty('auth:'+user.User_ID,JSON.stringify(password_(input)));
  return {ok:true}; // auth version change immediately invalidates existing sessions.
}

function dateText_(value) { return value instanceof Date?Utilities.formatDate(value,db_().getSpreadsheetTimeZone(),'yyyy-MM-dd'):String(value); }
function timeText_(value) { return value instanceof Date?Utilities.formatDate(value,db_().getSpreadsheetTimeZone(),'HH:mm'):String(value); }
function medicineView_(row) { return {id:row.Medicine_ID,patientId:row.Patient_ID,name:row.Name,type:row.Type,dose:row.Dose,times:String(row.Times).split(',').map(time=>time.trim()).filter(Boolean),instructions:row.Instructions,active:row.Active===true||String(row.Active).toLowerCase()==='true'}; }
function data_(actor,requested) {
  const id=owner_(actor,requested);
  return {ownerId:id,patients:rows_('Patients').filter(row=>row.User_ID===id).map(row=>({id:row.Patient_ID,name:row.Name,age:Number(row.Age)||0,relation:row.Relation,color:row.Color})),
    medicines:rows_('Medicines').filter(row=>row.User_ID===id).map(medicineView_),
    logs:rows_('Dose_Logs').filter(row=>row.User_ID===id).slice(-2000).map(row=>({id:row.Log_ID,medicineId:row.Medicine_ID,date:dateText_(row.Date),time:timeText_(row.Time),status:row.Status,recordedAt:row.Recorded_At instanceof Date?row.Recorded_At.toISOString():row.Recorded_At}))};
}

function patient_(actor,requested,input) {
  const id=owner_(actor,requested),name=str_(input.name,100),age=Number(input.age)||0;
  if(!name || age<0 || age>120)fail_('VALIDATION','Enter a name and an age from 0 to 120.');
  if(rows_('Patients').filter(row=>row.User_ID===id).length>=100)fail_('CAPACITY','The profile limit for this prototype has been reached.');
  const now=new Date(),row={Patient_ID:Utilities.getUuid(),User_ID:id,Name:name,Age:age,Relation:str_(input.relation,40)||'Family',Color:'#e3f1e8',Created_At:now,Updated_At:now};
  write_('Patients',row);return {id:row.Patient_ID,name,age,relation:row.Relation,color:row.Color};
}

function medicine_(actor,requested,input) {
  const id=owner_(actor,requested),name=str_(input.name,100),times=input.times;
  if(!name || !Array.isArray(times) || !times.length || times.length>12 || !times.every(time=>typeof time==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)))fail_('VALIDATION','Enter a medicine name and valid 24-hour times.');
  if(!rows_('Patients').some(row=>row.User_ID===id && row.Patient_ID===input.patientId))fail_('FORBIDDEN','Choose one of this user\'s profiles.');
  const rows=rows_('Medicines'),existing=input.id?rows.find(row=>row.Medicine_ID===input.id):null;
  if(input.id && (!existing||existing.User_ID!==id))fail_('FORBIDDEN','Medicine is not accessible.');
  if(!existing && rows.filter(row=>row.User_ID===id).length>=500)fail_('CAPACITY','The medicine limit for this prototype has been reached.');
  const now=new Date(),row=Object.assign(existing || {},{Medicine_ID:existing?existing.Medicine_ID:Utilities.getUuid(),User_ID:id,Patient_ID:input.patientId,Name:name,Type:str_(input.type,30)||'Tablet',Dose:str_(input.dose,70)||'As prescribed',Times:[...new Set(times)].sort().join(', '),Instructions:str_(input.instructions,160),Active:input.active!==false,Created_At:existing?existing.Created_At:now,Updated_At:now});
  write_('Medicines',row);return medicineView_(row);
}

function deleteMedicine_(actor,requested,input) {
  const id=owner_(actor,requested),row=rows_('Medicines').find(item=>item.Medicine_ID===input.id);
  if(!row || row.User_ID!==id)fail_('FORBIDDEN','Medicine is not accessible.');
  // Keep the row and its history; disabling removes it from future reminders.
  row.Active=false;row.Updated_At=new Date();write_('Medicines',row);return {ok:true};
}

function log_(actor,requested,input) {
  const id=owner_(actor,requested),date=str_(input.date,10),time=str_(input.time,5);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||isNaN(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!['taken','skipped'].includes(input.status))fail_('VALIDATION','Invalid dose log.');
  const medicine=rows_('Medicines').find(row=>row.User_ID===id&&row.Medicine_ID===input.medicineId);
  if(!medicine || !medicineView_(medicine).times.includes(time))fail_('FORBIDDEN','Dose is not part of this user\'s schedule.');
  const rows=rows_('Dose_Logs'),existing=rows.find(row=>row.User_ID===id&&row.Medicine_ID===input.medicineId&&dateText_(row.Date)===date&&timeText_(row.Time)===time);
  const row=Object.assign(existing||{},{Log_ID:existing?existing.Log_ID:Utilities.getUuid(),User_ID:id,Medicine_ID:input.medicineId,Date:Utilities.parseDate(date,db_().getSpreadsheetTimeZone(),'yyyy-MM-dd'),Time:time,Status:input.status,Recorded_At:new Date()});
  write_('Dose_Logs',row);return {id:row.Log_ID,medicineId:row.Medicine_ID,date,time,status:row.Status,recordedAt:row.Recorded_At.toISOString()};
}
