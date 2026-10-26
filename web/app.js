/* SBOM Fixer Dashboard: upload, fix, show. Plain JavaScript, no libraries, no network except this computer. */
"use strict";

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (n) => Number(n || 0).toLocaleString("en-US");
const pct = (v) => `${Math.round(v * 100)}%`;
const sum = (a) => a.reduce((x, y) => x + y, 0);
const bytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

const KIND = {
  schema: { label: "Schema error", color: "var(--s7)" },
  data: { label: "Data problem", color: "var(--s5)" },
  ntia: { label: "NTIA gap", color: "var(--s3)" },
  pipeline: { label: "Pipeline hint", color: "var(--s4)" },
};
const CHANGE_KIND = { fix: { label: "Repair", color: "var(--s2)" }, layout: { label: "Layout", color: "var(--s1)" } };
const SEVERITY = {
  INFO: { label: "Info", color: "var(--before)" },
  WARN: { label: "Warning", color: "var(--warn)" },
  DATA_LOSS: { label: "Data removed", color: "var(--bad)" },
};
const STATUS = {
  supported: { label: "Supported", color: "var(--good)", scanned: true },
  fixed: { label: "Format repaired", color: "var(--s1)", scanned: true },
  remapped: { label: "Remapped from URL", color: "var(--s7)", scanned: true },
  versionless: { label: "No version", color: "var(--s4)", scanned: true },
  unsupported: { label: "Type not supported", color: "var(--bad)", scanned: false },
  "os-package": { label: "OS package", color: "var(--s2)", scanned: false },
  missing: { label: "No purl", color: "var(--before)", scanned: false },
  malformed: { label: "Malformed purl", color: "var(--s5)", scanned: false },
};
const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--s7)", "var(--s8)"];

const ICON = {
  check: '<svg viewBox="0 0 24 24" width="{s}" height="{s}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="{s}" height="{s}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  alert: '<svg viewBox="0 0 24 24" width="{s}" height="{s}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v6M12 17h.01"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="{s}" height="{s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5"/><path d="M4 18v1a2 2 0 002 2h12a2 2 0 002-2v-1"/></svg>',
  up: '<svg viewBox="0 0 24 24" width="{s}" height="{s}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6m0 0l-5 5m5-5l5 5"/></svg>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>',
};
const icon = (name, s = 16) => ICON[name].replaceAll("{s}", s);

const state = { result: null, info: null, busy: false };

/* ============================== theme ============================== */
function setTheme(mode) {
  if (mode) document.documentElement.dataset.theme = mode;
  const dark = document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  $("#theme-icon").innerHTML = dark ? ICON.sun : ICON.moon;
  try { if (mode) localStorage.setItem("sbom-theme", mode); } catch { /* storage may be blocked */ }
  if (state.graph) state.graph.redraw();
}
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem("sbom-theme"); } catch { /* ignore */ }
  if (saved) document.documentElement.dataset.theme = saved;
  setTheme(null);
  $("#theme-btn").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
    setTheme(dark ? "light" : "dark");
  });
}

/* ============================== tooltip ============================== */
const tip = $("#tip");
document.addEventListener("mousemove", (e) => {
  const t = e.target.closest ? e.target.closest("[data-tip]") : null;
  if (!t) { tip.hidden = true; return; }
  // text only: the first line is the title, the others are details (SBOM text is never parsed as HTML)
  tip.replaceChildren();
  t.getAttribute("data-tip").split("\n").forEach((line, i) => {
    if (i === 0) { const b = document.createElement("b"); b.textContent = line; tip.append(b); }
    else tip.append(document.createElement("br"), document.createTextNode(line));
  });
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = `${Math.min(e.clientX + 14, innerWidth - w - 8)}px`;
  tip.style.top = `${e.clientY + 18 + h > innerHeight ? e.clientY - h - 12 : e.clientY + 18}px`;
});
document.addEventListener("mouseleave", () => { tip.hidden = true; });

/* ============================== charts ============================== */
/** data-tip attribute: first line = title, further lines = details; plain text only. */
const tp = (...lines) => `data-tip="${esc(lines.filter((l) => l !== "" && l != null).join("\n"))}"`;

function ring(value, label, { color = "var(--accent)", size = 132, tipText = "" } = {}) {
  const r = 50, c = 2 * Math.PI * r, len = Math.max(0, Math.min(1, value / 100)) * c;
  return `<div class="ring" ${tipText ? `data-tip="${esc(tipText)}"` : ""}>
    <svg width="${size}" height="${size}" viewBox="0 0 132 132" role="img" aria-label="${esc(label)} ${value}%">
      <circle cx="66" cy="66" r="${r}" fill="none" style="stroke:var(--grid)" stroke-width="13"/>
      <circle class="ring-arc" cx="66" cy="66" r="${r}" fill="none" style="stroke:${color}" stroke-width="13" stroke-linecap="round"
        transform="rotate(-90 66 66)" stroke-dasharray="0 ${c}" data-dash="${len} ${c - len}"/>
      <text x="66" y="73" text-anchor="middle" font-size="26">${value}<tspan font-size="14" dy="-4">%</tspan></text>
    </svg><div class="ring-label">${esc(label)}</div></div>`;
}

function donut(items, { center = "", sub = "", size = 176 } = {}) {
  items = items.filter((i) => i.value > 0);
  const total = sum(items.map((i) => i.value));
  const r = 62, c = 2 * Math.PI * r;
  let off = 0, parts = "";
  for (const it of items) {
    const frac = it.value / total, len = Math.max(frac * c - (items.length > 1 ? 2.5 : 0), 0.6);
    parts += `<circle cx="80" cy="80" r="${r}" fill="none" style="stroke:${it.color};cursor:default" stroke-width="20"
      stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 80 80)"
      ${tp(it.label, `${num(it.value)} (${(frac * 100).toFixed(frac < 0.1 ? 1 : 0)}%)`)}/>`;
    off += frac * c;
  }
  if (!items.length) parts = `<circle cx="80" cy="80" r="${r}" fill="none" style="stroke:var(--grid)" stroke-width="20"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 160 160" role="img" aria-label="${esc(center)} ${esc(sub)}">
    <circle cx="80" cy="80" r="${r}" fill="none" style="stroke:var(--grid)" stroke-width="20" opacity=".35"/>${parts}
    <text x="80" y="${sub ? 80 : 87}" text-anchor="middle" font-size="27" font-weight="700" style="fill:var(--text)">${esc(center)}</text>
    ${sub ? `<text x="80" y="99" text-anchor="middle" font-size="11" style="fill:var(--text-3)">${esc(sub)}</text>` : ""}</svg>`;
}

function legend(items, { col = false, values = true } = {}) {
  return `<div class="legend ${col ? "col" : ""}">${items.filter((i) => i.value > 0 || !values).map((i) =>
    `<span class="key"><i style="background:${i.color}"></i>${esc(i.label)}${values ? ` <b>${num(i.value)}</b>` : ""}</span>`).join("")}</div>`;
}

function hbars(rows, { max, unit = "" } = {}) {
  max = max || Math.max(1, ...rows.map((r) => r.value));
  return rows.map((r) => `<div class="bar-row" ${tp(r.label, `${num(r.value)}${unit}`, r.tip)}>
    <div class="name">${esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</div>
    <div class="track"><div class="fill" style="background:${r.color || "var(--accent)"}" data-w="${(r.value / max) * 100}"></div></div>
    <div class="num">${num(r.value)}</div></div>`).join("");
}

function stacked(items) {
  const total = Math.max(1, sum(items.map((i) => i.value)));
  return `<div class="stack">${items.filter((i) => i.value > 0).map((i) =>
    `<span style="flex-grow:${i.value};background:${i.color}" ${tp(i.label, `${num(i.value)} (${((i.value / total) * 100).toFixed(1)}%)`)}></span>`).join("")}</div>`;
}

function beforeAfter(row) {
  const line = (cls, label, v, detail, color) => `<div class="ba-line"><span>${label}</span>
    <div class="track"><div class="fill" style="background:${color}" data-w="${v * 100}"></div></div><span class="v">${esc(detail)}</span></div>`;
  return `<div class="ba-row"><div class="name">${esc(row.label)}</div><div class="ba-bars">
    ${line("b", "Before", row.before, row.before_detail, "var(--before)")}
    ${line("a", "After", row.after, row.after_detail, row.after >= 1 ? "var(--good)" : "var(--accent)")}</div></div>`;
}

/* ============================== dashboard sections ============================== */
function heroState(r) {
  if (!r.ok) return { color: "var(--bad)", icon: "x", title: "This SBOM could not be fixed", note: r.error };
  if (r.exit.code === 0) return { color: "var(--good)", icon: "check", title: "Already clean: nothing to change", note: "" };
  if (r.exit.code === 1) return { color: "var(--good)", icon: "check", title: "Fixed and ready for Checkmarx", note: "" };
  if (r.exit.code === 7) return { color: "var(--bad)", icon: "alert", title: "Fixed, but Checkmarx cannot scan any component", note: "No component has a purl type Checkmarx scans. Do not upload this file; use a generator that writes purls." };
  return { color: "var(--warn)", icon: "alert", title: `Fixed, with a warning: ${r.exit.text}`, note: "Read the notes below before uploading." };
}

function heroSection(r) {
  const st = heroState(r);
  const dl = (kind, text, primary) => r.id ? `<a class="btn ${primary ? "primary" : ""}" href="/download/${r.id}/${kind}">${icon("down", 15)}${text}</a>` : "";
  return `<section class="card hero" id="sec-overview" style="--state:${st.color}">
    <div class="hero-top">
      <div class="hero-title">
        <div class="state-badge">${icon(st.icon, 26)}</div>
        <div><h2>${esc(st.title)}</h2>
          <div class="meta"><span><b>${esc(r.file.name)}</b></span><span>${bytes(r.file.size)}</span>
            <span>${esc(r.input?.spec || "")} ${esc(r.input?.version || "")}${r.input?.generator ? " &middot; made by " + esc(r.input.generator) : ""}</span>
            <span>checked in ${r.seconds}s</span></div></div>
      </div>
      <div class="downloads">
        ${r.ok ? dl("sbom", "Fixed SBOM", true) : ""}
        ${dl("notes", "Tech notes")}${dl("suggestions", "What to fix")}${dl("report", "Report (JSON)")}${dl("zip", "Download all (.zip)")}
      </div>
    </div>
    ${st.note ? `<div class="hero-note ${r.ok ? "warn" : ""}">${esc(st.note)}</div>` : ""}
    ${r.ok ? `<div class="hero-note">Upload <b>${esc(r.output.name)}</b> to Checkmarx, never the original. Output: CycloneDX ${esc(r.output.version)}, ${num(r.output.components)} components, ${num(r.output.dependencies)} dependency entries. Tool name set to <b>${esc(r.tool.replace(/^Tool\s+/, ""))}</b></div>` : ""}
  </section>`;
}

function kpiSection(r) {
  const cx = r.checkmarx?.after, cb = r.checkmarx?.before;
  const covAfter = cx && cx.total ? cx.scanned / cx.total : null, covBefore = cb && cb.total ? cb.scanned / cb.total : null;
  const delta = (after, before) => {   // both in percent points
    const d = Math.round((after - before) * 10) / 10;
    return d > 0 ? `<span class="delta up">${icon("up", 12)}+${d} pts</span>` : `<span class="delta same">no change</span>`;
  };
  const card = (label, value, note, color) => `<div class="card kpi"><div class="label"><span class="dot" style="background:${color}"></span>${label}</div>
    <div class="value" data-count="${typeof value === "number" ? value : ""}">${typeof value === "number" ? num(value) : value}</div><div class="note">${note}</div></div>`;
  const rd = r.readiness;
  return `<div class="kpis">
    ${card("Mistakes found", r.counts.problems, "distinct problems in your file", "var(--s5)")}
    ${card("Repairs made", r.counts.fixes, "fixed automatically", "var(--s2)")}
    ${card("Layout changes", r.counts.layout, "reshaped for Checkmarx", "var(--s1)")}
    ${card("Components", r.output?.components ?? r.input?.components ?? 0, r.input ? `${num(r.input.components)} in the original` : "", "var(--s3)")}
    ${card("Checkmarx can scan", covAfter === null ? "-" : pct(covAfter), covAfter === null ? "" : `${num(cx.scanned)} of ${num(cx.total)} &middot; ${delta(covAfter * 100, (covBefore ?? 0) * 100)}`, "var(--good)")}
    ${card("Readiness score", rd ? `${rd.after}%` : "-", rd ? `was ${rd.before}% &middot; ${delta(rd.after, rd.before)}` : "", "var(--accent)")}
  </div>`;
}

function readinessSection(r) {
  const rd = r.readiness;
  if (!rd) return "";
  return `<div class="section"><h2>Before and after</h2><div class="grid g-wide-r">
    <div class="card"><div class="card-head"><div><h3>Readiness score</h3><div class="sub">Average of the ${rd.rows.length} checks Checkmarx cares about</div></div></div>
      <div class="rings">${ring(rd.before, "Your file", { color: "var(--before)", tipText: "Score of the original file" })}
      <span class="ring-arrow">${icon("up", 22).replace("<svg", '<svg style="transform:rotate(90deg)"')}</span>
      ${ring(rd.after, "Fixed file", { color: rd.after >= 90 ? "var(--good)" : "var(--accent)", tipText: "Score of the fixed file" })}</div>
      <p class="notice" style="text-align:center">A score is only a guide. The detail on the right shows exactly what changed.</p></div>
    <div class="card"><div class="card-head"><div><h3>What got better</h3><div class="sub">Each check: your original file against the fixed file</div></div></div>
      ${rd.rows.map(beforeAfter).join("")}</div></div></div>`;
}

function problemsSection(r) {
  const by = r.counts.problems_by_kind || {};
  const items = Object.keys(KIND).map((k) => ({ label: KIND[k].label + "s", value: by[k] || 0, color: KIND[k].color }));
  const list = r.problems.length ? r.problems.map((p, i) => {
    const k = KIND[p.kind] || KIND.data;
    const count = p.kind === "schema" ? `${num(p.count)}&times;` : p.total != null ? `${num(p.count)} of ${num(p.total)}` : p.count != null ? num(p.count) : "";
    return `<div class="problem"><div class="problem-head"><span class="badge"><i style="background:${k.color}"></i>${k.label}</span>
      <div class="problem-title">${i + 1}. ${esc(p.issue)}</div><div class="problem-count">${count}</div></div>
      <div class="problem-body">
        ${p.which?.length ? `<div><span class="k">Which</span>${p.which.map((w) => `<code>${esc(w)}</code>`).join(" ")}${p.more ? ` <span style="color:var(--text-3)">and ${num(p.more)} more</span>` : ""}</div>` : ""}
        <div><span class="k">How to fix</span>${esc(p.fix)}</div></div></div>`;
  }).join("") : `<div class="empty">${icon("check", 40)}<strong>No mistakes found</strong><span>Your file already follows its schema and has the data Checkmarx needs.</span></div>`;
  return `<div class="section" id="sec-problems"><h2>Mistakes found in your file</h2><div class="grid g-wide-r">
    <div class="card"><div class="card-head"><div><h3>By type</h3><div class="sub">${num(r.counts.problems)} distinct problems</div></div></div>
      <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;justify-content:center">
      ${donut(items, { center: num(r.counts.problems), sub: "problems" })}${legend(items, { col: true })}</div>
      ${r.counts.original_not_validated ? `<p class="notice">Schema check skipped: ${esc(r.counts.original_not_validated)}</p>` : `<p class="notice">${num(r.counts.schema_errors_original)} schema error group(s) in the original file.</p>`}</div>
    <div class="card"><div class="card-head"><div><h3>What is wrong and how to fix it at the source</h3><div class="sub">Fix these in the tool that creates your SBOM so the next one is correct on its own</div></div></div>
      <div class="problem-list">${list}</div></div></div></div>`;
}

function changesSection(r) {
  const kinds = [{ label: "Repairs (mistakes fixed)", value: r.counts.fixes, color: CHANGE_KIND.fix.color },
    { label: "Layout (reshaped for Checkmarx)", value: r.counts.layout, color: CHANGE_KIND.layout.color }];
  const sev = Object.keys(SEVERITY).map((k) => ({ label: SEVERITY[k].label, value: r.counts.severity?.[k] || 0, color: SEVERITY[k].color }));
  const top = r.rules.slice(0, 10).map((x) => ({ label: x.title, sub: x.id, value: x.count, color: CHANGE_KIND[x.kind].color, tip: x.example }));
  return `<div class="section" id="sec-changes"><h2>What was changed</h2><div class="grid g-wide">
    <div class="card"><div class="card-head"><div><h3>Changes by rule</h3><div class="sub">Top ${top.length} of ${r.rules.length} rules &middot; hover a bar for an example</div></div>
      ${legend(kinds.map((k) => ({ ...k, label: k.label.split(" (")[0] })), { values: false })}</div>
      ${top.length ? hbars(top) : '<div class="empty"><strong>No changes were needed</strong></div>'}</div>
    <div class="grid" style="align-content:start">
      <div class="card"><div class="card-head"><div><h3>Repairs vs layout</h3><div class="sub">${num(r.counts.changes)} changes in total</div></div></div>
        <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;justify-content:center">${donut(kinds, { center: num(r.counts.changes), sub: "changes", size: 150 })}${legend(kinds, { col: true })}</div></div>
      <div class="card"><div class="card-head"><div><h3>Impact</h3><div class="sub">Data removed = Checkmarx does not read it; your original keeps it</div></div></div>
        ${stacked(sev)}<div style="margin-top:12px">${legend(sev)}</div></div>
    </div></div></div>`;
}

function ntiaTile(el, orig, fixed) {
  const find = (rep) => rep?.elements.find((e) => e.name === el);
  const line = (label, e, color) => {
    if (!e) return "";
    if (e.kind === "component") return `<div class="ntia-line"><span>${label}</span><div class="track"><div class="fill" style="background:${color}" data-w="${(e.total ? e.covered / e.total : 1) * 100}"></div></div><span class="v">${num(e.covered)} / ${num(e.total)}</span></div>`;
    return `<div class="ntia-line"><span>${label}</span><span></span><span class="status ${e.ok ? "ok" : "no"}">${icon(e.ok ? "check" : "x", 13)}${e.ok ? "Yes" : "Missing"}</span></div>`;
  };
  return `<div class="ntia-tile"><h4>${esc(el)}</h4>${line("Before", find(orig), "var(--before)")}${line("After", find(fixed), "var(--accent)")}</div>`;
}

function ntiaSection(r) {
  const o = r.ntia.original, c = r.ntia.corrected;
  if (!o && !c) return "";
  const names = (o || c).elements.map((e) => e.name);
  const verdict = (rep, label) => rep ? `<span class="status ${rep.passed ? "ok" : "no"}">${icon(rep.passed ? "check" : "x", 14)}${label}: ${rep.passed ? "PASS" : "FAIL"} (${rep.passed_count} of ${rep.element_count})</span>` : "";
  return `<div class="section" id="sec-ntia"><h2>NTIA minimum elements</h2><div class="card">
    <div class="card-head"><div><h3>The seven elements a government-grade SBOM needs</h3>
      <div class="sub">The fixed file keeps supplier, author, publisher and description of a component only where your original had them (nothing is invented) and drops the SBOM-level author, so it can still fail NTIA. Keep your original for NTIA and audits, and close the gaps at the source.</div></div>
      <div style="display:grid;gap:4px;justify-items:end">${verdict(o, "Original")}${verdict(c, "Fixed")}</div></div>
    <div class="ntia-grid">${names.map((n) => ntiaTile(n, o, c)).join("")}</div></div></div>`;
}

function checkmarxSection(r) {
  const a = r.checkmarx?.after, b = r.checkmarx?.before;
  if (!a) return "";
  const segs = (cov) => Object.keys(STATUS).map((k) => ({ label: STATUS[k].label, value: cov.by_status[k] || 0, color: STATUS[k].color }));
  const eco = a.by_type.slice(0, 7).map((t, i) => ({ label: t.type, value: t.count, color: SERIES[i] }));
  const rest = sum(a.by_type.slice(7).map((t) => t.count));
  if (rest) eco.push({ label: "Other", value: rest, color: "var(--before)" });
  const lic = r.licences.top.map(([n, v], i) => ({ label: n, value: v, color: "var(--s1)" }));
  if (r.licences.unknown) lic.push({ label: "No licence", value: r.licences.unknown, color: "var(--before)" });
  return `<div class="section" id="sec-checkmarx"><h2>Checkmarx scan coverage</h2><div class="grid g-wide">
    <div class="card"><div class="card-head"><div><h3>Can Checkmarx scan each component?</h3><div class="sub">A component is scanned when it has a purl of a type Checkmarx supports</div></div></div>
      <div class="stack-label"><span>Before (your file)</span><span>${b ? `${num(b.scanned)} of ${num(b.total)} scannable` : ""}</span></div>${b ? stacked(segs(b)) : ""}
      <div class="stack-label"><span>After (fixed file)</span><span>${num(a.scanned)} of ${num(a.total)} scannable</span></div>${stacked(segs(a))}
      <div style="margin-top:14px">${legend(segs(a).map((s, i) => ({ ...s, value: (a.by_status[Object.keys(STATUS)[i]] || 0) })))}</div>
      <div class="table-wrap" style="margin-top:16px;max-height:260px"><table><thead><tr><th>Package type</th><th>Checkmarx scans it as</th><th class="num">Components</th><th>Status</th></tr></thead><tbody>
      ${a.by_type.map((t) => `<tr><td class="mono">${esc(t.type)}</td><td>${esc(t.manager)}</td><td class="num">${num(t.count)}</td><td>${esc(t.status)}</td></tr>`).join("")}</tbody></table></div></div>
    <div class="grid" style="align-content:start">
      <div class="card"><div class="card-head"><div><h3>Ecosystems</h3><div class="sub">Package types in the fixed file</div></div></div>
        <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;justify-content:center">${donut(eco, { center: num(a.total), sub: "components", size: 150 })}${legend(eco, { col: true })}</div></div>
      <div class="card"><div class="card-head"><div><h3>Licences</h3><div class="sub">Components per licence (top ${r.licences.top.length})</div></div></div>
        ${lic.length ? hbars(lic) : '<div class="empty"><strong>No licence data</strong></div>'}</div>
    </div></div></div>`;
}

function graphSection(r) {
  if (!r.graph || !r.graph.nodes.length) return "";
  const g = r.graph;
  const types = {};
  g.nodes.forEach((n) => { types[n.type] = (types[n.type] || 0) + 1; });
  const order = Object.keys(types).sort((x, y) => types[y] - types[x]);
  const lg = order.slice(0, 7).map((t, i) => ({ label: t, value: types[t], color: SERIES[i] }));
  const pickOptions = g.nodes.map((n, i) => ({ i, label: n.label }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true }))
    .map((n) => `<option value="${n.i}">${esc(n.label)}</option>`).join("");
  if (order.length > 7) lg.push({ label: "other", value: sum(order.slice(7).map((t) => types[t])), color: "var(--before)" });
  return `<div class="section" id="sec-graph"><h2>Dependency map</h2><div class="card">
    <div class="card-head"><div><h3>How the components depend on each other</h3>
      <div class="sub">${num(g.total_nodes)} components, ${num(g.total_edges)} links${g.truncated ? ` &middot; showing the ${num(g.nodes.length)} best connected` : ""}. Pick a component by name or click a dot to see its dependencies, drag to move, scroll to zoom.</div></div>
      <div class="graph-tools">
        <label class="field"><span>Component</span><select id="graph-pick" aria-label="Select a component by name">
          <option value="">Select by name (A-Z)</option>${pickOptions}</select></label>
        <button class="btn" type="button" id="graph-reset">Reset view</button></div></div>
    <div class="graph-box"><canvas id="graph" aria-label="Dependency graph" style="height:${g.nodes.length < 8 ? 240 : 520}px"></canvas><div class="graph-hint">Click a dot to list its dependencies &middot; drag to move &middot; scroll to zoom</div></div>
    <div class="graph-info" id="graph-info"><div class="gi-empty">Click any dot to see the components it depends on and the components that use it.</div></div>
    <div class="graph-legend">${legend(lg, { values: true })}</div></div></div>`;
}

function exploreSection(r) {
  const tabs = [
    ["changes", `Changes <span class="n">${num(r.changes_total)}</span>`],
    ["components", `Components <span class="n">${num(r.components_total)}</span>`],
    ["sbom", "Fixed SBOM"], ["notes", "Tech notes"], ["advice", "What to fix"],
  ];
  if (r.schema_errors.length) tabs.push(["schema", `Schema errors <span class="n">${r.schema_errors.length}</span>`]);
  if (r.findings.length) tabs.push(["findings", `Not changed <span class="n">${r.findings.length}</span>`]);
  return `<div class="section" id="sec-explore"><h2>Explore the details</h2><div class="card">
    <div class="tabs" role="tablist">${tabs.map(([id, label], i) => `<button class="tab" role="tab" data-tab="${id}" aria-selected="${i === 0}">${label}</button>`).join("")}</div>
    <div id="tabpane"></div></div></div>`;
}

/* ---------- tab panes ---------- */
function highlightJson(text) {
  return esc(text).replace(/(&quot;(?:(?!&quot;).)*&quot;)(\s*:)?|\b(true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g,
    (m, str, colon, lit) => (str ? `<span style="color:var(${colon ? "--s7" : "--s3"})">${str}</span>${colon || ""}` : lit ? `<span style="color:var(--s2)">${m}</span>` : `<span style="color:var(--s1)">${m}</span>`));
}

function pagedTable(host, rows, columns, { pageSize = 100, empty = "Nothing matches." } = {}) {
  let shown = pageSize;
  const draw = () => {
    const slice = rows.slice(0, shown);
    host.innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr>${columns.map((c) => `<th>${c.head}</th>`).join("")}</tr></thead>
      <tbody>${slice.map((row) => `<tr>${columns.map((c) => `<td class="${c.cls || ""}">${c.cell(row)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      ${rows.length > shown ? `<button class="btn more" type="button">Show ${Math.min(pageSize, rows.length - shown)} more (${num(rows.length - shown)} left)</button>` : ""}`
      : `<div class="empty"><span>${esc(empty)}</span></div>`;
    const more = $(".more", host);
    if (more) more.addEventListener("click", () => { shown += pageSize; draw(); });
  };
  draw();
}

function paneChanges(r, pane) {
  // the dropdown lists rule NAMES (A-Z); the value stays the rule id. A name used by two rules gets its id added.
  const byId = new Map(r.rules.map((x) => [x.id, x.title]));
  r.changes.forEach((c) => { if (!byId.has(c.rule)) byId.set(c.rule, c.title || c.rule); });
  const titleCount = {};
  byId.forEach((t) => { titleCount[t] = (titleCount[t] || 0) + 1; });
  const ruleOptions = [...byId].map(([id, title]) => ({ id, label: titleCount[title] > 1 ? `${title} (${id})` : title }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true }));
  pane.innerHTML = `<div class="toolbar"><input type="search" id="q" placeholder="Search path, rule or reason">
    <select id="kind"><option value="">Repairs and layout</option><option value="fix">Repairs only</option><option value="layout">Layout only</option></select>
    <select id="rule"><option value="">All rules</option>${ruleOptions.map((x) => `<option value="${esc(x.id)}">${esc(x.label)}</option>`).join("")}</select>
    <span class="grow"></span><span class="count" id="cnt"></span></div><div id="tbl"></div>
    ${r.changes_total > r.changes.length ? `<p class="notice">Showing the first ${num(r.changes.length)} of ${num(r.changes_total)} changes. The report (JSON) has the same limit; the tech notes list every rule.</p>` : ""}`;
  const apply = () => {
    const q = $("#q", pane).value.toLowerCase(), k = $("#kind", pane).value, ru = $("#rule", pane).value;
    const rows = r.changes.filter((c) => (!k || c.kind === k) && (!ru || c.rule === ru) &&
      (!q || `${c.path} ${c.rule} ${c.title} ${c.reason} ${c.before} ${c.after}`.toLowerCase().includes(q)));
    $("#cnt", pane).textContent = `${num(rows.length)} shown`;
    pagedTable($("#tbl", pane), rows, [
      { head: "Type", cell: (c) => `<span class="badge"><i style="background:${CHANGE_KIND[c.kind].color}"></i>${CHANGE_KIND[c.kind].label}</span>` },
      { head: "Rule", cell: (c) => `<b>${esc(c.rule)}</b><br><span style="color:var(--text-3)">${esc(c.title)}</span>` },
      { head: "Where", cls: "mono", cell: (c) => esc(c.path) },
      { head: "Before", cls: "mono", cell: (c) => (c.before === "null" ? '<span style="color:var(--text-3)">(none)</span>' : `<span class="before">${esc(c.before)}</span>`) },
      { head: "After", cls: "mono", cell: (c) => (c.action === "removed" ? '<span style="color:var(--text-3)">(removed)</span>' : `<span class="after">${esc(c.after)}</span>`) },
      { head: "Why", cell: (c) => esc(c.reason) },
    ]);
  };
  ["q", "kind", "rule"].forEach((id) => $("#" + id, pane).addEventListener("input", apply));
  apply();
}

function paneComponents(r, pane) {
  pane.innerHTML = `<div class="toolbar"><input type="search" id="q" placeholder="Search name, version, purl, supplier or author">
    <select id="f"><option value="">All components</option><option value="scan">Checkmarx can scan</option><option value="noscan">Checkmarx cannot scan</option>
      <option value="fixed">Had repairs</option><option value="nolic">No licence</option></select>
    <span class="grow"></span><span class="count" id="cnt"></span></div><div id="tbl"></div>`;
  const apply = () => {
    const q = $("#q", pane).value.toLowerCase(), f = $("#f", pane).value;
    const rows = r.components.filter((c) => {
      if (f === "scan" && !(STATUS[c.status]?.scanned)) return false;
      if (f === "noscan" && STATUS[c.status]?.scanned) return false;
      if (f === "fixed" && !c.fixes) return false;
      if (f === "nolic" && c.licences.length) return false;
      return !q || `${c.name} ${c.version} ${c.purl} ${c.supplier} ${c.author} ${c.publisher}`.toLowerCase().includes(q);
    });
    $("#cnt", pane).textContent = `${num(rows.length)} shown`;
    pagedTable($("#tbl", pane), rows, [
      { head: "Component", cell: (c) => `<b>${esc(c.name)}</b>` },
      { head: "Version", cls: "mono", cell: (c) => esc(c.version) },
      { head: "purl", cls: "mono", cell: (c) => esc(c.purl) },
      { head: "Licence", cell: (c) => (c.licences.length ? esc(c.licences.join(", ")) : '<span style="color:var(--text-3)">none</span>') },
      { head: "Supplier / author", cell: (c) => {
        const who = [c.supplier && `Supplier: ${c.supplier}`, c.author && `Author: ${c.author}`, c.publisher && `Publisher: ${c.publisher}`].filter(Boolean);
        return who.length ? `<span ${tp(...who, c.description)}>${esc(c.supplier || c.author || c.publisher)}</span>` : '<span style="color:var(--text-3)">not in your SBOM</span>';
      } },
      { head: "Checkmarx", cell: (c) => { const s = STATUS[c.status]; return s ? `<span class="badge" data-tip="${esc(c.reason || s.label)}"><i style="background:${s.color}"></i>${s.label}</span>` : ""; } },
      { head: "Repairs", cls: "num", cell: (c) => (c.fixes ? `<b>${c.fixes}</b>` : '<span style="color:var(--text-3)">0</span>') },
    ]);
  };
  ["q", "f"].forEach((id) => $("#" + id, pane).addEventListener("input", apply));
  apply();
}

function paneText(text, { wrap = false, json = false, limit = 250000, download = null } = {}) {
  const clipped = text.length > limit;
  const body = clipped ? text.slice(0, limit) : text;
  return `<div class="toolbar"><button class="btn" type="button" data-copy>Copy</button>${download ? `<a class="btn" href="${download}">${icon("down", 14)}Download</a>` : ""}
    <span class="grow"></span><span class="count">${num(text.length)} characters</span></div>
    <pre class="viewer ${wrap ? "wrap" : ""}">${json ? highlightJson(body) : esc(body)}</pre>
    ${clipped ? `<p class="notice">Showing the first ${num(limit)} characters. Download the file for the rest.</p>` : ""}`;
}

function showTab(r, id) {
  const pane = $("#tabpane");
  $$(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === id)));
  const dl = (k) => (r.id ? `/download/${r.id}/${k}` : null);
  if (id === "changes") paneChanges(r, pane);
  else if (id === "components") paneComponents(r, pane);
  else if (id === "sbom") pane.innerHTML = r.files.sbom ? paneText(r.files.sbom, { json: true, download: dl("sbom") }) : '<div class="empty"><span>No fixed file was produced.</span></div>';
  else if (id === "notes") pane.innerHTML = paneText(r.files.tech_notes, { wrap: true, download: dl("notes") });
  else if (id === "advice") pane.innerHTML = paneText(r.files.suggestions, { wrap: true, download: dl("suggestions") });
  else if (id === "schema") {
    pane.innerHTML = '<div id="tbl"></div>';
    pagedTable($("#tbl", pane), r.schema_errors, [
      { head: "Rule", cls: "mono", cell: (e) => esc(e.keyword) }, { head: "Where", cls: "mono", cell: (e) => esc(e.path) },
      { head: "Times", cls: "num", cell: (e) => num(e.count) }, { head: "Message", cell: (e) => esc(e.message) }]);
  } else if (id === "findings") {
    pane.innerHTML = '<div id="tbl"></div>';
    pagedTable($("#tbl", pane), r.findings, [
      { head: "Rule", cls: "mono", cell: (e) => esc(e.rule) }, { head: "Where", cls: "mono", cell: (e) => esc(e.path || "/") },
      { head: "What was noticed", cell: (e) => esc(e.message) }]);
  }
  const copy = $("[data-copy]", pane);
  if (copy) copy.addEventListener("click", async () => {
    const text = $("pre.viewer", pane).textContent;
    try { await navigator.clipboard.writeText(id === "sbom" ? r.files.sbom : text); copy.textContent = "Copied"; } catch { copy.textContent = "Copy failed"; }
    setTimeout(() => { copy.textContent = "Copy"; }, 1500);
  });
  animateIn(pane);
}

/* ============================== dependency graph ============================== */
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888"; }

function createGraph(canvas, g, resetBtn) {
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let W = 0, H = 0, hover = null, drag = null, pan = null, alpha = 1, raf = 0, sel = null, downAt = null;
  const info = document.getElementById("graph-info");
  const picker = document.getElementById("graph-pick");
  const view = { k: 1, x: 0, y: 0 };
  const types = {};
  g.nodes.forEach((n) => { types[n.type] = (types[n.type] || 0) + 1; });
  const order = Object.keys(types).sort((a, b) => types[b] - types[a]);
  const colorOf = (t) => { const i = order.indexOf(t); return i > -1 && i < 7 ? `var(--s${i + 1})` : "var(--before)"; };
  const nodes = g.nodes.map((n, i) => {
    const a = i * 2.399963, rad = 14 * Math.sqrt(i + 1) + 6;
    return { ...n, i, x: n.root ? 0 : Math.cos(a) * rad, y: n.root ? 0 : Math.sin(a) * rad, vx: 0, vy: 0, r: n.root ? 9 : 3.2 + Math.sqrt(n.degree) * 1.5 };
  });
  const edges = g.edges.map(([a, b]) => ({ a: nodes[a], b: nodes[b] }));
  const adj = nodes.map(() => new Set());
  g.edges.forEach(([a, b]) => { adj[a].add(b); adj[b].add(a); });

  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    draw();
  }
  function reset() { view.k = 1; view.x = W / 2; view.y = H / 2; draw(); }

  function tick() {
    const n = nodes.length;
    for (let i = 0; i < n; i++) {
      const p = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const q = nodes[j];
        let dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy;
        if (d2 > 90000) continue;
        if (d2 < 1) { dx = Math.random() - .5; dy = Math.random() - .5; d2 = 1; }
        const f = (420 * alpha) / d2, d = Math.sqrt(d2);
        p.vx += (dx / d) * f * 12; p.vy += (dy / d) * f * 12; q.vx -= (dx / d) * f * 12; q.vy -= (dy / d) * f * 12;
      }
    }
    for (const e of edges) {
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 46) * 0.018 * alpha;
      e.a.vx += (dx / d) * f; e.a.vy += (dy / d) * f; e.b.vx -= (dx / d) * f; e.b.vy -= (dy / d) * f;
    }
    for (const p of nodes) {
      p.vx -= p.x * 0.006 * alpha; p.vy -= p.y * 0.006 * alpha;
      if (p === drag) { p.vx = 0; p.vy = 0; continue; }
      p.vx *= 0.82; p.vy *= 0.82; p.x += p.vx; p.y += p.vy;
    }
    alpha *= 0.985;
  }
  function loop() {
    for (let i = 0; i < 3; i++) tick();
    draw();
    raf = alpha > 0.03 || drag ? requestAnimationFrame(loop) : 0;
  }
  function wake(a = 0.6) { alpha = Math.max(alpha, a); if (!raf) raf = requestAnimationFrame(loop); }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.translate(view.x, view.y); ctx.scale(view.k, view.k);
    const line = cssVar("--before"), ink = cssVar("--text");
    const focus = sel || hover;
    const hi = focus ? adj[focus.i] : null;
    ctx.lineWidth = 1 / view.k;
    ctx.strokeStyle = line; ctx.globalAlpha = focus ? 0.14 : 0.38;
    ctx.beginPath();
    for (const e of edges) { ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y); }
    ctx.stroke();
    if (focus) {
      ctx.globalAlpha = 0.9; ctx.strokeStyle = cssVar("--accent"); ctx.lineWidth = 1.6 / view.k; ctx.beginPath();
      for (const e of edges) if (e.a === focus || e.b === focus) { ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const surface = cssVar("--surface-2");
    nodes.forEach((p, i) => {
      const dim = focus && p !== focus && !hi.has(i);
      ctx.globalAlpha = dim ? 0.25 : 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832);
      ctx.fillStyle = p.root ? ink : cssVar(colorOf(p.type).slice(4, -1));
      ctx.fill(); ctx.lineWidth = (p === sel ? 3 : 1.5) / view.k; ctx.strokeStyle = p === sel ? cssVar("--accent") : surface; ctx.stroke();
    });
    ctx.globalAlpha = 1;
    if (focus) {
      ctx.font = `${12 / view.k}px system-ui, sans-serif`;
      const shown = [focus];
      if (sel) { let c = 0; for (const j of hi) { if (c++ >= 40) break; shown.push(nodes[j]); } }
      for (const p of shown) {
        const label = p.label, w = ctx.measureText(label).width;
        const lx = p.x + p.r + 6 / view.k, ly = p.y + 4 / view.k;
        ctx.fillStyle = cssVar("--surface"); ctx.globalAlpha = 0.92;
        ctx.fillRect(lx - 3 / view.k, ly - 12 / view.k, w + 6 / view.k, 17 / view.k);
        ctx.globalAlpha = 1; ctx.fillStyle = ink; ctx.fillText(label, lx, ly);
      }
    }
  }
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function showInfo() {
    if (!info) return;
    if (!sel) { info.innerHTML = '<div class="gi-empty">Click any dot to see the components it depends on and the components that use it.</div>'; return; }
    const list = (title, items) => `<div class="gi-col"><h4>${title} <span>${num(items.length)}</span></h4>${
      items.length ? `<div class="gi-chips">${items.map((x) => `<span class="gi-chip">${esc(x)}</span>`).join("")}</div>` : '<div class="gi-none">none</div>'}</div>`;
    info.innerHTML = `<div class="gi-head"><strong>${esc(sel.label)}</strong> <span class="gi-type">${esc(sel.type)}</span>
      <button class="btn" type="button" id="gi-clear">Clear</button></div>
      <div class="gi-cols">${list("Depends on", sel.deps || [])}${list("Used by", sel.used_by || [])}</div>`;
    document.getElementById("gi-clear")?.addEventListener("click", () => { sel = null; syncPicker(); showInfo(); draw(); });
  }
  function syncPicker() { if (picker) picker.value = sel ? String(sel.i) : ""; }
  function selectNode(value) {   // from the dropdown: select the dot, move it to the middle and zoom in a little
    sel = value === "" ? null : nodes[Number(value)] || null;
    if (sel) { view.k = Math.max(view.k, 1.6); view.x = W / 2 - sel.x * view.k; view.y = H / 2 - sel.y * view.k; }
    showInfo(); draw();
  }
  picker?.addEventListener("change", () => selectNode(picker.value));
  const toWorld = (e) => {
    const b = canvas.getBoundingClientRect();
    return { x: (e.clientX - b.left - view.x) / view.k, y: (e.clientY - b.top - view.y) / view.k, sx: e.clientX - b.left, sy: e.clientY - b.top };
  };
  const pick = (w) => {
    let best = null, bd = 1e9;
    nodes.forEach((p, i) => { const d = Math.hypot(p.x - w.x, p.y - w.y); if (d < p.r + 5 / view.k && d < bd) { bd = d; best = p; best.i = i; } });
    return best;
  };
  canvas.addEventListener("mousedown", (e) => {
    const w = toWorld(e), n = pick(w);
    canvas.classList.add("drag"); downAt = { x: e.clientX, y: e.clientY, n };
    if (n) { drag = n; wake(0.3); } else pan = { sx: w.sx, sy: w.sy, vx: view.x, vy: view.y };
  });
  addEventListener("mouseup", (e) => {
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 4) { sel = downAt.n; syncPicker(); showInfo(); draw(); }  // a click, not a drag
    downAt = null; drag = null; pan = null; canvas.classList.remove("drag");
  });
  canvas.addEventListener("mousemove", (e) => {
    const w = toWorld(e);
    if (drag) { drag.x = w.x; drag.y = w.y; wake(0.3); return; }
    if (pan) { view.x = pan.vx + (w.sx - pan.sx); view.y = pan.vy + (w.sy - pan.sy); draw(); return; }
    const n = pick(w);
    if (n !== hover) { hover = n; draw(); }
  });
  canvas.addEventListener("mouseleave", () => { hover = null; draw(); });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const w = toWorld(e), k = Math.max(0.2, Math.min(6, view.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    view.x = w.sx - w.x * k; view.y = w.sy - w.y * k; view.k = k; draw();
  }, { passive: false });
  resetBtn?.addEventListener("click", reset);
  new ResizeObserver(resize).observe(canvas);
  resize(); reset();
  for (let i = 0; i < 160; i++) tick();   // start from a settled picture, then keep moving
  alpha = 0.25; draw(); wake(0.25);
  return { redraw: draw, stop: () => cancelAnimationFrame(raf) };
}

/* ============================== render ============================== */
function animateIn(root = document) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$("[data-w]", root).forEach((el) => { el.style.width = `${Math.max(0, Math.min(100, Number(el.dataset.w)))}%`; });
    $$("[data-dash]", root).forEach((el) => el.setAttribute("stroke-dasharray", el.dataset.dash));
  }));
  $$("[data-count]", root).forEach((el) => {
    const target = Number(el.dataset.count);
    if (!el.dataset.count || Number.isNaN(target) || target < 2) return;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 700);
      el.textContent = num(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function render(r, { scroll = true } = {}) {
  state.result = r;
  if (state.graph) { state.graph.stop(); state.graph = null; }
  const dash = $("#dash");
  dash.innerHTML = [heroSection(r), kpiSection(r), readinessSection(r), problemsSection(r), changesSection(r), ntiaSection(r),
    checkmarxSection(r), graphSection(r), exploreSection(r)].join("");
  dash.hidden = false;
  $("#topnav").hidden = false;
  $("#upload").classList.add("compact");
  $("#drop-title").textContent = "Fix another file: drop it here or click to choose";
  $$("#topnav a").forEach((a) => { a.style.display = $(a.getAttribute("href")) ? "" : "none"; });
  $$(".tab").forEach((t) => t.addEventListener("click", () => showTab(r, t.dataset.tab)));
  showTab(r, "changes");
  animateIn(dash);
  const canvas = $("#graph");
  if (canvas && r.graph) state.graph = createGraph(canvas, r.graph, $("#graph-reset"));
  if (scroll) scrollTo({ top: 0, behavior: "smooth" });
}

function showError(message, extra = []) {
  const box = $("#error");
  box.innerHTML = `<h2>This file could not be fixed</h2><p>${esc(message)}</p>${extra.length ? `<ul>${extra.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`;
  box.hidden = false;
}

/* ============================== upload ============================== */
const STEPS = ["Reading the file", "Converting to CycloneDX", "Checking against the schema", "Repairing the mistakes", "Writing the Checkmarx layout"];
let stepTimer = 0;
function busy(on, name = "") {
  state.busy = on;
  $("#loading").hidden = !on;
  $("#loading-title").textContent = `Fixing ${name || "your SBOM"}…`;
  clearInterval(stepTimer);
  if (on) {
    let i = 0; $("#loading-step").textContent = STEPS[0];
    stepTimer = setInterval(() => { i = Math.min(i + 1, STEPS.length - 1); $("#loading-step").textContent = STEPS[i]; }, 450);
    $("#error").hidden = true;
  }
}

async function handle(promiseFactory, name) {
  if (state.busy) return;
  $("#batch").hidden = true;
  busy(true, name);
  try {
    const res = await promiseFactory();
    const data = await res.json();
    busy(false);
    if (!data.ok && !data.files) { $("#dash").hidden = true; showError(data.error || "Unknown error.", [
      "Use a CycloneDX (1.2 to 1.7) or SPDX 2.2 / 2.3 file in JSON format.", "XML and SPDX tag-value files are not supported; regenerate the SBOM as JSON."]); return; }
    render(data);
  } catch (err) {
    busy(false);
    showError("The dashboard server did not answer. Is the start window still open?", [String(err)]);
  }
}

function uploadFile(file) {
  const eco = $("#eco").value;
  handle(() => fetch(`/api/fix?name=${encodeURIComponent(file.name)}${eco ? `&ecosystem=${encodeURIComponent(eco)}` : ""}`, { method: "POST", body: file }), file.name);
}
function runSample(name) {
  const eco = $("#eco").value;
  handle(() => fetch(`/api/sample/${encodeURIComponent(name)}${eco ? `?ecosystem=${encodeURIComponent(eco)}` : ""}`), name);
}

/* ---------- several SBOMs, or a zip of them: every file is fixed on its own ---------- */
const isZip = (f) => /\.zip$/i.test(f.name) || /zip/.test(f.type || "");
const newBatchId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");

function setLoading(title, step) {
  $("#loading-title").textContent = title;
  $("#loading-step").textContent = step;
}

function uploadFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  if (files.length === 1 && !isZip(files[0])) return uploadFile(files[0]);
  runBatch(files);
}

async function runBatch(files) {
  if (state.busy) return;
  const bid = newBatchId(), eco = $("#eco").value;
  const ecoQ = eco ? `&ecosystem=${encodeURIComponent(eco)}` : "";
  state.busy = true;
  clearInterval(stepTimer);
  $("#loading").hidden = false; $("#error").hidden = true; $("#dash").hidden = true; $("#batch").hidden = true;
  const jobs = [], skipped = [], rows = [];
  try {
    for (const f of files) {
      if (!isZip(f)) { jobs.push({ name: f.name, file: f }); continue; }
      setLoading(`Opening ${f.name}`, "Reading the zip");
      const data = await (await fetch(`/api/zip?batch=${bid}&name=${encodeURIComponent(f.name)}`, { method: "POST", body: f })).json();
      if (!data.ok) { skipped.push({ name: f.name, reason: data.error || "could not be read" }); continue; }
      data.entries.forEach((e) => jobs.push({ name: e.name, member: e.i }));
      data.skipped.forEach((x) => skipped.push({ name: `${f.name} \u203a ${x.name}`, reason: x.reason }));
    }
    for (const [k, job] of jobs.entries()) {
      setLoading(`Fixing ${k + 1} of ${jobs.length}`, job.name);
      const url = `/api/fix?slim=1&batch=${bid}&name=${encodeURIComponent(job.name)}${job.member != null ? `&member=${job.member}` : ""}${ecoQ}`;
      try {
        const data = await (await fetch(url, { method: "POST", body: job.file || null })).json();
        rows.push({ name: job.name, ...data, ok: !!data.ok });
      } catch (err) {
        rows.push({ name: job.name, ok: false, error: `The dashboard server did not answer: ${err}` });
      }
    }
  } catch (err) {
    state.busy = false; $("#loading").hidden = true;
    showError("The dashboard server did not answer. Is the start window still open?", [String(err)]);
    return;
  }
  state.busy = false; $("#loading").hidden = true;
  if (!rows.length) {
    showError("No SBOM files were found.", ["Choose .json SBOM files, or a .zip that contains them.",
      ...skipped.slice(0, 8).map((x) => `${x.name}: ${x.reason}`)]);
    return;
  }
  renderBatch({ bid, rows, skipped });
}

function rowState(r) {
  if (!r.ok) return { label: "Failed", color: "var(--bad)", tip: r.error || "" };
  if (r.exit_code === 0) return { label: "Clean", color: "var(--good)", tip: "Nothing to change" };
  if (r.exit_code === 1) return { label: "Fixed", color: "var(--good)", tip: "Fixed and ready for Checkmarx" };
  return { label: "Warning", color: "var(--warn)", tip: r.exit_text || "" };
}

function renderBatch(b) {
  const host = $("#batch"), ok = b.rows.filter((r) => r.ok);
  const avg = ok.length && ok.every((r) => r.readiness_after != null) ? Math.round(sum(ok.map((r) => r.readiness_after)) / ok.length) : null;
  const card = (label, value, note, color) => `<div class="card kpi"><div class="label"><span class="dot" style="background:${color}"></span>${label}</div>
    <div class="value">${value}</div><div class="note">${note}</div></div>`;
  host.innerHTML = `<div class="section" id="sec-batch"><h2>Batch results</h2>
    <div class="kpis">
      ${card("SBOM files", num(b.rows.length), "each one fixed on its own", "var(--s1)")}
      ${card("Fixed or clean", num(ok.length), "ready for Checkmarx", "var(--good)")}
      ${card("Failed", num(b.rows.length - ok.length), "see the reason in the table", "var(--bad)")}
      ${card("Components", num(sum(ok.map((r) => r.components_out || 0))), "in the fixed files", "var(--s3)")}
      ${card("Mistakes found", num(sum(ok.map((r) => r.problems || 0))), "over all files", "var(--s5)")}
      ${card("Avg readiness", avg == null ? "-" : `${avg}%`, "after fixing", "var(--accent)")}
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-head"><div><h3>One row per SBOM</h3><div class="sub">Open a row for its full dashboard. Each file has its own fixed SBOM, tech notes and what-to-fix list.</div></div>
        <a class="btn primary" href="/download/batch/${b.bid}">${icon("down", 15)}Download all (.zip)</a></div>
      <div id="batch-tbl"></div>
      ${b.skipped.length ? `<details class="batch-skipped"><summary>${num(b.skipped.length)} file(s) skipped</summary><ul>${b.skipped.map((x) => `<li><code>${esc(x.name)}</code>: ${esc(x.reason)}</li>`).join("")}</ul></details>` : ""}
      <p class="notice">The zip has one folder per SBOM (fixed SBOM, tech notes, what to fix, report) and a batch-summary.csv. Results stay in memory until the dashboard is closed.</p>
    </div></div>`;
  host.hidden = false;
  $("#dash").hidden = true;
  $("#upload").classList.add("compact");
  $("#topnav").hidden = true;
  const link = (r, kind, text) => `<a href="/download/${r.id}/${kind}">${text}</a>`;
  pagedTable($("#batch-tbl", host), b.rows, [
    { head: "File", cell: (r) => `<b>${esc(r.name)}</b>${r.spec ? `<br><span style="color:var(--text-3)">${esc(r.spec)} ${esc(r.version || "")}${r.generator ? " &middot; " + esc(r.generator) : ""}</span>` : ""}` },
    { head: "Result", cell: (r) => { const st = rowState(r); return `<span class="badge" ${tp(st.label, st.tip)}><i style="background:${st.color}"></i>${st.label}</span>${!r.ok && r.error ? `<br><span class="row-err">${esc(String(r.error).slice(0, 140))}</span>` : ""}`; } },
    { head: "Components", cls: "num", cell: (r) => (r.ok ? `${num(r.components_in)} &rarr; ${num(r.components_out)}` : "") },
    { head: "Mistakes", cls: "num", cell: (r) => (r.ok ? num(r.problems) : "") },
    { head: "Repairs", cls: "num", cell: (r) => (r.ok ? num(r.fixes) : "") },
    { head: "Scannable", cls: "num", cell: (r) => (r.ok && r.scannable != null ? `${r.scannable}%` : "") },
    { head: "Readiness", cls: "num", cell: (r) => (r.ok && r.readiness_after != null ? `${r.readiness_before}% &rarr; <b>${r.readiness_after}%</b>` : "") },
    { head: "Files", cls: "row-links", cell: (r) => (r.id && r.has_files ? [r.ok ? link(r, "sbom", "Fixed SBOM") : "", link(r, "notes", "Tech notes"), link(r, "suggestions", "What to fix"), link(r, "report", "Report")].filter(Boolean).join(" ") : "") },
    { head: "", cell: (r) => (r.id ? `<button class="btn" type="button" data-open="${esc(r.id)}">Open</button>` : "") },
  ], { pageSize: 200 });
  $("#batch-tbl", host).addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-open]");
    if (!btn) return;
    btn.disabled = true;
    try {
      const res = await fetch(`/api/result/${btn.dataset.open}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "not available");
      render(data, { scroll: false });
      $("#topnav").hidden = false;
      $$("#batch-tbl tr").forEach((tr) => tr.classList.toggle("sel", tr.contains(btn)));
      $("#dash").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      showError(String(err.message || err), ["Fix the file again (results are kept only while the dashboard window is open)."]);
    }
    btn.disabled = false;
  });
  scrollTo({ top: 0, behavior: "smooth" });
}

function initUpload() {
  const drop = $("#drop"), input = $("#file");
  drop.addEventListener("click", () => input.click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.addEventListener("change", () => { const files = Array.from(input.files); input.value = ""; uploadFiles(files); });
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => uploadFiles(e.dataTransfer?.files));
  addEventListener("dragover", (e) => e.preventDefault());
  addEventListener("drop", (e) => e.preventDefault());
}

async function init() {
  initTheme();
  initUpload();
  try {
    const info = await (await fetch("/api/info")).json();
    state.info = info;
    $("#engine-pill").textContent = `engine ${info.engine}`;
    $("#eco").insertAdjacentHTML("beforeend", info.ecosystems.map((e) => `<option value="${esc(e)}">${esc(e)}</option>`).join(""));
    if (info.samples.length) {
      $("#samples").innerHTML = `<span>No file at hand? Try a sample:</span>` + info.samples.map((s) => `<button type="button" class="chip-btn" data-sample="${esc(s)}">${esc(s)}</button>`).join("");
      $$("[data-sample]").forEach((b) => b.addEventListener("click", () => runSample(b.dataset.sample)));
    }
  } catch { showError("Cannot reach the dashboard server."); }
  const q = new URLSearchParams(location.search).get("sample");
  if (q) runSample(q);
}
init();
