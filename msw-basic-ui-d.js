/* MSW MVP01: approved seven-row basic layout (2026-10-22). Fake-only until operational approval. */
(()=>{
'use strict';
if(typeof window.renderBasicDashboard!=='function'||typeof window.basicDocumentHtml!=='function')return;
const CSS=String.raw`
#tabbody .basic-grid-d{display:grid;gap:8px;min-width:0}
#tabbody .basic-row-d{display:grid;gap:7px;min-width:0;align-items:end}
#tabbody .basic-row-d.r1{grid-template-columns:minmax(0,1fr) minmax(0,1.35fr) 68px}
#tabbody .basic-row-d.r2{grid-template-columns:minmax(0,.79fr) minmax(0,1.11fr) minmax(0,1.22fr) minmax(0,.77fr)}
#tabbody .basic-row-d.r3{grid-template-columns:minmax(0,.92fr) minmax(0,1.9fr)}
#tabbody .basic-row-d.r4{grid-template-columns:minmax(0,180px) minmax(0,190px)}
#tabbody .basic-row-d .basic-field{min-width:0;display:flex;flex-direction:column;gap:3px}
#tabbody .basic-row-d .basic-field label{font-size:10.5px;line-height:1.25;margin:0}
#tabbody .basic-row-d .basic-field input,#tabbody .basic-row-d .basic-field textarea,#tabbody .basic-row-d .basic-bed-picker{box-sizing:border-box;min-width:0;width:100%;margin:0;min-height:37px;height:37px;padding:6px 7px;font-size:12.5px}
#tabbody .basic-row-d .basic-field input[type=date]{max-width:100%;padding-right:2px;font-variant-numeric:tabular-nums}
#tabbody .basic-row-d .basic-readonly{box-sizing:border-box;display:flex;align-items:center;justify-content:center;min-width:0;height:37px;padding:4px 1px;font-size:11.5px;white-space:nowrap}
#tabbody .basic-row-d textarea{height:62px!important;min-height:62px!important;resize:vertical;line-height:1.35}
#tabbody .basic-row-d.r7 textarea{height:70px!important;min-height:70px!important}
#tabbody .basic-choice-wrap{position:relative;min-width:0;width:100%}
#tabbody .basic-choice-wrap input{padding-right:18px!important}
#tabbody .basic-choice-wrap:after{content:"▾";position:absolute;top:10px;right:5px;color:#496b75;pointer-events:none;font-size:11px}
#tabbody .basic-choice-panel{position:absolute;z-index:300;top:calc(100% + 4px);left:0;width:max(100%,min(246px,72vw));max-width:80vw;max-height:min(340px,52vh);overflow:auto;box-sizing:border-box;border:1px solid #a8c8d0;box-shadow:0 8px 25px #102d3240;border-radius:10px;background:#fff;padding:7px}
#tabbody .basic-choice-panel[hidden]{display:none!important}
#tabbody .basic-choice-panel.open-up{top:auto;bottom:calc(100% + 4px)}
#tabbody .basic-choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}
#tabbody .basic-choice-grid button{font:inherit;font-size:11.5px;text-align:left;border:1px solid #d4e4ee;background:#f1f7fb;border-radius:7px;min-height:35px;padding:6px;overflow-wrap:anywhere;touch-action:manipulation}
#tabbody .basic-choice-note{font-size:10px;color:#536e73;margin:3px 0 6px}
#tabbody .basic-choice-add{width:100%;min-height:36px;margin-top:7px;background:#e8f6f2;border:1px solid #a6d4c9;border-radius:7px;font-weight:700;font-size:11px;color:#086354}
#tabbody .basic-help-d{font-size:10px;color:#466e71;line-height:1.5;margin:6px 0 0}
#tabbody .basic-city-error{color:#a33424;font-size:10px;margin:3px 0 0}
@media(max-width:800px){#tabbody .basic-row-d{gap:5px}#tabbody .basic-row-d .basic-field label{font-size:10px}#tabbody .basic-row-d .basic-field input,#tabbody .basic-row-d .basic-bed-picker{font-size:11.5px;padding-left:4px;padding-right:4px}#tabbody .basic-row-d .basic-readonly{font-size:11px}}
@media(max-width:450px){#tabbody .basic-row-d.r1{grid-template-columns:minmax(0,1fr) minmax(0,1.4fr) 62px}#tabbody .basic-row-d.r2{grid-template-columns:.78fr 1.08fr 1.25fr .72fr}#tabbody .basic-row-d.r4{grid-template-columns:minmax(0,1fr) minmax(0,1.15fr)}}
`;
const sheet=document.createElement('style');sheet.textContent=CSS;document.head.appendChild(sheet);
const cityPattern=/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}々ヶケー・]{1,24}[市区町村]$/u;
const cityValid=value=>!String(value).trim()||cityPattern.test(String(value).trim());
const presets=['茨城町','水戸市','小美玉市','笠間市','鉾田市'];
function fld(k,label){
 const val=String(selectedPatient.data?.[k]??'');
 const d=' data-field="'+esc(k)+'" aria-label="'+esc(label)+'"';
 const wrap=x=>'<div class="basic-field field"><label>'+esc(label)+'</label>'+x+'</div>';
 if(k==='ベッド番号')return wrap('<input type="hidden" data-field="ベッド番号" id="patientBedValue" value="'+esc(val)+'"><button type="button" class="btn secondary basic-bed-picker" id="patientBedPick">'+esc(val||'その他・未配置')+' ▾</button>');
 if(k==='入院日数'){const n=daysSince(selectedPatient.data['入院日']);return wrap('<div class="basic-readonly" id="basicAdmissionDays">'+(n!==''?esc(n)+'日':'—')+'</div>');}
 if(['市町村','主治医','介護度'].includes(k))return wrap('<div class="basic-choice-wrap"><input type="text" '+d+' data-candidate="'+esc(k)+'" autocomplete="off" aria-haspopup="listbox" aria-expanded="false" placeholder="タップで候補・手入力" value="'+esc(val)+'"><div class="basic-choice-panel" role="listbox" hidden></div></div>'+(k==='市町村'?'<small class="basic-city-error" hidden>市町村名のみ入力（番地は不可）</small>':''));
 if(['介護情報','備考'].includes(k))return wrap('<textarea '+d+' rows="2">'+esc(val)+'</textarea>');
 const type=k==='入院日'||k==='調査日'?'date':'text';
 return wrap('<input type="'+type+'" '+d+(k==='ＩＤ'?' inputmode="numeric" autocomplete="off"':'')+' value="'+esc(val)+'">');
}
function bindCombo(root){
 const arr=[...root.querySelectorAll('[data-candidate]')];let active=null;
 function close(){for(const x of arr){x.setAttribute('aria-expanded','false');x.nextElementSibling.hidden=true;x.nextElementSibling.classList.remove('open-up')}active=null;}
 function options(k){
   const v=k==='市町村'?[...presets,...(state.masters?.['市町村']||[]),...(state.patients||[]).map(p=>p.data?.['市町村']||'')]:masterValues(k);
   return uniq(v).filter(x=>k!=='市町村'||cityValid(x));
 }
 function open(input,filter=''){
   close();if(!root.isConnected)return;active=input;
   const k=input.dataset.candidate,panel=input.nextElementSibling;panel.replaceChildren();
   const hint=document.createElement('p');hint.className='basic-choice-note';hint.textContent='候補をタップ／そのまま文字入力もできます';panel.append(hint);
   const grid=document.createElement('div');grid.className='basic-choice-grid';
   const list=options(k).filter(v=>!filter||v.toLowerCase().includes(filter.toLowerCase()));
   for(const v of list){
     const b=document.createElement('button');b.type='button';b.setAttribute('role','option');b.textContent=v;
     b.addEventListener('pointerdown',e=>e.preventDefault());
     b.onclick=()=>{input.value=v;close();input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));input.blur()};
     grid.append(b);
   }
   if(list.length)panel.append(grid);else{const t=document.createElement('p');t.className='basic-choice-note';t.textContent='候補なし。文字入力できます';panel.append(t)}
   const add=document.createElement('button');add.type='button';add.className='basic-choice-add';add.textContent='＋ この入力を次回の候補に追加';
   add.addEventListener('pointerdown',e=>e.preventDefault());
   add.onclick=async()=>{
      const v=input.value.trim();if(!v)return;
      if(k==='市町村'&&!cityValid(v)){alert('市町村名だけ入力してください。番地は登録できません。');return}
      const old=[...(state.masters?.[k]||[])];state.masters??={};state.masters[k]=uniq([...old,v]);
      try{await save();close();input.dispatchEvent(new Event('change',{bubbles:true}))}catch(e){state.masters[k]=old;alert('候補を保存できませんでした：'+String(e?.message||e))}
   };
   panel.append(add);panel.hidden=false;input.setAttribute('aria-expanded','true');
   const h=window.visualViewport?.height||window.innerHeight,r=input.getBoundingClientRect();panel.classList.toggle('open-up',r.bottom>h-215&&r.top>215);
 }
 for(const i of arr){
   const isCity=i.dataset.candidate==='市町村';
   i.addEventListener('focus',()=>open(i));i.addEventListener('click',()=>{if(active!==i)open(i)});
   i.addEventListener('input',()=>{
      if(isCity){const ok=cityValid(i.value);if(ok)i.dataset.field='市町村';else i.removeAttribute('data-field');const e=i.closest('.basic-field').querySelector('.basic-city-error');if(e)e.hidden=ok}
      if(!i.dataset.composing)open(i,i.value);
   });
   i.addEventListener('compositionstart',()=>i.dataset.composing='true');
   i.addEventListener('compositionend',()=>{delete i.dataset.composing;i.dispatchEvent(new Event('input',{bubbles:true}))});
   i.addEventListener('keydown',e=>{if(e.key==='Escape'){close();i.blur()}});
   if(isCity)i.addEventListener('blur',()=>{
     if(cityValid(i.value))return;i.value=String(selectedPatient?.data?.['市町村']||'');i.dataset.field='市町村';const e=i.closest('.basic-field').querySelector('.basic-city-error');if(e)e.hidden=true;
   });
 }
 root.addEventListener('pointerdown',e=>{if(!e.target.closest('.basic-choice-wrap'))close()});
 root.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
}
window.renderBasicDashboard=function(){
 const root=document.getElementById('tabbody');if(!root||!selectedPatient)return;
 const line=(n,keys)=>'<div class="basic-row-d r'+n+'">'+keys.map(([k,l])=>fld(k,l)).join('')+'</div>';
 const rows=[
 [['ベッド番号','ベッド番号'],['入院日','入院日'],['入院日数','入院日数']],
 [['ＩＤ','ID（数字）'],['氏名','氏名'],['市町村','住所（市町村のみ）'],['家構','家族構成']],
 [['主治医','主治医'],['病名','病名']],
 [['介護度','介護度'],['調査日','調査日']],
 [['介護情報','介護情報']],
 [['入院元','入院元']],
 [['備考','備考']]
 ];
 root.innerHTML='<div class="basic-dashboard"><section class="basic-information" aria-label="患者基本情報">'+
 (typeof DATA_MINIMIZATION_NOTICE==='string'?'<p class="notice privacy-notice">'+esc(DATA_MINIMIZATION_NOTICE)+'</p>':'')+
 '<div class="basic-grid-d">'+rows.map((r,i)=>line(i+1,r)).join('')+'</div>'+
 '<p class="basic-help-d">IDは数字のみ。住所は市町村名まで。住所・主治医・介護度は入力欄をタップすると候補が直接出ます。</p>'+
 '<details class="basic-extra"><summary>その他の既存項目（保険・本人職業・術式・かかりつけ）</summary><div class="basic-extra-grid">'+
 ['保険','本人職業','術式','かかりつけ'].map(fieldHtml).join('')+'</div></details></section>'+
 basicDocumentHtml()+'</div>';
 bindPatientBedPicker();bindMasterSelects(root);
 const date=root.querySelector('[data-field="入院日"]');
 date?.addEventListener('input',()=>{const n=daysSince(date.value),e=document.getElementById('basicAdmissionDays');if(e)e.textContent=n!==''?n+'日':'—'});
 const id=root.querySelector('[data-field="ＩＤ"]');
 id?.addEventListener('input',()=>{if(!id.dataset.composing)id.value=id.value.replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0)).replace(/[^0-9]/g,'')});
 id?.addEventListener('compositionstart',()=>id.dataset.composing='true');
 id?.addEventListener('compositionend',()=>{delete id.dataset.composing;id.dispatchEvent(new Event('input',{bubbles:true}))});
 bindCombo(root);
 const p=selectedPatient,gen=photoList(p,'genogram'),adm=photoList(p,'admission');
 document.getElementById('basicGenogramOpen').onclick=()=>gen.length?viewPhoto(gen[0].id):openPatientPhotosFromBasic();
 document.getElementById('basicAdmissionOpen').onclick=()=>adm.length?viewPhoto(adm[0].id):openPatientPhotosFromBasic();
 loadBasicGenogramPreview(p,root,gen[0]);
};
})();