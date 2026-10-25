"use strict";
const { Plugin } = require("obsidian");

const MARK = "__trackpad_swipe_nav__:";

// Gesture detector. It runs in Obsidian and also inside each web viewer page,
// because wheel events over a web page do not reach Obsidian's document.
// One swipe = a run of wheel events with gaps shorter than 250 ms.
// It fires at most once per swipe, so the macOS momentum tail does not fire again.
function makeDetector(fire) {
  const GESTURE_GAP_MS = 250;
  const THRESHOLD_PX = 120;
  const DOMINANCE = 2;
  let dx = 0, dy = 0, last = 0, done = false;

  // True if an element under the pointer can still scroll horizontally in this direction.
  function canScrollX(el, d) {
    for (; el && el.nodeType === 1; el = el.parentElement) {
      if (el.scrollWidth <= el.clientWidth + 1) continue;
      const ox = getComputedStyle(el).overflowX;
      const root = el === document.scrollingElement;
      if (!root && ox !== "auto" && ox !== "scroll") continue;
      if (d < 0 && el.scrollLeft > 0) return true;
      if (d > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
    }
    return false;
  }

  return function onWheel(e) {
    const now = Date.now();
    if (now - last > GESTURE_GAP_MS) { dx = 0; dy = 0; done = false; }
    last = now;
    if (e.ctrlKey || done) return;

    // A swipe that starts inside a wide table, code block or page scrolls it instead.
    if (dx === 0 && e.deltaX !== 0 && canScrollX(e.target, e.deltaX)) { done = true; return; }

    dx += e.deltaX;
    dy += e.deltaY;
    if (Math.abs(dx) < THRESHOLD_PX || Math.abs(dx) < Math.abs(dy) * DOMINANCE) return;

    done = true;
    // Natural scrolling: fingers move right -> deltaX < 0 -> back, as in Safari.
    fire(dx < 0 ? "back" : "forward");
  };
}

const GUEST_SCRIPT = `(() => {
  if (window.__trackpadSwipeNav) return;
  window.__trackpadSwipeNav = true;
  const onWheel = (${makeDetector.toString()})((dir) => console.log(${JSON.stringify(MARK)} + dir));
  window.addEventListener("wheel", onWheel, { passive: true, capture: true });
})();`;

module.exports = class TrackpadSwipeNav extends Plugin {
  onload() {
    this.hooked = new WeakSet();
    this.registerDomEvent(document, "wheel", makeDetector((dir) => this.go(dir)), { passive: true });

    this.app.workspace.onLayoutReady(() => this.hookWebviews());
    this.registerEvent(this.app.workspace.on("layout-change", () => this.hookWebviews()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.hookWebviews()));
  }

  go(dir) {
    this.app.commands.executeCommandById(dir === "back" ? "app:go-back" : "app:go-forward");
  }

  hookWebviews() {
    for (const wv of document.querySelectorAll("webview")) {
      if (this.hooked.has(wv)) continue;
      this.hooked.add(wv);

      const inject = () => wv.executeJavaScript(GUEST_SCRIPT).catch(() => {});
      const onConsole = (e) => {
        if (typeof e.message !== "string" || !e.message.startsWith(MARK)) return;
        // Navigate the pane that holds this web page, not only the active pane.
        const leaf = this.app.workspace.getLeavesOfType("webviewer")
          .find((l) => l.view.containerEl.contains(wv));
        if (leaf) this.app.workspace.setActiveLeaf(leaf, { focus: false });
        this.go(e.message.slice(MARK.length));
      };

      wv.addEventListener("dom-ready", inject);
      wv.addEventListener("console-message", onConsole);
      this.register(() => {
        wv.removeEventListener("dom-ready", inject);
        wv.removeEventListener("console-message", onConsole);
      });
      inject();
    }
  }
};
