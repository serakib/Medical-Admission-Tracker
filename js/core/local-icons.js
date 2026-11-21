/* Convert existing Font Awesome class markup to same-origin SVG sprite references.
 * Initial icon hydration is chunked so large hidden views cannot block first paint.
 */
(function () {
  'use strict';

  var sprite = './public/assets/icons/fontawesome.svg';
  var ignored = new Set([
    'solid','regular','brands','spin','pulse','fw','ul','li','border','inverse',
    'pull-left','pull-right','flip-horizontal','flip-vertical','rotate-90','rotate-180',
    'rotate-270','beat','fade','bounce','shake','beat-fade','flip','spin-pulse','spin-reverse',
    'xs','sm','lg','xl','2xl','2x','3x','4x','5x','6x','7x','8x','9x'
  ]);
  var scanQueue = [];
  var queuedRoots = new WeakSet();
  var scheduled = false;

  function updateIcon(node) {
    if (!node || node.nodeType !== 1 || node.tagName !== 'I') return;
    var classes = Array.prototype.slice.call(node.classList || []);
    var family = classes.indexOf('fa-brands') >= 0 || classes.indexOf('fab') >= 0 ? 'brands'
      : classes.indexOf('fa-regular') >= 0 || classes.indexOf('far') >= 0 ? 'regular' : 'solid';
    var name = classes.find(function (value) {
      return value.indexOf('fa-') === 0 && !ignored.has(value.slice(3));
    });
    if (!name) return;

    var symbol = 'fa-' + family + '-' + name.slice(3);
    var svg = node.querySelector(':scope > svg[data-local-fa-use]');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('data-local-fa-use', '');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      svg.appendChild(use);
      node.appendChild(svg);
    }

    if (node.getAttribute('data-local-fa-symbol') !== symbol) {
      var useNode = svg.querySelector('use');
      if (useNode) {
        useNode.setAttribute('href', sprite + '#' + symbol);
        useNode.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', sprite + '#' + symbol);
      }
      node.setAttribute('data-local-fa-symbol', symbol);
    }
    if (!node.classList.contains('fa-local-icon-host')) node.classList.add('fa-local-icon-host');
  }

  function enqueueTree(root) {
    if (!root || root.nodeType !== 1 || queuedRoots.has(root)) return;
    queuedRoots.add(root);
    if (root.tagName === 'I' && root.matches('i[class*="fa-"]')) updateIcon(root);
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (node) {
        return node.tagName === 'I' && node.matches('i[class*="fa-"]')
          ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    scanQueue.push(walker);
    schedule();
  }

  function processQueue(deadline) {
    scheduled = false;
    var processed = 0;
    while (scanQueue.length && processed < 100 &&
      (!deadline || deadline.timeRemaining() > 2 || processed < 30)) {
      var walker = scanQueue[0];
      var node = walker.nextNode();
      if (!node) {
        scanQueue.shift();
        continue;
      }
      updateIcon(node);
      processed += 1;
    }
    if (scanQueue.length) schedule();
  }

  function schedule() {
    if (scheduled || !scanQueue.length) return;
    scheduled = true;
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(processQueue, { timeout: 300 });
    } else {
      window.setTimeout(function () { processQueue(null); }, 24);
    }
  }

  function start() {
    var observer = new MutationObserver(function (records) {
      records.forEach(function (record) {
        if (record.type === 'attributes') {
          if (record.target && record.target.tagName === 'I') updateIcon(record.target);
        } else {
          record.addedNodes.forEach(enqueueTree);
        }
      });
    });
    observer.observe(document.documentElement, {
      subtree: true, childList: true, attributes: true, attributeFilter: ['class']
    });
    enqueueTree(document.documentElement);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
