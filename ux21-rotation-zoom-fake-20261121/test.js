/* UX21: fake-only viewport/orientation experiment. Does not read or write storage.
   Never sends patient information or PINs. No automatic reload.
   Rotation-only conditional viewport recalibration; restores zoom capability. */
(function () {
  'use strict';
  const lock = document.getElementById('lockScene');
  const patients = document.getElementById('patientScene');
  const viewport = document.querySelector('meta[name="viewport"]');
  const original = viewport ? viewport.content : 'width=device-width,initial-scale=1,viewport-fit=cover';
  const normal = original;
  const reset = normal + ',minimum-scale=1,maximum-scale=1';
  const result = document.getElementById('result');
  const metrics = document.getElementById('metrics');
  const action = document.getElementById('actionInfo');
  let orientation = window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';
  let resizeCheck = 0;
  let calibrationId = 0;
  let lastReason = '初期表示';

  function measurements() {
    const vv = window.visualViewport;
    const scale = Number(vv && vv.scale || 1);
    const layoutWidth = document.documentElement.clientWidth;
    const overflow = Math.max(0, document.documentElement.scrollWidth - layoutWidth);
    return { scale, layoutWidth, overflow, inner: window.innerWidth, visible: vv ? vv.width : window.innerWidth };
  }

  function renderStatus() {
    const m = measurements();
    const mode = window.matchMedia('(orientation: landscape)').matches ? '横' : '縦';
    const measuredZoom = m.scale > 1.06;
    const measuredOverflow = m.overflow > 3;
    result.textContent = measuredZoom || measuredOverflow ? '画面サイズを確認してください' : '表示倍率の計測：正常範囲';
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    metrics.textContent = (standalone ? 'PWA' : 'Safari') + '・' + mode + '｜倍率 ' + m.scale.toFixed(2) + '｜画面幅 ' + m.layoutWidth + '｜はみ出し ' + m.overflow + 'px';
    action.textContent = lastReason + '（実際の見た目でも判断してください）';
  }

  function recalibrate(reason) {
    const m = measurements();
    lastReason = reason;
    // Reflow layout for orientation; no zoom changes when already at 1x.
    document.documentElement.style.setProperty('--ux21-viewport-width', window.innerWidth + 'px');
    if (!viewport || m.scale <= 1.06) {
      renderStatus();
      return;
    }
    const token = ++calibrationId;
    // Temporary scale constraint only on initial load/physical rotation.
    // This is deliberately not a permanent pinch-zoom prohibition.
    viewport.setAttribute('content', reset);
    window.setTimeout(function () {
      if (token !== calibrationId) return;
      viewport.setAttribute('content', normal);
      window.requestAnimationFrame(renderStatus);
    }, 130);
  }

  function orientationCheck(source) {
    const now = window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';
    if (now !== orientation) {
      orientation = now;
      window.setTimeout(function () { recalibrate('回転後に再調整'); }, 260);
      window.setTimeout(function () { recalibrate('回転後の再確認'); }, 820);
    } else {
      renderStatus();
    }
  }

  document.getElementById('unlockDemo').addEventListener('click', function () {
    document.getElementById('dummyPin').value = '';
    lock.classList.add('hidden');
    patients.classList.remove('hidden');
    window.scrollTo(0, 0);
    renderStatus();
  });
  document.getElementById('backLock').addEventListener('click', function () {
    patients.classList.add('hidden');
    lock.classList.remove('hidden');
    window.scrollTo(0, 0);
    renderStatus();
  });

  window.addEventListener('orientationchange', function () { orientationCheck('orientationchange'); }, { passive: true });
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeCheck);
    resizeCheck = window.setTimeout(function () { orientationCheck('resize'); }, 100);
  }, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', renderStatus, { passive: true });
  }
  // Initial boot check after Safari has settled the first layout.
  window.setTimeout(function () { recalibrate('起動後の倍率確認'); }, 280);
  renderStatus();
}());
