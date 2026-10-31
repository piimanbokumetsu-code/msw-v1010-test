(function(){'use strict';
const k=window.MSWKana02;
if(!k){document.getElementById('version').textContent='読み込み失敗';return}
document.getElementById('version').textContent='辞書：姓'+k.surnameCount+'件／名'+k.givenCount+'件 · '+k.version;
const fake=[['山田太郎','ヤマダ タロウ'],['渡邉 義雄','ワタナベ ヨシオ'],['青山千鶴子','アオヤマ チヅコ'],['藤本 正弘','フジモト マサヒロ'],['佐藤・花子','サトウ ハナコ'],['山崎 花子','ヤマザキ ハナコ'],['架空 未知名','']];
const rows=document.getElementById('rows');let passed=0;
for(const [name,expect] of fake){const preview=k.suggest(name),row=document.createElement('div');row.className='patient';const label=document.createElement('span');label.className='name';label.textContent=name;const input=document.createElement('input');input.value=preview;input.placeholder='候補なし・手入力';input.setAttribute('aria-label',name+'の候補');const button=document.createElement('button');button.textContent='確認';button.onclick=()=>{if(!input.value.trim())return;input.value=k.normalizeKana(input.value);button.textContent='済';button.disabled=true;document.getElementById('result').textContent='架空患者の読みを画面内で確認しました（保存なし）';};row.append(label,input,button);rows.append(row);if(preview===expect)passed++;}
const conf={data:{'氏名':'山崎 花子','フリガナ':'ヤマサキ ハナコ'},furiganaConfirmed:true,furiganaConfirmedFor:'山崎 花子'};const retained=k.preview(conf).text==='ヤマサキ ハナコ';const msg='候補一致 '+passed+'/'+fake.length+'件／確認済み読みの保護 '+(retained?'合格':'不合格');document.getElementById('checks').textContent=msg;
})();