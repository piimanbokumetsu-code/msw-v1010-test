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
