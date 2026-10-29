'use strict';
(() => {
  const bridge=window.TabletCloud;
  const config=bridge?JSON.parse(bridge.configuration()):{cloud:true,endpoint:'',user:null};
  const pending=new Map();let sequence=0,owner=config.user?.id||'';
  const account={config,user:config.user,owner:()=>owner,setOwner:id=>owner=id};
  window.TabletCloudReply=(id,text)=>{
    const request=pending.get(id);if(!request)return;pending.delete(id);clearTimeout(request.timer);
    try{const reply=JSON.parse(text);if(reply.ok)request.resolve(reply.data);else{const error=Error(reply.message||'Request failed');error.code=reply.code;request.reject(error);}}catch(error){request.reject(error);}
  };
  account.rpc=(action,payload={})=>new Promise((resolve,reject)=>{
    if(!bridge){reject(Error('Shared accounts are available in the Android app.'));return;}
    const id='r'+(++sequence),timer=setTimeout(()=>{pending.delete(id);reject(Error('The request timed out. Please retry.'));},60000);
    pending.set(id,{resolve,reject,timer});bridge.request(id,JSON.stringify({action,...payload}));
  });
  account.password=async password=>{
    if(password.length<10||password.length>128)throw Error('Use a password between 10 and 128 characters.');
    const salt=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
    return {salt,passwordKey:await account.derive(password,salt,600000)};
  };
  account.derive=async(password,salt,iterations)=>{
    if(!/^[a-f0-9]{32}$/.test(salt)||iterations!==600000)throw Error('Unsupported password configuration.');
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
    const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:Uint8Array.from(salt.match(/../g),x=>parseInt(x,16)),iterations},key,256);
    return Array.from(new Uint8Array(bits),n=>n.toString(16).padStart(2,'0')).join('');
  };
  account.login=async(email,password)=>{
    const challenge=await account.rpc('challenge',{email});
    const passwordKey=await account.derive(password,challenge.salt,challenge.iterations);
    const result=await account.rpc('login',{email,passwordKey});
    account.user=result.user;owner=result.user.id;return result.user;
  };
  const offline=window.tabletDemoApi;
  window.tabletDemoApi=async(url,options={})=>{
    if(!config.cloud)return offline(url,options);
    if(!account.user){const error=Error('Please sign in.');error.code='AUTH_REQUIRED';throw error;}
    const payload=options.body?JSON.parse(options.body):{};
    try{
      if(url==='/api/data')return await account.rpc('data',{userId:owner});
      if(url==='/api/patients')return await account.rpc('createPatient',{userId:owner,payload});
      if(url==='/api/medicines'){
        payload.active=payload.active!==false && payload.active!=='false';
        return await account.rpc('saveMedicine',{userId:owner,payload});
      }
      if(url.startsWith('/api/medicines/'))return await account.rpc('deleteMedicine',{userId:owner,payload:{id:decodeURIComponent(url.split('/').pop())}});
      if(url==='/api/logs')return await account.rpc('saveLog',{userId:owner,payload});
      throw Error('This action is available only in the offline prototype.');
    }catch(error){if(error.code==='AUTH_REQUIRED')window.accountSignedOut?.();throw error;}
  };
  window.Accounts=account;
})();
