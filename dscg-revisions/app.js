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
const TAB_TITLES = { dashboard: "Accueil", ue: "Programme", annales: "Annales", planning: "Planning", settings: "Réglages" };

const ICONS = {
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/>',
  trash: '<path d="M5 7h14"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h7M9 17h5"/>',
};
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

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

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const todayISO = () => toISO(new Date());

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

function formatDate(iso, withYear = true) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const opts = withYear ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" };
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", opts);
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Données ----------

const newItem = (title) => ({ id: uid(), title, status: "nonvu", step: 0, nextReview: "", notes: "", imageCount: 0, children: [] });

function defaultState() {
  return {
    ues: DEFAULT_UES.map((ue) => ({
      code: ue.code,
      name: ue.name,
      examDate: "",
      chapters: ue.chapters.map(newItem),
    })),
    annales: [],
    planning: DAYS.map(() => []),
  };
}

// Complète les sauvegardes créées avant l'ajout des sous-chapitres et des observations.
function normalize(data) {
  const fill = (item) => {
    item.notes = item.notes || "";
    item.imageCount = item.imageCount || 0;
  };
  for (const ue of data.ues) {
    for (const ch of ue.chapters) {
      fill(ch);
      ch.children = ch.children || [];
      for (const sub of ch.children) {
        fill(sub);
        sub.children = [];
      }
    }
  }
  return data;
}

// ---------- Images (IndexedDB) ----------
// Les images sont trop lourdes pour localStorage : elles vivent dans IndexedDB,
// rattachées à un chapitre par `chapterId`.

const dbPromise = new Promise((resolve, reject) => {
  const req = indexedDB.open("dscg-revisions", 1);
  req.onupgradeneeded = () => {
    const store = req.result.createObjectStore("images", { keyPath: "id" });
    store.createIndex("chapterId", "chapterId");
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

function imageStore(mode, fn) {
  return dbPromise.then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction("images", mode);
    const result = fn(tx.objectStore("images"));
    tx.oncomplete = () => resolve(result && "result" in result ? result.result : undefined);
    tx.onerror = () => reject(tx.error);
  }));
}

const imagesFor = (chapterId) => imageStore("readonly", (s) => s.index("chapterId").getAll(chapterId));
const allImages = () => imageStore("readonly", (s) => s.getAll());
const putImage = (img) => imageStore("readwrite", (s) => s.put(img));
const deleteImage = (id) => imageStore("readwrite", (s) => s.delete(id));
const clearImages = () => imageStore("readwrite", (s) => s.clear());

async function deleteImagesFor(chapterIds) {
  for (const id of chapterIds) {
    for (const img of await imagesFor(id)) await deleteImage(img.id);
  }
}

// Réduit les photos (souvent 4000 px sur iPhone) avant de les enregistrer.
function compressImage(file, maxSize = 1600) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("compression"))), "image/jpeg", 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("lecture")); };
    img.src = url;
  });
}

const blobToDataUrl = (blob) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.readAsDataURL(blob);
});

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
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
let editMode = false;
// Saisie en cours dans la page : { type: "sub" | "rename", id }.
let inlineEdit = null;
// Bouton de suppression en attente d'un second appui de confirmation.
let pendingConfirm = null;
// Chapitre dont la fiche (observations et images) est ouverte.
let currentDetail = null;
let galleryUrls = [];
const openGroups = new Set();

const findUe = (code) => state.ues.find((u) => u.code === code);

function forEachItem(cb) {
  for (const ue of state.ues) {
    for (const ch of ue.chapters) {
      cb(ue, ch, null);
      for (const sub of ch.children) cb(ue, sub, ch);
    }
  }
}

function findItem(id) {
  let found = null;
  forEachItem((ue, ch, parent) => {
    if (!found && ch.id === id) found = { ue, ch, parent };
  });
  return found;
}

// Un chapitre découpé en sous-chapitres est suivi via ses sous-chapitres.
const isLeaf = (ch) => ch.children.length === 0;
const leaves = (ue) => ue.chapters.flatMap((ch) => (isLeaf(ch) ? [ch] : ch.children));
const label = ({ ch, parent }) => (parent ? `${parent.title} › ${ch.title}` : ch.title);

function progress(items) {
  if (!items.length) return 0;
  return Math.round((items.filter((c) => c.status === "acquis").length / items.length) * 100);
}

function dueReviews() {
  const today = todayISO();
  const out = [];
  forEachItem((ue, ch, parent) => {
    if (isLeaf(ch) && ch.nextReview && ch.nextReview <= today) out.push({ ue, ch, parent });
  });
  return out.sort((a, b) => a.ch.nextReview.localeCompare(b.ch.nextReview));
}

// ---------- Actions ----------

function setStatus(id, status) {
  const found = findItem(id);
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
  const found = findItem(id);
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

function removeFromPlanning(ids) {
  state.planning = state.planning.map((list) => list.filter((id) => !ids.includes(id)));
}

// ---------- Vues ----------

const statusDot = (status) => `<span class="dot s-${status}" title="${STATUSES[status]}"></span>`;

function emptyRow(text) {
  return `<li class="empty">${text}</li>`;
}

function viewDashboard() {
  const today = todayISO();

  const exams = state.ues.map((ue) => {
    const p = progress(leaves(ue));
    let when = '<span class="muted">Date à définir</span>';
    if (ue.examDate) {
      const n = daysBetween(today, ue.examDate);
      when = n >= 0 ? `<span class="countdown">J-${n}</span>` : '<span class="muted">Passée</span>';
    }
    return `<li class="item exam">
      <div class="title"><strong>${ue.code}</strong> <span class="muted">${esc(ue.name)}</span>
        <div class="bar" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100" aria-label="${ue.code} : ${p} % acquis"><span style="width:${p}%"></span></div>
      </div>
      <div class="meta">${when}<span class="muted num">${p} %</span></div>
    </li>`;
  }).join("");

  const due = dueReviews();
  const dueRows = due.map((f) => `
    <li class="item">
      ${statusDot(f.ch.status)}
      <button class="title title-btn" data-open="${f.ch.id}"><span class="ue">${f.ue.code}</span> ${esc(label(f))}
        ${f.ch.nextReview < today ? `<small class="late">Prévue le ${formatDate(f.ch.nextReview, false)}</small>` : ""}${attachmentHint(f.ch)}</button>
      <div class="actions">
        <button class="btn" data-review="${f.ch.id}" data-ok="1">Je maîtrise</button>
        <button class="btn ghost" data-review="${f.ch.id}" data-ok="0">À retravailler</button>
      </div>
    </li>`).join("");

  const dayIdx = (new Date().getDay() + 6) % 7;
  const planRows = state.planning[dayIdx]
    .map(findItem)
    .filter(Boolean)
    .map((f) => `<li class="item">${statusDot(f.ch.status)}<button class="title title-btn" data-open="${f.ch.id}"><span class="ue">${f.ue.code}</span> ${esc(label(f))}${attachmentHint(f.ch)}</button></li>`)
    .join("");

  return `
    <p class="greeting">Bonjour, Mody</p>
    <div class="dash">
      <section class="panel primary">
        <h2>À réviser (${due.length})</h2>
        ${dueRows ? `<ul class="tiles">${dueRows}</ul>` : `<div class="tile-empty">Rien à réviser aujourd'hui. Passez un chapitre en « Acquis » pour programmer ses révisions.</div>`}
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Au planning · ${DAYS[dayIdx]}</h2><button class="link" data-goto="planning">Voir le planning</button></div>
        ${planRows ? `<ul class="list">${planRows}</ul>` : `<div class="empty-state"><strong>Rien de prévu.</strong><p>Ajoutez des chapitres à votre semaine type.</p></div>`}
      </section>
      <section class="panel wide">
        <div class="panel-head"><h2>Épreuves</h2><button class="link" data-goto="settings">Modifier les dates</button></div>
        <ul class="list">${exams}</ul>
      </section>
    </div>`;
}

function deleteButton(attr, id, name) {
  const key = `${attr}:${id}`;
  if (pendingConfirm === key) {
    return `<button class="btn danger small" data-${attr}="${id}" data-confirmed="1">Supprimer ?</button>`;
  }
  return `<button class="icon-btn danger" data-${attr}="${id}" aria-label="Supprimer ${esc(name)}">${icon("trash")}</button>`;
}

function editActions(ch, parent) {
  if (!editMode) return "";
  return `<div class="actions">
    ${parent ? "" : `<button class="icon-btn" data-add-sub="${ch.id}" aria-label="Ajouter un sous-chapitre à ${esc(ch.title)}">${icon("plus")}</button>`}
    <button class="icon-btn" data-rename="${ch.id}" aria-label="Renommer ${esc(ch.title)}">${icon("edit")}</button>
    ${deleteButton("delete", ch.id, ch.title)}
  </div>`;
}

function inlineForm(type, ch) {
  const isSub = type === "sub";
  return `<li class="inline-edit${isSub ? " sub" : ""}">
    <form class="inline-form" data-inline="${type}" data-id="${ch.id}">
      <input name="title" required autofocus value="${isSub ? "" : esc(ch.title)}"
        placeholder="${isSub ? "Titre du sous-chapitre" : "Nouveau titre"}"
        aria-label="${isSub ? `Nouveau sous-chapitre de ${esc(ch.title)}` : `Nouveau titre pour ${esc(ch.title)}`}">
      <button class="btn" type="submit">${isSub ? "Ajouter" : "Renommer"}</button>
      <button class="btn ghost" type="button" data-cancel-inline="1">Annuler</button>
    </form>
  </li>`;
}

const isEditing = (type, ch) => inlineEdit && inlineEdit.type === type && inlineEdit.id === ch.id;

// Rappelle sous le titre ce que contient la fiche du chapitre.
function attachmentHint(ch) {
  const parts = [];
  if (ch.notes.trim()) parts.push("Observations");
  if (ch.imageCount) parts.push(`${ch.imageCount} image${ch.imageCount > 1 ? "s" : ""}`);
  return parts.length ? `<span class="hint">${icon("note")}${parts.join(" · ")}</span>` : "";
}

function leafRow(ch, parent) {
  if (isEditing("rename", ch)) return inlineForm("rename", ch);
  return `<li class="item${parent ? " sub" : ""}">
    ${statusDot(ch.status)}
    <button class="title title-btn" data-open="${ch.id}" aria-label="Ouvrir la fiche de ${esc(ch.title)}">${esc(ch.title)}
      ${ch.nextReview ? `<small>Révision le ${formatDate(ch.nextReview, false)}</small>` : ""}${attachmentHint(ch)}</button>
    ${editMode ? editActions(ch, parent) : `<select class="status" data-status="${ch.id}" aria-label="Statut de ${esc(ch.title)}">
      ${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}" ${k === ch.status ? "selected" : ""}>${v}</option>`).join("")}
    </select>`}
  </li>${isEditing("sub", ch) ? inlineForm("sub", ch) : ""}`;
}

function groupRow(ch) {
  const done = ch.children.filter((c) => c.status === "acquis").length;
  return `<li class="group">
    ${isEditing("rename", ch) ? `<ul class="list">${inlineForm("rename", ch)}</ul>` : ""}
    <details data-group="${ch.id}" ${openGroups.has(ch.id) ? "open" : ""}>
      <summary class="item"${isEditing("rename", ch) ? " hidden" : ""}>
        <span class="chevron">${icon("chevron")}</span>
        <div class="title">${esc(ch.title)}${attachmentHint(ch)}</div>
        ${editMode ? editActions(ch, null) : `<span class="muted num">${done}/${ch.children.length}</span>
          <button class="icon-btn" data-open="${ch.id}" aria-label="Ouvrir la fiche de ${esc(ch.title)}">${icon("note")}</button>`}
      </summary>
      <ul class="list">${ch.children.map((sub) => leafRow(sub, ch)).join("")}${isEditing("sub", ch) ? inlineForm("sub", ch) : ""}</ul>
    </details>
  </li>`;
}

function viewDetail(found) {
  const { ue, ch, parent } = found;
  const done = ch.children.filter((c) => c.status === "acquis").length;
  const statusControl = isLeaf(ch)
    ? `<label class="row-field"><span class="muted">Statut</span>
        <select class="status" data-status="${ch.id}">
          ${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}" ${k === ch.status ? "selected" : ""}>${v}</option>`).join("")}
        </select></label>
       ${ch.nextReview ? `<p class="muted">Prochaine révision le ${formatDate(ch.nextReview)}</p>` : ""}`
    : `<p class="muted">${done} sous-chapitre${done > 1 ? "s" : ""} acquis sur ${ch.children.length}</p>`;

  return `
    <button class="back" data-back="1">${icon("back")}${ue.code}${parent ? ` · ${esc(parent.title)}` : ""}</button>
    <section>
      <h2 class="detail-title">${esc(ch.title)}</h2>
      ${statusControl}
    </section>
    <section>
      <div class="panel-head"><h2><label for="notes">Observations</label></h2><span class="muted save-state" id="save-state" aria-live="polite"></span></div>
      <textarea id="notes" data-notes="${ch.id}" rows="6" placeholder="Points clés, pièges, références d'articles, questions à reposer…">${esc(ch.notes)}</textarea>
    </section>
    <section>
      <div class="panel-head">
        <h2>Images</h2>
        <button class="btn ghost" data-pick-images="1">${icon("plus")}Ajouter</button>
        <input type="file" id="image-input" data-add-images="${ch.id}" accept="image/*" multiple hidden>
      </div>
      <div class="gallery" id="gallery" data-chapter="${ch.id}"><p class="muted">Chargement…</p></div>
    </section>`;
}

async function loadGallery() {
  const el = document.getElementById("gallery");
  if (!el) return;
  const chapterId = el.dataset.chapter;
  const images = (await imagesFor(chapterId)).sort((a, b) => a.createdAt - b.createdAt);
  // La vue a pu changer pendant la lecture.
  if (document.getElementById("gallery") !== el) return;
  galleryUrls.forEach((u) => URL.revokeObjectURL(u));
  galleryUrls = images.map((img) => URL.createObjectURL(img.blob));
  el.innerHTML = images.length
    ? images.map((img, i) => `<figure>
        <button class="thumb" data-view-image="${galleryUrls[i]}" aria-label="Agrandir l'image ${i + 1}"><img src="${galleryUrls[i]}" alt="Image ${i + 1}"></button>
        ${deleteButton("del-image", img.id, `l'image ${i + 1}`)}
      </figure>`).join("")
    : '<p class="muted">Ajoutez des photos de cours, schémas ou captures d\'écran liés à cette partie.</p>';
}

function viewUe() {
  if (currentDetail) {
    const found = findItem(currentDetail);
    if (found) return viewDetail(found);
    currentDetail = null;
  }
  const ue = findUe(currentUe);
  const items = leaves(ue);
  const p = progress(items);
  const tabs = state.ues
    .map((u) => `<button role="tab" aria-selected="${u.code === currentUe}" data-ue="${u.code}">${u.code}</button>`)
    .join("");

  const rows = ue.chapters.map((ch) => (isLeaf(ch) ? leafRow(ch, null) : groupRow(ch))).join("");

  return `
    <div class="segmented" role="tablist">${tabs}</div>
    <section>
      <div class="ue-head">
        <h2>${esc(ue.name)}</h2>
        <button class="btn ghost" id="toggle-edit">${editMode ? "Terminer" : "Modifier"}</button>
      </div>
      <div class="bar"><span style="width:${p}%"></span></div>
      <p class="muted summary">${items.filter((c) => c.status === "acquis").length} acquis sur ${items.length} · ${p} %</p>
      <ul class="list">${rows || emptyRow("Aucun chapitre.")}</ul>
      ${editMode ? `<form id="add-chapter" class="inline-form">
        <input name="title" placeholder="Nouveau chapitre" required aria-label="Titre du nouveau chapitre">
        <button class="btn" type="submit">Ajouter</button>
      </form>` : ""}
    </section>`;
}

function chartSvg(entries) {
  const W = 600, H = 150, P = 24;
  const x = (i) => P + (entries.length === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (entries.length - 1));
  const y = (v) => H - P - (v / 20) * (H - 2 * P);
  const pts = entries.map((e, i) => `${x(i)},${y(e.score)}`).join(" ");
  const grid = [0, 10, 20]
    .map((v) => `<line class="grid-line" x1="${P}" x2="${W - P}" y1="${y(v)}" y2="${y(v)}"/><text x="0" y="${y(v) + 4}">${v}</text>`)
    .join("");
  const dots = entries.map((e, i) => `<circle cx="${x(i)}" cy="${y(e.score)}" r="4"><title>${esc(e.title)} : ${e.score}/20</title></circle>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution des notes">
    ${grid}${entries.length > 1 ? `<polyline points="${pts}"/>` : ""}${dots}</svg>`;
}

function viewAnnales() {
  const sorted = [...state.annales].sort((a, b) => b.date.localeCompare(a.date));

  const stats = state.ues.map((ue) => {
    const list = state.annales.filter((a) => a.ue === ue.code).sort((a, b) => a.date.localeCompare(b.date));
    if (!list.length) return "";
    const avg = (list.reduce((s, a) => s + a.score, 0) / list.length).toFixed(1).replace(".", ",");
    return `<div class="stat">
      <div class="stat-head"><strong>${ue.code}</strong><span><span class="num">${avg}</span><span class="muted"> /20 · ${list.length} copie${list.length > 1 ? "s" : ""}</span></span></div>
      ${chartSvg(list)}
    </div>`;
  }).join("");

  const rows = sorted.map((a) => `
    <li class="item">
      <div class="title"><span class="ue">${a.ue}</span> ${esc(a.title)}<small>${formatDate(a.date)}</small></div>
      <span class="num score">${String(a.score).replace(".", ",")}</span>
      ${deleteButton("del-annale", a.id, a.title)}
    </li>`).join("");

  return `
    <section>
      <h2>Nouvelle note</h2>
      <form id="add-annale" class="form-grid">
        <select name="ue" aria-label="UE">${state.ues.map((u) => `<option>${u.code}</option>`).join("")}</select>
        <input type="date" name="date" value="${todayISO()}" required aria-label="Date">
        <input type="number" name="score" min="0" max="20" step="0.25" placeholder="Note /20" required aria-label="Note sur 20" inputmode="decimal">
        <input name="title" class="full" placeholder="Intitulé, ex. Annale 2024" required aria-label="Intitulé">
        <button class="btn full" type="submit">Enregistrer</button>
      </form>
    </section>
    ${stats ? `<section><h2>Moyennes</h2>${stats}</section>` : ""}
    <section>
      <h2>Historique</h2>
      <ul class="list">${rows || emptyRow("Vos notes d'annales et d'examens blancs apparaîtront ici.")}</ul>
    </section>`;
}

function viewPlanning() {
  const options = state.ues.map((ue) => {
    const opts = [];
    for (const ch of ue.chapters) {
      if (isLeaf(ch)) opts.push(`<option value="${ch.id}">${esc(ch.title)}</option>`);
      else for (const sub of ch.children) opts.push(`<option value="${sub.id}">${esc(ch.title)} › ${esc(sub.title)}</option>`);
    }
    return `<optgroup label="${ue.code}">${opts.join("")}</optgroup>`;
  }).join("");

  return DAYS.map((day, i) => {
    const rows = state.planning[i]
      .map((id) => ({ id, f: findItem(id) }))
      .filter((x) => x.f)
      .map(({ id, f }) => `<li class="item">${statusDot(f.ch.status)}<div class="title"><span class="ue">${f.ue.code}</span> ${esc(label(f))}</div>
        <button class="icon-btn" data-unplan="${i}:${id}" aria-label="Retirer du ${day.toLowerCase()}">${icon("trash")}</button></li>`)
      .join("");
    return `<section>
      <h2>${day}</h2>
      ${rows ? `<ul class="list">${rows}</ul>` : ""}
      <form class="inline-form add-plan" data-day="${i}">
        <select name="chapter" aria-label="Chapitre à prévoir le ${day.toLowerCase()}" required><option value="">Ajouter un chapitre…</option>${options}</select>
        <button class="btn ghost" type="submit">Ajouter</button>
      </form>
    </section>`;
  }).join("");
}

function viewSettings() {
  const dates = state.ues.map((ue) => `
    <li class="item">
      <label class="title" for="exam-${ue.code}"><strong>${ue.code}</strong> <span class="muted">${esc(ue.name)}</span></label>
      <input type="date" id="exam-${ue.code}" data-exam="${ue.code}" value="${ue.examDate}">
    </li>`).join("");
  return `
    <section>
      <h2>Dates des épreuves</h2>
      <ul class="list">${dates}</ul>
    </section>
    <section>
      <h2>Sauvegarde</h2>
      <p class="muted">Vos données restent sur cet appareil. Exportez-les régulièrement pour ne rien perdre.</p>
      <div class="inline-form">
        <button class="btn" id="export">Exporter</button>
        <button class="btn ghost" id="import-btn">Importer</button>
        <input type="file" id="import" accept="application/json,.json" hidden>
      </div>
    </section>
    <section>
      <h2>Réinitialisation</h2>
      <button class="btn danger" id="reset">${pendingConfirm === "reset" ? "Confirmer l'effacement définitif" : "Effacer toutes les données"}</button>
      <p class="feedback" id="feedback" role="status"></p>
    </section>`;
}

const VIEWS = { dashboard: viewDashboard, ue: viewUe, annales: viewAnnales, planning: viewPlanning, settings: viewSettings };

function render() {
  // Garde la position de lecture : la galerie se recharge de façon asynchrone.
  const scrollY = window.scrollY;
  document.getElementById("page-title").textContent = TAB_TITLES[currentTab];
  document.getElementById("view").innerHTML = VIEWS[currentTab]();
  window.scrollTo(0, scrollY);
  document.querySelectorAll(".tabs button").forEach((b) => {
    const active = b.dataset.tab === currentTab;
    b.classList.toggle("active", active);
    if (active) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  if (currentTab === "ue" && currentDetail) loadGallery().then(() => window.scrollTo(0, scrollY));
}

function openDetail(id) {
  const found = findItem(id);
  if (!found) return;
  currentTab = "ue";
  currentUe = found.ue.code;
  currentDetail = id;
  editMode = false;
  inlineEdit = null;
  if (found.parent) openGroups.add(found.parent.id);
  window.scrollTo(0, 0);
  render();
}

function closeDetail() {
  const id = currentDetail;
  currentDetail = null;
  render();
  // Revient à la ligne du chapitre dans la liste.
  const row = view.querySelector(`[data-open="${id}"]`);
  if (row) row.scrollIntoView({ block: "center" });
}

const lightbox = document.getElementById("lightbox");
lightbox.addEventListener("click", (e) => {
  // Un appui hors de l'image ou sur « Fermer » referme la visionneuse.
  if (e.target === lightbox || e.target.closest("[data-close]")) lightbox.close();
});

// ---------- Événements ----------

document.querySelector(".tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  currentTab = btn.dataset.tab;
  currentDetail = null;
  editMode = false;
  inlineEdit = null;
  pendingConfirm = null;
  window.scrollTo(0, 0);
  render();
});

const view = document.getElementById("view");

view.addEventListener("toggle", (e) => {
  const id = e.target.dataset && e.target.dataset.group;
  if (!id) return;
  if (e.target.open) openGroups.add(id);
  else openGroups.delete(id);
}, true);

view.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  // Un bouton placé dans un <summary> ne doit pas replier le groupe.
  if (t.closest("summary")) e.preventDefault();
  const d = t.dataset;

  // Re-rendre ici retirerait le formulaire du DOM et annulerait son envoi.
  if (t.type === "submit" && t.form) return;

  // Les suppressions demandent un second appui : le bouton devient « Supprimer ? ».
  const hadPending = pendingConfirm;
  const confirmKey = d.delete ? `delete:${d.delete}`
    : d.delAnnale ? `del-annale:${d.delAnnale}`
    : d.delImage ? `del-image:${d.delImage}`
    : t.id === "reset" ? "reset" : null;
  if (confirmKey && pendingConfirm !== confirmKey) {
    pendingConfirm = confirmKey;
    render();
    return;
  }
  pendingConfirm = null;

  if (d.open) openDetail(d.open);
  else if (d.back) closeDetail();
  else if (d.pickImages) document.getElementById("image-input").click();
  else if (d.viewImage) {
    lightbox.querySelector("img").src = d.viewImage;
    lightbox.showModal();
  } else if (d.delImage) {
    const { ch } = findItem(currentDetail);
    deleteImage(d.delImage).then(() => {
      ch.imageCount = Math.max(0, ch.imageCount - 1);
      save(); render();
    });
  } else if (d.goto) { currentTab = d.goto; window.scrollTo(0, 0); render(); }
  else if (d.review) review(d.review, d.ok === "1");
  else if (d.ue) { currentUe = d.ue; inlineEdit = null; render(); }
  else if (t.id === "toggle-edit") { editMode = !editMode; inlineEdit = null; render(); }
  else if (d.addSub) { inlineEdit = { type: "sub", id: d.addSub }; openGroups.add(d.addSub); renderAndFocus(); }
  else if (d.rename) { inlineEdit = { type: "rename", id: d.rename }; renderAndFocus(); }
  else if (d.cancelInline) { inlineEdit = null; render(); }
  else if (d.delete) {
    const { ue, ch, parent } = findItem(d.delete);
    if (parent) parent.children = parent.children.filter((c) => c.id !== ch.id);
    else ue.chapters = ue.chapters.filter((c) => c.id !== ch.id);
    const ids = [ch.id, ...ch.children.map((c) => c.id)];
    removeFromPlanning(ids);
    deleteImagesFor(ids);
    save(); render();
  } else if (d.delAnnale) {
    state.annales = state.annales.filter((a) => a.id !== d.delAnnale);
    save(); render();
  } else if (d.unplan) {
    const [day, id] = d.unplan.split(":");
    state.planning[day] = state.planning[day].filter((x) => x !== id);
    save(); render();
  } else if (t.id === "export") {
    exportData();
  } else if (t.id === "import-btn") {
    document.getElementById("import").click();
  } else if (t.id === "reset") {
    state = defaultState();
    save();
    clearImages().then(() => {
      render();
      showFeedback("Toutes les données ont été effacées.");
    });
  } else if (hadPending) render();
});

function renderAndFocus() {
  render();
  const input = view.querySelector(".inline-edit input");
  if (input) { input.focus(); input.select(); }
}

function showFeedback(text) {
  const el = document.getElementById("feedback");
  if (el) el.textContent = text;
}

// La sauvegarde embarque les images, encodées en texte, pour être complète.
async function exportData() {
  showFeedback("Préparation de la sauvegarde…");
  const images = await Promise.all((await allImages()).map(async (img) => ({
    id: img.id,
    chapterId: img.chapterId,
    createdAt: img.createdAt,
    data: await blobToDataUrl(img.blob),
  })));
  const blob = new Blob([JSON.stringify({ ...state, images }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `revisions-dscg-${todayISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showFeedback(`Sauvegarde exportée (${images.length} image${images.length > 1 ? "s" : ""}).`);
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.ues) || !Array.isArray(data.annales) || !Array.isArray(data.planning)) throw new Error("format");
    const images = data.images || [];
    delete data.images;
    await clearImages();
    for (const img of images) {
      const blob = await (await fetch(img.data)).blob();
      await putImage({ id: img.id, chapterId: img.chapterId, createdAt: img.createdAt || Date.now(), blob });
    }
    state = normalize(data);
    save(); render();
    showFeedback("Sauvegarde importée.");
  } catch {
    showFeedback("Ce fichier n'est pas une sauvegarde valide.");
  }
}

async function addImages(chapterId, files) {
  const { ch } = findItem(chapterId);
  const gallery = document.getElementById("gallery");
  if (gallery) gallery.insertAdjacentHTML("afterbegin", '<p class="muted" id="adding">Ajout en cours…</p>');
  let added = 0;
  for (const file of files) {
    try {
      const blob = await compressImage(file);
      await putImage({ id: uid(), chapterId, createdAt: Date.now() + added, blob });
      added++;
    } catch (e) {
      console.warn("Image ignorée", file.name, e);
    }
  }
  ch.imageCount += added;
  save(); render();
}

let notesTimer = null;
view.addEventListener("input", (e) => {
  const t = e.target;
  if (!t.dataset.notes) return;
  const { ch } = findItem(t.dataset.notes);
  ch.notes = t.value;
  const stateEl = document.getElementById("save-state");
  stateEl.textContent = "…";
  clearTimeout(notesTimer);
  notesTimer = setTimeout(() => {
    save();
    stateEl.textContent = "Enregistré";
  }, 400);
});

view.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.status) setStatus(t.dataset.status, t.value);
  else if (t.dataset.exam) {
    findUe(t.dataset.exam).examDate = t.value;
    save();
  } else if (t.dataset.addImages && t.files.length) {
    addImages(t.dataset.addImages, [...t.files]);
  } else if (t.id === "import" && t.files[0]) {
    importData(t.files[0]);
  }
});

view.addEventListener("submit", (e) => {
  e.preventDefault();
  pendingConfirm = null;
  const f = e.target;
  const data = new FormData(f);

  if (f.dataset.inline) {
    const { ch } = findItem(f.dataset.id);
    const title = data.get("title").trim();
    if (!title) return;
    if (f.dataset.inline === "rename") {
      ch.title = title;
      inlineEdit = null;
    } else {
      if (isLeaf(ch)) {
        // Le chapitre devient un regroupement : son suivi passe aux sous-chapitres.
        Object.assign(ch, { status: "nonvu", step: 0, nextReview: "" });
        removeFromPlanning([ch.id]);
      }
      ch.children.push(newItem(title));
      openGroups.add(ch.id);
      // Le champ reste ouvert pour enchaîner plusieurs sous-chapitres.
      save();
      renderAndFocus();
      return;
    }
  } else if (f.id === "add-chapter") {
    findUe(currentUe).chapters.push(newItem(data.get("title").trim()));
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

// Demande au navigateur de ne pas purger les données (notes et images) en cas de manque d'espace.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

render();
