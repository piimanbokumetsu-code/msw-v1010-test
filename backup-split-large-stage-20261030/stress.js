'use strict';
(() => {
  // Standalone stress probe. No IndexedDB, downloads, real photos, or patient access.
  const $ = id => document.getElementById(id);
  const startButton = $('start'), stopButton = $('stop'), result = $('result');
  const COUNT = 130, PHOTO_CHARS = 1100000, MAX_PART = 4 * 1024 * 1024;
  const REQUIRED_TOTAL = 120 * 1024 * 1024;
  let running = false, cancelled = false;
  const mib = bytes => (bytes / (1024 * 1024)).toFixed(1);
  const paint = message => { result.textContent = message; };
  async function run() {
    if (running) return;
    running = true; cancelled = false;
    startButton.disabled = true; stopButton.disabled = false;
    let emitted = 0, total = 0, largest = 0;
    const started = performance.now();
    paint('準備中：架空データのみ（保存・ダウンロードなし）');
    try {
      if (!globalThis.crypto?.subtle || typeof MSWSplitV04 === 'undefined')
        throw Error('Web Cryptoまたは分割処理部品を読み込めません');
      await new Promise(resolve => setTimeout(resolve, 20));
      // The same synthetic string is reused for each fake record; create() must
      // serialize/hash/emit individual parts, never collect the entire backup.
      const ct = 'A'.repeat(PHOTO_CHARS);
      const fake = Object.freeze({iv:'AAAAAAAAAAAAAAAA', ct});
      const photoIds = Array.from({length:COUNT}, (_,i) => 'fake' + String(i + 1).padStart(4, '0'));
      const core = {meta:{salt:'ZmFrZQ==', check:{iv:'AAAAAAAAAAAAAAAA',ct:'AAAA'}},
                    data:{iv:'AAAAAAAAAAAAAAAA',ct:'AAAA'}};
      const names = new Set();
      const manifest = await MSWSplitV04.create({
        ...core, photoIds, maxBytes:MAX_PART,
        getPhoto: async () => { if (cancelled) throw Error('利用者が中断しました'); return fake; },
        onPart: async (info, blob) => {
          if (cancelled) throw Error('利用者が中断しました');
          if (names.has(info.name) || info.sequence !== emitted + 1 ||
              blob.size !== info.bytes || info.bytes > MAX_PART ||
              !/^[0-9a-f]{64}$/.test(info.sha256))
            throw Error('パートの番号・サイズ・ハッシュ形式に問題があります');
          names.add(info.name);
          emitted += 1; total += info.bytes; largest = Math.max(largest, info.bytes);
          paint('処理中：' + emitted + 'パート作成\n累計 ' + mib(total) +
            'MiB（架空データ）\n最大パート ' + mib(largest) + 'MiB\n保存ファイル数 0');
          // Yield to Safari so progress paints and cancellation remains responsive.
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      });
      const m = JSON.parse(await manifest.blob.text());
      if (m.format !== 'MSWDB-SPLIT-V04' || m.partCount !== emitted ||
          m.parts.length !== emitted || m.photoCount !== COUNT ||
          m.parts.reduce((sum,p) => sum + p.bytes, 0) !== total ||
          m.parts.some(p => p.bytes > MAX_PART) ||
          total <= REQUIRED_TOTAL)
        throw Error('容量・分割管理ファイルの検証に失敗');
      const elapsed = ((performance.now() - started)/1000).toFixed(1);
      paint('合格：120MiBを超える架空データの逐次分割\n' +
        '合計 ' + mib(total) + 'MiB／架空レコード ' + COUNT + '件\n' +
        '分割パート ' + emitted + '件／最大 ' + mib(largest) + 'MiB\n' +
        '処理時間 ' + elapsed + '秒\n実ファイル保存 0件（端末容量を消費しない）\n' +
        '※実際の大容量復元・本番反映は未検証');
    } catch (e) {
      paint((cancelled ? '中断：' : '不合格：') + (e?.message || String(e)) +
        '\n処理済み ' + mib(total) + 'MiB／パート ' + emitted + '件\n' +
        '既存アプリと保存データには一切変更なし');
    } finally {
      running = false;
      startButton.disabled = false; stopButton.disabled = true;
    }
  }
  startButton.addEventListener('click', run);
  stopButton.addEventListener('click', () => {
    if (running) {cancelled = true; stopButton.disabled = true;}
  });
})();