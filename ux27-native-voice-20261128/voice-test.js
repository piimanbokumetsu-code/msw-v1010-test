(function(){
'use strict';
// UX27 fictitious-words-only trial: no DB, PIN, storage, upload or service worker.
var $=function(id){return document.getElementById(id);};
var std=typeof window.SpeechRecognition==='function'?window.SpeechRecognition:null;
var pre=typeof window.webkitSpeechRecognition==='function'?window.webkitSpeechRecognition:null;
var Ctor=null,strictCapable=false,locale='unknown',running=false,active=null;
[std,pre].forEach(function(C){if(!C)return;try{var x=new C();if(!Ctor){Ctor=C;}if('processLocally' in x){Ctor=C;strictCapable=true;}}catch(_){}});
function say(id,text){$(id).textContent=text;}
function route(){
 if(!Ctor||!window.isSecureContext)return 'none';
 if(strictCapable&&locale==='available')return 'local';
 if(navigator.onLine===false&&$('offlineConfirm').checked)return 'offline';
 return 'none';
}
function refresh(){
 var routeMode=route();
 say('api',Ctor?(Ctor===pre?'webkit版あり':'標準版あり'):'非対応');
 say('local',strictCapable?'明示指定に対応':'明示指定を確認できない');
 say('japanese',strictCapable?({
 available:'端末内で日本語利用可能',downloadable:'言語パック未導入',downloading:'準備中',unavailable:'日本語は非対応',unknown:'確認できない',checking:'照会中'
 }[locale]||'確認できない'):'端末内日本語の対応を確認できない');
 say('network',navigator.onLine===false?'オフラインと判定':'オンラインと判定');
 say('mode',routeMode==='local'?'端末内認識を強制':routeMode==='offline'?'通信遮断で架空テスト':'起動できない');
 say('ready',routeMode==='local'?'端末内処理を明示して試験できます。架空の言葉だけ話してください。':
 routeMode==='offline'?'通信遮断の条件を確認。架空の言葉だけで試験できます。':
 !Ctor?'Safariの音声認識機能が見つかりません。':
 !window.isSecureContext?'HTTPSが必要です。':
 '端末内処理の確証がないため停止中。通信を切って手動確認した場合だけ架空テスト可能です。');
 $('start').disabled=running||routeMode==='none';
 $('stop').disabled=!running;
}
async function checkLocal(){
 locale='checking';refresh();
 if(!strictCapable||typeof Ctor.available!=='function'){locale='unknown';refresh();return;}
 try{
  var answer=await Ctor.available({langs:['ja-JP'],processLocally:true});
  locale=['available','downloadable','downloading','unavailable'].includes(answer)?answer:'unknown';
 }catch(_){locale='unknown';}
 refresh();
}
function safeCode(x){
 var known=['not-allowed','service-not-allowed','language-not-supported','network','no-speech','audio-capture','aborted','other','NotAllowedError','InvalidStateError'];
 return known.includes(String(x))?String(x):'その他';
}
function finish(){active=null;running=false;refresh();}
function begin(){
 if(running)return;
 var type=route();
 if(type==='none'){say('feedback','安全な開始条件が満たされていません。');return;}
 if(type==='offline'&&(navigator.onLine!==false||!$('offlineConfirm').checked)){say('feedback','通信遮断を再確認してください。');return;}
 var r;try{r=new Ctor();}catch(_){say('feedback','音声認識を利用できません。');return;}
 if(type==='local'){
  if(!('processLocally' in r)){say('feedback','端末内指定が使えないため停止しました。');return;}
  r.processLocally=true;
  if(r.processLocally!==true){say('feedback','端末内指定を適用できません。');return;}
 }else if('processLocally' in r){r.processLocally=true;}
 r.lang='ja-JP';r.continuous=false;r.interimResults=true;r.maxAlternatives=1;
 active=r;running=true;$('output').value='';say('feedback','認識開始を要求しています…');refresh();
 r.onstart=function(){if(active===r)say('feedback','音声認識中。「みかんをふたつ」と話してね。');};
 r.onresult=function(e){
  if(active!==r)return;
  var done='',partial='';
  try{
   for(var i=0;i<e.results.length;i++){
    var x=e.results[i],t=String(x[0]&&x[0].transcript||'');
    if(x.isFinal)done+=t;else partial+=t;
   }
  }catch(_){}
  $('output').value=(done+partial).slice(0,120);
  say('feedback','文字を表示しました。保存はしません。');
 };
 r.onerror=function(e){if(active===r)say('feedback','音声認識エラー：'+safeCode(e&&e.error));};
 r.onend=function(){if(active===r){finish();if(!$('output').value)say('feedback','認識が終わりました。文字を取得できませんでした。');}};
 try{r.start();}catch(e){try{r.abort();}catch(_){}finish();say('feedback','起動できません：'+safeCode(e&&e.name));}
}
function stop(){var r=active;if(!r)return;$('stop').disabled=true;try{r.stop();}catch(_){finish();}}
function abort(){var r=active;active=null;running=false;if(r)try{r.abort();}catch(_){}refresh();}
$('start').addEventListener('click',begin);
$('stop').addEventListener('click',stop);
$('clear').addEventListener('click',function(){$('output').value='';say('feedback','画面の文字を消しました。保存はしていません。');});
$('refresh').addEventListener('click',function(){refresh();void checkLocal();});
$('offlineConfirm').addEventListener('change',refresh);
window.addEventListener('online',refresh);
window.addEventListener('offline',refresh);
document.addEventListener('visibilitychange',function(){if(document.hidden)abort();});
window.addEventListener('pagehide',abort);
refresh();void checkLocal();
})();