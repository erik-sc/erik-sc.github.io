// Campo de ondas em ASCII no topo da página. Por cima do campo roda uma superfície
// de água simulada: o cursor arrasta um rastro como um bastão passando pela água,
// e cliques soltam gotas.
// Desenha em camadas: `base` (tom apagado), `tone[0..2]` (as três cores da paleta,
// da menor à maior intensidade) e `hi` (tom de texto, só nos picos).
(() => {
  const preBase = document.getElementById("ascii-base");
  const preHi = document.getElementById("ascii-hi");
  const preTone = [0, 1, 2].map((i) => document.getElementById("ascii-c" + (i + 1)));
  const hero = document.querySelector(".hero");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  const SP = 32;
  const RAMP = " .,:-=+*#%@";
  let cols = 0, rows = 0, aspect = 2, cw = 7, lh = 14;
  let base = new Uint16Array(0), hi = new Uint16Array(0);
  let tone = [new Uint16Array(0), new Uint16Array(0), new Uint16Array(0)];

  // ---------- água ----------
  // Equação de onda discreta em dois buffers. A grade da água tem células
  // quadradas (rows * aspect linhas), para as ondas se espalharem em círculo.

  const DAMP = 0.982;
  let W = 0, H = 0;
  let cur = new Float32Array(0), prev = new Float32Array(0);

  function resizeWater() {
    // margem de 2 células em volta, para a inclinação poder olhar 2 vizinhos
    W = cols + 4;
    H = Math.ceil(rows * aspect) + 4;
    cur = new Float32Array(W * H);
    prev = new Float32Array(W * H);
  }

  function stepWater() {
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1, i = y * W + 1; x < W - 1; x++, i++) {
        prev[i] = ((cur[i - 1] + cur[i + 1] + cur[i - W] + cur[i + W]) * 0.5 - prev[i]) * DAMP;
      }
    }
    const t = cur; cur = prev; prev = t;
  }

  // empurra a superfície num disco de raio `r` (em células da água)
  function press(cx, cy, amount, r) {
    const r2 = r * r;
    for (let dy = -r; dy <= r; dy++) {
      const y = Math.round(cy) + dy;
      if (y < 1 || y >= H - 1) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.round(cx) + dx;
        if (x < 1 || x >= W - 1) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const f = 1 - d2 / r2;
        cur[y * W + x] += amount * f * f;
      }
    }
  }

  // ---------- campo ----------

  function frame(t) {
    // faixa de intensidade -> camada
    const layerOf = [null, base, base, base, tone[0], tone[0], tone[1], tone[1], tone[2], tone[2], hi];
    const s = 2 / Math.min(cols, rows * aspect);
    const ox = 0.35 * Math.sin(t * 0.17), oy = 0.25 * Math.cos(t * 0.13);
    for (let y = 0; y < rows; y++) {
      const v = (y - rows / 2) * aspect * s;
      const row = Math.min(H - 3, Math.round(y * aspect) + 2) * W;
      for (let x = 0; x < cols; x++) {
        const u = (x - cols / 2) * s;
        const val =
          Math.sin(u * 5 + t * 0.5) +
          Math.sin(v * 6 - t * 0.35) +
          Math.sin((u + v) * 4 + t * 0.27) +
          Math.sin(Math.hypot(u - ox, v - oy) * 9 - t * 0.8);
        let k = Math.pow((val + 4) / 8, 1.6) * 1.1;
        // a água ilumina pela inclinação da superfície (luz vinda do alto à esquerda);
        // medir a 2 células filtra o serrilhado de alta frequência da simulação
        const i = row + x + 2;
        const slope = (cur[i - 2] - cur[i + 2]) + (cur[i - 2 * W] - cur[i + 2 * W]);
        k += slope * 0.14 + Math.abs(cur[i]) * 0.06;
        const c = Math.max(0, Math.min(RAMP.length - 1, Math.floor(k * RAMP.length)));
        if (c === 0) continue;
        layerOf[c][y * cols + x] = RAMP.charCodeAt(c);
      }
    }
  }

  // ---------- render ----------

  function measure() {
    const w = innerWidth;
    const size = w < 600 ? 11 : w < 1200 ? 12 : 13;
    document.documentElement.style.setProperty("--cell", size + "px");
    const probe = document.createElement("span");
    probe.textContent = "M".repeat(200);
    preBase.textContent = "";
    preBase.appendChild(probe);
    cw = probe.getBoundingClientRect().width / 200;
    lh = parseFloat(getComputedStyle(preBase).lineHeight) || size * 1.2;
    preBase.removeChild(probe);
    aspect = lh / cw;
    cols = Math.ceil(hero.clientWidth / cw);
    rows = Math.ceil(hero.clientHeight / lh);
    base = new Uint16Array(cols * rows);
    hi = new Uint16Array(cols * rows);
    tone = tone.map(() => new Uint16Array(cols * rows));
    resizeWater();
  }

  function flush(buf, pre) {
    const out = new Array(rows);
    for (let y = 0; y < rows; y++) out[y] = String.fromCharCode.apply(null, buf.subarray(y * cols, (y + 1) * cols));
    pre.textContent = out.join("\n");
  }

  function draw(t) {
    base.fill(SP); hi.fill(SP);
    for (const b of tone) b.fill(SP);
    frame(t);
    flush(base, preBase);
    flush(hi, preHi);
    tone.forEach((b, i) => flush(b, preTone[i]));
  }

  const t0 = performance.now();
  const clock = () => (performance.now() - t0) / 1000;

  // ---------- ponteiro ----------
  // posições em células da água; `x`/`y` seguem o alvo com leve suavização e o
  // rastro é carimbado ao longo do caminho percorrido desde o quadro anterior

  const pointer = { x: 0, y: 0, tx: 0, ty: 0, inside: false, fresh: true };
  let lastInput = 0;

  function toWater(e) {
    const r = hero.getBoundingClientRect();
    return [(e.clientX - r.left) / cw + 2, ((e.clientY - r.top) / lh) * aspect + 2];
  }
  const interactive = (e) => !e.target.closest("a, button, .hero-id");

  hero.addEventListener("pointermove", (e) => {
    [pointer.tx, pointer.ty] = toWater(e);
    pointer.inside = interactive(e);
    if (pointer.fresh) { pointer.x = pointer.tx; pointer.y = pointer.ty; pointer.fresh = false; }
    lastInput = performance.now();
  });
  hero.addEventListener("pointerleave", () => { pointer.inside = false; pointer.fresh = true; });
  hero.addEventListener("pointerdown", (e) => {
    if (!interactive(e)) return;
    const [x, y] = toWater(e);
    press(x, y, -5, 4);
    lastInput = performance.now();
  });

  function wake() {
    const nx = pointer.x + (pointer.tx - pointer.x) * 0.45;
    const ny = pointer.y + (pointer.ty - pointer.y) * 0.45;
    if (pointer.inside) {
      const dist = Math.hypot(nx - pointer.x, ny - pointer.y);
      // mais rápido, mais água deslocada, até um limite
      const amount = -Math.min(0.7, 0.15 + dist * 0.05);
      const steps = Math.ceil(dist / 1.5);
      for (let k = 1; k <= steps; k++) {
        const f = k / steps;
        press(pointer.x + (nx - pointer.x) * f, pointer.y + (ny - pointer.y) * f, amount, 3);
      }
    }
    pointer.x = nx; pointer.y = ny;
  }

  // ---------- laço ----------

  let visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(hero);

  let last = 0, nextIdle = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (reduced.matches || !visible || document.hidden) return;
    if (now - last < 33) return;
    last = now;
    wake();
    // sem interação, cai uma gota de vez em quando
    if (now - lastInput > 6000 && now > nextIdle) {
      if (nextIdle) press(W * (0.15 + Math.random() * 0.7), H * (0.15 + Math.random() * 0.6), -3, 3);
      nextIdle = now + 3500 + Math.random() * 3000;
    }
    stepWater();
    stepWater();
    draw(clock());
  }

  const redraw = () => { measure(); draw(reduced.matches ? 8 : clock()); };
  let rz;
  addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(redraw, 120); });

  redraw();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
  requestAnimationFrame(loop);
})();
