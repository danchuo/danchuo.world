/**
 * The font gate: the board stays hidden until the wave's fonts arrive, so it appears dressed
 * rather than re-lettering widget by widget. `document.fonts.ready` MUST be asked only after the
 * first layout — before it the font set is empty and answers "ready" at once. DESIGN §7.10
 */
export const FONT_GATE_TIMEOUT_MS = 1200;

export const FONT_GATE_SCRIPT = `(function(){
  var r = document.documentElement;
  var done = function(){ r.setAttribute("data-fonts", "ready"); };
  try {
    r.setAttribute("data-fonts", "pending");
    setTimeout(done, ${FONT_GATE_TIMEOUT_MS});
    var f = document.fonts;
    if (!f || !f.ready || !f.ready.then) return done();
    var wait = function(){
      try { void document.body.offsetHeight; } catch (e) {}
      f.ready.then(done, done);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait);
    else wait();
  } catch (e) { done(); }
})();`;

/**
 * Subscription to the gate opening, for those who need more than hiding: the backdrop CUTS its
 * ribbon by a measured character and must recompute once the real face arrives. It reads the
 * gate's state rather than `document.fonts.ready`, which is only trustworthy behind it.
 */
export function onFontsReady(run: () => void): () => void {
  const root = document.documentElement;
  if (root.getAttribute("data-fonts") !== "pending") {
    run();
    return () => {};
  }
  const observer = new MutationObserver(() => {
    if (root.getAttribute("data-fonts") === "pending") return;
    observer.disconnect();
    run();
  });
  observer.observe(root, { attributes: true, attributeFilter: ["data-fonts"] });
  return () => observer.disconnect();
}
