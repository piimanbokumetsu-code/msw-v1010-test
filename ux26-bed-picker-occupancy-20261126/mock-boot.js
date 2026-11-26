/* UX26 fake iPad scenario runner. Changes do not persist and never touch production. */
(function(){
'use strict';
const output=document.getElementById('result');
const checksOut=document.getElementById('testResults');
function showTest(current){
  window.showGroupedBedPicker(current,bed=>{
    output.textContent='架空選択：'+(bed||'その他・未配置')+'（実際の患者情報は変わりません）';
  });
  const root=document.getElementById('groupedBedPicker');
  if(!root){checksOut.textContent='表示できませんでした';return}
  const bed=number=>[...root.querySelectorAll('.bed-picker-grid .bed-picker-choice[data-bed]')]
    .find(el=>el.dataset.bed===number);
  const tests=[
    ['使用中201-1がオレンジ対象',bed('201-1')?.classList.contains('ux26-occupied')],
    ['空床201-2が白のまま',!bed('201-2')?.classList.contains('ux26-occupied')],
    ['使用中201-3がオレンジ対象',bed('201-3')?.classList.contains('ux26-occupied')],
    ['退院済み201-4が空床扱い',!bed('201-4')?.classList.contains('ux26-occupied')],
    ['ICU1-2の使用状況を反映',bed('ICU1-2')?.classList.contains('ux26-occupied')],
    ['1床室211の使用状況を反映',bed('211')?.classList.contains('ux26-occupied')],
    ['選択中のベッドは従来のchosenを維持',current?bed(current)?.classList.contains('chosen'):root.querySelector('.bed-picker-top .chosen')!==null],
    ['本来のベッド選択操作が可能',!!root.querySelector('.bed-picker-choice[data-bed="201-2"]')]
  ];
  const good=tests.filter(([_,ok])=>ok).length;
  checksOut.textContent='画面のコード検査 '+good+'/'+tests.length+' 件。'+(good===tests.length?'配置・選択用の表示条件を満たしました。':'確認が必要な項目があります。');
  window.UX26_FAKE_CHECKS=tests;
}
document.getElementById('openEdit').addEventListener('click',()=>showTest('201-3'));
document.getElementById('openNew').addEventListener('click',()=>showTest(''));
})();
