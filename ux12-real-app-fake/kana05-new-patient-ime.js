/* KANA05: new-patient-only IME reading candidates for iPad Safari.
 * No storage, network, or access to patient images/medication/PIN.
 * The user must still press the existing per-patient Confirm button before saving kana.
 */
(function(root){
'use strict';
function katakana(s){
  return String(s||'').normalize('NFKC').replace(/[ぁ-ゖゔ]/g,c=>String.fromCharCode(c.charCodeAt(0)+96));
}
function isKana(s){return !!s&&/^[ぁ-ゖゔァ-ヿー]+$/.test(s);}
function attach(name,kana,p){
  if(!name||!kana||!p||!p._new)return false;
  // Eligibility is captured on initial registration. A new patient may be
  // auto-saved while surname/given-name conversion is still in progress.
  let manual=false,internal=false,committed='',reading='',candidate='',seq=0;
  kana.addEventListener('input',function(){
    if(!internal)manual=true;
  });
  kana.addEventListener('compositionend',function(){manual=true;});
  function locked(){
    return manual||!!p.furiganaConfirmed||!!(p.data&&String(p.data['フリガナ']||'').trim());
  }
  function write(text){
    if(locked())return;
    internal=true;
    try{
      kana.value=text;
      // Existing handlers update the visible review status; unconfirmed
      // values are deliberately excluded from patient autosave.
      kana.dispatchEvent(new Event('input',{bubbles:true}));
    }finally{internal=false;}
  }
  name.addEventListener('compositionstart',function(){candidate='';seq++;});
  name.addEventListener('compositionupdate',function(e){
    const s=String(e.data||'');
    if(isKana(s)&&s.length>=candidate.length)candidate=s;
  });
  name.addEventListener('compositionend',function(e){
    const captured=candidate,final=String(e.data||''),token=seq;
    candidate='';
    setTimeout(function(){
      if(token!==seq||locked()||!captured||!final||isKana(final))return;
      const current=String(name.value||'');
      if(!current.endsWith(final))return;
      const prefix=current.slice(0,-final.length);
      if(prefix!==committed){
        // Allow a normal optional space between surname and given name.
        if(!committed||!prefix.startsWith(committed)||
            !/^[\s　]+$/.test(prefix.slice(committed.length))){
          committed='';
          reading='';
          return;
        }
      }
      const joiner=prefix!==committed?' ':'';
      reading=(reading?reading+joiner:'')+katakana(captured);
      committed=current;
      write(reading);
    },0);
  });
  name.addEventListener('input',function(e){
    if(e.isComposing)return;
    if(committed&&!String(name.value||'').startsWith(committed)){
      committed='';reading='';
      write('');
    }
  });
  return true;
}
root.MSWKana05IME=Object.freeze({attach:attach,version:'KANA05-NEW-IME-DEV'});
// Preserve the original furigana UI, confirm action, and encrypted autosave.
if(typeof bindBasicFurigana==='function'){
  const original=bindBasicFurigana;
  bindBasicFurigana=function(container){
    const p=typeof selectedPatient!=='undefined'?selectedPatient:null;
    original(container);
    if(!p||!p._new||!container)return;
    attach(container.querySelector('[data-field="氏名"]'),
           container.querySelector('[data-field="フリガナ"]'),p);
  };
}
})(window);
