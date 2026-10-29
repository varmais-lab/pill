package com.varmaislab.tabletreminder;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Network requests are made outside WebView and never expose the Sheet itself. */
public final class CloudClient {
    private static final String KEY = "tablet_cloud_session_v1";
    private final Activity activity;
    private final WebView web;
    private final SharedPreferences prefs;
    private final ExecutorService worker = Executors.newFixedThreadPool(2);
    private volatile boolean closed;
    private final AtomicLong generation = new AtomicLong();

    CloudClient(Activity activity, WebView web) {
        this.activity=activity;this.web=web;
        prefs=activity.getSharedPreferences("tablet_cloud", Context.MODE_PRIVATE);
    }
    boolean isCloudMode() { return prefs.getBoolean("cloud_mode", true); }

    @JavascriptInterface public String configuration() {
        JSONObject result=new JSONObject();
        try { result.put("endpoint",prefs.getString("endpoint",""));result.put("cloud",isCloudMode());JSONObject session=session();result.put("user",session==null?JSONObject.NULL:session.getJSONObject("user")); }
        catch(Exception ignored) {}
        return result.toString();
    }

    @JavascriptInterface public boolean configure(String endpoint) {
        String value=endpoint==null?"":endpoint.trim();
        if(!validEndpoint(value))return false;
        String previous=prefs.getString("endpoint","");
        if(!previous.equals(value))clearAccount();
        return prefs.edit().putString("endpoint",value).putBoolean("cloud_mode",true).commit();
    }

    @JavascriptInterface public void useOfflinePrototype() {
        clearAccount();
        prefs.edit().putBoolean("cloud_mode",false).commit();
        String backup=prefs.getString("legacy_data","");
        if(!backup.isEmpty())new AppStore(activity).save(backup);
        activity.runOnUiThread(()->web.reload());
    }

    @JavascriptInterface public void useSharedAccounts() {
        backupLegacy();
        new AppStore(activity).enable(false);
        ReminderScheduler.schedule(activity);
        prefs.edit().putBoolean("cloud_mode",true).commit();
        activity.runOnUiThread(()->web.reload());
    }

    @JavascriptInterface public void request(String id, String input) {
        if(closed || id==null || !id.matches("[a-zA-Z0-9_-]{1,50}"))return;
        final long requestGeneration=generation.get();
        worker.execute(()->{
            JSONObject response;
            String action="";
            try {
                if(input==null || input.length()>100000)throw new Exception("Request too large.");
                JSONObject request=new JSONObject(input);action=request.optString("action");
                String endpoint=prefs.getString("endpoint","");
                if(!validEndpoint(endpoint))throw new Exception("Set the deployed Google Apps Script /exec URL first.");
                JSONObject session=session();
                request.remove("token");
                if(!action.equals("challenge") && !action.equals("login")) {
                    if(session==null) { reply(id,error("AUTH_REQUIRED","Please sign in."));return; }
                    request.put("token",session.getString("token"));
                }
                response=new JSONObject(post(endpoint,request.toString()));
                if(requestGeneration!=generation.get()){reply(id,error("AUTH_REQUIRED","Account changed. Please sign in again."));return;}
                if(response.optBoolean("ok")) {
                    JSONObject data=response.optJSONObject("data");
                    if(action.equals("login") && data!=null) {
                        String token=data.getString("token");
                        if(!token.matches("[a-f0-9]{64}"))throw new Exception("Invalid sign-in response.");
                        activate(new JSONObject(data.toString()));data.remove("token");
                    } else if(action.equals("me") && data!=null && session!=null) {
                        session.put("user",data);saveSession(session);
                    } else if(action.equals("data") && data!=null && session!=null && data.optString("ownerId").equals(session.getJSONObject("user").getString("id"))) {
                        JSONObject local=new JSONObject();
                        local.put("patients",data.getJSONArray("patients"));local.put("medicines",data.getJSONArray("medicines"));local.put("logs",data.getJSONArray("logs"));
                        synchronized(ReminderScheduler.class) { new AppStore(activity).save(local.toString());ReminderScheduler.schedule(activity); }
                    }
                } else if(response.optString("code").equals("AUTH_REQUIRED")) clearAccount();
            } catch(Exception failure) {
                response=error("CONNECTION", "Could not connect. Check the internet connection and the deployed backend URL.");
            }
            if(action.equals("logout"))clearAccount();
            reply(id,response);
        });
    }

    @JavascriptInterface public void signOutLocally() { clearAccount(); }

    private void reply(String id,JSONObject response) {
        if(closed)return;
        activity.runOnUiThread(()->{
            if(!closed && !activity.isDestroyed())web.evaluateJavascript("window.TabletCloudReply&&window.TabletCloudReply("+JSONObject.quote(id)+","+JSONObject.quote(response.toString())+")",null);
        });
    }
    private static JSONObject error(String code,String message) { JSONObject error=new JSONObject();try{error.put("ok",false);error.put("code",code);error.put("message",message);}catch(Exception ignored){}return error; }
    private static boolean validEndpoint(String value) {
        try { Uri uri=Uri.parse(value);return "https".equals(uri.getScheme()) && "script.google.com".equals(uri.getHost()) && uri.getPort()==-1 && uri.getQuery()==null && uri.getFragment()==null && uri.getUserInfo()==null && uri.getPath()!=null && uri.getPath().matches("/macros/s/[a-zA-Z0-9_-]+/exec"); }
        catch(Exception ignored){return false;}
    }
    private static boolean allowed(URL url) { return "https".equals(url.getProtocol()) && (url.getPort()==-1 || url.getPort()==443) && url.getUserInfo()==null && (url.getHost().equals("script.google.com") || url.getHost().equals("script.googleusercontent.com")); }
    private static String post(String endpoint,String json) throws Exception {
        URL url=new URL(endpoint);String method="POST";
        byte[] body=json.getBytes(StandardCharsets.UTF_8);
        for(int redirect=0;redirect<6;redirect++) {
            if(!allowed(url))throw new Exception("Unapproved redirect.");
            HttpURLConnection connection=(HttpURLConnection)url.openConnection();
            connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(15000);connection.setReadTimeout(25000);
            connection.setRequestMethod(method);connection.setRequestProperty("Accept","application/json");
            try {
                if(method.equals("POST")) {
                    connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json; charset=utf-8");
                    try(java.io.OutputStream out=connection.getOutputStream()){out.write(body);}
                }
                int status=connection.getResponseCode();
                if(status>=300 && status<400) {
                    String location=connection.getHeaderField("Location");if(location==null)throw new Exception("Missing redirect.");
                    url=new URL(url,location);if(status==301||status==302||status==303)method="GET";
                    continue;
                }
                if(status!=200)throw new Exception("Backend unavailable.");
                try(InputStream in=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()) {
                    byte[] buffer=new byte[8192];int count;
                    while((count=in.read(buffer))!=-1){if(out.size()+count>2_000_000)throw new Exception("Response too large.");out.write(buffer,0,count);}
                    return out.toString("UTF-8");
                }
            } finally {connection.disconnect();}
        }
        throw new Exception("Too many redirects.");
    }

    private synchronized SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(!store.containsAlias(KEY)) {
            KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(KEY,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
            generator.generateKey();
        }
        return (SecretKey)store.getKey(KEY,null);
    }
    private synchronized void saveSession(JSONObject value) throws Exception {
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
        String encrypted=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(value.toString().getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
        if(!prefs.edit().putString("session",encrypted).commit())throw new Exception("Could not save session.");
    }
    private synchronized JSONObject session() {
        String raw=prefs.getString("session","");if(raw.isEmpty())return null;
        try {String[] parts=raw.split(":",2);Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));return new JSONObject(new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8));}
        catch(Exception ignored){prefs.edit().remove("session").commit();return null;}
    }
    private synchronized void backupLegacy() {
        if(prefs.getString("current_user","").isEmpty() && !prefs.contains("legacy_data")) {
            String raw=new AppStore(activity).raw();if(!raw.isEmpty())prefs.edit().putString("legacy_data",raw).commit();
        }
    }
    private synchronized void activate(JSONObject login) throws Exception {
        String id=login.getJSONObject("user").getString("id");
        backupLegacy();
        if(!id.equals(prefs.getString("current_user",""))) {
            generation.incrementAndGet();
            new AppStore(activity).enable(false);new AppStore(activity).save("{\"patients\":[],\"medicines\":[],\"logs\":[]}");
            new AppStore(activity).resetDeliveryHistory();ReminderScheduler.schedule(activity);
        }
        saveSession(login);prefs.edit().putString("current_user",id).putBoolean("cloud_mode",true).commit();
    }
    private synchronized void clearAccount() {
        generation.incrementAndGet();
        backupLegacy();
        prefs.edit().remove("session").remove("current_user").commit();
        new AppStore(activity).enable(false);new AppStore(activity).save("{\"patients\":[],\"medicines\":[],\"logs\":[]}");
        new AppStore(activity).resetDeliveryHistory();ReminderScheduler.schedule(activity);
    }
    void close() { closed=true;worker.shutdownNow(); }
}
