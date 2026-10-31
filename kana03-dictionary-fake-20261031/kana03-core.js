/* KANA03 offline candidate engine for invented-name validation.
 * Data: shuheilocale/japanese-personal-name-dataset (MIT); notices in THIRD_PARTY_NOTICES.txt
 * Readings are suggestions only; ambiguous names MUST be checked by a human.
 * No networking, persistence, patient writes, or access to PINs/images.
 */
(function(root){
 'use strict';
 const previous=root.MSWKana02;
 const corpus=root.MSWKana03Data||{};
 const surnames=corpus.surnames, given=corpus.given;
 if(!previous||!surnames||!given)throw new Error('KANA03 dictionary not loaded');
 const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
 const toKata=s=>String(s||'').normalize('NFKC').replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+96));
 function normalizeName(value){
   return String(value||'').normalize('NFKC')
     .replace(/[\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/g,'')
     .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g,' ')
     .replace(/[・･\/／|｜,，、]+/g,' ')
     .replace(/\s+/g,' ').trim();
 }
 function readingsFor(givenName) {
   if(own(given,givenName)){
     const recorded=given[givenName];
     // Prefer KANA02's hand-reviewed common reading when the expanded dataset supports it.
     // No real patient name is sent or stored for this prior-reading lookup.
     const legacy=previous.suggest('山田 '+givenName);
     const knownReading=legacy.startsWith('ヤマダ ')?legacy.slice('ヤマダ '.length):'';
     return knownReading&&recorded.includes(knownReading)
       ?[knownReading,...recorded.filter(x=>x!==knownReading)]
       :recorded;
   }
   if(/^[ぁ-ゖァ-ヿー]+$/.test(givenName))return [toKata(givenName)];
   return [];
 }
 function candidates(input) {
   const name=normalizeName(input),results=[];
   const push=v=>{const text=String(v||'').trim();if(text&&!results.includes(text)&&results.length<8)results.push(text)};
   // Protect the previous known readings and the backwards-compatible fallback.
   if(!name)return [];
   push(previous.suggest(name));
   const parts=name.split(' ');
   if(parts.length===2) {
     const [family,first]=parts;
     const fr=own(surnames,family)?surnames[family]:(/^[ぁ-ゖァ-ヿー]+$/.test(family)?[toKata(family)]:[]);
     const gr=readingsFor(first);
     for(const surnameReading of fr)for(const givenReading of gr)push(surnameReading+' '+givenReading);
   }else if(parts.length===1) {
     // Try valid surname + EXACT given-name combinations; no speculative character readings.
     const splits=[];
     for(let len=1;len<=Math.min(6,name.length-1);len++){
       const family=name.slice(0,len),first=name.slice(len);
       if(own(surnames,family)&&readingsFor(first).length){
         splits.push({family,first,readings:surnames[family],firstReadings:readingsFor(first)});
       }
     }
     splits.sort((a,b)=>b.family.length-a.family.length);
     for(const pair of splits)
       for(const surnameReading of pair.readings)
         for(const givenReading of pair.firstReadings)
           push(surnameReading+' '+givenReading);
   }
   return results;
 }
 function suggest(name){return candidates(name)[0]||''}
 function preview(patient){
   if(previous.isConfirmed(patient))return {text:String(patient.data['フリガナ']),confirmed:true};
   const saved=String(patient&&patient.data&&patient.data['フリガナ']||'').trim();
   return {text:saved||suggest(patient&&patient.data&&patient.data['氏名']),confirmed:false};
 }
 const replacement=Object.assign({},previous,{suggest,preview,getCandidates:candidates,
   dataset:{surnames:Object.keys(surnames).length,givenSpellings:Object.keys(given).length},
   version:'KANA03-DICTIONARY-FAKE-20261031'});
 root.MSWKana02=Object.freeze(replacement);
 root.MSWKana03=Object.freeze({suggest,getCandidates:candidates,normalizeName,preview});
})(window);
