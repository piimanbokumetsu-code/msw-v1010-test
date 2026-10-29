MSW 実名OCR専用のオフライン確認プロトタイプ（開発専用・本番未承認）。
現場許可あり。実名をChatGPT/GitHubにアップロードしない。初回準備はオンラインで静的エンジンを取得、全OCR部品をCache APIに保存し、写真の読み込み前にオフラインで架空文字を認識して動作確認する。画像とOCR結果はメモリのみ、保存・アップロード・患者登録なし。PWAの独立したService Workerスコープと通信のホワイトリスト。現場書式は未知のため、全文日本語OCR結果のみ表示し、患者氏名・人数・日付を自動分離/登録しない。iPad Safariの実機検証未完了、実名画像は動作検証合格まで読み込まない。

2026-10-29 offline hotfix: OCR JS, worker, core wasm/js, traineddata were mirrored as identical Git blobs within this service worker scope. Fixed external-scope dependency. Cache version 02. Prior versions left untouched. After deployment, online reload page and repeat OCR asset preparation before testing offline. Never load real names until on-device verification passes.
