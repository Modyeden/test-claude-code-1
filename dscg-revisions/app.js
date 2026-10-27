"use strict";

const STORAGE_KEY = "dscg-revisions-v1";
const INTERVALS = [1, 3, 7, 14, 30];
const STATUSES = {
  nonvu: "Non vu",
  encours: "En cours",
  acquis: "Acquis",
  arevoir: "À revoir",
};
const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

// Grands thèmes du programme, modifiables dans l'application.
const DEFAULT_UES = [
  {
    code: "UE1",
    name: "Gestion juridique, fiscale et sociale",
    chapters: [
      "L'entreprise et son environnement juridique",
      "Les contrats de l'entreprise",
      "Le droit de la concurrence",
      "Le développement de l'entreprise : sociétés et groupes",
      "Les restructurations : fusions, scissions, apports",
      "L'entreprise en difficulté et les procédures collectives",
      "Le droit pénal des affaires",
      "Les relations individuelles et collectives de travail",
      "La protection sociale",
      "Fiscalité de l'entreprise : IS et régimes particuliers",
      "Fiscalité des groupes de sociétés",
      "Fiscalité des opérations de restructuration",
      "Fiscalité internationale et TVA internationale",
      "Fiscalité personnelle du dirigeant et patrimoine",
      "Contrôle fiscal et contentieux",
    ],
  },
  {
    code: "UE4",
    name: "Comptabilité et audit",
    chapters: [
      "Cadre conceptuel et normalisation comptable (PCG, IFRS)",
      "Opérations complexes : actifs, passifs, instruments financiers",
      "Fusions et opérations assimilées",
      "Comptes consolidés : périmètre et méthodes",
      "Comptes consolidés : retraitements et élimination",
      "Comptes consolidés : variations de périmètre",
      "Normes IFRS : principales normes",
      "Information financière et communication",
      "Évaluation d'entreprise",
      "Déontologie et cadre de l'audit",
      "Démarche d'audit et contrôle interne",
      "Commissariat aux comptes et missions légales",
    ],
  },
  {
    code: "UE5",
    name: "Management des systèmes d'information",
    chapters: [
      "Gouvernance des systèmes d'information",
      "Stratégie et alignement du SI",
      "Management de projet SI",
      "Progiciels de gestion intégrés (ERP)",
      "Gestion des données et aide à la décision",
      "Sécurité des systèmes d'information",
      "Audit du système d'information",
      "Contrôle interne et SI",
      "Évolutions technologiques et transformation numérique",
    ],
  },
];

// ---------- Utilitaires ----------

const uid = () => Math.random().toString(36).slice(2, 10);

function todayISO() {
  const d = new Date();
  return toISO(d);
}

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return toISO(new Date(y, m - 1, d + n));
}

function daysBetween(fromIso, toIso) {
  const [a, b] = [fromIso, toIso].map((s) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86400000);
}

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Données ----------

function defaultState() {
  return {
    ues: DEFAULT_UES.map((ue) => ({
      code: ue.code,
      name: ue.name,
      examDate: "",
      chapters: ue.chapters.map((title) => ({ id: uid(), title, status: "nonvu", step: 0, nextReview: "" })),
    })),
    annales: [],
    planning: DAYS.map(() => []),
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Lecture impossible, données par défaut", e);
  }
  return defaultState();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    alert("Impossible d'enregistrer les données sur cet appareil.");
  }
}

let state = load();
let currentTab = "dashboard";
let currentUe = "UE1";

const findUe = (code) => state.ues.find((u) => u.code === code);

function findChapter(id) {
  for (const ue of state.ues) {
    const ch = ue.chapters.find((c) => c.id === id);
    if (ch) return { ue, ch };
  }
  return null;
}

function progress(ue) {
  if (!ue.chapters.length) return 0;
  const done = ue.chapters.filter((c) => c.status === "acquis").length;
  return Math.round((done / ue.chapters.length) * 100);
}

function dueReviews() {
  const today = todayISO();
  const out = [];
  for (const ue of state.ues) {
    for (const ch of ue.chapters) {
      if (ch.nextReview && ch.nextReview <= today) out.push({ ue, ch });
    }
  }
  return out.sort((a, b) => a.ch.nextReview.localeCompare(b.ch.nextReview));
}

// ---------- Actions ----------

function setStatus(id, status) {
  const found = findChapter(id);
  if (!found) return;
  const { ch } = found;
  const wasAcquis = ch.status === "acquis";
  ch.status = status;
  if (status === "acquis" && !wasAcquis) {
    ch.step = 0;
    ch.nextReview = addDays(todayISO(), INTERVALS[0]);
  } else if (status === "nonvu" || status === "encours") {
    ch.step = 0;
    ch.nextReview = "";
  } else if (status === "arevoir") {
    ch.step = 0;
    ch.nextReview = addDays(todayISO(), INTERVALS[0]);
  }
  save();
  render();
}

function review(id, success) {
  const found = findChapter(id);
  if (!found) return;
  const { ch } = found;
  if (success) {
    ch.step = Math.min(ch.step + 1, INTERVALS.length - 1);
    ch.status = "acquis";
  } else {
    ch.step = 0;
    ch.status = "arevoir";
  }
  ch.nextReview = addDays(todayISO(), INTERVALS[ch.step]);
  save();
  render();
}

// ---------- Vues ----------

function viewDashboard() {
  const today = todayISO();
  const countdowns = state.ues
    .map((ue) => {
      let txt = '<span class="muted">Date d\'épreuve non définie</span>';
      if (ue.examDate) {
        const n = daysBetween(today, ue.examDate);
        txt = n >= 0
          ? `<div class="big">J-${n}</div><div class="muted">${formatDate(ue.examDate)}</div>`
          : `<div class="muted">Épreuve passée (${formatDate(ue.examDate)})</div>`;
      }
      const p = progress(ue);
      return `<div class="card">
        <div class="row between"><span class="ue-tag ue-${ue.code}">${ue.code}</span><span class="muted">${p} % acquis</span></div>
        <div style="margin-top:8px">${txt}</div>
        <div class="bar"><span style="width:${p}%"></span></div>
      </div>`;
    })
    .join("");

  const due = dueReviews();
  const dueHtml = due.length
    ? `<ul class="list">${due.map(({ ue, ch }) => `
        <li>
          <span class="title"><span class="ue-tag ue-${ue.code}">${ue.code}</span> ${esc(ch.title)}
            ${ch.nextReview < today ? `<div class="muted">En retard depuis le ${formatDate(ch.nextReview)}</div>` : ""}</span>
          <span class="row">
            <button class="small" data-review="${ch.id}" data-ok="1">Je maîtrise</button>
            <button class="small secondary" data-review="${ch.id}" data-ok="0">À retravailler</button>
          </span>
        </li>`).join("")}</ul>`
    : '<p class="empty">Aucune révision prévue aujourd\'hui.</p>';

  const dayIdx = (new Date().getDay() + 6) % 7;
  const todayPlan = state.planning[dayIdx]
    .map((id) => findChapter(id))
    .filter(Boolean);
  const planHtml = todayPlan.length
    ? `<ul class="list">${todayPlan.map(({ ue, ch }) => `<li><span class="title"><span class="ue-tag ue-${ue.code}">${ue.code}</span> ${esc(ch.title)}</span><span class="muted">${STATUSES[ch.status]}</span></li>`).join("")}</ul>`
    : '<p class="empty">Rien de planifié pour aujourd\'hui.</p>';

  return `
    <h2>Épreuves</h2>
    <div class="grid">${countdowns}</div>
    <h2>Révisions du jour (${due.length})</h2>
    <div class="card">${dueHtml}</div>
    <h2>Planning d'aujourd'hui · ${DAYS[dayIdx]}</h2>
    <div class="card">${planHtml}</div>`;
}

function viewUe() {
  const ue = findUe(currentUe);
  const tabs = state.ues
    .map((u) => `<button class="${u.code === currentUe ? "" : "secondary"}" data-ue="${u.code}">${u.code}</button>`)
    .join("");
  const counts = Object.keys(STATUSES)
    .map((s) => `${STATUSES[s]} : ${ue.chapters.filter((c) => c.status === s).length}`)
    .join(" · ");

  const rows = ue.chapters.map((ch) => `
    <li>
      <span class="title">${esc(ch.title)}
        ${ch.nextReview ? `<div class="muted">Prochaine révision : ${formatDate(ch.nextReview)}</div>` : ""}</span>
      <span class="row">
        <select class="status status-${ch.status}" data-status="${ch.id}" aria-label="Statut">
          ${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}" ${k === ch.status ? "selected" : ""}>${v}</option>`).join("")}
        </select>
        <button class="small secondary" data-rename="${ch.id}" aria-label="Renommer">Renommer</button>
        <button class="small danger" data-delete="${ch.id}" aria-label="Supprimer">✕</button>
      </span>
    </li>`).join("");

  return `
    <div class="subtabs">${tabs}</div>
    <div class="card">
      <div class="row between"><strong>${esc(ue.name)}</strong><span class="muted">${progress(ue)} % acquis</span></div>
      <div class="bar"><span style="width:${progress(ue)}%"></span></div>
      <div class="muted" style="margin-top:8px">${counts}</div>
    </div>
    <div class="card">
      <ul class="list">${rows || '<li class="empty">Aucun chapitre.</li>'}</ul>
      <form id="add-chapter" class="row" style="margin-top:12px">
        <input name="title" placeholder="Nouveau chapitre" required style="flex:1 1 200px">
        <button type="submit">Ajouter</button>
      </form>
    </div>`;
}

function chartSvg(entries) {
  if (entries.length < 2) return '<p class="muted">Au moins deux notes sont nécessaires pour la courbe.</p>';
  const W = 600, H = 160, P = 28;
  const x = (i) => P + (i * (W - 2 * P)) / (entries.length - 1);
  const y = (v) => H - P + 8 - (v / 20) * (H - 2 * P);
  const pts = entries.map((e, i) => `${x(i)},${y(e.score)}`).join(" ");
  const grid = [0, 10, 20]
    .map((v) => `<line class="grid-line" x1="${P}" x2="${W - P}" y1="${y(v)}" y2="${y(v)}"/><text x="2" y="${y(v) + 4}">${v}</text>`)
    .join("");
  const dots = entries.map((e, i) => `<circle cx="${x(i)}" cy="${y(e.score)}" r="4" fill="var(--accent)"><title>${esc(e.title)} : ${e.score}/20</title></circle>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution des notes">
    ${grid}<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2"/>${dots}</svg>`;
}

function viewAnnales() {
  const sorted = [...state.annales].sort((a, b) => b.date.localeCompare(a.date));
  const byUe = state.ues.map((ue) => {
    const list = state.annales.filter((a) => a.ue === ue.code).sort((a, b) => a.date.localeCompare(b.date));
    const avg = list.length ? (list.reduce((s, a) => s + a.score, 0) / list.length).toFixed(1) : "–";
    return `<div class="card">
      <div class="row between"><span class="ue-tag ue-${ue.code}">${ue.code}</span><span><strong>${avg}</strong><span class="muted"> /20 de moyenne · ${list.length} copie(s)</span></span></div>
      <div style="margin-top:8px">${chartSvg(list)}</div>
    </div>`;
  }).join("");

  const rows = sorted.map((a) => `
    <li>
      <span class="title"><span class="ue-tag ue-${a.ue}">${a.ue}</span> ${esc(a.title)}<div class="muted">${formatDate(a.date)}</div></span>
      <span class="row"><strong>${a.score}/20</strong><button class="small danger" data-del-annale="${a.id}" aria-label="Supprimer">✕</button></span>
    </li>`).join("");

  return `
    <h2>Ajouter une note</h2>
    <form id="add-annale" class="card stack">
      <div class="row">
        <select name="ue" aria-label="UE">${state.ues.map((u) => `<option>${u.code}</option>`).join("")}</select>
        <input type="date" name="date" value="${todayISO()}" required aria-label="Date">
        <input type="number" name="score" min="0" max="20" step="0.25" placeholder="Note /20" required style="width:110px">
      </div>
      <input name="title" placeholder="Intitulé (ex. Annale 2024, examen blanc n°1)" required style="width:100%">
      <button type="submit">Enregistrer</button>
    </form>
    <h2>Évolution par UE</h2>
    ${byUe}
    <h2>Historique</h2>
    <div class="card"><ul class="list">${rows || '<li class="empty">Aucune note enregistrée.</li>'}</ul></div>`;
}

function viewPlanning() {
  const options = state.ues
    .map((ue) => `<optgroup label="${ue.code}">${ue.chapters.map((c) => `<option value="${c.id}">${esc(c.title)}</option>`).join("")}</optgroup>`)
    .join("");

  return `<h2>Semaine type</h2>` + DAYS.map((day, i) => {
    const items = state.planning[i]
      .map((id) => ({ id, found: findChapter(id) }))
      .filter((x) => x.found)
      .map(({ id, found }) => `<li><span class="title"><span class="ue-tag ue-${found.ue.code}">${found.ue.code}</span> ${esc(found.ch.title)}</span>
        <button class="small danger" data-unplan="${i}:${id}" aria-label="Retirer">✕</button></li>`)
      .join("");
    return `<div class="card day">
      <h3>${day}</h3>
      <ul class="list">${items || '<li class="empty">Rien de prévu.</li>'}</ul>
      <form class="row add-plan" data-day="${i}" style="margin-top:8px">
        <select name="chapter" style="flex:1 1 200px" aria-label="Chapitre"><option value="">Choisir un chapitre…</option>${options}</select>
        <button type="submit">Ajouter</button>
      </form>
    </div>`;
  }).join("");
}

function viewSettings() {
  const dates = state.ues.map((ue) => `
    <div class="row between">
      <label for="exam-${ue.code}"><span class="ue-tag ue-${ue.code}">${ue.code}</span> ${esc(ue.name)}</label>
      <input type="date" id="exam-${ue.code}" data-exam="${ue.code}" value="${ue.examDate}">
    </div>`).join("");
  return `
    <h2>Dates des épreuves</h2>
    <div class="card stack">${dates}</div>
    <h2>Sauvegarde</h2>
    <div class="card stack">
      <p class="muted" style="margin:0">Les données sont enregistrées uniquement sur cet appareil. Exportez-les régulièrement.</p>
      <div class="row">
        <button id="export">Exporter (JSON)</button>
        <label class="row"><button type="button" class="secondary" id="import-btn">Importer</button>
          <input type="file" id="import" accept="application/json,.json" hidden></label>
      </div>
    </div>
    <h2>Réinitialisation</h2>
    <div class="card"><button class="danger" id="reset">Effacer toutes les données</button></div>`;
}

const VIEWS = { dashboard: viewDashboard, ue: viewUe, annales: viewAnnales, planning: viewPlanning, settings: viewSettings };

function render() {
  document.getElementById("view").innerHTML = VIEWS[currentTab]();
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === currentTab));
}

// ---------- Événements ----------

document.querySelector(".tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  currentTab = btn.dataset.tab;
  render();
  window.scrollTo(0, 0);
});

const view = document.getElementById("view");

view.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  const d = t.dataset;

  if (d.review) review(d.review, d.ok === "1");
  else if (d.ue) { currentUe = d.ue; render(); }
  else if (d.rename) {
    const { ch } = findChapter(d.rename);
    const title = prompt("Nouveau nom du chapitre", ch.title);
    if (title && title.trim()) { ch.title = title.trim(); save(); render(); }
  } else if (d.delete) {
    const { ue, ch } = findChapter(d.delete);
    if (confirm(`Supprimer « ${ch.title} » ?`)) {
      ue.chapters = ue.chapters.filter((c) => c.id !== ch.id);
      state.planning = state.planning.map((list) => list.filter((id) => id !== ch.id));
      save(); render();
    }
  } else if (d.delAnnale) {
    if (confirm("Supprimer cette note ?")) {
      state.annales = state.annales.filter((a) => a.id !== d.delAnnale);
      save(); render();
    }
  } else if (d.unplan) {
    const [day, id] = d.unplan.split(":");
    state.planning[day] = state.planning[day].filter((x) => x !== id);
    save(); render();
  } else if (t.id === "export") {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `revisions-dscg-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  } else if (t.id === "import-btn") {
    document.getElementById("import").click();
  } else if (t.id === "reset") {
    if (confirm("Effacer toutes les données ? Cette action est irréversible.")) {
      state = defaultState();
      save(); render();
    }
  }
});

view.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.status) setStatus(t.dataset.status, t.value);
  else if (t.dataset.exam) {
    findUe(t.dataset.exam).examDate = t.value;
    save();
  } else if (t.id === "import" && t.files[0]) {
    t.files[0].text().then((txt) => {
      try {
        const data = JSON.parse(txt);
        if (!Array.isArray(data.ues) || !Array.isArray(data.annales) || !Array.isArray(data.planning)) throw new Error("format");
        if (!confirm("Remplacer les données actuelles par celles du fichier ?")) return;
        state = data;
        save(); render();
        alert("Import réussi.");
      } catch {
        alert("Fichier invalide.");
      }
    });
  }
});

view.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const data = new FormData(f);

  if (f.id === "add-chapter") {
    findUe(currentUe).chapters.push({ id: uid(), title: data.get("title").trim(), status: "nonvu", step: 0, nextReview: "" });
  } else if (f.id === "add-annale") {
    state.annales.push({
      id: uid(),
      ue: data.get("ue"),
      date: data.get("date"),
      title: data.get("title").trim(),
      score: Number(data.get("score")),
    });
  } else if (f.classList.contains("add-plan")) {
    const id = data.get("chapter");
    const day = Number(f.dataset.day);
    if (!id || state.planning[day].includes(id)) return;
    state.planning[day].push(id);
  }
  save();
  render();
});

render();
