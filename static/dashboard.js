// LCRA Hydromet dashboard. D3 v7 (loaded globally). No cache, no build step.

const REFRESH_MS = 60_000;

// Highland Lakes — physically ordered upstream → downstream — with operating
// ranges chosen to make BOTH the storage lakes (Buchanan, Travis) and the
// pass-through lakes (Inks, LBJ, Marble Falls, Austin) read visually.
// low/conservation/flood are all in feet MSL.
const LAKES = [
  { dam: "Buchanan",  lake: "Buchanan",    low: 985,   conservation: 1020.5, flood: 1025.5, kind: "storage"     },
  { dam: "Inks",      lake: "Inks",        low: 886,   conservation: 888.0,  flood: 890.0,  kind: "passthrough" },
  { dam: "Wirtz",     lake: "LBJ",         low: 823,   conservation: 825.0,  flood: 827.0,  kind: "passthrough" },
  { dam: "Starcke",   lake: "Marble Falls", low: 736,  conservation: 738.0,  flood: 740.0,  kind: "passthrough" },
  { dam: "Mansfield", lake: "Travis",      low: 620,   conservation: 681.0,  flood: 715.0,  kind: "storage"     },
  { dam: "Miller",    lake: "Austin",      low: 490,   conservation: 492.8,  flood: 495.0,  kind: "passthrough", displayDam: "Tom Miller" },
  { dam: "Bastrop",   lake: "Bastrop",     low: 446,   conservation: 449.5,  flood: 452.0,  kind: "passthrough" },
];
const DAM_ORDER = new Map(LAKES.map((l, i) => [l.dam, i]));

const tip = d3.select("#tip");
function showTip(html, evt) {
  tip.html(html)
     .style("left", `${evt.clientX + 14}px`)
     .style("top",  `${evt.clientY + 14}px`)
     .classed("on", true);
}
function moveTip(evt) {
  tip.style("left", `${evt.clientX + 14}px`)
     .style("top",  `${evt.clientY + 14}px`);
}
function hideTip() { tip.classed("on", false); }

// ---------- data fetch ----------
async function fetchAll() {
  const r = await fetch("/api/all", { cache: "no-store" });
  if (!r.ok) throw new Error(`fetch failed: ${r.status}`);
  return r.json();
}

function classifyGate(text) {
  if (!text) return "good";
  const t = text.toLowerCase();
  if (t.includes("no gate operations") || t.includes("not expected")) return "good";
  if (t.includes("inks dam has no floodgates")) return "good";
  if (/\b\d+\s+gate/.test(t) || t.includes("opened") || t.includes("releasing")) return "bad";
  if (t.includes("possible") || t.includes("may") || t.includes("monitor")) return "warn";
  return "warn";
}

// ---------- Highland Lakes chain ----------
const MOBILE_BREAKPOINT = 760;

function renderChain(damsData) {
  if (!damsData?.records) return;
  const byDam = new Map(damsData.records.map(r => [r.dam, r]));

  const root = d3.select("#chain");
  root.selectAll("*").remove();

  const W = root.node().clientWidth;
  if (W < MOBILE_BREAKPOINT) renderChainVertical(root, byDam, W);
  else                       renderChainHorizontal(root, byDam, W);

  // Update KPI counters
  const gateCounts = damsData.records.map(r => classifyGate(r.gateOps));
  const active = gateCounts.filter(c => c === "bad").length;
  const monitoring = gateCounts.filter(c => c === "warn").length;
  d3.select("#kpi-gates .kpi-value").text(
    active > 0 ? `${active} active` :
    monitoring > 0 ? `${monitoring} watch` :
    "all closed"
  );
}

function renderChainHorizontal(root, byDam, W) {
  const N = LAKES.length;
  const GUTTER = 30;
  const totalGutter = GUTTER * (N - 1);
  const cardW = Math.floor((W - totalGutter - 8) / N);
  const cardH = 360;
  const H = cardH + 40;

  const svg = root.append("svg")
    .attr("width", W).attr("height", H)
    .attr("viewBox", `0 0 ${W} ${H}`);

  // Background flow connectors first (so cards draw above)
  for (let i = 0; i < N - 1; i++) {
    const x1 = (i + 1) * cardW + i * GUTTER;
    const x2 = (i + 1) * cardW + (i + 1) * GUTTER;
    const y  = cardH / 2 + 10;
    const mid = (x1 + x2) / 2;
    svg.append("path")
      .attr("class", "flow-line")
      .attr("d", `M ${x1} ${y} C ${mid} ${y - 8}, ${mid} ${y + 8}, ${x2} ${y}`);
    svg.append("path")
      .attr("class", "flow-arrow")
      .attr("d", `M ${x2 - 6} ${y - 4} L ${x2} ${y} L ${x2 - 6} ${y + 4} Z`);
  }

  const cards = svg.selectAll(".dam-card")
    .data(LAKES, d => d.dam)
    .join("g")
      .attr("class", "dam-card")
      .attr("transform", (_, i) => `translate(${i * (cardW + GUTTER)}, 8)`);

  cards.append("rect")
    .attr("class", "dam-bg")
    .attr("width", cardW).attr("height", cardH)
    .attr("rx", 16).attr("ry", 16);

  // Color gradient strip on left edge based on % fill
  cards.each(function(d) {
    const g = d3.select(this);
    const rec = byDam.get(d.dam);
    if (!rec) return;

    const head = rec.head;
    const tail = rec.tail;
    const pctRaw = (head - d.low) / (d.flood - d.low);
    const pct = Math.max(0, Math.min(1.05, pctRaw));
    const overFlood = head > d.flood;
    const nearConservation = head >= d.conservation - 0.2;
    const fillColor =
      overFlood              ? "#ec4899" :
      nearConservation       ? "#fbbf24" :
      pct > 0.85             ? "#5ec8f7" :
      pct > 0.55             ? "#34d399" :
                                "#94a3b8";

    // Left accent strip
    g.append("rect")
      .attr("x", 0).attr("y", 0)
      .attr("width", 4).attr("height", cardH)
      .attr("fill", fillColor)
      .attr("opacity", 0.85);

    // Headline
    g.append("text")
      .attr("class", "lake-name")
      .attr("x", 18).attr("y", 26)
      .text(`LAKE ${d.lake.toUpperCase()}`);
    g.append("text")
      .attr("class", "dam-name")
      .attr("x", 18).attr("y", 46)
      .text(`${d.displayDam ?? d.dam} Dam`);

    // Big elevation
    g.append("text")
      .attr("class", "elev-value")
      .attr("x", 18).attr("y", 92)
      .text(head != null ? head.toFixed(2) : "—");
    g.append("text")
      .attr("class", "elev-unit")
      .attr("x", 18).attr("y", 110)
      .text("ft MSL · head");

    // Fill column on right side of card
    const colX = cardW - 60;
    const colW = 28;
    const colTop = 80;
    const colBot = cardH - 90;
    const colH = colBot - colTop;

    g.append("rect")
      .attr("class", "fill-track")
      .attr("x", colX).attr("y", colTop)
      .attr("width", colW).attr("height", colH)
      .attr("rx", 6).attr("ry", 6);

    // Reference lines for conservation pool and flood pool
    const yForElev = e => colBot - ((e - d.low) / (d.flood - d.low)) * colH;
    const yCons = yForElev(d.conservation);
    const yFlood = yForElev(d.flood);

    g.append("line").attr("class", "conservation-line")
      .attr("x1", colX - 10).attr("x2", colX + colW + 10)
      .attr("y1", yCons).attr("y2", yCons);
    g.append("text").attr("class", "range-label")
      .attr("x", colX - 14).attr("y", yCons - 3)
      .attr("text-anchor", "end")
      .text(`cons ${d.conservation}`);

    g.append("line").attr("class", "flood-line")
      .attr("x1", colX - 10).attr("x2", colX + colW + 10)
      .attr("y1", yFlood).attr("y2", yFlood);
    g.append("text").attr("class", "range-label")
      .attr("x", colX - 14).attr("y", yFlood + 9)
      .attr("text-anchor", "end")
      .text(`flood ${d.flood}`);

    // Animated fill
    const fillTop = Math.max(yFlood - 6, yForElev(head));
    const fillHeight = Math.max(2, colBot - fillTop);
    g.append("rect")
      .attr("class", "fill-bar")
      .attr("x", colX).attr("y", colBot)
      .attr("width", colW).attr("height", 0)
      .attr("rx", 6).attr("ry", 6)
      .attr("fill", fillColor)
      .attr("opacity", 0.85)
      .transition().duration(700).delay(100)
      .attr("y", fillTop)
      .attr("height", fillHeight);

    // Tail elevation (treat 0 as missing — Bastrop reports 0)
    g.append("text").attr("class", "tail-label")
      .attr("x", 18).attr("y", 140)
      .text("Tailwater");
    g.append("text").attr("class", "tail-value")
      .attr("x", 18).attr("y", 158)
      .text(tail != null && tail > 1 ? `${tail.toFixed(2)} ft` : "—");

    // % of operating range
    g.append("text").attr("class", "tail-label")
      .attr("x", 18).attr("y", 184)
      .text("Range fill");
    g.append("text").attr("class", "tail-value")
      .attr("x", 18).attr("y", 202)
      .text(`${(pct * 100).toFixed(1)} %`);

    // ft to conservation pool
    g.append("text").attr("class", "tail-label")
      .attr("x", 18).attr("y", 228)
      .text("Δ Conservation");
    const dCons = head - d.conservation;
    g.append("text").attr("class", "tail-value")
      .attr("x", 18).attr("y", 246)
      .attr("fill", dCons > 0 ? "#fbbf24" : "#93a4c8")
      .text(`${dCons >= 0 ? "+" : ""}${dCons.toFixed(2)} ft`);

    // Gate status pill
    const gateClass = classifyGate(rec.gateOps);
    const gateText =
      gateClass === "good" ? "GATES CLOSED" :
      gateClass === "warn" ? "MONITORING"   :
                              "GATES ACTIVE";

    const pillG = g.append("g").attr("transform", `translate(18, ${cardH - 58})`);
    const padX = 10, pillH = 24;
    const textW = gateText.length * 6.8 + 8;
    pillG.append("rect")
      .attr("class", `gate-pill-bg gate-${gateClass}`)
      .attr("width", textW + padX * 2).attr("height", pillH)
      .attr("rx", 12).attr("ry", 12)
      .attr("stroke-width", 1)
      .attr("class", `gate-pill-bg gate-${gateClass} gate-${gateClass}-stroke`);
    pillG.append("text")
      .attr("class", `gate-pill gate-${gateClass}-text`)
      .attr("x", padX + (textW + padX) / 2)
      .attr("y", 16)
      .attr("text-anchor", "middle")
      .text(gateText);

    // Hover tooltip with the wordy fields
    g.append("rect")
      .attr("width", cardW).attr("height", cardH)
      .attr("fill", "transparent")
      .on("mouseenter", (event) => {
        const html = `
          <div class="tip-title">${d.displayDam ?? d.dam} Dam · Lake ${d.lake}</div>
          <div class="tip-row"><span>head</span><span>${head?.toFixed(2) ?? "—"} ft</span></div>
          <div class="tip-row"><span>tail</span><span>${(tail != null && tail > 1) ? tail.toFixed(2) + " ft" : "—"}</span></div>
          <div class="tip-row"><span>conservation</span><span>${d.conservation} ft</span></div>
          <div class="tip-row"><span>flood pool</span><span>${d.flood} ft</span></div>
          <div style="margin-top:8px;color:var(--ink-dim);font-size:11px">${rec.gateOps ?? ""}</div>
          <div style="margin-top:6px;color:var(--ink-mute);font-size:10px">Updated ${formatTime(rec.lastDataUpdate)}</div>
        `;
        showTip(html, event);
      })
      .on("mousemove", moveTip)
      .on("mouseleave", hideTip);
  });
}

// Vertical / mobile chain layout — cards stacked top→bottom with downward flow.
function renderChainVertical(root, byDam, W) {
  const N = LAKES.length;
  const cardH = 132;       // shorter card, full width
  const GAP   = 28;        // vertical gap between cards (for connector)
  const padX  = 16;
  const H = N * cardH + (N - 1) * GAP + 16;

  const svg = root.append("svg")
    .attr("width", W).attr("height", H)
    .attr("viewBox", `0 0 ${W} ${H}`);

  // Vertical flow connectors between cards
  for (let i = 0; i < N - 1; i++) {
    const y1 = 8 + (i + 1) * cardH + i * GAP;
    const y2 = y1 + GAP;
    const x = W / 2;
    const mid = (y1 + y2) / 2;
    svg.append("path")
      .attr("class", "flow-line")
      .attr("d", `M ${x} ${y1} C ${x - 8} ${mid}, ${x + 8} ${mid}, ${x} ${y2}`);
    svg.append("path")
      .attr("class", "flow-arrow")
      .attr("d", `M ${x - 4} ${y2 - 6} L ${x} ${y2} L ${x + 4} ${y2 - 6} Z`);
  }

  const cards = svg.selectAll(".dam-card")
    .data(LAKES, d => d.dam)
    .join("g")
      .attr("class", "dam-card")
      .attr("transform", (_, i) => `translate(0, ${8 + i * (cardH + GAP)})`);

  cards.append("rect")
    .attr("class", "dam-bg")
    .attr("width", W).attr("height", cardH)
    .attr("rx", 14).attr("ry", 14);

  cards.each(function(d) {
    const g = d3.select(this);
    const rec = byDam.get(d.dam);
    if (!rec) return;

    const head = rec.head;
    const tail = rec.tail;
    const pctRaw = (head - d.low) / (d.flood - d.low);
    const pct = Math.max(0, Math.min(1.05, pctRaw));
    const overFlood = head > d.flood;
    const nearConservation = head >= d.conservation - 0.2;
    const fillColor =
      overFlood              ? "#ec4899" :
      nearConservation       ? "#fbbf24" :
      pct > 0.85             ? "#5ec8f7" :
      pct > 0.55             ? "#34d399" :
                                "#94a3b8";

    // Left accent strip
    g.append("rect")
      .attr("x", 0).attr("y", 0)
      .attr("width", 4).attr("height", cardH)
      .attr("fill", fillColor)
      .attr("opacity", 0.85);

    // Left column: lake + dam name
    g.append("text")
      .attr("class", "lake-name")
      .attr("x", padX).attr("y", 22)
      .text(`LAKE ${d.lake.toUpperCase()}`);
    g.append("text")
      .attr("class", "dam-name")
      .attr("x", padX).attr("y", 42)
      .text(`${d.displayDam ?? d.dam} Dam`);

    // Right column: big elevation, right-aligned
    g.append("text")
      .attr("class", "elev-value")
      .attr("x", W - padX).attr("y", 36)
      .attr("text-anchor", "end")
      .text(head != null ? head.toFixed(2) : "—");
    g.append("text")
      .attr("class", "elev-unit")
      .attr("x", W - padX).attr("y", 54)
      .attr("text-anchor", "end")
      .text("ft MSL · head");

    // Mid row: gate pill (left) + range fill % + Δ cons (right)
    const gateClass = classifyGate(rec.gateOps);
    const gateText =
      gateClass === "good" ? "GATES CLOSED" :
      gateClass === "warn" ? "MONITORING"   :
                              "GATES ACTIVE";
    const pillG = g.append("g").attr("transform", `translate(${padX}, 64)`);
    const ppadX = 10, pillH = 22;
    const ptW = gateText.length * 6.6 + 8;
    pillG.append("rect")
      .attr("class", `gate-pill-bg gate-${gateClass} gate-${gateClass}-stroke`)
      .attr("width", ptW + ppadX * 2).attr("height", pillH)
      .attr("rx", 11).attr("ry", 11)
      .attr("stroke-width", 1);
    pillG.append("text")
      .attr("class", `gate-pill gate-${gateClass}-text`)
      .attr("x", ppadX + (ptW + ppadX) / 2)
      .attr("y", 15)
      .attr("text-anchor", "middle")
      .text(gateText);

    // Right-aligned stats below elevation
    g.append("text")
      .attr("class", "tail-value")
      .attr("x", W - padX).attr("y", 80)
      .attr("text-anchor", "end")
      .text(`range ${(pct * 100).toFixed(1)}%`);
    const dCons = head - d.conservation;
    g.append("text")
      .attr("class", "tail-value")
      .attr("x", W - padX).attr("y", 96)
      .attr("text-anchor", "end")
      .attr("fill", dCons > 0 ? "#fbbf24" : "#93a4c8")
      .text(`Δ cons ${dCons >= 0 ? "+" : ""}${dCons.toFixed(2)} ft`);

    // Horizontal fill bar at bottom of card
    const barY = cardH - 18;
    const barX1 = padX;
    const barX2 = W - padX;
    const barW = barX2 - barX1;
    g.append("rect")
      .attr("class", "fill-track")
      .attr("x", barX1).attr("y", barY)
      .attr("width", barW).attr("height", 6)
      .attr("rx", 3).attr("ry", 3);

    // Conservation marker on the bar
    const xForElev = e => barX1 + ((e - d.low) / (d.flood - d.low)) * barW;
    const xCons  = Math.max(barX1, Math.min(barX2, xForElev(d.conservation)));
    const xFlood = barX2;
    g.append("line").attr("class", "conservation-line")
      .attr("y1", barY - 3).attr("y2", barY + 9)
      .attr("x1", xCons).attr("x2", xCons);
    g.append("line").attr("class", "flood-line")
      .attr("y1", barY - 3).attr("y2", barY + 9)
      .attr("x1", xFlood).attr("x2", xFlood);

    const fillEnd = Math.min(barX2, Math.max(barX1, xForElev(head)));
    g.append("rect")
      .attr("class", "fill-bar")
      .attr("x", barX1).attr("y", barY)
      .attr("width", 0).attr("height", 6)
      .attr("rx", 3).attr("ry", 3)
      .attr("fill", fillColor)
      .attr("opacity", 0.9)
      .transition().duration(700).delay(100)
      .attr("width", Math.max(2, fillEnd - barX1));

    // Tap target / tooltip overlay
    g.append("rect")
      .attr("width", W).attr("height", cardH)
      .attr("fill", "transparent")
      .on("mouseenter", (event) => {
        const html = `
          <div class="tip-title">${d.displayDam ?? d.dam} Dam · Lake ${d.lake}</div>
          <div class="tip-row"><span>head</span><span>${head?.toFixed(2) ?? "—"} ft</span></div>
          <div class="tip-row"><span>tail</span><span>${(tail != null && tail > 1) ? tail.toFixed(2) + " ft" : "—"}</span></div>
          <div class="tip-row"><span>conservation</span><span>${d.conservation} ft</span></div>
          <div class="tip-row"><span>flood pool</span><span>${d.flood} ft</span></div>
          <div style="margin-top:8px;color:var(--ink-dim);font-size:11px">${rec.gateOps ?? ""}</div>
          <div style="margin-top:6px;color:var(--ink-mute);font-size:10px">Updated ${formatTime(rec.lastDataUpdate)}</div>
        `;
        showTip(html, event);
      })
      .on("mousemove", moveTip)
      .on("mouseleave", hideTip);
  });
}

// ---------- River gauges ----------
const riverColor = pct =>
  pct >= 1     ? "#ec4899" :
  pct >= 0.75  ? "#f87171" :
  pct >= 0.5   ? "#fbbf24" :
  pct >= 0.25  ? "#5ec8f7" :
                 "#34d399";

function renderRivers(forecastSites) {
  if (!forecastSites?.sites) return;
  const sites = forecastSites.sites
    .map(s => {
      const stage = +s.stage;
      const flood = +s.floodStage;
      const bank  = +s.bankfull;
      return {
        location: s.location,
        stage: Number.isFinite(stage) ? stage : null,
        flow:  Number.isFinite(+s.flow) ? +s.flow : null,
        bankfull: Number.isFinite(bank) ? bank : null,
        flood:    Number.isFinite(flood) ? flood : null,
        pct: (Number.isFinite(stage) && Number.isFinite(flood) && flood > 0) ? stage / flood : 0,
        dt: s.dateTime,
      };
    })
    .filter(s => s.stage != null && s.flood != null)
    .sort((a, b) => b.pct - a.pct);

  const root = d3.select("#rivers");
  root.selectAll("*").remove();

  const W = root.node().clientWidth;
  if (W < MOBILE_BREAKPOINT) renderRiversMobile(root, sites, W);
  else                       renderRiversDesktop(root, sites, W);

  d3.select("#kpi-stage .kpi-value").text(`${sites.length} gauges`);
  const elevated = sites.filter(s => s.pct >= 0.5).length;
  if (elevated > 0) {
    d3.select("#kpi-stage").classed("flash", true);
    setTimeout(() => d3.select("#kpi-stage").classed("flash", false), 600);
  }
}

function attachRiverTip(sel) {
  sel
    .on("mouseenter", function(event, d) {
      const html = `
        <div class="tip-title">${d.location}</div>
        <div class="tip-row"><span>stage</span><span>${d.stage.toFixed(2)} ft</span></div>
        <div class="tip-row"><span>flow</span><span>${formatFlow(d.flow)}</span></div>
        <div class="tip-row"><span>bankfull</span><span>${d.bankfull ?? "—"} ft</span></div>
        <div class="tip-row"><span>flood stage</span><span>${d.flood} ft</span></div>
        <div class="tip-row"><span>% of flood</span><span>${(d.pct * 100).toFixed(1)} %</span></div>
        <div style="margin-top:6px;color:var(--ink-mute);font-size:10px">Updated ${formatTime(d.dt)}</div>
      `;
      showTip(html, event);
    })
    .on("mousemove", moveTip)
    .on("mouseleave", hideTip);
}

function renderRiversDesktop(root, sites, W) {
  const rowH = 28;
  const padTop = 6;
  const labelW = 220;
  const statsW = 110;
  const barX = labelW + 8;
  const barW = W - barX - statsW - 8;
  const H = padTop + sites.length * rowH + 12;

  const svg = root.append("svg")
    .attr("width", W).attr("height", H)
    .attr("viewBox", `0 0 ${W} ${H}`);

  const rows = svg.selectAll(".river-row")
    .data(sites, d => d.location)
    .join("g")
      .attr("class", "river-row")
      .attr("transform", (_, i) => `translate(0, ${padTop + i * rowH})`);

  rows.append("rect")
    .attr("class", "river-bg")
    .attr("x", 0).attr("y", 0).attr("width", W).attr("height", rowH);

  rows.append("text")
    .attr("class", "river-name")
    .attr("x", 0).attr("y", rowH / 2 + 4)
    .text(d => d.location);

  rows.append("rect")
    .attr("class", "river-track")
    .attr("x", barX).attr("y", rowH / 2 - 7)
    .attr("width", barW).attr("height", 14)
    .attr("rx", 7).attr("ry", 7);

  rows.append("rect")
    .attr("class", "river-bar")
    .attr("x", barX).attr("y", rowH / 2 - 7)
    .attr("width", 0).attr("height", 14)
    .attr("rx", 7).attr("ry", 7)
    .attr("fill", d => riverColor(d.pct))
    .transition().duration(550).delay((_, i) => i * 12)
    .attr("width", d => Math.max(2, Math.min(barW, barW * Math.min(1.05, d.pct))));

  rows.each(function(d) {
    const g = d3.select(this);
    if (d.bankfull > 0 && d.flood > 0) {
      const xb = barX + barW * (d.bankfull / d.flood);
      if (xb > barX && xb < barX + barW) {
        g.append("line").attr("class", "bankfull-tick")
          .attr("x1", xb).attr("x2", xb)
          .attr("y1", rowH / 2 - 10).attr("y2", rowH / 2 + 10);
      }
    }
    g.append("line").attr("class", "flood-tick")
      .attr("x1", barX + barW).attr("x2", barX + barW)
      .attr("y1", rowH / 2 - 10).attr("y2", rowH / 2 + 10);
  });

  rows.append("text")
    .attr("class", "river-stats")
    .attr("x", W - 6).attr("y", rowH / 2 + 4)
    .attr("text-anchor", "end")
    .text(d => `${d.stage.toFixed(2)} / ${d.flood.toFixed(0)} ft · ${formatFlow(d.flow)}`);

  attachRiverTip(rows);
}

function renderRiversMobile(root, sites, W) {
  // Stacked layout: each gauge gets two lines — name+stage+pct on top,
  // full-width bar below. Eliminates the squeezed bar that desktop
  // layout produces on narrow viewports.
  const rowH = 46;
  const padTop = 4;
  const padX = 0;
  const nameY = 16;
  const statsY = 16;
  const barY = 28;
  const barH = 10;
  const barX = padX;
  const barW = W - 2 * padX;
  const H = padTop + sites.length * rowH + 8;

  const svg = root.append("svg")
    .attr("width", W).attr("height", H)
    .attr("viewBox", `0 0 ${W} ${H}`);

  const rows = svg.selectAll(".river-row")
    .data(sites, d => d.location)
    .join("g")
      .attr("class", "river-row")
      .attr("transform", (_, i) => `translate(0, ${padTop + i * rowH})`);

  rows.append("rect")
    .attr("class", "river-bg")
    .attr("x", 0).attr("y", 0).attr("width", W).attr("height", rowH - 6);

  rows.append("text")
    .attr("class", "river-name")
    .attr("x", padX).attr("y", nameY)
    .text(d => d.location);

  rows.append("text")
    .attr("class", "river-stats")
    .attr("x", W - padX).attr("y", statsY)
    .attr("text-anchor", "end")
    .text(d => `${d.stage.toFixed(2)} ft · ${formatFlow(d.flow)}`);

  rows.append("rect")
    .attr("class", "river-track")
    .attr("x", barX).attr("y", barY)
    .attr("width", barW).attr("height", barH)
    .attr("rx", barH / 2).attr("ry", barH / 2);

  rows.append("rect")
    .attr("class", "river-bar")
    .attr("x", barX).attr("y", barY)
    .attr("width", 0).attr("height", barH)
    .attr("rx", barH / 2).attr("ry", barH / 2)
    .attr("fill", d => riverColor(d.pct))
    .transition().duration(550).delay((_, i) => i * 10)
    .attr("width", d => Math.max(2, Math.min(barW, barW * Math.min(1.05, d.pct))));

  rows.each(function(d) {
    const g = d3.select(this);
    if (d.bankfull > 0 && d.flood > 0) {
      const xb = barX + barW * (d.bankfull / d.flood);
      if (xb > barX && xb < barX + barW) {
        g.append("line").attr("class", "bankfull-tick")
          .attr("x1", xb).attr("x2", xb)
          .attr("y1", barY - 3).attr("y2", barY + barH + 3);
      }
    }
    g.append("line").attr("class", "flood-tick")
      .attr("x1", barX + barW).attr("x2", barX + barW)
      .attr("y1", barY - 3).attr("y2", barY + barH + 3);

    // Tiny "% of flood" label at end of row (right-aligned, small)
    g.append("text")
      .attr("class", "river-stats")
      .attr("x", W - padX).attr("y", barY + barH + 14)
      .attr("text-anchor", "end")
      .attr("font-size", 10)
      .attr("fill", riverColor(d.pct))
      .text(`${(d.pct * 100).toFixed(0)}% of flood`);
  });

  attachRiverTip(rows);
}

function formatFlow(f) {
  if (f == null || !Number.isFinite(f)) return "— cfs";
  if (f >= 1000) return `${(f / 1000).toFixed(1)}k cfs`;
  return `${Math.round(f)} cfs`;
}

// ---------- Rainfall beeswarm ----------
function renderRain(rainData) {
  if (!Array.isArray(rainData)) return;
  const sites = rainData
    .map(s => ({
      location: s.location?.trim(),
      basin: (s.reservoir || "Other").trim(),
      rain24: +s.rain24Hr,
      rain1: +s.rain1Hr,
      dt: s.dateTime,
    }))
    .filter(s => Number.isFinite(s.rain24));

  // Group basins, biggest first
  const byBasin = d3.rollups(sites, v => v, d => d.basin)
    .sort((a, b) => d3.max(b[1], d => d.rain24) - d3.max(a[1], d => d.rain24));
  // Keep all basins for completeness, but order by max recent rain
  const basinOrder = byBasin.map(([k]) => k);

  const root = d3.select("#rain");
  root.selectAll("*").remove();

  const W = root.node().clientWidth;
  const padL = 110, padR = 24, padT = 28, padB = 32;
  const rowH = Math.max(48, Math.min(72, Math.floor((420 - padT - padB) / Math.max(basinOrder.length, 3))));
  const H = padT + basinOrder.length * rowH + padB;

  const svg = root.append("svg")
    .attr("width", W).attr("height", H)
    .attr("viewBox", `0 0 ${W} ${H}`);

  const maxRain = d3.max(sites, d => d.rain24) || 0.5;
  const xScale = d3.scaleSqrt()
    .domain([0, Math.max(0.5, maxRain * 1.05)])
    .range([padL, W - padR]);

  const rScale = d3.scaleSqrt()
    .domain([0, Math.max(0.5, maxRain)])
    .range([3, 14]);

  const colorFor = r =>
    r === 0      ? "rgba(148, 163, 184, 0.45)" :
    r < 0.10     ? "#5ec8f7" :
    r < 0.50     ? "#34d399" :
    r < 1.0      ? "#fbbf24" :
    r < 2.5      ? "#f97316" :
                    "#ec4899";

  // x-axis (top)
  const axis = d3.axisTop(xScale)
    .ticks(6)
    .tickFormat(d => d === 0 ? "0" : `${d}"`);
  svg.append("g")
    .attr("class", "rain-axis")
    .attr("transform", `translate(0, ${padT - 4})`)
    .call(axis);

  // Per-basin rows
  basinOrder.forEach((basin, i) => {
    const rowY = padT + i * rowH + rowH / 2;
    svg.append("text")
      .attr("class", "rain-basin-label")
      .attr("x", 4).attr("y", rowY + 4)
      .text(basin);

    // baseline
    svg.append("line")
      .attr("x1", padL).attr("x2", W - padR)
      .attr("y1", rowY).attr("y2", rowY)
      .attr("stroke", "rgba(255,255,255,0.06)");

    const basinSites = sites.filter(s => s.basin === basin);

    // Force-layout beeswarm along x.
    const nodes = basinSites.map(s => ({
      ...s,
      x: xScale(s.rain24),
      y: rowY,
    }));

    const sim = d3.forceSimulation(nodes)
      .force("x", d3.forceX(d => xScale(d.rain24)).strength(0.85))
      .force("y", d3.forceY(rowY).strength(0.18))
      .force("collide", d3.forceCollide(d => rScale(d.rain24) + 1.5).strength(0.9))
      .stop();
    for (let k = 0; k < 90; k++) sim.tick();

    svg.append("g").selectAll("circle")
      .data(nodes)
      .join("circle")
        .attr("class", "rain-bubble")
        .attr("cx", d => d.x)
        .attr("cy", d => Math.max(padT + 8, Math.min(rowY + rowH / 2 - 6, d.y)))
        .attr("r", 0)
        .attr("fill", d => colorFor(d.rain24))
        .attr("opacity", d => d.rain24 === 0 ? 0.55 : 0.92)
        .attr("stroke", "rgba(255,255,255,0.18)")
        .attr("stroke-width", 0.5)
        .on("mouseenter", (event, d) => {
          const html = `
            <div class="tip-title">${d.location}</div>
            <div class="tip-row"><span>basin</span><span>${d.basin}</span></div>
            <div class="tip-row"><span>24-hour</span><span>${d.rain24.toFixed(2)} in</span></div>
            <div class="tip-row"><span>last hour</span><span>${(d.rain1 || 0).toFixed(2)} in</span></div>
            <div style="margin-top:6px;color:var(--ink-mute);font-size:10px">Updated ${formatTime(d.dt)}</div>
          `;
          showTip(html, event);
        })
        .on("mousemove", moveTip)
        .on("mouseleave", hideTip)
        .transition().duration(450).delay((_, j) => j * 4)
          .attr("r", d => rScale(d.rain24));
  });

  // KPI: total 24h across all stations
  const totalReporting = sites.length;
  const max24 = sites.reduce((m, s) => Math.max(m, s.rain24), 0);
  d3.select("#kpi-rain .kpi-value").text(
    max24 > 0 ? `max ${max24.toFixed(2)}″` : "all dry"
  );
  d3.select("#kpi-lakes .kpi-value").text(`${totalReporting} stations`);
}

// ---------- Narrative ----------
function renderNarrative(narrativeData) {
  if (!Array.isArray(narrativeData) || !narrativeData.length) return;
  const rec = narrativeData[0];
  d3.select("#narrative").html(rec.narrive_sum || "");
  d3.select("#narrative-time").text(`Last update ${formatTime(rec.lastUpdate)}`);
}

// ---------- helpers ----------
function formatTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
      timeZoneName: "short",
    });
  } catch { return iso; }
}

function nowClock() {
  const d = new Date();
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ---------- main loop ----------
async function update() {
  try {
    const bundle = await fetchAll();
    renderChain(bundle.dams);
    renderRivers(bundle.forecast_sites);
    renderRain(bundle.rainfall);
    renderNarrative(bundle.narrative);

    d3.select("#last-fetched").text(`Last fetched: ${nowClock()}`);
  } catch (e) {
    console.error("update failed", e);
    d3.select("#last-fetched").text(`Fetch error · retry in 60s · ${e.message}`);
  }
}

function tickClock() {
  d3.select("#live-clock").text(nowClock());
}

setInterval(tickClock, 1000);
tickClock();

update();
setInterval(update, REFRESH_MS);

// Re-render on resize (debounced)
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(update, 200);
});
