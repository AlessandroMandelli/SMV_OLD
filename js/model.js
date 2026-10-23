/** Modello unico condiviso da editor, bozza, JSON e PDF. */
export const APP_ID = "schede-restauro";
export const SCHEMA_VERSION = 1;
export const COMMON = Object.freeze({
  operator: "Francesco Maria Peron",
  company: "Cròmo s.c.ar.l.",
  address: "Via Matteotti, 8 – 21030 Castello Cabiaglio (Varese)",
  email: "info@cromorestauri.com",
  pec: "cromo restauri@sicurezzapostale.it",
  complex: "Sacro Monte di Varese – Percorso devozionale dei 15 misteri",
  owner: "Parrocchia Santa Maria del Monte al Sacro Monte di Varese",
  authorization: "D.L., Arch. Gaetano Arricobene",
});
export const SECTIONS = [
  "Identificazione e dati del bene",
  "Storico e stato conservativo",
  "Diagnostica e priorità",
  "Atlante fotografico",
  "Manutenzione immediata",
  "Azioni preventive",
];
export const RISKS = ["BASSO", "MEDIO", "ALTO"];
export const WINDOWS = [
  "PROSECUZIONE MONITORAGGIO",
  "IMMEDIATO",
  "ENTRO 6 MESI",
  "ENTRO 12 MESI",
];
export const METHODS = ["Visiva (da terra)", "Visiva (da presidio)", "Tattile"];
export const ROLES = [
  "TECNICO MANUTENTORE",
  "RESTAURATORE BENI CULTURALI",
  "GIARDINIERE/MANUTENTORE",
];
export const STATUSES = ["IN ATTESA", "PIANIFICATO", "ATTIVO"];
export const uid = () => crypto.randomUUID();
export function localDate(d = new Date()) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}
export function localTime(d = new Date()) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export const historyRecord = () => ({ id: uid(), date: "", action: "" });
export const conditionRecord = () => ({
  id: uid(),
  exposure: "",
  methods: [],
  assessment: "",
});
export const diagnosisRecord = () => ({
  id: uid(),
  area: "",
  element: "",
  pathology: "",
  causes: "",
  risk: "",
  resolvedDate: "",
  actions: [],
});
export const priorityRecord = () => ({
  id: uid(),
  risk: "",
  window: "",
  anomalies: "",
});
export const immediateRecord = () => ({ id: uid(), area: "", action: "" });
export const preventiveRecord = () => ({
  id: uid(),
  risk: "",
  window: "",
  description: "",
  action: "",
  objective: "",
  operator: "",
  role: "",
  status: "",
});
export function newState(assetId) {
  const date = localDate();
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    assetId,
    filename: "",
    customFilename: false,
    section: 0,
    general: {
      id: "",
      date,
      time: localTime(),
      object: "",
      chronology: "",
      author: "",
      altitude: "",
      distance: "",
      subject: "",
      height: "",
      width: "",
      depth: "",
      materials: "",
    },
    history: {
      restorations: [historyRecord()],
      maintenance: [historyRecord()],
    },
    conditions: [conditionRecord()],
    diagnosis: [diagnosisRecord()],
    priorities: [priorityRecord()],
    inspectionNotes: "",
    photos: [],
    immediate: {
      date,
      executedDate: "",
      records: [immediateRecord()],
      notes: "",
    },
    preventive: { date, notes: "" },
  };
}
export function baseName(state, assets) {
  if (state.customFilename && state.filename.trim())
    return safeFilename(state.filename);
  const asset = assets.find((a) => a.id === state.assetId);
  const name =
    asset?.kind === "arch"
      ? `Arco_${String(asset.number).padStart(2, "0")}`
      : `Cappella_${String(asset?.number || "").padStart(2, "0")}`;
  const date = state.general.date || localDate(new Date(state.createdAt));
  return `Sacro_Monte_Varese_${name}_${date.replaceAll("-", "_")}_${localTime(new Date(state.createdAt)).replace(":", "_")}`;
}
export function safeFilename(name) {
  return (
    name
      .trim()
      .replace(/\.(pdf|json)$/i, "")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/[. ]+$/, "")
      .slice(0, 160) || "Scheda_Restauro"
  );
}
export function formatMeasure(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/.test(raw))
    throw Error(
      "Inserisci un numero con virgola per i decimali, per esempio 1.950,50.",
    );
  const [whole, fraction] = raw.replaceAll(".", "").split(",");
  const negative = whole.startsWith("-");
  const digits = whole.replace("-", "").replace(/^0+(?=\d)/, "");
  return (
    (negative ? "-" : "") +
    digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".") +
    (fraction !== undefined ? "," + fraction : "")
  );
}
export const measureText = (value) =>
  value ? `${formatMeasure(value)} m` : "";
export const displayDate = (value) =>
  value ? value.split("-").reverse().join("/") : "";
export function displayMonth(value) {
  if (!value) return "";
  const [y, m] = value.split("-");
  return `${["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"][Number(m) - 1]} ${y}`;
}
/** I soli dati futuri dichiarati in fixed nell'archivio possono bloccare l'anagrafica. */
export function applyFixed(state, assets) {
  const selected = assets.find((a) => a.id === state.assetId);
  const fixed = selected?.fixed || {};
  state.fixedCommon = { ...COMMON };
  state.assetSnapshot = selected ? structuredClone(selected) : null;
  for (const key of Object.keys(state.general))
    if (Object.hasOwn(fixed, key)) state.general[key] = String(fixed[key]);
  return state;
}
export function parseState(input, assets, { allowIncomplete = false } = {}) {
  if (!input || input.app !== APP_ID || input.schemaVersion !== SCHEMA_VERSION)
    throw Error(
      "JSON non compatibile. Usa una scheda esportata da questa versione. Le bozze precedenti rimangono nel browser.",
    );
  if (!assets.some((a) => a.id === input.assetId))
    throw Error("Il bene indicato nel JSON non è disponibile.");
  const out = newState(input.assetId);
  const text = (v) => (typeof v === "string" ? v : "");
  const arr = (v) => {
    if (!Array.isArray(v))
      throw Error("Struttura JSON non valida: elenco mancante.");
    return v;
  };
  const date = (v, month = false) => {
    v = text(v);
    if (!v) return "";
    if (
      month
        ? !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)
        : !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)
    )
      throw Error("Data JSON non valida.");
    if (!month && localDate(new Date(v + "T12:00:00")) !== v)
      throw Error("Data JSON non valida.");
    return v;
  };
  const choice = (v, list) => {
    v = text(v);
    if (v && !list.includes(v)) throw Error("Scelta JSON non riconosciuta.");
    return v;
  };
  const records = (values, factory, keys) =>
    arr(values).map((value) => {
      if (!value || typeof value !== "object")
        throw Error("Riga JSON non valida.");
      const row = factory();
      for (const k of keys) row[k] = text(value[k]);
      return row;
    });
  out.createdAt = text(input.createdAt);
  if (!Number.isFinite(Date.parse(out.createdAt)))
    throw Error("Data di creazione non valida.");
  out.filename = safeFilename(text(input.filename));
  out.customFilename = input.customFilename === true;
  out.section = Number.isInteger(input.section)
    ? Math.max(0, Math.min(5, input.section))
    : 0;
  for (const key of Object.keys(out.general))
    out.general[key] = text(input.general?.[key]);
  out.general.date = date(out.general.date);
  if (out.general.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(out.general.time))
    throw Error("Ora JSON non valida.");
  for (const k of ["altitude", "distance", "height", "width", "depth"]) {
    try {
      out.general[k] = formatMeasure(out.general[k]);
    } catch (error) {
      if (!allowIncomplete) throw error;
    }
  }
  out.history.restorations = records(
    input.history?.restorations,
    historyRecord,
    ["date", "action"],
  );
  out.history.maintenance = records(input.history?.maintenance, historyRecord, [
    "date",
    "action",
  ]);
  for (const row of [...out.history.restorations, ...out.history.maintenance])
    row.date = date(row.date, true);
  out.conditions = records(input.conditions, conditionRecord, [
    "exposure",
    "assessment",
  ]);
  out.conditions.forEach((r, i) => {
    r.methods = arr(input.conditions[i].methods)
      .map((m) => choice(m, METHODS))
      .filter(Boolean);
  });
  out.diagnosis = records(input.diagnosis, diagnosisRecord, [
    "area",
    "element",
    "pathology",
    "causes",
    "risk",
    "resolvedDate",
  ]);
  out.diagnosis.forEach((r, i) => {
    r.risk = choice(r.risk, RISKS);
    r.resolvedDate = date(r.resolvedDate);
    r.actions = records(input.diagnosis[i].actions, preventiveRecord, [
      "risk",
      "window",
      "description",
      "action",
      "objective",
      "operator",
      "role",
      "status",
    ]);
    for (const a of r.actions) {
      a.risk = choice(a.risk, RISKS);
      a.window = choice(a.window, WINDOWS);
      a.role = choice(a.role, ROLES);
      a.status = choice(a.status, STATUSES);
    }
  });
  out.priorities = records(input.priorities, priorityRecord, [
    "risk",
    "window",
    "anomalies",
  ]);
  for (const r of out.priorities) {
    r.risk = choice(r.risk, RISKS);
    r.window = choice(r.window, WINDOWS);
  }
  out.inspectionNotes = text(input.inspectionNotes);
  out.photos = arr(input.photos).map((p) => {
    if (
      !p ||
      !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/.test(
        p.data || "",
      )
    )
      throw Error("Fotografia JSON non valida.");
    if (
      !Number.isFinite(p.width) ||
      !Number.isFinite(p.height) ||
      p.width <= 0 ||
      p.height <= 0
    )
      throw Error("Dimensioni fotografia non valide.");
    return { id: uid(), data: p.data, width: p.width, height: p.height };
  });
  out.immediate.date = date(input.immediate?.date);
  out.immediate.executedDate = date(input.immediate?.executedDate);
  out.immediate.records = records(input.immediate?.records, immediateRecord, [
    "area",
    "action",
  ]);
  out.immediate.notes = text(input.immediate?.notes);
  out.preventive.date = date(input.preventive?.date);
  out.preventive.notes = text(input.preventive?.notes);
  return applyFixed(out, assets);
}
