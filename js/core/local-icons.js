/* Convert existing Font Awesome class markup to same-origin SVG sprite references. */
(function () {
  'use strict';
  var sprite = './public/assets/icons/fontawesome.svg';
  var ignored = new Set([
    'solid','regular','brands','spin','pulse','fw','ul','li','border','inverse',
    'pull-left','pull-right','flip-horizontal','flip-vertical','rotate-90','rotate-180',
    'rotate-270','beat','fade','bounce','shake','beat-fade','flip','spin-pulse','spin-reverse',
    'xs','sm','lg','xl','2xl','2x','3x','4x','5x','6x','7x','8x','9x'
  ]);
  function updateIcon(node) {
    if (!node || node.nodeType !== 1 || node.tagName !== 'I') return;
    var classes = Array.prototype.slice.call(node.classList || []);
    var family = classes.indexOf('fa-brands') >= 0 || classes.indexOf('fab') >= 0 ? 'brands'
      : classes.indexOf('fa-regular') >= 0 || classes.indexOf('far') >= 0 ? 'regular' : 'solid';
    var name = classes.find(function (value) {
      return value.indexOf('fa-') === 0 && !ignored.has(value.slice(3));
    });
    if (!name) return;
    name = name.slice(3);
    var symbol = 'fa-' + family + '-' + name;
    var svg = node.querySelector(':scope > svg[data-local-fa-use]');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('data-local-fa-use', '');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', sprite + '#' + symbol);
      use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', sprite + '#' + symbol);
      svg.appendChild(use);
      node.appendChild(svg);
    } else {
      var useNode = svg.querySelector('use');
      if (useNode) {
        useNode.setAttribute('href', sprite + '#' + symbol);
        useNode.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', sprite + '#' + symbol);
      }
    }
    node.classList.add('fa-local-icon-host');
  }
  function scan(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName === 'I') updateIcon(node);
    if (node.querySelectorAll) node.querySelectorAll('i[class*="fa-"]').forEach(updateIcon);
  }
  function start() {
    scan(document.documentElement);
    var observer = new MutationObserver(function (records) {
      records.forEach(function (record) {
        if (record.type === 'attributes') updateIcon(record.target);
        else record.addedNodes.forEach(scan);
      });
    });
    observer.observe(document.documentElement, {
      subtree: true, childList: true, attributes: true, attributeFilter: ['class']
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
