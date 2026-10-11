
/* Medical Admission Tracker - View Navigation Fix */
(function () {
  "use strict";

  const extraViews = {
    "medical-hsc-info": "view-medical-hsc-info",
    "student-life-support": "view-student-life-support"
  };

  function openExtraView(viewName) {
    const targetId = extraViews[viewName];
    if (!targetId) return false;

    const target = document.getElementById(targetId);

    if (!target) {
      console.error("View not found: #" + targetId);
      return true;
    }

    document.querySelectorAll(".view-section").forEach(function (section) {
      section.classList.add("hidden");
    });

    target.classList.remove("hidden");

    document.querySelectorAll(".nav-btn").forEach(function (button) {
      button.classList.remove("active");

      const onclick = button.getAttribute("onclick") || "";

      if (
        onclick.includes("showView('" + viewName + "')") ||
        onclick.includes('showView("' + viewName + '")')
      ) {
        button.classList.add("active");
      }
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
    return true;
  }

  function installPatch() {
    if (!window.app || typeof window.app.showView !== "function") {
      console.error(
        "app.showView not found. Load this script after your main app JavaScript."
      );
      return;
    }

    if (window.app.showView.__extraViewsPatch) return;

    const originalShowView = window.app.showView.bind(window.app);

    function patchedShowView(viewName) {
      if (
        Object.prototype.hasOwnProperty.call(extraViews, viewName)
      ) {
        openExtraView(viewName);
        return;
      }

      return originalShowView(viewName);
    }

    patchedShowView.__extraViewsPatch = true;
    window.app.showView = patchedShowView;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installPatch, {
      once: true
    });
  } else {
    installPatch();
  }
})();
