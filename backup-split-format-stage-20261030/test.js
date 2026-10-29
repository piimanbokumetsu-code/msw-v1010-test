'use strict';document.getElementById('run').onclick=async()=>{
 const status=document.getElementById('result');status.textContent='検査中…';
 try{
 const ids=['fake1','fake2','fake3','fake4'],meta={salt:'fake-salt',check:{iv:'iv',ct:'fake'}},data={iv:'iv',ct:'fake-index'};
 const files=new Map();
 const manifest=await MSWSplitV04.create({meta,data,photoIds:ids,getPhoto:async id=>({iv:'iv',ct:id.repeat(130)}),onPart:async(p,b)=>{Object.defineProperty(b,'name',{value:p.name});files.set(p.name,b)},maxBytes:1024});
 Object.defineProperty(manifest.blob,'name',{value:manifest.name});
 const valid=await MSWSplitV04.verify({manifestFile:manifest.blob,partFiles:files.values(),getReferenceIds:async()=>ids});
 let missing=false,wrongReference=false;
 try{await MSWSplitV04.verify({manifestFile:manifest.blob,partFiles:[...files.values()].slice(1),getReferenceIds:async()=>ids})}catch{missing=true}
 try{await MSWSplitV04.verify({manifestFile:manifest.blob,partFiles:files.values(),getReferenceIds:async()=>ids.slice(1)})}catch{wrongReference=true}
 if(!valid.verified||!missing||!wrongReference)throw Error('安全検証に不備');
 status.textContent='合格：架空形式の分割 '+valid.parts+'パート／写真 '+valid.photos+'枚\n全件検証：合格\n欠落パート：拒否\n写真との関連付け不一致：拒否\n本番患者データへのアクセス・書込みなし';
 }catch(e){status.textContent='テスト不合格：'+e.message}
};