/* KANA02: offline, non-authoritative Japanese personal-name reading suggestions.
 * No network calls; all readings are candidates requiring human confirmation.
 * Patient records and existing confirmed values are never changed by this module.
 */
(function(root){
 'use strict';
 const pairs=function(source){
  const out=Object.create(null);
  source.trim().split(/\s+/).forEach(function(part){
   const p=part.split(':');if(p.length===2)out[p[0]]=p[1];
  });return Object.freeze(out);
 };
 const surnames=pairs([
  '山田:ヤマダ 佐藤:サトウ 鈴木:スズキ 高橋:タカハシ 髙橋:タカハシ 田中:タナカ 伊藤:イトウ',
  '渡辺:ワタナベ 渡邊:ワタナベ 渡部:ワタベ 小林:コバヤシ 中村:ナカムラ 加藤:カトウ 吉田:ヨシダ',
  '山本:ヤマモト 松本:マツモト 井上:イノウエ 木村:キムラ 林:ハヤシ 清水:シミズ 山崎:ヤマザキ',
  '山﨑:ヤマザキ 山口:ヤマグチ 斎藤:サイトウ 斉藤:サイトウ 齋藤:サイトウ 阿部:アベ 安部:アベ',
  '池田:イケダ 橋本:ハシモト 森:モリ 石川:イシカワ 前田:マエダ 藤田:フジタ 後藤:ゴトウ',
  '岡田:オカダ 長谷川:ハセガワ 村上:ムラカミ 近藤:コンドウ 石井:イシイ 坂本:サカモト',
  '遠藤:エンドウ 青木:アオキ 藤井:フジイ 西村:ニシムラ 福田:フクダ 太田:オオタ 三浦:ミウラ',
  '藤原:フジワラ 岡本:オカモト 松田:マツダ 中川:ナカガワ 中島:ナカジマ 原田:ハラダ',
  '小川:オガワ 小野:オノ 田村:タムラ 竹内:タケウチ 金子:カネコ 中野:ナカノ 和田:ワダ',
  '中山:ナカヤマ 石田:イシダ 上田:ウエダ 森田:モリタ 原:ハラ 内田:ウチダ 柴田:シバタ',
  '酒井:サカイ 宮崎:ミヤザキ 宮﨑:ミヤザキ 横山:ヨコヤマ 高木:タカギ 安藤:アンドウ',
  '宮本:ミヤモト 大野:オオノ 小島:コジマ 谷口:タニグチ 工藤:クドウ 今井:イマイ',
  '高田:タカダ 丸山:マルヤマ 増田:マスダ 菅原:スガワラ 菊池:キクチ 杉山:スギヤマ',
  '新井:アライ 桜井:サクライ 小山:コヤマ 千葉:チバ 久保:クボ 松井:マツイ',
  '岩崎:イワサキ 木下:キノシタ 野口:ノグチ 松尾:マツオ 菅野:カンノ',
  '野村:ノムラ 佐々木:ササキ 大塚:オオツカ 大西:オオニシ 杉本:スギモト',
  '古川:フルカワ 浜田:ハマダ 平野:ヒラノ 川口:カワグチ 川上:カワカミ',
  '飯田:イイダ 大橋:オオハシ 本田:ホンダ 沢田:サワダ 澤田:サワダ',
  '関:セキ 関口:セキグチ 平田:ヒラタ 川崎:カワサキ 富田:トミタ',
  '北村:キタムラ 武田:タケダ 上野:ウエノ 小池:コイケ 西田:ニシダ',
  '荒木:アラキ 大島:オオシマ 栗原:クリハラ 松岡:マツオカ 片山:カタヤマ',
  '久保田:クボタ 大久保:オオクボ 吉川:ヨシカワ 南:ミナミ',
  '河野:コウノ 河合:カワイ 服部:ハットリ 堀:ホリ 堀内:ホリウチ',
  '永井:ナガイ 永田:ナガタ 秋山:アキヤマ 星野:ホシノ',
  '横田:ヨコタ 小松:コマツ 島田:シマダ 須藤:スドウ 須田:スダ',
  '児玉:コダマ 西川:ニシカワ 土屋:ツチヤ 坂井:サカイ',
  '細川:ホソカワ 早川:ハヤカワ 黒田:クロダ 黒川:クロカワ',
  '田口:タグチ 田辺:タナベ 田邊:タナベ 中田:ナカタ',
  '宮田:ミヤタ 望月:モチヅキ 宮下:ミヤシタ 小泉:コイズミ',
  '吉岡:ヨシオカ 吉野:ヨシノ 野田:ノダ 福島:フクシマ',
  '石原:イシハラ 石橋:イシバシ 大石:オオイシ 尾崎:オザキ',
  '成田:ナリタ 平井:ヒライ 岡崎:オカザキ 岡:オカ',
  '小田:オダ 小沢:オザワ 小澤:オザワ 内藤:ナイトウ',
  '松浦:マツウラ 高野:タカノ 小笠原:オガサワラ'
 ].join(' '));
 const given=pairs([
  '太郎:タロウ 花子:ハナコ 一郎:イチロウ 二郎:ジロウ 次郎:ジロウ 三郎:サブロウ 四郎:シロウ',
  '健:ケン 健一:ケンイチ 健二:ケンジ 健太:ケンタ 健太郎:ケンタロウ',
  '美咲:ミサキ 葵:アオイ 陽子:ヨウコ 洋子:ヨウコ 恵子:ケイコ 和子:カズコ 幸子:サチコ',
  '美智子:ミチコ 博:ヒロシ 浩:ヒロシ 誠:マコト 豊:ユタカ 明:アキラ',
  '優子:ユウコ 直子:ナオコ 和夫:カズオ 洋:ヒロシ 由美:ユミ 美香:ミカ 翔:ショウ 大輔:ダイスケ',
  '正:タダシ 正夫:マサオ 正雄:マサオ 正男:マサオ 正一:ショウイチ',
  '昭夫:アキオ 昭雄:アキオ 昭子:アキコ 明子:アキコ 明美:アケミ',
  '勝:マサル 勝男:カツオ 勝夫:カツオ 勝美:カツミ',
  '茂:シゲル 実:ミノル 稔:ミノル 隆:タカシ 隆司:タカシ',
  '修:オサム 治:オサム 勇:イサム 勇一:ユウイチ 勇二:ユウジ',
  '進:ススム 勉:ツトム 清:キヨシ 清一:セイイチ 清美:キヨミ',
  '武:タケシ 武雄:タケオ 文夫:フミオ 文雄:フミオ',
  '賢:ケン 賢一:ケンイチ 賢二:ケンジ 智:サトシ 聡:サトシ',
  '和也:カズヤ 和彦:カズヒコ 和弘:カズヒロ 和宏:カズヒロ',
  '浩一:コウイチ 浩二:コウジ 浩之:ヒロユキ 博之:ヒロユキ',
  '直樹:ナオキ 直人:ナオト 直美:ナオミ 直幸:ナオユキ',
  '拓也:タクヤ 拓真:タクマ 拓哉:タクヤ 達也:タツヤ',
  '大介:ダイスケ 大樹:ダイキ 大輝:ダイキ 大地:ダイチ',
  '翔太:ショウタ 翔平:ショウヘイ 翔一:ショウイチ',
  '雄一:ユウイチ 雄二:ユウジ 雄太:ユウタ 雄介:ユウスケ',
  '健司:ケンジ 康夫:ヤスオ 康子:ヤスコ 靖子:ヤスコ',
  '信夫:ノブオ 信一:シンイチ 信子:ノブコ',
  '敏夫:トシオ 敏子:トシコ 敏雄:トシオ 俊夫:トシオ 俊子:トシコ',
  '光子:ミツコ 光男:ミツオ 光夫:ミツオ 光雄:ミツオ',
  '良子:リョウコ 良一:リョウイチ 良夫:ヨシオ',
  '節子:セツコ 久子:ヒサコ 久美子:クミコ 京子:キョウコ',
  '洋一:ヨウイチ 洋二:ヨウジ 洋介:ヨウスケ',
  '由紀子:ユキコ 由紀:ユキ 由美子:ユミコ',
  '幸雄:ユキオ 幸夫:ユキオ 幸恵:ユキエ 幸枝:ユキエ',
  '典子:ノリコ 紀子:ノリコ 祥子:ショウコ 晶子:アキコ',
  '裕子:ユウコ 裕美:ヒロミ 裕一:ユウイチ 裕二:ユウジ',
  '真由美:マユミ 真理子:マリコ 真由子:マユコ 真一:シンイチ',
  '美穂:ミホ 美和:ミワ 美紀:ミキ 美幸:ミユキ 美佐子:ミサコ',
  '智子:トモコ 智美:トモミ 知子:トモコ',
  '絵美:エミ 恵美:エミ 恵美子:エミコ 恵:メグミ',
  '愛:アイ 愛子:アイコ 愛美:マナミ',
  '由香:ユカ 友美:トモミ 友子:トモコ',
  '千春:チハル 千代子:チヨコ 千恵子:チエコ',
  '春子:ハルコ 春美:ハルミ 春男:ハルオ',
  '夏美:ナツミ 夏子:ナツコ 秋子:アキコ 秋夫:アキオ',
  '良美:ヨシミ 雅子:マサコ 雅美:マサミ',
  '美代子:ミヨコ 美恵子:ミエコ 美奈子:ミナコ',
  '麻衣:マイ 麻美:アサミ 香織:カオリ 香:カオリ',
  'さくら:サクラ ひろみ:ヒロミ あかり:アカリ',
  'あゆみ:アユミ ゆかり:ユカリ みどり:ミドリ',
  '結衣:ユイ 結菜:ユイナ 陽菜:ヒナ',
  '凛:リン 蓮:レン 陽翔:ハルト 湊:ミナト',
  '茜:アカネ 瞳:ヒトミ 純子:ジュンコ 純一:ジュンイチ',
  '英子:エイコ 英一:エイイチ 英明:ヒデアキ',
  '栄子:エイコ 栄一:エイイチ 富子:トミコ'
 ].join(' '));
 const charGiven=pairs([
  '太:タ 郎:ロウ 一:イチ 二:ジ 三:サン 四:シ 雄:オ 夫:オ 男:オ 子:コ 美:ミ',
  '恵:エ 智:トモ 由:ユ 紀:キ 幸:ユキ 光:ミツ 明:アキ 和:カズ',
  '正:マサ 昭:アキ 信:ノブ 直:ナオ 康:ヤス 久:ヒサ 清:キヨ',
  '春:ハル 秋:アキ 夏:ナツ 冬:フユ 香:カ 里:リ 理:リ',
  '奈:ナ 菜:ナ 花:ハナ 優:ユウ 愛:アイ 真:マ 友:トモ',
  '健:ケン 浩:コウ 洋:ヨウ 拓:タク 翔:ショウ 賢:ケン',
  '高:タカ 大:ダイ 司:ジ 平:ヘイ 樹:キ 丈:ジョウ',
  '志:シ 江:エ 代:ヨ 千:チ 絵:エ 結:ユイ 純:ジュン',
  '博:ヒロ 裕:ユウ 英:エイ 栄:エイ 玲:レイ 加:カ'
 ].join(' '));
 function toKata(s){return String(s||'').normalize('NFKC').replace(/[ぁ-ゖ]/g,function(c){return String.fromCharCode(c.charCodeAt(0)+96)});}
 function normalizeKana(s){return toKata(s).replace(/[\s　]+/g,' ').trim();}
 function isKana(s){return /^[ァ-ヿー・\s]+$/.test(toKata(s)) && !!String(s).trim();}
 function readGiven(s){
  if(given[s])return given[s];
  if(isKana(s))return normalizeKana(s);
  let result='',rest=s;
  // Prefer dictionary chunks over one-kanji guesses.
  while(rest){
   let part='';
   const max=Math.min(4,rest.length);
   for(let n=max;n>1;n--){if(given[rest.slice(0,n)]){part=rest.slice(0,n);break}}
   if(part){result+=given[part];rest=rest.slice(part.length);continue}
   if(!charGiven[rest[0]])return '';
   result+=charGiven[rest[0]];rest=rest.slice(1);
  }
  return result;
 }
 function suggest(fullName){
  // Normalize imported display-name separators only for the unsaved reading preview.
  // This never alters registered names or existing confirmed readings.
  const name=String(fullName||'').normalize('NFKC')
   .replace(/[\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/g,'')
   .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g,' ')
   .replace(/[・･\/／|｜,，、]+/g,' ')
   .replace(/\s+/g,' ').trim();
  if(!name)return '';
  if(isKana(name))return normalizeKana(name);
  const parts=name.split(' ');
  let family='',givenName='';
  if(parts.length===2){family=parts[0];givenName=parts[1]}
  else if(parts.length===1){
   // In unspaced names, choose a known surname only when a given name remains.
   const familyCandidates=Object.keys(surnames).filter(function(k){return name.startsWith(k)&&name.length>k.length});
   familyCandidates.sort(function(a,b){return b.length-a.length});
   family=familyCandidates[0]||'';
   givenName=family?name.slice(family.length):'';
  }else return '';
  const surnameKana=surnames[family]||(isKana(family)?normalizeKana(family):'');
  const givenKana=readGiven(givenName);
  return surnameKana&&givenKana?(surnameKana+' '+givenKana):'';
 }
 function isConfirmed(p){
  const name=String(p&&p.data&&p.data['氏名']||'').trim();
  return !!(p&&p.furiganaConfirmed&&p.furiganaConfirmedFor===name&&String(p.data&&p.data['フリガナ']||'').trim());
 }
 function preview(p){
  if(isConfirmed(p))return {text:String(p.data['フリガナ']),confirmed:true};
  const current=String(p&&p.data&&p.data['フリガナ']||'').trim();
  // Previously saved values, even unconfirmed, take precedence over guesses.
  return {text:current||suggest(p&&p.data&&p.data['氏名']),confirmed:false};
 }
 root.MSWKana02=Object.freeze({suggest:suggest,isConfirmed:isConfirmed,preview:preview,normalizeKana:normalizeKana,
  surnameCount:Object.keys(surnames).length,givenCount:Object.keys(given).length,version:'KANA02-20261031'});
})(window);
