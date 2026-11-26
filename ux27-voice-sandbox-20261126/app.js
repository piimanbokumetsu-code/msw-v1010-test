/* UX27 fictional dictation test. No app storage. Recognition may use browser cloud processing. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const memo=$('memo'),start=$('startMic'),stop=$('stopMic'),clear=$('clearText'),status=$('status');
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const pwa=(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||window.navigator.standalone===true;
  $('mode').textContent=pwa?'ホーム画面アプリ（PWA）':'Safariなどのブラウザー';
  $('availability').textContent=SR?'音声認識APIを検出しました。マイクで試せます。':'この環境では音声認識APIが見つかりません。手入力は利用できます。';
  start.disabled=!SR;stop.disabled=true;
  let rec=null,prefix='',done='',partial='';
  const join=(a,b,c)=>[a.trim(),b.trim(),c.trim()].filter(Boolean).join('\n');
  const say=(s,k='info')=>{status.textContent=s;status.dataset.kind=k};
  const reset=()=>{
    rec=null;memo.readOnly=false;start.disabled=!SR;stop.disabled=true;
    start.setAttribute('aria-pressed','false');start.textContent='🎤 音声入力を開始';
  };
  function errMsg(k){
    const m={
      'not-allowed':'マイクまたは音声認識の許可がありません。iPadの権限を確認してください。',
      'service-not-allowed':'音声認識サービスを使用できません。ホーム画面PWA側の制限の可能性があります。',
      'audio-capture':'マイクから音声を取得できません。',
      'no-speech':'音声が認識できませんでした。',
      'network':'音声認識サービスとの接続に問題があります。',
      'language-not-supported':'日本語の音声認識が使えません。',
      'language-unavailable':'日本語の音声認識が使えません。'
    };
    return m[k]||'音声認識エラー（'+String(k||'不明')+'）。';
  }
  function abortWhenHidden(){
    if(!rec)return;
    const r=rec;rec=null;
    try{r.abort()}catch(_){}
    memo.value=join(prefix,done,'');
    reset();say('画面を離れたため、マイクを終了しました。');
  }
  start.addEventListener('click',()=>{
    if(!SR||rec)return;
    let r;
    try{r=new SR()}catch(e){say('音声認識を利用できません。','error');return}
    r.lang='ja-JP';r.continuous=false;r.interimResults=true;r.maxAlternatives=1;
    prefix=memo.value;done='';partial='';rec=r;memo.readOnly=true;
    start.disabled=true;stop.disabled=false;start.textContent='🎙️ マイク準備中…';
    start.setAttribute('aria-pressed','true');
    say('マイクを開始します。架空の例文だけで試してください。');
    r.onstart=()=>{if(rec!==r)return;start.textContent='🎙️ 認識しています';say('認識中。話し終えたら「停止」を押してください。','active')};
    r.onresult=e=>{
      if(rec!==r)return;
      let f='',t='';
      for(let i=0;i<e.results.length;i++){
        const item=e.results[i],s=String(item[0]?.transcript||'').trim();
        if(item.isFinal)f+=s;else t+=s;
      }
      done=f;partial=t;memo.value=join(prefix,done,partial);
      say(t?'文字に変換中（途中の文字は変わる場合があります）':'文字変換を受信しました。','active');
    };
    r.onerror=e=>{if(rec!==r)return;reset();say(errMsg(e.error),'error')};
    r.onend=()=>{
      if(rec!==r)return;
      memo.value=join(prefix,done,partial);
      reset();say(done||partial?'文字起こしできました。必要なら手直ししてください。':'終了しましたが文字を取得できませんでした。',done||partial?'ok':'info');
    };
    try{r.start()}catch(e){reset();say('開始できませんでした（'+String(e?.name||'不明')+'）。','error')}
  });
  stop.addEventListener('click',()=>{
    if(!rec)return;stop.disabled=true;say('停止中です…');
    try{rec.stop()}catch(e){reset();say('停止できませんでした。ページを再読み込みしてください。','error')}
  });
  clear.addEventListener('click',()=>{
    if(rec){try{rec.abort()}catch(_){}}
    reset();memo.value='';prefix='';done='';partial='';say('入力欄を消去しました。保存された記録はありません。');
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)abortWhenHidden()});
  window.addEventListener('pagehide',abortWhenHidden);
  say('準備完了。まずSafariで架空の文章を話してみてください。');
})();