/* Consistent animated ellipsis for loading/status messages.
 * Text-node hydration is chunked and starts after page load, never during first paint.
 */
(function () {
  'use strict';
  if (window.__matAnimatedLoadingDotsInstalled) return;
  window.__matAnimatedLoadingDotsInstalled = true;

  var style = document.createElement('style');
  style.id = 'mat-animated-loading-dots-style';
  style.textContent = [
    '@keyframes matLoadingDotPulse { 0%,60%,100% { opacity:.28; transform:translateY(0) } 30% { opacity:1; transform:translateY(-3px) } }',
    '.mat-animated-loading-dots { display:inline-flex; align-items:center; gap:3px; margin-left:3px; vertical-align:middle; white-space:nowrap; }',
    '.mat-animated-loading-dots > span { display:inline-block; width:4px; height:4px; border-radius:50%; background:currentColor; opacity:.35; animation:matLoadingDotPulse 1.15s infinite ease-in-out; }',
    '.mat-animated-loading-dots > span:nth-child(2) { animation-delay:.16s }',
    '.mat-animated-loading-dots > span:nth-child(3) { animation-delay:.32s }',
    '@media (prefers-reduced-motion:reduce) { .mat-animated-loading-dots > span { animation:none; opacity:.85; } }'
  ].join('\n');
  (document.head || document.documentElement).appendChild(style);

  var loadingCue = /(loading|granting|revoking|adding|removing|approving|rejecting|extending|cancelling|deleting|updating|disabling|enabling|লোড\s*হচ্ছে|load\s*হচ্ছে|saving|save\s*হচ্ছে|সেভ\s*হচ্ছে|যাচাই\s*হচ্ছে|তৈরি\s*হচ্ছে|আনা\s*হচ্ছে|নিশ্চিত\s*করা\s*হচ্ছে|হিসাব\s*করে\s*আনা\s*হচ্ছে|converting|please\s*wait|প্রস্তুত\s*হচ্ছে)/i;
  var scanQueue = [];
  var queuedRoots = new WeakSet();
  var scanScheduled = false;

  function enhanceTextNode(node) {
    if (!node || node.nodeType !== 3 || !node.nodeValue || !/[.…]{1,3}\s*$/.test(node.nodeValue)) return;
    var parent = node.parentElement;
    if (!parent || parent.closest('.mat-animated-loading-dots,script,style,textarea,input,pre,code,svg')) return;
    var match = node.nodeValue.match(/(\.{3}|…)(\s*)$/);
    if (!match) return;
    var context = (parent.textContent || '').trim();
    if (!loadingCue.test(context) || (parent.querySelector && parent.querySelector('.mat-animated-loading-dots'))) return;

    var before = node.nodeValue.slice(0, match.index);
    node.nodeValue = before + match[2];
    var dots = document.createElement('span');
    dots.className = 'mat-animated-loading-dots';
    dots.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 3; i++) dots.appendChild(document.createElement('span'));
    parent.insertBefore(dots, node.nextSibling);
  }

  function scheduleScan() {
    if (scanScheduled || !scanQueue.length) return;
    scanScheduled = true;
    var run = function (deadline) {
      scanScheduled = false;
      var processed = 0;
      while (scanQueue.length && processed < 120 &&
        (!deadline || deadline.timeRemaining() > 2 || processed === 0)) {
        var walker = scanQueue[0];
        var node = walker.nextNode();
        if (!node) {
          scanQueue.shift();
          continue;
        }
        enhanceTextNode(node);
        processed += 1;
      }
      if (scanQueue.length) scheduleScan();
    };
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 1000 });
    } else {
      window.setTimeout(function () { run(null); }, 32);
    }
  }

  function queueScan(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      enhanceTextNode(root);
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.nodeType === 1 && root.matches('.mat-animated-loading-dots,script,style,textarea,input,pre,code,svg')) return;
    if (queuedRoots.has(root)) return;
    queuedRoots.add(root);
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentElement;
        if (!parent || parent.closest('.mat-animated-loading-dots,script,style,textarea,input,pre,code,svg')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    scanQueue.push(walker);
    scheduleScan();
  }

  function start() {
    if (!document.body) return;
    var observer = new MutationObserver(function (records) {
      records.forEach(function (record) {
        if (record.type === 'characterData') enhanceTextNode(record.target);
        else record.addedNodes.forEach(queueScan);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    queueScan(document.body);
  }

  function scheduleStart() {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(start, { timeout: 1800 });
    } else {
      window.setTimeout(start, 250);
    }
  }

  if (document.readyState === 'complete') scheduleStart();
  else window.addEventListener('load', scheduleStart, { once: true });
})();
