/**
 * The paint gate: the board stays hidden until the wave's fonts arrive AND its first data has, so
 * it appears dressed and filled rather than assembling itself in front of the reader. Two halves,
 * because they open on different signals and either may be the slower one. DESIGN §7.10
 */
export const FONT_GATE_TIMEOUT_MS = 1200;

/**
 * The data half's ceiling. Past it the board is shown whatever the network is doing, and the tiles
 * answer for themselves with their own empty and error states — a blank page is never the answer.
 */
export const BOARD_GATE_TIMEOUT_MS = 2000;

/**
 * The weights the board sets its type in. A face is a FILE PER WEIGHT and `document.fonts.ready`
 * answers only for those already asked for, so the gate asks for all of them. DESIGN §8.3
 */
const GATE_WEIGHTS = [400, 500, 600, 700];

/** Digits and Cyrillic together: `fonts.load` fetches only the subsets its sample text needs. */
const GATE_SAMPLE = "0123456789чмин";

/** `document.fonts.ready` MUST be asked only after the first layout: before it the set is empty. */
export const FONT_GATE_SCRIPT = `(function(){
  var r = document.documentElement;
  var done = function(){ r.setAttribute("data-fonts", "ready"); };
  try {
    r.setAttribute("data-fonts", "pending");
    r.setAttribute("data-board", "pending");
    setTimeout(function(){ r.setAttribute("data-board", "ready"); }, ${BOARD_GATE_TIMEOUT_MS});
    setTimeout(done, ${FONT_GATE_TIMEOUT_MS});
    var f = document.fonts;
    if (!f || !f.ready || !f.ready.then) return done();
    var wait = function(){
      try { void document.body.offsetHeight; } catch (e) {}
      var jobs = [];
      try {
        var cs = getComputedStyle(r);
        ["--font-sans", "--font-mono", "--font-display"].forEach(function(name){
          var family = cs.getPropertyValue(name).trim();
          if (!family) return;
          ${JSON.stringify(GATE_WEIGHTS)}.forEach(function(w){
            try { jobs.push(f.load(w + " 1rem " + family, ${JSON.stringify(GATE_SAMPLE)})); } catch (e) {}
          });
        });
      } catch (e) {}
      Promise.all(jobs.map(function(p){ return p.catch(function(){}); }))
        .then(function(){ return f.ready; })
        .then(done, done);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait);
    else wait();
  } catch (e) { done(); r.setAttribute("data-board", "ready"); }
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

/** Opens the data half of the gate. Idempotent: the script's ceiling may have opened it already. */
export function openBoardGate(): void {
  document.documentElement.setAttribute("data-board", "ready");
}
