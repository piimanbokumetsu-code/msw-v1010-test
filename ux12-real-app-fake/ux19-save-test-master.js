/* UX19 stage-only opt-in fictional medication master for save/reopen tests.
 * NO patient data is modified or created. Not used in production.
 * All master names are fictional and have no strength or prices. */
(function(){
  'use strict';
  if(window.__UX19_TEST_MASTER__)return;
  if(location.origin!=='https://piimanbokumetsu-code.github.io'||
     location.pathname!=='/msw-v1010-test/ux12-real-app-fake/'&&
     location.pathname!=='/msw-v1010-test/ux12-real-app-fake/index.html')return;
  window.__UX19_TEST_MASTER__=true;
  const first='架空UX19先発薬',generic='架空UX19後発薬';
  let busy=false;
  function getMaster(){
    return Array.isArray(state?.drugs)?state.drugs.find(x=>
      x?.['薬名']===first&&
      x?.rx037?.generics?.some(g=>g?.name===generic)):null;
  }
  function install(){
    const input=document.getElementById('patientDrugQuery');
    const list=document.getElementById('patientDrugResults');
    if(!input||!list||!selectedPatient||!key||!state||document.getElementById('ux19SeedMaster'))return;
    const panel=document.createElement('div');
    panel.id='ux19SeedMaster';
    panel.style.cssText='margin:10px 0;padding:11px;background:#fffbeb;border:1px solid #e4b659;border-radius:9px';
    const intro=document.createElement('p');
    intro.textContent='UX19 架空保存テスト用：薬情マスターに架空薬を1組だけ準備できます。規格・薬価は未登録のままです。';
    intro.className='notice';
    const button=document.createElement('button');
    button.type='button';button.className='btn secondary';
    const status=document.createElement('p');
    status.className='notice';status.setAttribute('role','status');
    function refresh(){
      const ready=!!getMaster();
      button.textContent=ready?'✅ 架空薬マスター準備済み':'🧪 UX19 架空薬マスターを準備（テスト専用）';
      button.disabled=busy||ready;
      if(ready)status.textContent='準備済み：架空UX19先発薬・架空UX19後発薬。下の検索欄から「架空UX19」で探せます。';
    }
    button.onclick=async ()=>{
      if(busy||getMaster())return;
      if(!state||!key||!selectedPatient||!Array.isArray(state.drugs)){status.textContent='ロック解除と患者選択を確認してください。';return;}
      if(state.drugs.some(x=>x?.['薬名']===first||
          x?.rx037?.generics?.some(g=>g?.name===generic))){
        status.textContent='同名の薬が既にあるため、自動で追加しません。';return;
      }
      if(!confirm('架空テスト環境の薬情マスターに「架空UX19先発薬」と「架空UX19後発薬」を追加しますか？\n実際の患者情報・既存薬・薬価は変更しません。'))return;
      const before=state.drugs.slice();busy=true;refresh();
      const drug={'薬名':first,'医薬品分類':'架空テスト薬','薬価':'',
        '薬効':'UX19の架空動作テスト用。実処方ではありません。',
        rx037:{priceRows:[],generics:[{name:generic,priceRows:[]}]}};
      state.drugs=[...before,drug];
      try{
        await save();
        status.textContent='架空薬マスターを保存しました。検索欄に「架空UX19」と入力すると候補が表示されます。';
        input.value='架空UX19';
        input.dispatchEvent(new Event('input',{bubbles:true}));
      }catch(error){
        state.drugs=before;
        status.textContent='保存できませんでした。薬情マスターは元に戻しました。';
      }finally{busy=false;refresh();}
    };
    panel.append(intro,button,status);list.before(panel);refresh();
  }
  const prior=window.renderPatientMedications;
  if(typeof prior!=='function')return;
  window.renderPatientMedications=function(...args){
    const result=prior.apply(this,args);
    install();return result;
  };
})();