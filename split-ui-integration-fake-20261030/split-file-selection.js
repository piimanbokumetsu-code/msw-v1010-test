'use strict';
/* Shared selection validation for the unreleased split-backup import UI and
 * synthetic-only regression harness. Does not read file contents or storage.
 * Call add(map, Array.from(fileInput.files)) from one user selection event.
 * Rejections clear the entire tentative selection to prevent mixed backup runs.
 */
const MSWSplitFileSelection=(()=>{
  const NAME=/^msw-split-([0-9a-f]{24})-(manifest|([0-9]{4}))\.json$/;
  const MAX_PART=48*1024*1024, MAX_MANIFEST=1024*1024, MAX_COUNT=2002;
  function fail(map,message){map.clear();return {ok:false,count:0,message}}
  function add(map,batch){
    if(!(map instanceof Map)||!Array.isArray(batch))throw Error('選択の内部形式が不正');
    if(!batch.length)return {ok:true,count:map.size,message:'新しいファイルは選択されませんでした'};
    const temp=new Map(map);
    for(const f of batch){
      const m=typeof f?.name==='string'?NAME.exec(f.name):null;
      if(!m||!Number.isSafeInteger(f.size)||f.size<1||
          f.size>(m[2]==='manifest'?MAX_MANIFEST:MAX_PART))
        return fail(map,'分割JSONの名前またはサイズが不正です。選択をやり直してください');
      if(m[2]!=='manifest'&&(+m[2]<1||+m[2]>2001))
        return fail(map,'分割パート番号が不正です。選択をやり直してください');
      if(temp.has(f.name))
        return fail(map,'同名ファイルが重複しました。選択をやり直してください');
      const existing=temp.keys().next().value;
      if(existing&&NAME.exec(existing)?.[1]!==m[1])
        return fail(map,'異なるバックアップ回のファイルが混在しています。選択をやり直してください');
      if(temp.size>=MAX_COUNT)
        return fail(map,'選択ファイル数が上限を超えました。選択をやり直してください');
      temp.set(f.name,f);
    }
    map.clear();
    for(const [name,file] of temp)map.set(name,file);
    return {ok:true,count:map.size,message:'選択済み '+map.size+' ファイル'};
  }
  return Object.freeze({add});
})();
