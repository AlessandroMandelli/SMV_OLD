import {
  COMMON,
  SECTIONS,
  RISKS,
  WINDOWS,
  METHODS,
  ROLES,
  STATUSES,
  uid,
  newState,
  baseName,
  formatMeasure,
  applyFixed,
  parseState,
  historyRecord,
  conditionRecord,
  diagnosisRecord,
  priorityRecord,
  immediateRecord,
  preventiveRecord,
} from "./model.js";
import * as storage from "./storage.js";
import { ASSETS } from "./catalog.js";
import { migrateLegacy } from "./legacy.js";
import { makePdf } from "./pdf.js";

const $ = (id) => document.getElementById(id);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let assets = [],
  state = null,
  draftAvailable = false,
  storageReady = false,
  saveTimer,
  saveChain = Promise.resolve(),
  revision = 0,
  savedRevision = 0,
  toastTimer,
  busy = false;
const measureKeys = new Set([
  "altitude",
  "distance",
  "height",
  "width",
  "depth",
]);
function notify(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 6500);
}
function showMessage(title, message) {
  $("dialogTitle").textContent = title;
  $("dialogMessage").textContent = message;
  $("messageDialog").showModal();
}
function get(path) {
  return path.split(".").reduce((o, k) => o?.[k], state) ?? "";
}
function set(path, value) {
  const keys = path.split(".");
  if (keys.some((k) => ["__proto__", "prototype", "constructor"].includes(k)))
    throw Error("Campo non valido.");
  let target = state;
  for (const k of keys.slice(0, -1)) target = target[k];
  target[keys.at(-1)] = value;
}
function asset() {
  return assets.find((a) => a.id === state?.assetId);
}
function currentName() {
  return baseName(state, assets);
}
function syncFilename() {
  if (!state) return;
  if (document.activeElement !== $("filename"))
    $("filename").value = currentName();
}
function changed() {
  state.updatedAt = new Date().toISOString();
  revision++;
  draftAvailable = true;
  $("resumeButton").disabled = false;
  $("saveStatus").textContent = "Salvataggio…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 250);
  syncFilename();
}
function persist() {
  clearTimeout(saveTimer);
  if (!state) return saveChain;
  const copy = structuredClone(state),
    version = revision;
  saveChain = saveChain
    .catch(() => {})
    .then(async () => {
      try {
        if (!storageReady) throw Error("Archivio non disponibile");
        await storage.saveDraft(copy);
        savedRevision = version;
        if (version === revision) $("saveStatus").textContent = "Bozza salvata";
      } catch {
        $("saveStatus").textContent = "Bozza non salvata";
        notify(
          "Salvataggio locale non riuscito. Mantieni aperta la scheda e salva PDF e JSON prima di uscire.",
        );
      }
    });
  return saveChain;
}
function show(view) {
  for (const name of ["home", "editor"]) $(name).hidden = name !== view;
  $("options").open = false;
  window.scrollTo(0, 0);
  if (view === "editor") render();
}
function field(
  label,
  path,
  {
    type = "text",
    wide = false,
    multiline = false,
    fixed = false,
    value,
    unit = false,
  } = {},
) {
  const val = value ?? get(path);
  const read = fixed ? ' readonly aria-readonly="true"' : "";
  const common = `data-path="${escape(path)}"${read}${unit ? ' data-measure="true" inputmode="decimal"' : ""}`;
  const control = multiline
    ? `<textarea ${common} rows="3">${escape(val)}</textarea>`
    : `<input type="${type}" ${common} value="${escape(val)}"${unit ? ' placeholder="m"' : ""}>`;
  return `<label class="field${wide ? " wide" : ""}"><span>${escape(label)}${fixed ? ' <span aria-label="non modificabile">🔒</span>' : ""}${unit ? " <small>(m)</small>" : ""}</span>${control}</label>`;
}
function fixedField(label, value, wide = true) {
  return field(label, "", { fixed: true, value, wide });
}
function band(title) {
  return `<h2 class="section-heading">${escape(title)}</h2>`;
}
function removeButton(action, index, extra = "") {
  return `<button type="button" class="remove" data-action="${action}" data-index="${index}" ${extra}>Rimuovi</button>`;
}
function addButton(label, action, extra = "") {
  return `<button class="add-button" type="button" data-action="${action}" ${extra}>＋ ${escape(label)}</button>`;
}
function riskField(label, path) {
  const value = get(path);
  return `<label class="field"><span>${escape(label)}</span><select data-path="${path}" class="risk-${String(value).toLowerCase().replace("basso", "low").replace("medio", "medium").replace("alto", "high")}"><option value="">—</option>${RISKS.map((r) => `<option${r === value ? " selected" : ""}>${r}</option>`).join("")}</select></label>`;
}
function choices(label, path, values, multiple = false) {
  const value = get(path);
  return `<fieldset class="choice-group"><legend>${escape(label)}</legend><div class="choices">${values.map((v, i) => `<label><input type="${multiple ? "checkbox" : "radio"}" name="${path}" value="${escape(v)}" data-path="${path}"${multiple ? ' data-multiple="true"' : ""}${multiple ? (Array.isArray(value) && value.includes(v) ? " checked" : "") : value === v ? " checked" : ""}>${escape(v)}</label>`).join("")}</div>${!multiple ? `<button type="button" class="clear-choice" data-action="clear-choice" data-path="${path}">Azzera scelta</button>` : ""}</fieldset>`;
}
function fixedPeople() {
  return `<div class="fixed-block"><strong>Operatori:</strong> ${escape(COMMON.company)}<br><strong>Restauratore capofila:</strong> ${escape(COMMON.operator)}<br><strong>Interventi autorizzati da:</strong> ${escape(COMMON.authorization)}</div>`;
}
function sharedHeader(datePath) {
  return `<div class="fields three">${field("ID scheda", "general.id")}${field("Data", datePath, { type: "date" })}${field("Oggetto", "general.object", { fixed: Object.hasOwn(asset().fixed || {}, "object") })}</div>${fixedPeople()}`;
}
function mapHtml() {
  return `<aside class="map-panel"><h2>LOCALIZZAZIONE BENE</h2><p>🔒 ${escape(asset().label)}</p><div class="map-frame"><img src="./assets/map.jpg" alt="Planimetria del percorso del Sacro Monte di Varese">${assets.map((a) => `<span class="map-check${a.id === state.assetId ? " selected" : ""}" role="checkbox" aria-checked="${a.id === state.assetId}" aria-disabled="true" aria-label="${escape(a.label)}" title="${escape(a.label)}" style="left:${a.x}%;top:${a.y}%">${a.id === state.assetId ? "✓" : ""}</span>`).join("")}</div></aside>`;
}
function firstSection() {
  const fixed = asset().fixed || {};
  const general = (label, key, options = {}) =>
    field(label, "general." + key, {
      ...options,
      fixed: Object.hasOwn(fixed, key),
    });
  return `<div class="first-layout"><div><h1>SCHEDA DI ISPEZIONE PERIODICA</h1><div class="fields">${field("ID scheda", "general.id", { wide: true })}${field("Data", "general.date", { type: "date" })}${field("Ora", "general.time", { type: "time" })}</div>
  <div class="fixed-block"><strong>Operatore: ${escape(COMMON.operator)}</strong><small>${escape(COMMON.company)} – ${escape(COMMON.address)}</small><small>${escape(COMMON.email)}<br>PEC – ${escape(COMMON.pec)}</small></div>
  ${band("1. IDENTIFICAZIONE DEL BENE")}<div class="fields">${general("Oggetto", "object", { wide: true })}${general("Cronologia", "chronology")}${general("Autore", "author")}${general("Quota s.l.m.", "altitude", { unit: true })}${general("Distanza dal Santuario", "distance", { unit: true })}${fixedField("Complesso", COMMON.complex)}${fixedField("Ente proprietario", COMMON.owner)}</div>
  ${band("2. SOGGETTO E DATI TECNICO-DIMENSIONALI")}<div class="fields">${general("Soggetto", "subject", { wide: true })}</div><div class="fields three wide-note">${general("Altezza H", "height", { unit: true })}${general("Larghezza L", "width", { unit: true })}${general("Profondità P", "depth", { unit: true })}</div><div class="wide-note">${general("Materie e Tecniche", "materials", { multiline: true })}</div></div>${mapHtml()}</div>`;
}
function historyCards(key, title) {
  return `${band(title)}${state.history[key].map((r, i) => `<article class="repeat-card"><div class="card-top"><h3>${escape(title)} · ${i + 1}</h3>${removeButton("remove-history", i, `data-key="${key}"`)}</div><div class="fields">${field("Mese e anno", `history.${key}.${i}.date`, { type: "month" })}${field("Azione", `history.${key}.${i}.action`, { multiline: true, wide: true })}</div></article>`).join("")}${addButton("Aggiungi intervento", "add-history", `data-key="${key}"`)}`;
}
function historySection() {
  return `<h1>Storico e stato conservativo</h1>${band("3. STORICO MANUTENTIVO")}${historyCards("restorations", "Interventi di RESTAURO precedenti")}${historyCards("maintenance", "Interventi di MANUTENZIONE precedenti")}${band("4. STATO CONSERVATIVO ATTUALE")}${state.conditions.map((r, i) => `<article class="repeat-card"><div class="card-top"><h3>Stato conservativo · ${i + 1}</h3>${removeButton("remove-condition", i)}</div>${field("Esposizione", `conditions.${i}.exposure`)}${choices("Metodologia Ispezione", `conditions.${i}.methods`, METHODS, true)}${field("Valutazione sintetica", `conditions.${i}.assessment`, { multiline: true })}</article>`).join("")}${addButton("Aggiungi stato conservativo", "add-condition")}`;
}
const diagnosisHeaders = [
  "Macro-Area",
  "Elemento",
  "Patologia riscontrata",
  "Cause principali",
  "Livello di rischio",
  "Risolto in data",
];
function diagnosisSection() {
  return `<h1>Diagnostica e priorità</h1>${band("5. DIAGNOSTICA DEL DEGRADO E PRIORITÀ DI INTERVENTO")}<div class="table-wrap"><table><thead><tr>${diagnosisHeaders.map((h) => `<th scope="col">${h}</th>`).join("")}<th scope="col">Riga</th></tr></thead><tbody>${state.diagnosis.map((r, i) => `<tr>${["area", "element", "pathology", "causes"].map((k, j) => `<td>${field(diagnosisHeaders[j], `diagnosis.${i}.${k}`, { multiline: true })}</td>`).join("")}<td>${riskField("Livello di rischio", `diagnosis.${i}.risk`)}</td><td>${field("Risolto in data", `diagnosis.${i}.resolvedDate`, { type: "date" })}</td><td>${removeButton("remove-diagnosis", i)}</td></tr>`).join("")}</tbody></table></div>${addButton("Aggiungi riga", "add-diagnosis")}${band("INDICE DI PRIORITÀ E TEMPISTICHE DI INTERVENTO")}${state.priorities.map((r, i) => `<article class="repeat-card"><div class="card-top"><h3>Priorità · ${i + 1}</h3>${removeButton("remove-priority", i)}</div>${riskField("Grado d’urgenza", `priorities.${i}.risk`)}${choices("Finestra d’intervento programmata", `priorities.${i}.window`, WINDOWS)}${field("Anomalie attese", `priorities.${i}.anomalies`, { multiline: true })}</article>`).join("")}${addButton("Aggiungi priorità", "add-priority")}<div class="wide-note">${field("Note aggiuntive", "inspectionNotes", { multiline: true })}</div>`;
}
function photosSection() {
  return `<h1>Atlante fotografico</h1>${band("6. ATLANTE FOTOGRAFICO")}<div class="photo-actions"><button type="button" data-action="camera" class="primary">◉ Scatta foto</button><button type="button" data-action="photos">↥ Carica foto</button></div><div class="photo-grid">${state.photos.map((p, i) => `<article class="photo-card"><img src="${escape(p.data)}" alt="Fotografia ${i + 1}"><div><span>Foto ${i + 1}</span>${removeButton("remove-photo", i)}</div></article>`).join("")}</div>${!state.photos.length ? '<p class="empty">Aggiungi le fotografie del sopralluogo.</p>' : ""}`;
}
function immediateSection() {
  return `<h1>Registro interventi di manutenzione immediata</h1>${sharedHeader("immediate.date")}${field("Eseguiti in data", "immediate.executedDate", { type: "date" })}${band("INTERVENTI ESEGUITI")}${state.immediate.records.map((r, i) => `<article class="repeat-card"><div class="card-top"><h3>Intervento · ${i + 1}</h3>${removeButton("remove-immediate", i)}</div><div class="fields">${field("Macro-Area", `immediate.records.${i}.area`, { wide: true })}${field("Azioni condotte in loco", `immediate.records.${i}.action`, { wide: true, multiline: true })}</div></article>`).join("")}${addButton("Aggiungi intervento", "add-immediate")}<div class="wide-note">${field("Note aggiuntive", "immediate.notes", { multiline: true })}</div>`;
}
function preventiveSection() {
  return `<h1>Programmazione azioni preventive</h1>${sharedHeader("preventive.date")}${band("AZIONI PREVENTIVE")}<p class="section-note">Macro-Area, Elemento e Patologia sono collegati alla diagnostica. Aggiungi le azioni sotto la rispettiva riga.</p><div class="table-wrap"><table><thead><tr><th>Riga</th><th>Macro-Area</th><th>Elemento</th><th>Patologia riscontrata</th></tr></thead><tbody>${state.diagnosis.map((r, i) => `<tr><td>${i + 1}</td><td>${escape(r.area)}</td><td>${escape(r.element)}</td><td>${escape(r.pathology)}</td></tr>`).join("")}</tbody></table></div>${state.diagnosis.map((r, i) => `<div class="record-context"><strong>Riga ${i + 1}</strong> · ${escape(r.area || "Macro-Area non compilata")}<br>${escape(r.element)}${r.element && r.pathology ? " · " : ""}${escape(r.pathology)}</div>${r.actions.map((a, j) => `<article class="repeat-card"><div class="card-top"><h3>Azione preventiva ${i + 1}.${j + 1}</h3>${removeButton("remove-preventive", j, `data-row="${i}"`)}</div>${riskField("Grado d’urgenza", `diagnosis.${i}.actions.${j}.risk`)}${choices("Finestra d’intervento", `diagnosis.${i}.actions.${j}.window`, WINDOWS)}<div class="fields">${field("Descrizione", `diagnosis.${i}.actions.${j}.description`, { wide: true, multiline: true })}${field("Azione", `diagnosis.${i}.actions.${j}.action`, { wide: true, multiline: true })}${field("Obiettivo", `diagnosis.${i}.actions.${j}.objective`, { wide: true, multiline: true })}${field("Operatore", `diagnosis.${i}.actions.${j}.operator`, { wide: true })}</div>${choices("Qualifica operatore", `diagnosis.${i}.actions.${j}.role`, ROLES)}${choices("Stato", `diagnosis.${i}.actions.${j}.status`, STATUSES)}</article>`).join("")}${addButton("Aggiungi azione per la riga " + (i + 1), "add-preventive", `data-row="${i}"`)}`).join("")}${!state.diagnosis.length ? '<p class="empty">Aggiungi una riga nella sezione Diagnostica e priorità per associarle azioni preventive.</p>' : ""}<div class="wide-note">${field("Note aggiuntive", "preventive.notes", { multiline: true })}</div>`;
}
function render() {
  const renderer = [
    firstSection,
    historySection,
    diagnosisSection,
    photosSection,
    immediateSection,
    preventiveSection,
  ][state.section];
  $("sectionContent").innerHTML = renderer();
  syncFilename();
  $("sectionCounter").textContent =
    `Sezione ${state.section + 1} di ${SECTIONS.length}`;
  $("previous").textContent = state.section
    ? "← " + SECTIONS[state.section - 1]
    : "⌂ Home";
  $("next").textContent =
    state.section === SECTIONS.length - 1
      ? "Salva PDF e esporta JSON"
      : SECTIONS[state.section + 1] + " →";
  $("next").disabled = busy;
}
function navigate(direction) {
  if (direction < 0 && state.section === 0) {
    persist();
    show("home");
    return;
  }
  state.section += direction;
  changed();
  render();
  window.scrollTo(0, 0);
  $("sectionContent").focus({ preventScroll: true });
}

$("sectionContent").addEventListener("input", (event) => {
  const el = event.target;
  if (
    !el.matches("[data-path]") ||
    el.readOnly ||
    ["radio", "checkbox"].includes(el.type)
  )
    return;
  set(el.dataset.path, el.value);
  el.setCustomValidity("");
  changed();
});
$("sectionContent").addEventListener("change", (event) => {
  const el = event.target;
  if (!el.matches("[data-path]") || el.readOnly) return;
  if (el.dataset.measure) {
    try {
      el.value = formatMeasure(el.value);
      el.setCustomValidity("");
      set(el.dataset.path, el.value);
    } catch (error) {
      el.setCustomValidity(error.message);
      el.reportValidity();
      return;
    }
  } else if (el.dataset.multiple) {
    const list = get(el.dataset.path);
    set(
      el.dataset.path,
      el.checked
        ? [...new Set([...list, el.value])]
        : list.filter((v) => v !== el.value),
    );
  } else if (el.type === "radio") {
    if (el.checked) set(el.dataset.path, el.value);
  } else set(el.dataset.path, el.value);
  if (el.tagName === "SELECT") {
    el.className =
      "risk-" +
      ({ BASSO: "low", MEDIO: "medium", ALTO: "high" }[el.value] || "");
  }
  changed();
});
$("sectionContent").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, key, row } = button.dataset;
  const i = Number(button.dataset.index);
  if (action === "camera") {
    $("cameraInput").click();
    return;
  }
  if (action === "photos") {
    $("photoInput").click();
    return;
  }
  if (action.startsWith("remove-")) {
    const hasActions =
      action === "remove-diagnosis" && state.diagnosis[i].actions.length;
    if (
      !confirm(
        hasActions
          ? "Eliminare questa riga e tutte le azioni preventive collegate?"
          : "Rimuovere questo elemento e i dati contenuti?",
      )
    )
      return;
  }
  switch (action) {
    case "add-history":
      state.history[key].push(historyRecord());
      break;
    case "remove-history":
      state.history[key].splice(i, 1);
      break;
    case "add-condition":
      state.conditions.push(conditionRecord());
      break;
    case "remove-condition":
      state.conditions.splice(i, 1);
      break;
    case "add-diagnosis":
      state.diagnosis.push(diagnosisRecord());
      break;
    case "remove-diagnosis":
      state.diagnosis.splice(i, 1);
      break;
    case "add-priority":
      state.priorities.push(priorityRecord());
      break;
    case "remove-priority":
      state.priorities.splice(i, 1);
      break;
    case "remove-photo":
      state.photos.splice(i, 1);
      break;
    case "add-immediate":
      state.immediate.records.push(immediateRecord());
      break;
    case "remove-immediate":
      state.immediate.records.splice(i, 1);
      break;
    case "add-preventive":
      state.diagnosis[Number(row)].actions.push(preventiveRecord());
      break;
    case "remove-preventive":
      state.diagnosis[Number(row)].actions.splice(i, 1);
      break;
    case "clear-choice":
      set(button.dataset.path, "");
      break;
    default:
      return;
  }
  changed();
  render();
});
$("filename").addEventListener("input", () => {
  state.filename = $("filename").value;
  state.customFilename = !!state.filename.trim();
  changed();
});
$("filename").addEventListener("blur", () => {
  state.filename = currentName();
  syncFilename();
});
$("previous").onclick = () => navigate(-1);
$("next").onclick = () =>
  state.section === SECTIONS.length - 1 ? exportFinal() : navigate(1);
$("goHome").onclick = () => {
  persist();
  show("home");
};
$("newButton").onclick = () => $("newDialog").showModal();
$("newForm").onsubmit = async (event) => {
  event.preventDefault();
  if (
    draftAvailable &&
    !confirm(
      "Creare una nuova scheda sostituendo la bozza corrente? Salva prima PDF e JSON se vuoi conservarla.",
    )
  )
    return;
  clearTimeout(saveTimer);
  await saveChain;
  state = applyFixed(newState($("assetSelect").value), assets);
  $("newDialog").close();
  changed();
  show("editor");
};
$("resumeButton").onclick = () => show("editor");
$("resetButton").onclick = async () => {
  if (busy) {
    notify("Attendi il completamento del salvataggio.");
    return;
  }
  if (
    !confirm(
      "Cancellare tutti i dati e le fotografie della bozza? I PDF già archiviati resteranno disponibili.",
    )
  )
    return;
  clearTimeout(saveTimer);
  await saveChain;
  try {
    if (storageReady) await storage.removeDraft();
    localStorage.removeItem("restauro-v3-fallback");
    state = null;
    draftAvailable = false;
    revision = savedRevision = 0;
    $("resumeButton").disabled = true;
    show("home");
    notify("Bozza cancellata.");
  } catch (error) {
    notify("Reset non riuscito: " + error.message);
  }
};
for (const button of document.querySelectorAll("[data-close]"))
  button.onclick = () => $(button.dataset.close).close();
document.addEventListener("click", (e) => {
  if (!e.target.closest("#options")) $("options").open = false;
});

async function insertPhotos(files) {
  let failures = 0;
  for (const file of files) {
    let url;
    try {
      url = URL.createObjectURL(file);
      const image = new Image();
      image.src = url;
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight)
        throw Error("Immagine non leggibile");
      const scale = Math.min(
        1,
        2400 / Math.max(image.naturalWidth, image.naturalHeight),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      state.photos.push({
        id: uid(),
        data: canvas.toDataURL("image/jpeg", 0.9),
        width: canvas.width,
        height: canvas.height,
      });
    } catch {
      failures++;
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }
  changed();
  render();
  await persist();
  if (failures)
    notify(
      `${failures} immagini non leggibili. Convertile in JPEG o PNG e riprova.`,
    );
}
for (const id of ["photoInput", "cameraInput"])
  $(id).onchange = async (event) => {
    await insertPhotos([...event.target.files]);
    event.target.value = "";
  };
$("importButton").onclick = () => $("jsonInput").click();
$("jsonInput").onchange = async (event) => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    const raw = JSON.parse(await file.text());
    const next = parseState(
      raw.version === 3 ? await migrateLegacy(raw, assets) : raw,
      assets,
    );
    if (
      draftAvailable &&
      !confirm("Sostituire la bozza corrente con quella importata?")
    )
      return;
    clearTimeout(saveTimer);
    await saveChain;
    state = next;
    changed();
    show("editor");
    await persist();
    notify("Scheda importata, fotografie comprese.");
  } catch (error) {
    showMessage("Importazione non riuscita", error.message);
  } finally {
    event.target.value = "";
  }
};
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function exportFinal() {
  if (busy) return;
  try {
    for (const k of measureKeys)
      state.general[k] = formatMeasure(state.general[k]);
    parseState(state, assets);
  } catch (error) {
    showMessage("Controlla i dati", error.message);
    return;
  }
  busy = true;
  $("next").disabled = true;
  $("next").textContent = "Generazione dei file…";
  try {
    await persist();
    const snapshot = structuredClone(state);
    const pdf = await makePdf(snapshot, assets);
    const json = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json",
    });
    const name = baseName(snapshot, assets);
    download(pdf, name + ".pdf");
    download(json, name + ".json");
  } catch (error) {
    showMessage("Esportazione non riuscita", error.message);
  } finally {
    busy = false;
    render();
  }
}
window.addEventListener("pagehide", () => {
  if (state) persist();
});
window.addEventListener("beforeunload", (event) => {
  if (state && revision !== savedRevision) {
    event.preventDefault();
    event.returnValue = "";
  }
});
async function init() {
  assets = ASSETS;
  const ordered = [...assets].sort((a, b) => {
    const rank = (x) =>
      x.kind === "arch" ? { 1: 0.5, 2: 5.5, 3: 10.5 }[x.number] : x.number;
    return rank(a) - rank(b);
  });
  for (const item of ordered) {
    const option = document.createElement("option");
    option.textContent = item.label;
    option.value = item.id;
    $("assetSelect").append(option);
  }
  $("newButton").disabled = false;
  $("importButton").disabled = false;
  window.RestauroAppReady = true;
  // La home è utilizzabile subito. L'apertura della bozza non blocca i pulsanti.
  const startRevision = revision;
  try {
    await storage.openStorage();
    storageReady = true;
    const saved = await storage.loadDraft();
    let recovered = null;
    if (saved) recovered = parseState(saved, assets, { allowIncomplete: true });
    else {
      const legacy = await storage.loadLegacyDraft();
      if (legacy) recovered = await migrateLegacy(legacy, assets);
    }
    if (recovered && !state && revision === startRevision) {
      state = recovered;
      draftAvailable = true;
      $("resumeButton").disabled = false;
    } else if (state && revision > savedRevision) persist();
  } catch (error) {
    notify("Bozza locale non disponibile: " + error.message);
  }
}
init().catch((error) => showMessage("Avvio non riuscito", error.message));
