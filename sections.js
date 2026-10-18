// Animações das seções: entrada suave ao rolar e um pequeno glifo ASCII animado
// ao lado de cada título, que só roda enquanto a seção está na tela.
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- entrada ao rolar ----------

  const groups = [
    "section h2",
    "section .lead",
    "section .role",
    "section .subhead",
    "section > p",
    ".skills > div",
    ".facts > div",
    ".projects > li",
    ".contact > li",
  ];
  const items = document.querySelectorAll(groups.join(","));

  if (!reduced && "IntersectionObserver" in window) {
    document.documentElement.classList.add("js-reveal");
    items.forEach((el) => {
      const siblings = [...el.parentElement.children].filter((c) => c.matches(groups.join(",")));
      el.style.setProperty("--d", Math.min(siblings.indexOf(el), 6) * 70 + "ms");
      el.classList.add("reveal");
    });
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        en.target.classList.add("in");
        io.unobserve(en.target);
      }
    }, { rootMargin: "0px 0px -8% 0px" });
    items.forEach((el) => io.observe(el));
  }

  // ---------- glifos ----------

  const W = 14;
  const glyphs = {
    // uma faixa do campo do topo
    wave(f) {
      const ramp = " .:-=+*#";
      let s = "";
      for (let i = 0; i < W; i++) {
        const v = (Math.sin(i * 0.7 - f * 0.35) + Math.sin(i * 0.31 + f * 0.21)) / 4 + 0.5;
        s += ramp[Math.min(ramp.length - 1, Math.floor(v * ramp.length))];
      }
      return s;
    },
    // dado indo e voltando entre dois sistemas
    pulse(f) {
      const n = W - 4, p = f % (2 * n);
      const at = p < n ? p : 2 * n - p - 1;
      let s = "";
      for (let i = 0; i < n; i++) s += i === at ? "o" : "-";
      return "[]" + s + "[]";
    },
    // algo sendo construído aos poucos
    build(f) {
      const n = W - 2, p = Math.floor(f / 2) % (n + 6);
      let s = "";
      for (let i = 0; i < n; i++) s += i < p ? "#" : "·";
      return "[" + s + "]";
    },
    // um prompt digitando
    type(f) {
      const msg = "vamos conversar";
      const cycle = msg.length * 2 + 24;
      const p = f % cycle;
      const k = p < msg.length ? p : p < msg.length + 20 ? msg.length : Math.max(0, cycle - p - 4);
      const cursor = Math.floor(f / 4) % 2 ? "_" : " ";
      return "> " + msg.slice(0, k) + cursor;
    },
  };

  const els = [...document.querySelectorAll(".glyph[data-glyph]")];
  const live = new Set();
  els.forEach((el) => { el.textContent = glyphs[el.dataset.glyph](reduced ? 12 : 0); });
  if (reduced) return;

  const io = new IntersectionObserver((entries) => {
    for (const en of entries) en.isIntersecting ? live.add(en.target) : live.delete(en.target);
  });
  els.forEach((el) => io.observe(el));

  let frame = 0, last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (now - last < 100 || document.hidden) return;
    last = now;
    frame++;
    for (const el of live) el.textContent = glyphs[el.dataset.glyph](frame);
  }
  requestAnimationFrame(loop);
})();
