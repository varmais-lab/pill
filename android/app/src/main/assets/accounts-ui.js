'use strict';
(async()=>{
  const a=window.Accounts,phone=window.TabletCloud,layout=document.querySelector('.layout');
  const escape=value=>String(value??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const css=document.createElement('style');css.textContent='.account-login{max-width:450px;margin:7vh auto;padding:0 20px}.account-login h1{font-size:27px}.account-login .field{margin:14px 0}.account-error{color:#a34436;line-height:1.5}.account-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:20px}.account-bar span{flex:1;font-size:13px;color:#5c7867}.user-row{display:grid;grid-template-columns:1fr 110px 115px;gap:9px;padding:16px 0;border-bottom:1px solid #e3ece5}.user-row .user-actions{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px}.user-row b{display:block}.user-row small{color:#708578;overflow-wrap:anywhere}.user-row select{width:100%;min-width:0}.account-muted{font-size:12px;color:#708578;line-height:1.6}.owner-bar{margin-bottom:18px;padding:14px;background:#e4f3ea;border-radius:12px}.account-login input{width:100%}.account-login details{margin-top:24px}.btn:disabled,.smallbtn:disabled{opacity:.55;cursor:default}@media(max-width:600px){.user-row{grid-template-columns:1fr 1fr}.user-row>div:first-child{grid-column:1/-1}}';document.head.append(css);
  const login=document.createElement('section');login.className='account-login';login.id='accountLogin';
  login.innerHTML='<div class="brand"><span class="logo">✚</span>Tablet Reminder</div><h1>Sign in</h1><p class="muted">Your medicine schedule, on your phone.</p><div class="card"><form id="accountLoginForm"><div class="field"><label for="accountEmail">Email</label><input id="accountEmail" type="email" autocomplete="username" required placeholder="you@example.com"></div><div class="field"><label for="accountPassword">Password</label><input id="accountPassword" type="password" autocomplete="current-password" required></div><button class="btn" id="accountSignIn">Sign in</button><p class="account-error" id="accountError" role="alert"></p></form><p class="account-muted">Ask your administrator to create an account or reset your password.</p></div><details id="connectionDetails"><summary>Connection settings</summary><form id="connectionForm"><div class="field"><label for="connectionUrl">Connection address from your administrator</label><input id="connectionUrl" type="url" placeholder="https://script.google.com/macros/s/…/exec" required></div><button class="smallbtn">Save connection</button><p class="account-muted" id="connectionStatus"></p></form></details><p><button class="smallbtn" id="useOffline">Use offline prototype</button></p>';
  document.body.append(login);
  const showError=error=>document.querySelector('#accountError').textContent=error.message||String(error);
  function showLogin(){layout.style.visibility='hidden';layout.style.display='none';login.style.display='block';document.querySelector('#connectionDetails').open=!a.config.endpoint;document.querySelector('#connectionUrl').value=a.config.endpoint||'';document.querySelector('#accountPassword').value='';}
  window.accountSignedOut=()=>{a.user=null;showLogin();};
  document.querySelector('#useOffline').onclick=()=>phone?.useOfflinePrototype();
  document.querySelector('#connectionForm').onsubmit=event=>{event.preventDefault();const url=document.querySelector('#connectionUrl').value.trim();if(!phone||!phone.configure(url)){document.querySelector('#connectionStatus').textContent='Enter the deployed Google Apps Script address ending in /exec.';return;}a.config.endpoint=url;document.querySelector('#connectionStatus').textContent='Connection saved. Sign in above.';};

  const medicineForm=document.querySelector('#medicineForm');
  const hidden=document.createElement('input');hidden.type='hidden';hidden.name='id';medicineForm.prepend(hidden);
  const active=document.createElement('div');active.className='field';active.innerHTML='<label for="medicineActive">Schedule status</label><select id="medicineActive" name="active"><option value="true">Active</option><option value="false">Paused</option></select>';medicineForm.insertBefore(active,medicineForm.querySelector('button.btn'));
  const cancel=document.createElement('button');cancel.type='button';cancel.className='smallbtn wide';cancel.textContent='Cancel editing';cancel.style.display='none';medicineForm.append(cancel);
  const medicineHeading=medicineForm.parentElement.querySelector('h2');
  function stopEditing(){medicineForm.reset();hidden.value='';medicineHeading.textContent='Add Medicine';cancel.style.display='none';}
  cancel.onclick=stopEditing;
  medicineForm.onsubmit=async event=>{
    event.preventDefault();const button=medicineForm.querySelector('button[type="submit"],button.btn');button.disabled=true;
    try{const entry=Object.fromEntries(new FormData(medicineForm));entry.patientId=document.querySelector('#mPatient').value;entry.type=document.querySelector('#mType').value;entry.times=entry.times.split(',').map(x=>x.trim());await api('/api/medicines',{method:'POST',body:JSON.stringify(entry)});stopEditing();await refresh();toast('Medicine saved');}catch(error){toast(error.message);}finally{button.disabled=false;}
  };
  function decorateMedicines(){
    document.querySelectorAll('#adminMeds [data-delete]').forEach(remove=>{
      const medicine=data.medicines.find(m=>m.id===remove.dataset.delete);if(!medicine)return;
      if(a.config.cloud){remove.textContent=medicine.active?'Pause':'Paused';remove.disabled=!medicine.active;}
      if(remove.parentElement.querySelector('[data-edit-medicine]'))return;
      const controls=document.createElement('div');controls.className='actions';controls.style.cssText='width:auto;padding:0';remove.parentElement.append(controls);controls.append(remove);
      const edit=document.createElement('button');edit.type='button';edit.className='smallbtn';edit.textContent='Edit';edit.dataset.editMedicine=medicine.id;controls.prepend(edit);
      edit.onclick=()=>{
        const m=data.medicines.find(item=>item.id===edit.dataset.editMedicine);if(!m)return;
        hidden.value=m.id;medicineForm.elements.name.value=m.name;medicineForm.elements.dose.value=m.dose;medicineForm.elements.times.value=m.times.join(', ');medicineForm.elements.instructions.value=m.instructions;
        document.querySelector('#mPatient').value=m.patientId;document.querySelector('#mType').value=m.type;document.querySelector('#medicineActive').value=String(m.active);medicineHeading.textContent='Edit Medicine';cancel.style.display='block';medicineForm.scrollIntoView({behavior:'smooth',block:'start'});
      };
    });
  }
  new MutationObserver(decorateMedicines).observe(document.querySelector('#adminMeds'),{childList:true});

  const main=document.querySelector('main');
  const accountBar=document.createElement('div');accountBar.className='account-bar';accountBar.innerHTML='<span id="signedInName"></span><button class="smallbtn" id="refreshAccountData">Refresh</button><button class="smallbtn" id="accountSignOut">Sign out</button>';main.prepend(accountBar);
  const ownerBar=document.createElement('div');ownerBar.className='owner-bar hidden';ownerBar.innerHTML='<label for="ownerSelect">Managing records for </label><select id="ownerSelect" class="select"></select><p class="account-muted">Phone reminders use your own account. Other users receive their schedules when they refresh their app.</p>';accountBar.after(ownerBar);
  let users=[];
  const userSection=document.createElement('section');userSection.id='users';userSection.className='hidden';userSection.innerHTML='<div class="sectionhead"><h2>Manage users</h2></div><div class="card"><h2>Create user</h2><form id="createUserForm" class="form"><div class="field"><label for="newUserName">Name</label><input id="newUserName" name="name" required maxlength="100"></div><div class="field"><label for="newUserEmail">Email</label><input id="newUserEmail" name="email" type="email" required></div><div class="field"><label for="newUserPassword">Initial password</label><input id="newUserPassword" name="password" type="password" minlength="10" maxlength="128" required autocomplete="new-password"></div><div class="field"><label for="newUserRole">Role</label><select id="newUserRole" name="role"><option value="user">User</option><option value="admin">Admin</option></select></div><button class="btn wide">Create user</button></form></div><div class="card hidden" id="resetPasswordCard" style="margin-top:20px"><h2 id="resetPasswordTitle">Reset password</h2><form id="resetPasswordForm" class="form"><input type="hidden" name="id"><div class="field wide"><label for="resetPasswordValue">New password</label><input id="resetPasswordValue" name="password" type="password" minlength="10" maxlength="128" required autocomplete="new-password"></div><button class="btn">Set password</button><button class="smallbtn" type="button" id="cancelPasswordReset">Cancel</button></form></div><div class="card" style="margin-top:20px"><h2>Accounts</h2><div id="userRows"></div></div>';
  main.append(userSection);
  document.querySelectorAll('.field').forEach((field,index)=>{const label=field.querySelector('label'),input=field.querySelector('input,select');if(label&&input){if(!input.id)input.id='accountField'+index;label.htmlFor=input.id;}});
  function ordinaryPage(pageName){userSection.classList.add('hidden');page(pageName);if(pageName==='admin'&&a.config.cloud){document.querySelector('#loginPanel').classList.add('hidden');document.querySelector('#adminPanel').classList.remove('hidden');document.querySelector('#pageTitle').textContent='My medicines';document.querySelector('#sub').textContent='Add or update medicine schedules.';}document.querySelectorAll('[data-account-users]').forEach(b=>b.classList.remove('active'));}
  document.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',()=>userSection.classList.add('hidden')));
  function showUsers(){['today','family','admin'].forEach(id=>document.querySelector('#'+id).classList.add('hidden'));userSection.classList.remove('hidden');document.querySelector('#pageTitle').textContent='Manage users';document.querySelector('#sub').textContent='Accounts, access and medicine schedules.';document.querySelectorAll('[data-page]').forEach(b=>b.classList.remove('active'));document.querySelectorAll('[data-account-users]').forEach(b=>b.classList.add('active'));}
  async function chooseOwner(id){a.setOwner(id);document.querySelector('#ownerSelect').value=id;stopEditing();await refresh();const other=id!==a.user.id;const notify=document.querySelector('#notify');notify.disabled=other;document.querySelector('#phoneReminderStatus')?.closest('.card')?.classList.toggle('hidden',other);ordinaryPage('admin');}
  document.querySelector('#ownerSelect').onchange=event=>chooseOwner(event.target.value).catch(error=>toast(error.message));
  async function loadUsers(){
    if(a.user?.role!=='admin')return;
    users=await a.rpc('users');
    document.querySelector('#ownerSelect').innerHTML=users.map(user=>`<option value="${escape(user.id)}">${escape(user.name)} · ${escape(user.email)}</option>`).join('');document.querySelector('#ownerSelect').value=a.owner();
    document.querySelector('#userRows').innerHTML=users.map(user=>`<div class="user-row" data-user="${escape(user.id)}"><div><b>${escape(user.name)}</b><small>${escape(user.email)}</small></div><select class="select" aria-label="Role for ${escape(user.name)}" data-role><option value="user" ${user.role==='user'?'selected':''}>User</option><option value="admin" ${user.role==='admin'?'selected':''}>Admin</option></select><select class="select" aria-label="Status for ${escape(user.name)}" data-status><option value="active" ${user.status==='active'?'selected':''}>Active</option><option value="disabled" ${user.status==='disabled'?'selected':''}>Disabled</option></select><div class="user-actions"><button class="smallbtn" data-view-user="${escape(user.id)}">Medicines</button><button class="smallbtn" data-save-user="${escape(user.id)}">Save access</button><button class="smallbtn" data-reset-user="${escape(user.id)}">Reset password</button></div></div>`).join('');
  }
  document.querySelector('#userRows').onclick=async event=>{
    const button=event.target.closest('button');if(!button)return;
    try{
      if(button.dataset.viewUser){await chooseOwner(button.dataset.viewUser);return;}
      if(button.dataset.saveUser){const row=button.closest('.user-row');await a.rpc('updateUser',{payload:{id:button.dataset.saveUser,role:row.querySelector('[data-role]').value,status:row.querySelector('[data-status]').value}});if(button.dataset.saveUser===a.user.id){location.reload();return;}await loadUsers();toast('Account updated');}
      if(button.dataset.resetUser){const user=users.find(u=>u.id===button.dataset.resetUser);document.querySelector('#resetPasswordForm').elements.id.value=user.id;document.querySelector('#resetPasswordTitle').textContent='Reset password: '+user.name;document.querySelector('#resetPasswordCard').classList.remove('hidden');document.querySelector('#resetPasswordCard').scrollIntoView({behavior:'smooth'});}
    }catch(error){toast(error.message);}
  };
  document.querySelector('#createUserForm').onsubmit=async event=>{
    event.preventDefault();const form=event.target,button=form.querySelector('button');button.disabled=true;
    try{const values=Object.fromEntries(new FormData(form)),credential=await a.password(values.password);delete values.password;await a.rpc('createUser',{payload:{...values,...credential}});form.reset();await loadUsers();toast('User created');}catch(error){toast(error.message);}finally{button.disabled=false;}
  };
  document.querySelector('#resetPasswordForm').onsubmit=async event=>{
    event.preventDefault();const form=event.target,button=form.querySelector('button');button.disabled=true;
    try{const values=Object.fromEntries(new FormData(form)),credential=await a.password(values.password);await a.rpc('resetPassword',{payload:{id:values.id,...credential}});const own=values.id===a.user.id;form.reset();document.querySelector('#resetPasswordCard').classList.add('hidden');if(own){phone.signOutLocally();location.reload();return;}toast('Password changed. Existing sessions are revoked.');}catch(error){toast(error.message);}finally{button.disabled=false;}
  };
  document.querySelector('#cancelPasswordReset').onclick=()=>{document.querySelector('#resetPasswordForm').reset();document.querySelector('#resetPasswordCard').classList.add('hidden');};

  async function signedIn(){
    login.style.display='none';layout.style.display='';layout.style.visibility='visible';
    document.querySelector('#signedInName').textContent=a.user.name+' · '+(a.user.role==='admin'?'Administrator':'User');
    document.querySelector('#loginPanel').classList.add('hidden');document.querySelector('#adminPanel').classList.remove('hidden');document.querySelector('#reset').classList.add('hidden');document.querySelector('#logout').classList.add('hidden');
    document.querySelectorAll('[data-page="admin"]').forEach(button=>button.innerHTML=button.closest('.mobilebar')?'<span>💊</span>My medicines':'💊 &nbsp; My medicines');
    document.querySelector('.badge').textContent='● Shared account';
    ownerBar.classList.toggle('hidden',a.user.role!=='admin');
    document.querySelectorAll('[data-page="admin"]').forEach(button=>button.addEventListener('click',()=>{document.querySelector('#loginPanel').classList.add('hidden');document.querySelector('#adminPanel').classList.remove('hidden');document.querySelector('#pageTitle').textContent='My medicines';document.querySelector('#sub').textContent='Add or update medicine schedules.';}));
    if(a.user.role==='admin'){
      for(const nav of [document.querySelector('#nav'),document.querySelector('.mobilebar')])if(!nav.querySelector('[data-account-users]')){const button=document.createElement('button');button.dataset.accountUsers='true';button.innerHTML=nav.classList.contains('mobilebar')?'<span>♙</span>Users':'♙ &nbsp; Manage users';button.onclick=()=>{showUsers();loadUsers().catch(error=>toast(error.message));};nav.append(button);}
      await loadUsers();
    }
    await refresh();ordinaryPage('today');
  }
  document.querySelector('#refreshAccountData').onclick=async()=>{try{a.user=await a.rpc('me');await refresh();await loadUsers();toast('Latest records loaded');}catch(error){if(error.code==='AUTH_REQUIRED')window.accountSignedOut();else toast(error.message);}};
  document.querySelector('#accountSignOut').onclick=async()=>{try{await a.rpc('logout');}catch(_){}phone.signOutLocally();location.reload();};
  document.querySelector('#accountLoginForm').onsubmit=async event=>{event.preventDefault();const button=document.querySelector('#accountSignIn');button.disabled=true;document.querySelector('#accountError').textContent='Signing in…';try{const email=document.querySelector('#accountEmail').value,password=document.querySelector('#accountPassword').value;await a.login(email,password);document.querySelector('#accountPassword').value='';await signedIn();}catch(error){showError(error);}finally{button.disabled=false;}};
  if(!a.config.cloud){
    document.querySelector('.hint').textContent='OFFLINE PROTOTYPE · Records stay on this phone.';document.querySelector('.badge').textContent='● Offline prototype';
    login.style.display='none';accountBar.innerHTML='<span>Offline prototype · records stay on this phone</span><button class="smallbtn" id="connectAccounts">Connect shared accounts</button>';document.querySelector('#connectAccounts').onclick=()=>phone.useSharedAccounts();layout.style.visibility='visible';await refresh();ordinaryPage('today');return;
  }
  showLogin();
  if(a.user){try{a.user=await a.rpc('me');await signedIn();}catch(error){showError(error);}}
})();
