'use strict';
(()=>{
const base='/msw-v1010-test/msw-patient-kana-search-stage-20261029/';
if(location.origin!=='https://piimanbokumetsu-code.github.io'||location.pathname!==base)return;
const original=renderSettings;let running=false;
function save(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),90000)}
function attach(){const anchor=document.getElementById('backup');if(!anchor||document.getElementById('splitExportRow'))return;const panel=document.createElement('div');panel.className='panel';panel.id='splitExportRow';panel.innerHTML='<h3>分割暗号化バックアップ（架空患者専用）</h3><p class="notice">写真を順番に検証し、最大48MiBずつ書き出します。各パートは保存操作が必要です。途中で中断したファイルは不完全です。</p><button class="btn secondary" id="splitStart">架空患者の分割書出を開始</button> <button class="btn secondary" id="splitNext" hidden>次のパートを保存</button><p id="splitState" class="notice" role="status">未実施</p>';anchor.closest('.panel').insertAdjacentElement('afterend',panel);
const start=panel.querySelector('#splitStart'),next=panel.querySelector('#splitNext'),status=panel.querySelector('#splitState');
start.onclick=async()=>{if(running)return;running=true;start.disabled=true;let number=0;try{
const manifest=await MSWExportBridge.run(async(desc,blob)=>{number++;await new Promise(resolve=>{status.textContent='パート '+number+'（'+(desc.bytes/1048576).toFixed(2)+'MiB）を保存してください';next.textContent='保存：パート '+number;next.hidden=false;next.onclick=()=>{save(blob,desc.name);next.hidden=true;next.onclick=null;resolve()}})});
status.textContent='写真 '+manifest.photoCount+'枚、パート '+manifest.partCount+'個の書き出しを開始しました。管理ファイルを保存してください。';next.textContent='管理ファイルを保存';next.hidden=false;next.onclick=()=>{save(manifest.blob,manifest.name);next.hidden=true;next.onclick=null;status.textContent='全ファイルのダウンロード開始。iPad「ファイル」で現物を確認してください。保存と復元の成功は未証明です。'};
}catch(e){status.textContent='書出中断：'+(e.message||String(e));next.hidden=true}finally{running=false;start.disabled=false}};
}
renderSettings=async function(...args){await original(...args);attach()};
})();