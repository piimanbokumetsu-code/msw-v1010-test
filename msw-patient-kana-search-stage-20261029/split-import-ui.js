'use strict';
(()=>{
if(location.origin!=='https://piimanbokumetsu-code.github.io'||location.pathname!=='/msw-v1010-test/msw-patient-kana-search-stage-20261029/')return;
const original=renderSettings;
function bind(){const after=document.getElementById('splitExportRow');if(!after||document.getElementById('splitImportRow'))return;
const panel=document.createElement('div');panel.id='splitImportRow';panel.className='panel';
panel.innerHTML='<h3>分割バックアップ復元（架空患者専用）</h3><p class="notice">架空ファイルを1個ずつ追加し、暗証・全写真を検査してから復元します。復元すると架空患者情報は置き換わります。</p><input type="file" id="splitPick" multiple><p id="splitCount">選択済み 0 ファイル</p><button class="btn secondary" id="splitRestore">整合性を検証して復元</button> <button class="btn secondary" id="splitClear">選択をやり直す</button><p class="notice" id="splitImportStatus" role="status">未実施</p>';
after.insertAdjacentElement('afterend',panel);
const pick=panel.querySelector('#splitPick'),out=panel.querySelector('#splitImportStatus'),count=panel.querySelector('#splitCount');
const files=new Map();let busy=false;
pick.onchange=()=>{const selected=Array.from(pick.files||[]);pick.value='';for(const f of selected){if(!/^msw-split-[0-9a-f]{24}-(manifest|[0-9]{4})\.json$/.test(f.name)||f.size>48*1024*1024){out.textContent='架空検証用の分割JSONだけ選択してください';continue}files.set(f.name,f)}count.textContent='選択済み '+files.size+' ファイル'};
panel.querySelector('#splitClear').onclick=()=>{if(busy)return;files.clear();count.textContent='選択済み 0 ファイル';out.textContent='未実施'};
panel.querySelector('#splitRestore').onclick=async()=>{if(busy)return;const manifest=[...files.values()].filter(f=>f.name.endsWith('-manifest.json'));if(manifest.length!==1){out.textContent='管理ファイルは1個だけ選んでください';return}
const pin=prompt('架空患者用バックアップの暗証を入力してください。本番の暗証は入力しないでください');if(pin===null)return;
busy=true;out.textContent='全ファイルの整合性を検査中…';
try{const parts=[...files.values()].filter(f=>f!==manifest[0]);const result=await MSWImportBridge.run(manifest[0],parts,pin,(done,total)=>{out.textContent='写真認証 '+done+' / '+total+'件'});out.textContent=result.cancelled?'復元を中止しました':'架空患者'+result.patients+'件・写真'+result.photos+'件を復元しロックしました'}
catch(e){out.textContent='復元中断（既存患者は変更なし）：'+(e.message||String(e))}finally{busy=false}};
}
renderSettings=async function(...args){await original(...args);bind()};
})();