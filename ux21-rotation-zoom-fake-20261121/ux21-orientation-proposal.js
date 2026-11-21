/* UX21 proposal -- NOT linked to production.
   Only a conditional check for unintended zoom on initial startup or
   a *physical orientation change*. Never changes storage, patient records,
   PIN handling, print UI or screen-navigation behavior.
   WebKit may ignore temporary viewport scaling; test in fake PWA first. */
(function(){
  'use strict';
  var viewport = document.querySelector('meta[name="viewport"]');
  if (!viewport) return;
  var original = viewport.getAttribute('content');
  if (!original || original.indexOf('width=device-width') < 0) return;
  var previousOrientation = window.matchMedia('(orientation:landscape)').matches ? 'landscape' : 'portrait';
  var pending = 0;
  var debounce = 0;
  function checkScale() {
    if (window.matchMedia('print').matches) return;
    var v = window.visualViewport;
    if (!v || !(v.scale > 1.06)) return;
    var run = ++pending;
    // Transient constraint, always restored. Do not block normal pinch zoom.
    viewport.setAttribute('content', original+',minimum-scale=1,maximum-scale=1');
    window.setTimeout(function(){
      if (run !== pending) return;
      viewport.setAttribute('content', original);
    }, 130);
  }
  function onOrientationSample() {
    var current = window.matchMedia('(orientation:landscape)').matches ? 'landscape' : 'portrait';
    if (current === previousOrientation) return;
    previousOrientation = current;
    window.setTimeout(checkScale, 280);
    window.setTimeout(checkScale, 830);
  }
  window.addEventListener('orientationchange', onOrientationSample, {passive:true});
  window.addEventListener('resize', function(){
    window.clearTimeout(debounce);
    debounce = window.setTimeout(onOrientationSample, 110);
  }, {passive:true});
  window.setTimeout(checkScale, 300);
})();
