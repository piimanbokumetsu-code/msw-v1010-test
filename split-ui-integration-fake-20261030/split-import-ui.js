'use strict';
(()=>{
if(location.origin!=='https://piimanbokumetsu-code.github.io'||location.pathname!=='/msw-v1010-test/split-ui-integration-fake-20261030/')return;
const original=renderSettings;
function bind(){const after=document.getElementById('splitExportRow');if(!after||document.getElementById('splitImportRow'))return;
const panel=document.createElement('div');panel.id='splitImportRow';panel.className='panel';
panel.innerHTML='<h3>分割バックアップ復元（導入候補）</h3><p class="notice">バックアップファイルを1個ずつ追加し、暗証・全写真を検査してから復元します。復元すると現在の患者記録が置き換わります。事前に新しいバックアップと端末保存容量を確認してください。</p><input type="file" id="splitPick" multiple><p id="splitCount">選択済み 0 ファイル</p><button class="btn secondary" id="splitRestore">整合性を検証して復元</button> <button class="btn secondary" id="splitClear">選択をやり直す</button><p class="notice" id="splitImportStatus" role="status">未実施</p>';
after.insertAdjacentElement('afterend',panel);
const pick=panel.querySelector('#splitPick'),out=panel.querySelector('#splitImportStatus'),count=panel.querySelector('#splitCount');
const files=new Map();let busy=false;
pick.onchange=()=>{const selected=Array.from(pick.files||[]);pick.value='';const result=MSWSplitFileSelection.add(files,selected);count.textContent='選択済み '+result.count+' ファイル';out.textContent=result.ok?'ファイル選択を受け付けました':result.message};
panel.querySelector('#splitClear').onclick=()=>{if(busy)return;files.clear();count.textContent='選択済み 0 ファイル';out.textContent='未実施'};
panel.querySelector('#splitRestore').onclick=async()=>{if(busy)return;const manifest=[...files.values()].filter(f=>f.name.endsWith('-manifest.json'));if(manifest.length!==1){out.textContent='管理ファイルは1個だけ選んでください';return}
const pin=prompt('架空試験専用PINを表示しています。この試験では固定PINを使います。実際のPINは入力しないでください。',TEST_PIN);if(pin===null)return;
busy=true;out.textContent='全ファイルの整合性を検査中…';
try{const parts=[...files.values()].filter(f=>f!==manifest[0]);const result=await MSWImportBridge.run(manifest[0],parts,pin,(done,total)=>{out.textContent='写真認証 '+done+' / '+total+'件'});out.textContent=result.cancelled?'復元を中止しました':result.restored?(result.uiWarning||'患者'+result.patients+'件・写真'+result.photos+'件を復元しロックしました'):'復元結果を確認できません。アプリを再読み込みして確認してください'}
catch(e){out.textContent='復元処理の確認が必要です。エラー：'+(e.message||String(e))+'。既存データに変更がないと断言せず、再読み込み後の状態を確認してください'}finally{busy=false}};
}
renderSettings=async function(...args){await original(...args);bind()};
})();