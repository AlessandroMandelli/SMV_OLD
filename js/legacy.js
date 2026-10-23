/** Lettura delle bozze v3: mantiene intatto l'originale e converte i campi storici conosciuti. */
import {
  newState,
  applyFixed,
  historyRecord,
  diagnosisRecord,
  preventiveRecord,
  priorityRecord,
  COMMON,
  WINDOWS,
  METHODS,
  ROLES,
  STATUSES,
} from "./model.js";
export async function migrateLegacy(legacy, assets) {
  if (legacy?.version !== 3 || !legacy.values || !legacy.meta)
    throw Error("Formato della bozza precedente non riconosciuto.");
  const id = "c" + String(legacy.meta.chapel || legacy.map).padStart(2, "0");
  if (!assets.some((a) => a.id === id))
    throw Error("La vecchia bozza non contiene una cappella valida.");
  const out = newState(id),
    v = legacy.values,
    c = legacy.checks || {};
  const value = (id) => String(v[id] ?? "");
  for (const [id, key] of [
    ["0", "id"],
    ["1", "date"],
    ["2", "time"],
    ["4", "object"],
    ["5", "chronology"],
    ["6", "author"],
    ["7", "altitude"],
    ["8", "distance"],
    ["9", "subject"],
    ["10", "height"],
    ["11", "width"],
    ["12", "depth"],
    ["13", "materials"],
  ])
    out.general[key] = value(id);
  if (!out.general.date) out.general.date = legacy.meta.date || "";
  for (const key of ["altitude", "distance", "height", "width", "depth"])
    out.general[key] = out.general[key].replace(".", ",");
  if (legacy.meta.name) {
    out.filename = legacy.meta.name;
    out.customFilename = true;
  }
  out.history.restorations = [
    { ...historyRecord(), date: value("28"), action: value("29") },
  ];
  out.history.maintenance = [
    { ...historyRecord(), date: value("30"), action: value("31") },
  ];
  out.conditions[0].exposure = value("32");
  out.conditions[0].assessment = value("36");
  out.conditions[0].methods = METHODS.filter((_, i) => c[String(33 + i)]);
  out.diagnosis = [];
  for (let i = 0; i < 9; i++) {
    const start = 37 + i * 5,
      values = Array.from({ length: 5 }, (_, j) => value(String(start + j)));
    if (!values.some(Boolean)) continue;
    const row = diagnosisRecord();
    [row.area, row.element, row.pathology, row.causes] = values;
    row.risk =
      ["BASSO", "MEDIO", "ALTO"].find((r) =>
        values[4].toUpperCase().includes(r),
      ) || "";
    out.diagnosis.push(row);
  }
  out.priorities = [];
  for (const [risk, ids, extra] of [
    ["BASSO", [82, 83, 84, 85], null],
    ["MEDIO", [89, 88, 87, 86], "extra4"],
    ["ALTO", [93, 92, 91, 90], "extra5"],
  ]) {
    const windowIndex = ids.findIndex((id) => c[String(id)]);
    const anomalies = extra ? value(extra) : "";
    if (windowIndex < 0 && !anomalies) continue;
    const row = priorityRecord();
    row.risk = risk;
    row.window = WINDOWS[windowIndex] || "";
    row.anomalies = anomalies;
    out.priorities.push(row);
  }
  out.inspectionNotes = value("94");
  out.immediate.date = out.general.date;
  out.preventive.date = out.general.date;
  out.immediate.records = [];
  for (const [area, action] of [
    ["106", "107"],
    ["109", "110"],
  ])
    if (value(area) || value(action))
      out.immediate.records.push({
        id: crypto.randomUUID(),
        area: value(area),
        action: value(action),
      });
  out.immediate.notes = [value("105"), value("108")].filter(Boolean).join("\n");
  out.preventive.notes = value("157");
  const actions = [
    ["121", "122", "123", "extra0", [124, 128, 129], [125, 126, 127]],
    ["130", "132", "131", "extra1", [136, 137, 138], [133, 134, 135]],
    ["139", "141", "140", "extra2", [145, 146, 147], [142, 143, 144]],
    ["148", "150", "149", "extra3", [154, 155, 156], [151, 152, 153]],
  ];
  let target = out.diagnosis.find(
    (r) => r.area === value("117") && r.element === value("118"),
  );
  for (const [
    action,
    objective,
    operator,
    description,
    roles,
    statuses,
  ] of actions) {
    if (
      ![action, objective, operator, description].some((id) => value(id)) &&
      !roles.some((id) => c[id]) &&
      !statuses.some((id) => c[id])
    )
      continue;
    if (!target) {
      target = diagnosisRecord();
      target.area = value("117");
      target.element = value("118");
      out.diagnosis.push(target);
    }
    const row = preventiveRecord();
    row.action = value(action);
    row.objective = value(objective);
    row.operator = value(operator);
    row.description = value(description);
    row.risk =
      ["BASSO", "MEDIO", "ALTO"].find((r) =>
        value("119").toUpperCase().includes(r),
      ) || "";
    row.window =
      WINDOWS.find((w) => value("120").toUpperCase().includes(w)) || "";
    row.role = ROLES[roles.findIndex((id) => c[id])] || "";
    row.status = STATUSES[statuses.findIndex((id) => c[id])] || "";
    target.actions.push(row);
  }
  for (const data of Object.values(legacy.photos || {})) {
    if (!data) continue;
    const image = new Image();
    image.src = data;
    await image.decode();
    out.photos.push({
      id: crypto.randomUUID(),
      data,
      width: image.naturalWidth,
      height: image.naturalHeight,
    });
  }
  return applyFixed(out, assets);
}
