/* Medical Admission Tracker — navigation + compatibility fix for every existing view.
 * Runs after module scripts, uses the real window.app when available and has an
 * independent fallback for the two new feature views.
 */
(function (window, document) {
  'use strict';
  var FEATURE_IDS = Object.freeze({
    'medical-hsc-info': 'view-medical-hsc-info',
    'student-life-support': 'view-student-life-support'
  });
  var patchedApp = null;

  function getViewId(name) {
    // The app consistently names its sections view-<name>.
    return 'view-' + name;
  }

  function markActive(viewName) {
    document.querySelectorAll('.nav-btn, [data-feature-view], [data-nav-view]').forEach(function (el) {
      var handler = el.getAttribute('onclick') || '';
      var active = el.getAttribute('data-feature-view') === viewName ||
        el.getAttribute('data-nav-view') === viewName ||
        handler.indexOf("showView('" + viewName + "')") !== -1 ||
        handler.indexOf('showView("' + viewName + '")') !== -1;
      el.classList.toggle('active', active);
      if (active) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
  }

  function closeMobileMenu() {
    ['mobileMenu', 'mobile-menu', 'mobile-menu-panel'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.classList.contains('hidden')) el.classList.add('hidden');
    });
  }

  function showIndependent(viewName) {
    var id = FEATURE_IDS[viewName];
    var target = id && document.getElementById(id);
    if (!target) {
      console.error('[FeatureNavigation] Missing section:', id || viewName);
      return false;
    }
    document.querySelectorAll('main .view-section').forEach(function (section) {
      section.classList.add('hidden');
      section.setAttribute('aria-hidden', 'true');
    });
    target.classList.remove('hidden');
    target.setAttribute('aria-hidden', 'false');
    markActive(viewName);
    closeMobileMenu();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
  }

  function installAppViewCompatibility() {
    var app = window.app;
    if (!app || typeof app.showView !== 'function' || patchedApp === app) return;

    // Current script.js overrides the class method with an incomplete view map.
    // This single post-load wrapper resolves views by their actual HTML section IDs,
    // so question-bank/practice/exam-intro/previous/setup continue working too.
    app.showView = function (viewName, force) {
      var targetId = getViewId(viewName);
      var target = document.getElementById(targetId);
      if (!target || !target.classList.contains('view-section')) {
        console.warn('[Navigation] Unknown or missing view:', viewName);
        return false;
      }

      if (app.examActive && app.examState && !app.examState.submitted && !force && viewName !== 'exam') {
        if (typeof app.confirmSubmitExam === 'function') app.confirmSubmitExam('navigation');
        return false;
      }

      document.querySelectorAll('main .view-section').forEach(function (section) {
        var active = section === target;
        section.classList.toggle('hidden', !active);
        section.setAttribute('aria-hidden', String(!active));
      });
      document.body.classList.toggle('exam-active', viewName === 'exam');
      if (viewName === 'exam') {
        try { window.history.pushState({ exam: true }, '', '#exam'); } catch (_error) { /* no-op */ }
      }
      markActive(viewName);
      closeMobileMenu();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return true;
    };
    patchedApp = app;
  }

  function bindFeatureButtons() {
    document.querySelectorAll('[data-feature-view]').forEach(function (button) {
      if (button.dataset.featureNavReady === '1') return;
      button.dataset.featureNavReady = '1';
      button.addEventListener('click', function (event) {
        event.preventDefault();
        var name = button.getAttribute('data-feature-view');
        installAppViewCompatibility();
        if (window.app && typeof window.app.showView === 'function') {
          var result = window.app.showView(name);
          if (result !== false) {
            markActive(name);
            closeMobileMenu();
            return;
          }
        }
        showIndependent(name);
      });
    });
  }

  function initialise() {
    installAppViewCompatibility();
    bindFeatureButtons();
  }

  window.MedicalTrackerNavigation = Object.freeze({ show: showIndependent, install: installAppViewCompatibility });
  window.navigateFeatureView = showIndependent;

  // `interactive` can occur before module scripts execute; waiting until DOMContentLoaded
  // ensures root script.js has had a chance to publish window.app.
  if (document.readyState === 'complete') initialise();
  else document.addEventListener('DOMContentLoaded', initialise, { once: true });
})(window, document);
