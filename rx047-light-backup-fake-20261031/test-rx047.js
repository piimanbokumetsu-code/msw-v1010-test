'use strict';
(function(){
  const pass='FAKE-Demo-Only2026';
  const sample=[
    {'薬名':'架空テスト薬A','薬価':'10.50','医薬品分類':'架空分類','薬効':'架空薬効',
     rx038:{ingredient:'架空成分',otherOriginals:[{name:'架空先発B',strength:'2.5mg'}]},
     rx037:{generics:[{name:'架空後発C',strength:'5mg'},{name:'架空後発D',strength:'10mg'}]},
     rx039:{layout:['架空グループ1','架空グループ2']}},
    {'薬名':'架空テスト薬E','薬価':'','医薬品分類':'架空分類2','薬効':'架空薬効2'}
  ];
  const $=id=>document.getElementById(id);
  let sealed=null;
  function record(label,ok){const el=document.createElement('li');el.textContent=(ok?'合格　':'不合格　')+label;el.className=ok?'good':'bad';$('results').appendChild(el);return ok}
  async function raises(action){try{await action();return false}catch(e){return true}}
  async function test(){
    $('run').disabled=true;$('results').replaceChildren();$('status').textContent='iPadの暗号化機能で検査中…';
    let total=0,ok=0;async function check(label,action){total++;try{if(record(label,await action()))ok++}catch(e){record(label,false)}}
    try{
      if(!crypto.subtle)throw Error('WebCrypto非対応');
      const engine=window.MSWRX047Core;
      await check('薬情の先発・後発・規格を含む完全往復',async()=>{
        sealed=await engine.seal(sample,pass);
        const imported=await engine.unseal(sealed,pass);
        return JSON.stringify(imported)===JSON.stringify(sample);
      });
      await check('ファイルのJSON書出し→読込',async()=>{
        const file=new File([JSON.stringify(sealed)],'FAKE_Drug_Backup.mswrx',{type:'application/octet-stream'});
        const opened=JSON.parse(await file.text());
        return JSON.stringify(await engine.unseal(opened,pass))===JSON.stringify(sample);
      });
      await check('間違ったパスフレーズを拒否',()=>raises(()=>engine.unseal(sealed,'WRONG-Passphrase2026')));
      await check('件数を書き換えたファイルを拒否',()=>raises(()=>engine.unseal({...sealed,itemCount:sealed.itemCount+1},pass)));
      await check('暗号文を改変したファイルを拒否',()=>raises(()=>{
        const chars=sealed.ciphertext;
        const ix=Math.floor(chars.length/2);
        const corrupt=chars.slice(0,ix)+(chars[ix]==='A'?'B':'A')+chars.slice(ix+1);
        return engine.unseal({...sealed,ciphertext:corrupt},pass);
      }));
      await check('患者・写真・処方薬がバックアップ対象外',async()=>{
        return !('patients' in sealed)&&!('photos' in sealed)&&!('medications' in sealed)&&!('pin' in sealed);
      });
      await check('薬情だけを置換し、患者情報はそのまま',async()=>{
        const fake={patients:[{id:'FAKE_001',data:{'氏名':'架空検証のみ'}}],drugs:[{'薬名':'旧架空薬'}],settings:{autoLockMin:5},masters:{test:['架空候補']}};
        const oldPatients=JSON.stringify(fake.patients),oldSettings=JSON.stringify(fake.settings),oldMasters=JSON.stringify(fake.masters);
        const next={...fake,drugs:await engine.unseal(sealed,pass)};
        return JSON.stringify(next.patients)===oldPatients&&JSON.stringify(next.settings)===oldSettings&&
          JSON.stringify(next.masters)===oldMasters&&next.drugs.length===2;
      });
      await check('空の薬情も保存・復元できる',async()=>{
        const empty=await engine.seal([],pass);return (await engine.unseal(empty,pass)).length===0;
      });
      $('status').textContent=ok+'/'+total+' 件合格'+(ok===total?' ― 実WebCryptoの架空データ試験は成功':' ― 不合格があります');
      $('status').className=ok===total?'good':'bad';
      $('export').disabled=ok!==total;$('import').disabled=ok!==total;
    }catch(e){$('status').textContent='検証できませんでした：'+(e?.message||'不明なエラー');$('status').className='bad'}
    finally{$('run').disabled=false}
  }
  $('run').onclick=()=>{void test()};
  $('export').onclick=()=>{
    if(!sealed)return;
    const blob=new Blob([JSON.stringify(sealed)],{type:'application/octet-stream'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='FAKE_RX047_架空薬情.mswrx';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    $('fileStatus').textContent='架空データを書き出しました。「ファイル」で保存した実物を確認してください。';
  };
  $('import').onclick=()=>$('file').click();
  $('file').onchange=async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    if(file.size>window.MSWRX047Core.fileLimit){$('fileStatus').textContent='ファイルが大きすぎます';return}
    try{
      const packet=JSON.parse(await file.text());
      const drugs=await window.MSWRX047Core.unseal(packet,pass);
      $('fileStatus').textContent=drugs.length===sample.length&&JSON.stringify(drugs)===JSON.stringify(sample)?
        '保存した架空ファイルから元の薬情を復元できました（合格）':'復元内容が架空データと一致しません';
    }catch(err){$('fileStatus').textContent='読み込み失敗：ファイル/パスフレーズを確認してください'}
  };
  void test();
})();
