# KANA02 フリガナ改善・開発引き継ぎ（2026-10-31）

## ユーザー承認仕様
- 氏名を入力すると一般的なカタカナ読みを自動候補として表示し、人が修正後に「確認」で確定。
- 新規・既存患者の両方に適用。
- 既存患者については「基本」タブ個別確認と、未確認患者一覧によるまとめ確認の両方を使う。
- 確認済みの読みを自動上書きしない。実患者氏名の外部通信は禁止。
- 既存のKANA01レイアウト・ベッド検索・朝一印刷・RX047薬情バックアップを変更しない。

## 正しい本番
- 本番リポジトリ: `msw-ipadmini-app/msw-ipadmini-app.github.io` の `main`、URL `https://msw-ipadmini-app.github.io/`
- 2026-10-31現行 `app.js` blob SHA `d47702a132ca2c8f1d609166cda4d72b2d3872fc`
- `app.js` の `furiganaSuggestion()` は姓40・名27程度の両方完全一致のみ。
- `bindBasicFurigana()` の確認済み処理・`capturePatientForm()` の未確認フリガナ保存抑止は保持する。

## このチャットで実際に作成したもの
- テストリポジトリ: `piimanbokumetsu-code/msw-v1010-test`、main
- 架空専用パス: `kana02-furigana-fake-20261031/`
- 公開想定URL: https://piimanbokumetsu-code.github.io/msw-v1010-test/kana02-furigana-fake-20261031/
- `kana02-core.js`: 完全オフライン読み候補、名字180種・名前204種、さらに一部漢字の推測、既存読み優先、確認済み判定。コミット `28e4dfe8f8e30de11cf7a731dc47aed00bc282b4`
- `kana02-test.js`: 架空8名の一括確認、架空新規患者フォーム、12項目ブラウザ自動検査。コミット `b6fc71d888297594f02f023931c9eedc82749d49`
- `index.html`: iPad Safari架空テストUI。コミット `076fcc401ec58436b30996071e43c1411868520c`
- GitHubにコード保存済。JS構文検査、代表的な姓名の候補、未確認の手入力優先、確認済み保護、外部通信なし、参照関係を静的検査して合格。
- 外部WebツールからGitHub PagesのURLは取得不可。**iPadで公開画面が開いたことも12/12表示も未確認**。確認前に合格扱いしない。
- 本番リポジトリ `main`、本番 IndexedDB/薬情/RX047には一切手を加えていない。
- **本番との接続コード／保存連動／新規・既存の本番回帰／本番公開は未実装**。この区別を忘れない。

## 次の一操作
iPad mini の Safari で上記の公開想定URLを開き、表示と「架空データ自動試験：12/12 件合格」を確認する。実名や本番PINを入れない。開かなければPages配信状態を調べる。

## その後
iPadでテストOKなら本番の別ブランチにKANA02オフラインコアとバッチ確認UIを統合する。確認済みフラグ保持とautosaveの安全性を重点検証し、架空環境で動作確認後のみ本番反映判断。


## 2026-10-31 iPad mini 実機進捗
- ユーザーがSafari架空テスト画面で「12/12件合格」を確認し報告した。**画面起動とブラウザ自動検査表示は合格**。
- ただし架空新規患者の候補手直し・確認ボタン、既存患者一覧の修正・確認・保持は**手動操作未検証**。この段階で本番合格扱いしない。

## 2026-10-31 本番リポジトリへの安全な段階配置
- 本番リポジトリの別ブランチ `feature-kana02-offline-suggestions-20261031` を `main` から作成。
- 新規 `kana02-core.js` を追加（commit `dbba6dfb4ca16817df779a17edb9fa4215c15948`）。
- 新規 `kana02-addon.js` を追加（commit `3cf4c4757876893cb02a24a4ff31841030fc9be9`）。既存 `furiganaSuggestion` と患者一覧表示のラッパーを設計し、1患者ずつ明示確認・暗号化保存、失敗時の復元を記述。
- **index.html と SW はまだ変更していないため、このアドオンは現時点では読み込まれない。統合済みとは言わない。**
- app.jsの本体・本番main・患者DB・RX047は変更なし。
- 次の開発作業：iPad架空手動検証後、追加2スクリプトの SRI を作成し開発ブランチ index.html / sw.js に組込む。静的構文・制約、架空環境との連動を確認。未検証のままmainへmergeしない。

## iPad mini 架空新規患者・手動確認の進捗
- 架空患者「小川 明子」のフリガナ候補をユーザーが手直しできたことを報告。
- その後「この架空患者の読みを確認」をタップして「確認済み（架空データ）」表示を実機で確認。**新規患者の候補編集と確定表示は合格**。
- なおこの架空画面での確認は画面内一時状態であり、保存・再起動後の保持を検証したものではない。
- 次の一操作：既存架空患者一覧で「山田 太郎」行の「確認」をタップし、「確認済み」「済」に変わるか確認。いきなり本番データ操作はしない。

## 2026-10-31 iPad mini 既存架空患者・一括確認手動試験
- ユーザーが架空患者「山田 太郎」の行で「確認」をタップし、ボタンが「済」に変わり「確認済み」となったことを報告。**一覧での個別確定・画面表示は実機合格**。
- この架空試験はメモリ内の表示変更で、暗号化された本番患者レコードへの保存・再起動後保持はまだ試験していない。KANA01での既存のフリガナ保存実績をKANA02のバッチ保存合格とは扱わない。
- 直近の追加操作は最小限とし、KANA02の本番別ブランチ統合と安全確認へ進む。

## 2026-10-31 別ブランチ内KANA02統合・ドラフトPR作成
- 本番コード管理リポジトリの開発ブランチ `feature-kana02-offline-suggestions-20261031` で `index.html` に `kana02-core.js` と `kana02-addon.js` を SHA-384 SRI付きで追加。`sw.js` の固定キャッシュリストにも追加。
- SRIを計算する自作SHA-384は公開標準テストベクトル `abc` と既存RX047実物の既知SRIで一致を確認。
- GitHub差分は4ファイル（index.html,sw.js,新規2JS）、mainからahead 4/behind 0。
- **本体app.js blob SHA `d47702a132ca2c8f1d609166cda4d72b2d3872fc` のまま変更なし**。
- ドラフトPR #5 https://github.com/msw-ipadmini-app/msw-ipadmini-app.github.io/pull/5 を作成。**mainにマージしておらず、本番には反映されていない**。
- 独立架空画面12/12、既存患者の一覧確定表示と新規患者の読み手直し・確定表示は実機合格。ただし開発ブランチに組み込んだ**本体の患者データへの暗号化保存・保持・再起動後・印刷・検索との共存は未検証**。
- 次は架空一覧の未確認患者で「手直し→確認」の手動試験を1操作ずつ行い、独立環境での統合保存試験を追加する。本番アプリや実患者・PINへの操作を依頼しない。

## 2026-10-31 KANA02本体連動・iPad mini架空患者16/16合格
- ユーザーが https://piimanbokumetsu-code.github.io/msw-v1010-test/kana02-integration-fake-20261031/ で「本体連動・架空データ自動試験：16/16件合格」を確認。
- 初回404になったが、テスト用 index.html の配信再試行コミット 9bb396ac06621d567c45b43d00339d6cb2a20a51 後にユーザーが開けたと報告。
- 16項目はKANA02本番導入用コアとアドオンを架空患者・別IndexedDBで使用し、候補生成、確認済み保護、一括確認、編集→保存、AES-GCM 暗号化・読戻し、意図的な保存失敗の巻戻し、再読込をテスト。
- **独立した検証環境での16/16。完全な本番app.jsを組み込んだ総合検証・本番PWA再起動・実患者保全は未確認。**
- これまでの KANA02 基本架空画面12/12、手直しと確認の実機試験は繰り返さない。
- 本番GitHub msw-ipadmini-app/msw-ipadmini-app.github.io の開発ブランチ・ドラフトPR #5 は作成済みだが、mainにマージしていない。写真・薬情RX047・本番患者データに影響なし。

## 2026-10-31 Safari再読み込み後の保存保持テスト準備
- 架空患者16/16のiPad報告を受け、既存の同一セッション内読戻しとは別に、ブラウザの再読み込み前にIndexedDBに残っていたAES-GCM暗号化レコードを復号して、佐藤花子のフリガナと確認済みフラグをチェックする表示を追加。
- 試験ページ: https://piimanbokumetsu-code.github.io/msw-v1010-test/kana02-integration-fake-20261031/
- 変更: run-tests.jsコミット 62ac87a659ed2155d5eda67de77750fb23cc8ece、index.htmlコミット 697994096a48e0fe358605532d74e02561e69119。
- **再読み込み後の保持は、まだユーザー未検証。** 従来の16/16自動試験の結果・既存の架空手直し合格は変更しない。
- 次はページをSafariで1回再読み込みし「前回の暗号化保存を再読込：合格」の表示を確認。実患者情報は使わない。

## 2026-10-31 iPad Safari 再読み込み後の暗号化保存保持・合格
- ユーザーがKANA02架空患者の統合テストURLをSafariで再読み込みし「前回の暗号化保存を再読込：合格」と表示されたと報告。
- 佐藤花子の手直しした候補・確認済みフラグがAES-GCMで別の架空IndexedDBに保存されたまま、ページ再読み込み後の最初の読み取りで復元できたことを検証。
- 先行する独立架空12/12、新規/既存の読み修正・確認操作、統合架空16/16も全て成功。重複テストは求めない。
- この実機結果は本番コードを一部使った架空データ専用の検証画面によるもの。完全な本番app.jsを隔離環境で動かす回帰試験と、本番PWAへの反映はまだ未実施。
- 本番コードリポジトリの未マージドラフトPR #5を維持し、RX047や実患者データを触らない。

## 2026-10-31 完全なMSW本体の架空患者専用・統合検証版
- 実患者情報を触らず、現時点の本体app.js 198KBのコピーを2026-10-31のテスト用別フォルダ kana02-full-app-fake-20261031/ に作成。
- 運用機能のコピー元は本番app.js blob d47702a132ca2c8f1d609166cda4d72b2d3872fc（本番実体は未変更）。テスト用コピーではDB名を msw_kana02_full_fake_20261031_v1 に変更し、配信許可origin/pathをテストURLへ固定、サービスワーカー登録を除去、初回のみ佐藤花子・中川明美・山崎一郎（別読み確認済）の架空3名を用意し、専用架空固定PINで自動起動する方式。
- 本番開発ブランチのkana02-core.jsとkana02-addon.jsは内容完全一致。実際の本体CSSを配置。index.htmlには「架空患者専用」「実名・実PIN入力禁止」を常時表示。
- 想定URL: https://piimanbokumetsu-code.github.io/msw-v1010-test/kana02-full-app-fake-20261031/
- GitHub上の5ファイル保存・静的チェック13/13合格。**iPad miniでの画面表示はまだ未確認**。これまでの16/16や再読み込み後保持の合格は独立環境についてであり、完全な本体での動作確認を代替しない。
- 本番コードのmain、DB名、実患者、薬情RX047、分割バックアップ、既存PWAを変更しない。
- 次の1操作はiPad mini Safariでこの架空専用URLを開き、3名のベッドマップと「フリガナ一括確認（未確認2人）」表示が出るかだけ確認。不要な既往試験を繰り返さない。

## 2026-10-31 完全本体の架空患者3名・iPad mini Safari実機表示合格
- ユーザーが https://piimanbokumetsu-code.github.io/msw-v1010-test/kana02-full-app-fake-20261031/ をiPad mini Safariで開き、「架空患者3人が表示された」と報告。
- 本番用app.jsの隔離コピー（専用架空DB・架空PIN）とKANA02コア・アドオンを組み合わせた完全本体画面の起動・一覧表示が実機で成功。
- 次に確認すべき1操作は患者一覧の「フリガナ一括確認（未確認2人）」ボタンを押し、未確認2名だけが出るか。山崎一郎の確認済み保護は未検証。
- 本番main・実患者・RX047・既存PWA・分割バックアップは未変更。統合画面の確認保存は未実施。

## 2026-10-31 完全本体の一括確認リスト表示・実機合格
- ユーザーが iPad mini Safariで完全本体の架空KANA02検証版を開き、「フリガナ一括確認」ボタンを押して「佐藤 花子」「中川 明美」の2人だけが表示されたと確認。
- 確認済みの架空患者「山崎 一郎」が一覧に出ないことを実機で確認。未確認数2人の一覧抽出・UI連携が成功。
- これまでの12/12, 16/16, 再読み込み後の暗号化保存合格を重複して試験しない。
- 本体検証版での実際の患者1件確定保存は次の1操作で検証予定（ユーザーが「佐藤 花子」行の「確認」を押し、済/残り1人の表示を確認）。
- 本番本体main、患者データ、RX047、PWAを変更していない。

## 2026-10-31 KANA02統合版・かな検索の実機確認
- iPad mini Safariで KANA02 隔離した本体アプリの一覧検索欄に「さとう」と入力すると、佐藤 花子の病室に正しく絞り込まれたとユーザーが報告。
- 同じ本体隔離環境では前段で一括確認リスト2名表示、佐藤の確認・済・未確認1人、Safari再読み込み後も未確認1人が維持されたことをユーザーが確認。
- 独立画面12/12および16/16、独立暗号化保存再読み込みも先に合格。合格した試験の反復は不要。
- 本番公開は行わず、開発用PR #5のまま。次の未確認事項は基本タブの確認済み状態表示や画面回帰の点検。

## 2026-10-31 KANA02 本体基本タブ・確認済みフリガナの実機表示
- iPad mini Safari の本体隔離検証版で、一覧検索「さとう」から佐藤 花子の病室へ絞り込み、ベッド枠を開いたところ基本タブで「サトウ ハナコ」「確認済み」が表示されたとユーザーが報告。
- 未確認2名の抽出、一人ずつ確認保存・済表示、Safari再読み込み後の未確認1名保持、ひらがな検索、基本タブの表示まで実機で連動合格。
- 本番main・患者データ・RX047は未変更。架空の既存確認済み患者を保護し、新規患者の候補表示・他機能との共存を最終点検する。

## 2026-10-31 KANA02本体・患者情報から一覧への復帰確認
- iPad mini Safariの架空専用・本体統合検証版で「佐藤 花子」の基本タブにフリガナ「サトウ ハナコ」と「確認済み」が表示された後、左上の戻る操作で患者一覧に復帰できたことをユーザーが確認。
- フリガナ確認・保存・再読込・ひらがな検索・基本タブ表示・一覧戻りまで一連の操作が実機合格。
- 次は一覧の検索欄の「消去」を1回押し、すべての架空患者が再び見える状態にしてから、以前から確認済みの「山崎 一郎」の読み保護を確認する。
- 本番main、実患者、RX047には変更なし。

## 2026-10-31 既存の読みの保護・実機合格
- 完全本体の隔離したサンプル版で、山崎 一郎の基本タブに「ヤマサキ イチロウ」「確認済み」と表示されることをiPad Safariで確認した。
- 一般的な自動候補「ヤマザキ」へ書き替わらず、以前から確認された読みが保持された。
- これまでに一括確認、暗号化保存、再読み込み、患者検索、基本タブ表示、一覧復帰、検索解除に合格した。
- リリース用PR #5はドラフトのまま、公開版mainには未反映。次は最終点検。

## 2026-10-31 KANA02新規患者ボタンの表示問題・修正候補
- ユーザー報告：架空の本体検証版で、従来の「＋患者」ボタンが「フリガナ一括確認」になってしまったように見え、操作できない。
- 原因は未特定（コード上はadd-onが「＋患者」の直前に一括確認ボタンを挿入する実装だった）。狭い画面で紛らわしいため、独立したフレックス配置欄を追加。既存「＋患者」要素を、イベントハンドラを保持したまま移して「＋患者（新規登録）」と明示し、一括確認ボタンを横に配置。幅不足時は折返し。
- 修正対象は架空用の kana02-full-app-fake-20261031/kana02-addon.js と、そのスクリプトURLを更新したindex.htmlのみ。DB名、架空患者データ、本番main、RX047は変更なし。
- テストJS構文と2ボタン分離DOMの静的確認は合格。**iPad Safariでの修正表示は未確認**。
- URL: https://piimanbokumetsu-code.github.io/msw-v1010-test/kana02-full-app-fake-20261031/?v=actions-fix1
- 本番開発ブランチのドラフトPR #5へは、ユーザーの修正表示確認後に同じ修正を取り込む。本番には未反映。

## 2026-10-31 新規患者ボタン表示修正・iPad Safari実機合格
- ユーザーが修正版のKANA02隔離本体検証版で「＋患者（新規登録）」と「フリガナ一括確認」の両方が表示されたと確認。
- ボタン表示修正がiPad Safari実機合格。以前の表示問題の再確認は不要。
- 次は元の新規患者ボタンから基本情報画面が開くことを一操作で確認する。実患者、実PIN、RX047には触れない。
- 本番mainは未反映。開発ブランチへの同じレイアウト修正はこれから同期。

## 2026-10-31 新規患者ボタン表示修正・開発ブランチにも反映
- iPad mini Safariで「＋患者（新規登録）」と「フリガナ一括確認」の両ボタンが表示されたとユーザー報告。表示修正の実機合格。
- 同じ新規患者ボタン分離コードを本番用GitHubの未公開ブランチ feature-kana02-offline-suggestions-20261031 のkana02-addon.jsへ移植（コミット376b2c0d611c73e5b10c6e11049bb7b637afb102）。保存処理部分のコードは変更しない。
- index.html のアドオン読込URLとSHA-384完全性検証値を更新し、sw.js の固定キャッシュ資産URL・キャッシュ名も更新。SHA-384は標準テストベクトルと本番RX047既知ハッシュの双方で確認。
- 追加コミット: index a3cec4cb41ea1104dd0622af1c884e9aa0ad30ee、sw 94c03a040730bc4302f45f5676b8a78d26ee2485。
- PR #5はドラフト/未マージ。公開mainのapp.js SHA d47702a132ca2c8f1d609166cda4d72b2d3872fc は開発ブランチと同一のまま。4ファイル差分以外変更なし。
- 次のiPad mini操作は、同じ架空患者検証版の「＋患者（新規登録）」を1回タップして基本タブが開くことを確認。新規患者の情報はこの操作では入力不要。

## 2026-10-31 新規患者ボタンから基本情報画面の起動・実機合格
- ユーザーがiPad mini SafariのKANA02修正版・架空患者専用本体検証版で「＋患者（新規登録）」をタップし、新規患者の基本情報画面が正常に開いたことを確認。
- 直前の「＋患者（新規登録）」と「フリガナ一括確認」両ボタン表示の実機合格に続き、既存の新規登録ボタンのイベント処理も維持されたことを確認した。
- 次の一操作はこの新規患者画面の「氏名」に架空名「小川 明子」を入力し、フリガナ欄に候補「オガワ アキコ」が表示されるか確認。氏名以外のデータや実患者情報は入力しない。
- 本番mainは未変更、開発ブランチのPR #5は未マージ。

## 2026-10-31 新規患者のオフライン読み候補・iPad本体実機合格
- 修正版のKANA02本体用・架空データ隔離検証版で「＋患者（新規登録）」を開き、架空名「小川 明子」を入力したところ、フリガナ候補「オガワ アキコ」が自動表示されたとユーザーが確認。
- 本体画面の新規患者について候補表示が実機合格。まだ新規患者として「確認」および患者保存は未検証。
- 次の一操作は新規患者の基本タブでフリガナ行の「確認」を押し、確認済みになるかだけ確認する。
- 本番main、実患者、RX047には変更なし。KANA02 PR #5ドラフト未マージ。

## 2026-10-31 本体新規患者のフリガナ確定・iPad実機合格
- 架空患者専用のフル本体統合検証画面で、新規患者「小川 明子」氏名入力後「オガワ アキコ」候補が自動表示された。
- ユーザーがフリガナ「確認」をタップし、ボタン「済」とステータス「確認済み」を実機で確認した。
- 現時点では画面上の確定UIが合格。新規患者の暗号化保存後の再表示・再起動保持はまだ未確認。
- 次の1操作：「保存して閉じる」をタップし患者一覧へ遷移するか検証。アプリは自動保存と保存完了後の閉画面を実装、保存失敗時は画面に留まる。
- main本番・実患者・RX047は一切変更なし。KANA02 PR #5は未公開ドラフト。

## 2026-10-31 新規患者の閉じる操作・表示確認要
- 架空新規患者「小川 明子」で自動候補「オガワ アキコ」、フリガナ「確認」後の「済」「確認済み」までiPad mini Safari実機で合格。
- 続けて右上の「保存して閉じる」を案内したところ、ユーザーから「保存して閉じるがありません」と報告。表示位置・端末画面での可視性は未特定。リロードや画面変更をまだ求めず、入力保持を優先。
- 本体のコード上では左上 #closeM（←）と右上 #saveP（保存して閉じる）は両方とも finishPatientAndNavigate(closePatient,{closing:true}) を呼び出し、保存完了まで遷移しない同一の処理。
- 次の1操作は新規患者画面左上の「←」を押して一覧へ戻ること。もし左矢印も見えなければ操作を止めて報告してもらう。新規患者の保存保持は未検証。
- 本番main未変更。表示が見えない原因は後に切り分ける。

## 2026-10-31 検証版で患者画面ヘッダーが注意帯に隠れる問題
- ユーザーが架空新規患者「小川 明子」のフリガナを確定した後、右上「保存して閉じる」も左上「←」も見えない、または操作できないと報告。元の入力画面は再読み込みしないよう案内。
- 原因として明確なCSS重なりを発見：検証版index.htmlの #fakeDemoBanner が position:relative;z-index:99 だが本体の .modal は z-index:80。注意帯が患者画面ヘッダーに覆いかぶさる。
- 架空検証用index.htmlのみ、バナーz-indexを99→10に修正（コミット14c19ff968f5ab16b73b699596a98a1d52e34ec8）。元の患者ボタン、保存機能、暗号化IndexedDB、アドオン、実患者、本番は未変更。
- コード静的点検は合格：患者ヘッダーの←/保存して閉じる両ボタン存在、共通保存処理へ接続、検証用バナーz10 < モーダルz80、架空専用DB維持、ボタン2つの一覧表示コード維持。本番PR#5はドラフト/未マージ。
- 次の検証：元の入力済みタブはそのまま残し、修正URLを新しいタブで開き、架空患者4名または小川 明子が保存済みかチェック。**新しいタブでの実機修正合格は未確認**。

## 2026-10-31 修正版の別タブで新規患者が保持される・実機合格
- iPad mini Safariで、前のタブを開いたまま別タブでバナー重なり修正版KANA02架空本体検証版を開き、架空の新規患者「小川 明子」が患者一覧に表示されたとユーザーが報告。
- 元のタブで「小川 明子」「オガワ アキコ」候補→「確認済み」まで成功。別タブの患者一覧に存在したので新規患者の自動保存・端末内共有DBからの読み出しは実機で確認。確認済みフラグの別タブ保持は未検証。
- 修正：検証版の #fakeDemoBanner z-index 99→10。次は別タブの「小川 明子」の患者カードを1回タップし、フリガナ・確認済み表示と患者ヘッダー（←と保存して閉じる）の可視性を確認。入力済みの元タブは閉じない。
- 本番main、実患者データ、RX047は変更なし。開発PR #5はドラフト未マージ。

## 2026-10-31 Header buttons shown
- Latest iPad Safari report confirms both Back and Save/Close buttons visible on the fake KANA02 patient screen; this supersedes a contradictory earlier report.
- Next verify saved confirmed kana after opening new fake patient in the refreshed tab. Production unchanged.

## 2026-10-31 KANA02 新規患者の確認済みフリガナ保存保持・実機合格
- iPad mini SafariのKANA02本体・架空隔離検証版で、新規患者「小川 明子」に自動候補「オガワ アキコ」が出て、ユーザーが「確認」を押し「済／確認済み」となった。
- その後、同じ架空DBを使う修正版の別タブで患者一覧に小川 明子が存在し、患者基本タブに「オガワ アキコ」と「確認済み」が保持されていることをユーザーが確認。
- 検証ページのバナー表示z-index修正後、患者画面上部の←と「保存して閉じる」が見えることも確認済み。これは本番UIでの問題ではなく、架空検証ページ固有のバナー重なり。
- 新規患者の自動提案、人手確認、暗号化保存後の別タブでの表示保持は実機合格。既存患者の確認済み読み保護・検索も前段で合格。合格テストの繰り返し不要。
- 次の1操作は修正版の患者情報画面上部「保存して閉じる」をタップし、患者一覧へ戻ることを確認する。
- 本番main、実患者データ、RX047は変更なし。KANA02 PR #5は未マージ。

## 2026-10-31 新規患者 保存して閉じる → 患者一覧・実機合格
- 修正版KANA02架空本体検証版（iPad Safari）で、新規患者「小川 明子」の「保存して閉じる」を押すと、患者一覧に正常に戻ったとユーザーが確認。
- 既に候補自動入力→確認済み→別タブでの暗号化保存保持→患者画面の操作ボタン可視化が実機合格。これで新規患者の一連の動作は確認完了。
- 主要実機検証の推定進捗99%。次は本番公開前の差分・キャッシュ・既存患者データ保護・バックアップ条件などをコード点検し、実患者データや本番更新はユーザーの明示的な判断なしに実施しない。
- 検証済み項目は繰り返さない。RX047薬情バックアップは全患者バックアップの代替ではない。

## KANA02 release preflight 2026-10-31
- GitHub production repository `msw-ipadmini-app/msw-ipadmini-app.github.io`: PR #5 remains open, draft, unmerged. `main` versus `feature-kana02-offline-suggestions-20261031` 7 commits ahead, 0 behind.
- Four changed files only: `index.html`, `kana02-addon.js`, `kana02-core.js`, `sw.js`. The `app.js` blob is identical to production `main`, hash `d47702a132ca2c8f1d609166cda4d72b2d3872fc`.
- `index.html` references the updated `kana02-addon.js` with SHA-384 SRI; `sw.js` pre-cache asset URL has matching `kana02-20261031-buttons-fix1` version and changed cache name. Source review confirms the original new-patient button handler was preserved by moving the actual button to a separate action row.
- Full patient data back-up/restore is not equivalent to the completed RX047 `.mswrx` pharmacy backup. Prior splitting work had unresolved integrated full restore issue, so **do not infer a verified current complete clinical backup**.
- No production deploy/merge was made. Next user decision: prioritize completing robust split all-patient backup before deployment (safest), versus discussing deployment risk and precautions first. Never deploy without explicit authorization.

## KANA02 approval-gated release preparation: 2026-10-31 RC1
- User requested development toward production introduction but explicitly **not yet** production update. Keep photo-inclusive split backup on hold as agreed.
- Final source functional/security static checks: 26/26 passed (including corrected unknown-name test); includes offline-only core/addon, manual-confirm-only saving, confirmed surname reading protection, no fake writes and clinical IndexedDB name.
- PR #5 title/body updated to reflect completed iPad full-app fake-data tests and detailed safe release/rollback plan. PR stays **draft/unmerged**.
- Dev branch `feature-kana02-offline-suggestions-20261031`: updated ONLY `sw.js` cache key from `20261031-kana02-buttons-fix1-dev-unreleased` to `20261031-kana02-rc1-ready-for-approval`, commit `aaf8aa3138d36aece459214cafa4bb07fed6e0e3`. No production change. Cached code URLs and assets unchanged.
- Rechecked GitHub main-vs-development: 4 files only (`index.html`, new `kana02-core.js`, new `kana02-addon.js`, `sw.js`), 0 behind main; original `app.js` and RX047 source blob hashes identical; PR draft and unmerged; main base commit `78d69fa8aa5b506e6e7bb9ad733a63c72b3c7865`.
- Clinical limitations: RX047 `.mswrx` covers medicine masters only; old `.mswdb` 105.2 MB is stale and full-photo patient recovery cannot be guaranteed. No destructive data restoration, no clearing storage/PWA uninstall. Code rollback never recovers lost IndexedDB.
- Next: do not merge until user's explicit authorization after risks explained; user prefers one operation at a time. On approval, merge dev PR and verify iPad mini Safari/PWA main patient count, bed positions, confirmed kana, and new action buttons without repeating exhaustive fake tests.

## 2026-10-31 KANA02 production merge authorized and complete
- User explicitly approved KANA02 production release after acknowledging the limits of the `.mswrx` medicine-only backup and the hold on full photo-inclusive split backup.
- PR #5 in `msw-ipadmini-app/msw-ipadmini-app.github.io` transitioned from draft to ready and successfully **merged into main**, merge commit `31599525ca7a0e0db899b72034c9cc967dcc653c`. Branch head merged: `aaf8aa3138d36aece459214cafa4bb07fed6e0e3`.
- Post-merge GitHub reads: PR #5 merged=true, state=closed; production main `index.html`, `sw.js`, `kana02-core.js`, `kana02-addon.js` exactly match approved dev branch. Production `app.js` still blob `d47702a132ca2c8f1d609166cda4d72b2d3872fc`, RX047 still `60d613894dca25022ee4e933db985d9df2983949`. Clinical DB name unchanged; no destructive patient operations, no backup restore.
- `index.html` includes both KANA02 scripts and SRI; production `sw.js` contains `20261031-kana02-rc1-ready-for-approval` cache key and both offline assets.
- **GitHub source merge fully verified, but user iPad mini Safari/PWA live application update and patient preservation still need confirmation.** Browser-source tool could not access the GitHub Pages URL (tool limitation). Do not claim actual iPad deployment success until user confirms.
- Next one action: on iPad mini open existing production application in Safari/PWA without clearing its data; inspect current patient count/bed assignment and check whether the two actions `＋患者（新規登録）` and `フリガナ一括確認` are present. If update is pending, use existing in-app update control only with sheet closed, then check again, one operation at a time. No reinstall, site-data deletion, or new backup request.

## 2026-10-31 KANA02 production iPad PWA screenshot confirms visibility
- User provided 2026-10-31 iPad mini production PWA screenshot after approved PR #5 merge.
- Screenshot visibly shows BOTH `＋患者（新規登録）` and `フリガナ一括確認（未確認49人）`; inpatient counter 50; patient bed map renders. No real patient names or bed-linked personal information is copied into this GitHub note.
- Header version suffix remains KANA01 as expected because core `app.js` is unchanged and KANA02 is an add-on. First screenshot-level production UI verification is passed.
- Still need user confirmation that existing count 50 and bed placement match pre-update; screenshot alone cannot establish absence of lost/changed clinical data. Do not run bulk confirmation or data destructive actions.

## KANA02 production rollout completed
- GitHub main PR #5 merge completed; production app code verified.
- User confirmed existing patient count remained 50 and ward bed layout unchanged.
- User confirmed both new KANA02 action buttons appear in production iPad PWA.
- User opened the batch furigana review and returned to the patient list using its Back button successfully.
- Production rollout checks completed; no live patient readings were bulk confirmed as part of deployment.
- Completion scope: deployment and non-destructive user interface checks. Recovery of all clinical data and pictures is not covered by the medicine master backup; split backup development stays on hold per user's decision.

## KANA02 fix1 isolated real-device candidate check
- User confirmed iPad Safari 12/12 in isolated static fake-name format-normalization test.
- A separate full-app fake integration stage was created at `kana02-batch-format-fix-fake-20261031/`, using its own dedicated fake IndexedDB, no SW, and four invented patient records. Browser-test stage code syntax and internal static integrity checks 13/13 passed; iPad real device still pending.
- Main app clinical DB and GitHub production branch are unchanged by fix work. Draft PR #7 remains unmerged; cause of all blank candidates in production not yet established.
- Issue #6 updated with details and safe fake validation link.

## KANA02 corrected fake batch preview 3/3 verified on iPad
- User reports the independent full-app fake stage showed four fake records and all three unconfirmed fake records displayed katakana candidate readings in its batch-review modal on iPad Safari.
- No confirmed flag or live patient data changed during this test. Full-app fake test scope passes candidate display; production issue #6 (49 empty candidates) remains unresolved, and draft PR #7 is **not merged**.
- Next is a production read-only observation to distinguish overall name suggestion vs batch-only failure. Do not repeat fake tests or request actual names, PIN, backups, or destructive actions.

## KANA02 production unspaced name and anonymized diagnostics
- User confirmed production display names are contiguous surname + given name, with no separating space. KANA02 already handles unspaced names for dictionary-recognized combinations; do not claim no-spaces itself caused the failure.
- Production batch 49/49 blank, one unconfirmed basic tab blank, placeholder displayed. Root cause not proven; no production hotfix merged.
- Draft-only PR #7 now also includes local, read-only aggregated candidate diagnostics: candidate found, surname candidate known but given unreadable, surname unknown, format ambiguity, empty name. Report only numbers and classification to user, never names, and perform no writes/transmissions.
- Fake standalone full-app stage `kana02-anon-diagnostic-fake-20261031/` was created with a new fake DB and four invented patients. Diagnostic callback check 9/9 pass; draft PR 4-file static integrity 8/8 pass, including matching SHA384 asset integrity and unchanged app.js/RX047.
- Next user action: open the new isolated fake diagnostics stage on iPad Safari and confirm four invented records display, then in a separate step test that counts report is 1/1/1. Do not request real names or change production before user approval.

## KANA02 anonymous diagnosis 1-1-1 iPad validation
- User confirmed read-only fictitious iPad integration test produces 1 candidate available / 1 known surname but unreadable given name / 1 unknown surname, matching predicted outcomes. Fake four-patient stage works on iPad Safari.
- Production all-blank issue is unresolved. Make diagnostic-only minimal PR separately from core-normalization draft PR #7, and seek explicit user approval before any production release.

## KANA02 diagnostic-only production candidate PR8
- User verified iPad mini Safari read-only count classification 1/1/1 using 4 invented patients in a fully isolated fake application.
- Diagnostic-only DRAFT pull request #8 in live production repo changes just addon/HTML/SW; existing core reading dictionary, app.js, RX047 and IndexedDB are unchanged. 10/10 minimal-diff checks; 5/5 isolated direct callback checks. Not merged or installed in production; explicit user authorization is required before deploying.
- Separate draft PR #7 contains possible name-separator fixes; root cause of the 49 production blanks is still unknown. No actual clinical data or name submitted to GitHub.

## KANA03 expanded offline name reading prototype
- 2026-10-31: User priority confirmed: automatically generate furigana from existing unsplit kanji names, not a diagnostic-only production update. Original KANA02 production with 49 blank candidates is unchanged; original diagnosis PR #8 and normalization PR #7 both remain unmerged.
- Licensed independent MIT-licensed source `shuheilocale/japanese-personal-name-dataset` copied as compact local candidate index to test path `kana03-dictionary-fake-20261031/` (1,999 surnames; 70,296 unique given-name spellings; 8 given-name index JS shards). See `THIRD_PARTY_NOTICES.txt`, copied original MIT license, original source hashes. Names are untrusted candidate readings, never verified without human confirmation.
- Prototype `kana03-core.js` recognizes concatenated surname+given without space, uses extended offline names as a fallback while respecting KANA02 common-reading priority, shows up to 8 alternatives, preserves confirmed and manually-entered readings, never sends or stores data itself. Fake standalone test 21/21 pass in code.
- Full isolated fake app `kana03-full-app-fake-20261031/` includes 5 synthetic inpatients (4 pending, one confirmed), alternate-reading dropdown only in batch view, new dedicated fake DB name. Static code/source integration 11/11 pass and all four invented surname+given readings match expected. User iPad mini Safari verification is pending.
- Next: user to open new full-app fake iPad test, confirm five patients display, then separately verify the four auto suggestions. No production deployment without explicit new authorization.

## KANA03 iPad Safari batch 4-of-4 candidate display
- iPad mini Safari operator confirmed `kana03-full-app-fake-20261031/` opens with five invented inpatients and the batch review shows automatic katakana candidate suggestions for **all four unconfirmed fake patients**. They had contiguous no-space surnames and given names. This is real-device UI verification, not production/real-patient proof.
- Prior isolated code checks 21/21 engine and 11/11 integration; next safe check: alternate-reading dropdown for one fake patient only. Do not confirm/save until explicitly testing that step. One confirmed fake patient remains protected.
- KANA03 has no production merge or deployment approval. Existing 50 patient records/49 pending are untouched. The earlier diagnostic-only PR #8 and normalization-only PR #7 were not merged.

## KANA03 iPad alternative-readings picker displayed
- User reported on iPad mini Safari in the isolated `kana03-full-app-fake-20261031/` test that tapping the 「別の読み候補を選ぶ」 control for invented 「宇都宮明子」 displays multiple katakana choices. This confirms alternate options open, but does NOT yet prove selection updates the preview input or is persisted. Next test: select one different fake reading (not Confirm); verify input text changes. No production update, no personal data.

## KANA03 alternate-reading selection updates input (iPad verified)
- User confirmed in iPad mini Safari fake-app batch screen: for fictional 「宇都宮明子」, choosing a different entry in the 「別の読み候補を選ぶ」 menu **updates the furigana input field to that chosen reading**. Candidate display 4/4 and choice list opening had already passed. No Confirm button was pressed yet; storage/persistence is untested.
- Next single safe test: press Confirm for this fake patient only; check the fake pending count decreases from 4 to 3, then in a later separate step verify saved text persists after opening again. Never use this test on production data; PRs unmerged and production unchanged.

## KANA03 fake confirmed reading excluded after reopening batch
- User's iPad mini Safari KANA03 full-app fake test: for 「宇都宮明子」 they selected a different furigana candidate, tapped 「確認」, observed status 「済」 and pending count changed 4→3. Then tapped 「← 戻る」 and successfully returned to the five-patient list. Reopening 「フリガナ一括確認」 showed only the other three pending fake patients, excluding 「宇都宮明子」. This establishes that the saved confirmed status is reflected after closing/reopening the modal, NOT yet that the reading persisted across a page reload or remains in the Basic tab. No production changes or real patient names.
- Next: leave the batch dialog and inspect 「宇都宮明子」 in its Basic tab, then eventually verify page reload persistence. Follow one tap at a time.

## KANA03 selected alternate confirmed in Basic tab
- On iPad mini Safari in the isolated five-fake-patient KANA03 test, the user confirmed that after selecting a different reading for fictitious 「宇都宮明子」 and pressing 「確認」, the patient was removed from the batch pending list (4→3), could be opened in the patient information view, and the **Basic** tab showed the selected reading with confirmation button 「済」.
- Cross-view linkage on the same live browser session PASSED. **Persistence across browser reload remains untested**; next action is a single Safari reload followed by separate UI checks. Production remains untouched.
