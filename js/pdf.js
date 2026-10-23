import {
  WINDOWS,
  METHODS,
  ROLES,
  STATUSES,
  displayDate,
  displayMonth,
  measureText,
  baseName,
} from "./model.js";

const WIDTH = 792,
  HEIGHT = 612,
  BOTTOM = 550;
const files = new Map();
const normalize = (value) =>
  String(value ?? "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ");
async function resource(path) {
  if (!files.has(path))
    files.set(
      path,
      fetch(path)
        .then((response) => {
          if (!response.ok) throw Error("Risorsa PDF non disponibile: " + path);
          return response.arrayBuffer();
        })
        .catch((error) => {
          files.delete(path);
          throw error;
        }),
    );
  return new Uint8Array(await files.get(path));
}
let dependencies;
function loadScript(src, globalName) {
  if (window[globalName]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    script.onload = () =>
      window[globalName]
        ? resolve()
        : reject(Error("Libreria PDF non inizializzata."));
    script.onerror = () => {
      script.remove();
      reject(
        Error(
          "Caricamento PDF non riuscito. Apri il sito GitHub Pages con connessione e riprova.",
        ),
      );
    };
    document.head.append(script);
  });
}
async function libraries() {
  if (!dependencies)
    dependencies = Promise.all([
      loadScript("./vendor/pdf-lib.min.js", "PDFLib"),
      loadScript("./vendor/fontkit.umd.min.js", "fontkit"),
    ]).catch((error) => {
      dependencies = null;
      throw error;
    });
  await dependencies;
}

/** Disegna sempre il modello originale. Le porzioni ripetute sono ritagli vettoriali,
 * non ricostruzioni dei font, dei grassetti, dei loghi o degli elenchi. */
class TemplateReport {
  constructor(pdf, templates, fonts, api) {
    this.pdf = pdf;
    this.templates = templates;
    this.fonts = fonts;
    this.api = api;
    this.overflow = [];
    this.coverage = new Map(
      Object.values(fonts).map((font) => [
        font,
        new Set(font.getCharacterSet()),
      ]),
    );
  }
  page(index) {
    const page = this.pdf.addPage([WIDTH, HEIGHT]);
    page.drawPage(this.templates[index]);
    return page;
  }
  slice(page, index, x, top, width, height, destX = x, destTop = top) {
    const { pushGraphicsState, popGraphicsState, rectangle, clip, endPath } =
      this.api;
    page.pushOperators(
      pushGraphicsState(),
      rectangle(destX, HEIGHT - destTop - height, width, height),
      clip(),
      endPath(),
    );
    page.drawPage(this.templates[index], { x: destX - x, y: top - destTop });
    page.pushOperators(popGraphicsState());
  }
  clear(page, x, top, width, height, color = this.api.rgb(1, 1, 1)) {
    page.drawRectangle({ x, y: HEIGHT - top - height, width, height, color });
  }
  continuation(index, heading) {
    const page = this.pdf.addPage([WIDTH, HEIGHT]);
    this.slice(page, index, 0, 560, WIDTH, 52);
    if (index === 3 || index === 4) this.slice(page, index, 0, 0, WIDTH, 215);
    if (heading)
      this.slice(
        page,
        index,
        ...heading.rect,
        heading.rect[0],
        heading.top ?? 30,
      );
    return page;
  }
  font(char, bold = false) {
    const primary = bold ? this.fonts.bold : this.fonts.regular;
    if (this.coverage.get(primary).has(char.codePointAt(0))) return primary;
    const fallback = bold ? this.fonts.fallbackBold : this.fonts.fallback;
    if (!this.coverage.get(fallback).has(char.codePointAt(0)))
      throw Error("Carattere non disponibile nel font del PDF: " + char);
    return fallback;
  }
  width(text, size = 9.5, bold = false) {
    return [...normalize(text)].reduce(
      (sum, c) => sum + this.font(c, bold).widthOfTextAtSize(c, size),
      0,
    );
  }
  text(
    page,
    text,
    x,
    baseline,
    size = 9.5,
    { bold = false, color = this.api.rgb(0, 0, 0) } = {},
  ) {
    let run = "",
      font = null,
      position = x;
    const flush = () => {
      if (!run) return;
      page.drawText(run, {
        x: position,
        y: HEIGHT - baseline,
        size,
        font,
        color,
      });
      position += font.widthOfTextAtSize(run, size);
      run = "";
    };
    for (const char of normalize(text)) {
      if (char === "\n") continue;
      const next = this.font(char, bold);
      if (font && next !== font) flush();
      font = next;
      run += char;
    }
    flush();
  }
  lines(text, width, size = 9.5) {
    const lines = [];
    for (const paragraph of normalize(text).split("\n")) {
      let line = "";
      for (const token of paragraph.match(/\S+\s*|\s+/g) || [""]) {
        if (this.width(line + token, size) <= width) {
          line += token;
          continue;
        }
        if (line.trim()) {
          lines.push(line.trimEnd());
          line = "";
        }
        for (const char of token) {
          if (this.width(line + char, size) > width && line) {
            lines.push(line.trimEnd());
            line = "";
          }
          line += char;
        }
      }
      lines.push(line.trimEnd());
    }
    return lines;
  }
  fit(
    page,
    label,
    value,
    x,
    top,
    width,
    height,
    { color, bold = false, queue = true } = {},
  ) {
    if (!normalize(value)) return;
    let size = 9.5,
      lines;
    for (; size >= 8; size -= 0.25) {
      lines = this.lines(value, width, size);
      if (lines.length * size * 1.18 <= height + 0.1) break;
    }
    size = Math.max(8, size);
    lines = this.lines(value, width, size);
    const capacity = Math.max(1, Math.floor(height / (size * 1.18)));
    if (lines.length > capacity) {
      const take = Math.max(0, capacity - 1);
      const visible = lines.slice(0, take);
      visible.push(capacity === 1 ? "(segue)" : "(segue nella continuazione)");
      visible.forEach((line, i) =>
        this.text(page, line, x, top + 8.6 + i * size * 1.18, size, {
          color,
          bold,
        }),
      );
      if (queue)
        this.overflow.push({ label, text: lines.slice(take).join("\n") });
    } else
      lines.forEach((line, i) =>
        this.text(page, line, x, top + 8.6 + i * size * 1.18, size, {
          color,
          bold,
        }),
      );
  }
  check(page, x, top, size = 8) {
    const c = this.api.rgb(0, 0.22, 0.42);
    page.drawLine({
      start: { x: x + 1, y: HEIGHT - top - size * 0.5 },
      end: { x: x + size * 0.4, y: HEIGHT - top - size * 0.88 },
      thickness: 1,
      color: c,
    });
    page.drawLine({
      start: { x: x + size * 0.4, y: HEIGHT - top - size * 0.88 },
      end: { x: x + size * 0.95, y: HEIGHT - top - size * 0.08 },
      thickness: 1,
      color: c,
    });
  }
  risk(page, value, x, top, width = 65) {
    const color = {
      BASSO: this.api.rgb(0.1, 0.43, 0.2),
      MEDIO: this.api.rgb(0.58, 0.42, 0),
      ALTO: this.api.rgb(0.72, 0.06, 0.06),
    }[value];
    this.fit(page, "Grado d’urgenza", value, x, top, width, 14, { color });
  }
  flushOverflow(index) {
    if (!this.overflow.length) return;
    const pending = this.overflow.splice(0);
    let page = this.continuation(index),
      y = index >= 3 ? 225 : 32;
    for (const item of pending) {
      if (y + 45 > BOTTOM) {
        page = this.continuation(index);
        y = index >= 3 ? 225 : 32;
      }
      this.text(page, item.label + " — continuazione", 34, y + 10, 9.5, {
        bold: true,
      });
      y += 24;
      for (const line of this.lines(item.text, 710, 9.5)) {
        if (y + 13 > BOTTOM) {
          page = this.continuation(index);
          y = index >= 3 ? 225 : 32;
          this.text(page, item.label + " — continuazione", 34, y + 10, 9.5, {
            bold: true,
          });
          y += 24;
        }
        this.text(page, line, 34, y + 9.5);
        y += 12;
      }
      y += 16;
    }
  }
}

function diagnostics(report, page, rows) {
  const xs = [32.82, 151.88, 270.92, 418.72, 574.6, 666.76, 747.18];
  const headers = [32.58, 380.86, 714.84, 20.7];
  const entries = rows.filter((r) =>
    [r.area, r.element, r.pathology, r.causes, r.risk, r.resolvedDate].some(
      Boolean,
    ),
  );
  if (!entries.length) return;
  let current = page,
    y = 401.8,
    bottom = 558.1,
    parity = 0;
  report.clear(current, 32.58, 401.8, 714.84, 156.3);
  function next() {
    current = report.continuation(1);
    report.slice(current, 1, 32.58, 347.3, 714.84, 18, 32.58, 31);
    report.slice(current, 1, ...headers, 32.58, 62);
    y = 82.7;
    bottom = 550;
  }
  for (const row of entries) {
    const values = [
      row.area,
      row.element,
      row.pathology,
      row.causes,
      row.risk,
      displayDate(row.resolvedDate),
    ];
    const wrapped = values.map((v, i) =>
      report.lines(v, xs[i + 1] - xs[i] - 9),
    );
    let offset = 0,
      total = Math.max(...wrapped.map((l) => l.length), 1);
    while (offset < total) {
      const desired = Math.max(17.14, (total - offset) * 11.4 + 6);
      if (y + desired > bottom && desired < 450) {
        next();
      }
      if (y + 18 > bottom) next();
      const count = Math.min(
          total - offset,
          Math.max(1, Math.floor((bottom - y - 6) / 11.4)),
        ),
        height = Math.max(17.14, count * 11.4 + 6);
      for (let c = 0; c < 6; c++) {
        current.drawRectangle({
          x: xs[c],
          y: HEIGHT - y - height,
          width: xs[c + 1] - xs[c],
          height,
          borderWidth: 0.48,
          borderColor: report.api.rgb(0.867, 0.867, 0.867),
          color:
            parity % 2
              ? report.api.rgb(0.957, 0.969, 0.965)
              : report.api.rgb(1, 1, 1),
        });
        const lines =
          offset > 0 && wrapped[c].length <= offset
            ? wrapped[c]
            : wrapped[c].slice(offset, offset + count);
        lines.forEach((line, j) => {
          if (c === 4)
            report.risk(
              current,
              line,
              xs[c] + 4,
              y + 3 + j * 11.4,
              xs[c + 1] - xs[c] - 8,
            );
          else report.text(current, line, xs[c] + 4, y + 12 + j * 11.4);
        });
      }
      y += height;
      offset += count;
      if (offset < total) next();
    }
    parity++;
  }
  // Con pochi dati rimangono visibili le righe vuote del modello.
  while (y + 17.14 < bottom) {
    current.drawRectangle({
      x: 32.82,
      y: HEIGHT - y - 17.14,
      width: 714.36,
      height: 17.14,
      borderWidth: 0.48,
      borderColor: report.api.rgb(0.867, 0.867, 0.867),
      color:
        parity++ % 2
          ? report.api.rgb(0.957, 0.969, 0.965)
          : report.api.rgb(1, 1, 1),
    });
    for (const x of xs.slice(1, -1))
      current.drawLine({
        start: { x, y: HEIGHT - y },
        end: { x, y: HEIGHT - y - 17.14 },
        thickness: 0.48,
        color: report.api.rgb(0.867, 0.867, 0.867),
      });
    y += 17.14;
  }
}
function history(report, page, state) {
  for (const [key, top] of [
    ["restorations", 63.3],
    ["maintenance", 147.9],
  ]) {
    const rows = state.history[key];
    const first = rows[0];
    const dateTop = key === "restorations" ? 80.2 : 162.5,
      actionTop = key === "restorations" ? 97.2 : 177.1;
    if (first) {
      report.fit(
        page,
        "Data intervento precedente",
        displayMonth(first.date),
        66,
        dateTop,
        650,
        14,
      );
      report.fit(
        page,
        "Azione precedente",
        first.action,
        74,
        actionTop,
        665,
        38,
      );
    }
    for (const row of rows.slice(1)) {
      const continuation = report.continuation(1);
      report.slice(continuation, 1, 28, 28.5, 724, 18, 28, 29);
      report.slice(continuation, 1, 35, top - 3, 705, 69, 35, 65);
      report.fit(
        continuation,
        "Data intervento precedente",
        displayMonth(row.date),
        66,
        65 + dateTop - top + 3,
        650,
        14,
      );
      report.fit(
        continuation,
        "Azione precedente",
        row.action,
        74,
        65 + actionTop - top + 3,
        665,
        400,
      );
    }
  }
  state.conditions.forEach((condition, i) => {
    let target = page,
      offset = 0;
    if (i) {
      target = report.continuation(1);
      offset = 227.4 - 30;
      report.slice(target, 1, 28, 223, 724, 110, 28, 30);
      offset = 193;
    }
    report.fit(
      target,
      "Esposizione",
      condition.exposure,
      101,
      261.4 - offset,
      638,
      15,
    );
    for (const [j, x] of [156.6, 256, 369.6].entries())
      if (condition.methods.includes(METHODS[j]))
        report.check(target, x, 280 - offset);
    report.fit(
      target,
      "Valutazione sintetica",
      condition.assessment,
      141,
      296.9 - offset,
      598,
      i ? 350 : 35,
    );
  });
}
async function photographs(report, page, photos) {
  if (!photos.length) return;
  report.clear(page, 35, 270, 712, 270);
  for (let i = 0; i < photos.length; i++) {
    const slot = i % 2;
    let target = page;
    if (i >= 2) {
      if (slot === 0) {
        page = report.continuation(2);
        report.slice(page, 2, 32, 227, 725, 20, 32, 30);
      }
      target = page;
    }
    const top = i < 2 ? 263 : 65,
      height = i < 2 ? 277 : 475,
      x = slot ? 392 : 35,
      width = 354;
    const photo = photos[i],
      encoded = photo.data.split(",")[1];
    let bitmap;
    if (photo.data.startsWith("data:image/png"))
      bitmap = await report.pdf.embedPng(encoded);
    else if (photo.data.startsWith("data:image/jpeg"))
      bitmap = await report.pdf.embedJpg(encoded);
    else throw Error("Per il PDF usa fotografie JPEG o PNG.");
    const scale = Math.min(width / bitmap.width, height / bitmap.height),
      w = bitmap.width * scale,
      h = bitmap.height * scale;
    target.drawImage(bitmap, {
      x: x + (width - w) / 2,
      y: HEIGHT - top - (height + h) / 2,
      width: w,
      height: h,
    });
  }
}
function sharedFields(report, page, state, date) {
  report.fit(page, "ID Scheda", state.general.id, 178, 60.9, 300, 12);
  report.fit(page, "Data", displayDate(date), 152, 75.5, 320, 12);
  report.fit(page, "Oggetto", state.general.object, 165, 102.6, 568, 12);
}
function immediate(report, state) {
  let page = report.page(3);
  sharedFields(report, page, state, state.immediate.date);
  report.fit(
    page,
    "Eseguiti in data",
    displayDate(state.immediate.executedDate),
    201,
    165.4,
    520,
    13,
  );
  const rows = state.immediate.records;
  rows.forEach((row, i) => {
    if (i) {
      page = report.continuation(3);
      sharedFields(report, page, state, state.immediate.date);
      report.slice(page, 3, 28, 200, 736, 18);
      report.slice(page, 3, 28, 232, 736, 36);
    }
    report.fit(page, "Macro-Area", row.area, 91, 237.4, 646, 13);
    report.fit(
      page,
      "Azioni condotte in loco",
      row.action,
      143,
      254.4,
      594,
      192,
    );
  });
  if (rows.length > 1) report.slice(page, 3, 28, 454, 736, 96);
  report.fit(
    page,
    "Note aggiuntive",
    state.immediate.notes,
    114,
    461.2,
    624,
    77,
  );
}
function preventive(report, state) {
  const records = state.diagnosis.length
    ? state.diagnosis
    : [{ area: "", element: "", pathology: "", actions: [] }];
  let last;
  for (const row of records) {
    const actions = row.actions.length ? row.actions : [null];
    for (const action of actions) {
      const page = report.page(4);
      last = page;
      sharedFields(report, page, state, state.preventive.date);
      report.fit(page, "Macro-Area", row.area, 38.2, 245.5, 211, 14);
      report.fit(page, "Elemento", row.element, 260, 245.5, 211, 14);
      report.fit(
        page,
        "Patologia riscontrata",
        row.pathology,
        483,
        245.5,
        258,
        14,
      );
      if (!action) continue;
      report.risk(page, action.risk, 122, 296, 57);
      report.fit(
        page,
        "Finestra d’intervento",
        action.window,
        318,
        296,
        420,
        14,
      );
      // Solo la zona compilabile del pacchetto viene riposizionata se aumenta il testo.
      // Ogni etichetta, grassetto e pallino proviene dal PDF originale.
      const fields = [
        ["Descrizione", action.description, 317, 335.8, 128, 324.5],
        ["Azione", action.action, 335.8, 347, 141, 336.02],
        ["Obiettivo", action.objective, 347, 358.5, 151, 347.54],
        ["Operatore", action.operator, 358.5, 370, 156, 359],
      ];
      const heights = fields.map(([label, value, top, bottom, x]) =>
        Math.max(
          bottom - top,
          report.lines(value, 740 - x).length > 1
            ? report.lines(value, 740 - x).length * 11.3
            : bottom - top,
        ),
      );
      const extra = heights.reduce(
        (sum, h, i) => sum + h - (fields[i][3] - fields[i][2]),
        0,
      );
      if (extra < 38) {
        if (extra > 0.1) {
          report.clear(page, 28, 317, 720, 142);
          let y = 317;
          fields.forEach(([label, value, top, bottom, x, fieldTop], i) => {
            report.slice(page, 4, 28, top, 720, bottom - top, 28, y);
            report.fit(
              page,
              label,
              value,
              x,
              y + fieldTop - top,
              740 - x,
              heights[i],
            );
            y += heights[i];
          });
          report.slice(page, 4, 28, 370, 720, 49, 28, y);
          const shift = y - 370;
          for (const [j, cy] of [376, 392, 408].entries())
            if (action.role === ROLES[j])
              report.check(page, 101, cy + shift, 9);
          for (const [j, cx] of [383.8, 469.1, 568.4].entries())
            if (action.status === STATUSES[j])
              report.check(page, cx, 376 + shift, 9);
        } else {
          fields.forEach(([label, value, top, bottom, x, fieldTop]) =>
            report.fit(page, label, value, x, fieldTop, 740 - x, bottom - top),
          );
          for (const [j, cy] of [376, 392, 408].entries())
            if (action.role === ROLES[j]) report.check(page, 101, cy, 9);
          for (const [j, cx] of [383.8, 469.1, 568.4].entries())
            if (action.status === STATUSES[j]) report.check(page, cx, 376, 9);
        }
      } else {
        // Le quattro righe del modello rimangono intatte; eventuali eccedenze sono esplicitamente collegate.
        fields.forEach(([label, value, top, bottom, x, fieldTop]) =>
          report.fit(page, label, value, x, fieldTop, 740 - x, bottom - top),
        );
        for (const [j, cy] of [376, 392, 408].entries())
          if (action.role === ROLES[j]) report.check(page, 101, cy, 9);
        for (const [j, cx] of [383.8, 469.1, 568.4].entries())
          if (action.status === STATUSES[j]) report.check(page, cx, 376, 9);
      }
      report.flushOverflow(4);
    }
  }
  report.fit(
    last,
    "Note aggiuntive",
    state.preventive.notes,
    118,
    470.9,
    620,
    70,
  );
}

export async function makePdf(state, assets) {
  await libraries();
  const api = window.PDFLib;
  const [template, regular, bold, fallback, fallbackBold] = await Promise.all(
    [
      "./assets/pdf-template.pdf",
      "./assets/source-arial.ttf",
      "./assets/source-arial-bold.ttf",
      "./assets/sans-regular.ttf",
      "./assets/sans-bold.ttf",
    ].map(resource),
  );
  const source = await api.PDFDocument.load(template),
    pdf = await api.PDFDocument.create();
  pdf.registerFontkit(window.fontkit);
  const templates = await pdf.embedPages(source.getPages());
  const fonts = {
    regular: await pdf.embedFont(regular, { subset: true }),
    bold: await pdf.embedFont(bold, { subset: true }),
    fallback: await pdf.embedFont(fallback, { subset: true }),
    fallbackBold: await pdf.embedFont(fallbackBold, { subset: true }),
  };
  const report = new TemplateReport(pdf, templates, fonts, api),
    g = state.general;
  const page1 = report.page(0);
  for (const [label, value, x, top, w, h] of [
    ["ID Scheda", g.id, 178, 86.6, 215, 12],
    ["Data", displayDate(g.date), 153, 101.2, 240, 12],
    ["Ora", g.time, 148, 115.8, 245, 12],
    ["Oggetto", g.object, 75, 259.6, 322, 14],
    ["Cronologia", g.chronology, 89, 276.5, 308, 14],
    ["Autore", g.author, 69, 293.4, 328, 14],
    ["Quota s.l.m.", measureText(g.altitude), 96, 310.4, 46, 14],
    ["Distanza Santuario", measureText(g.distance), 254, 310.4, 143, 14],
    ["Soggetto", g.subject, 82, 406.8, 315, 14],
    ["Altezza H", measureText(g.height), 108, 423.8, 49, 14],
    ["Larghezza L", measureText(g.width), 194, 423.8, 48, 14],
    ["Profondità P", measureText(g.depth), 279, 423.8, 118, 14],
    ["Materie e Tecniche", g.materials, 126, 440.7, 271, 89],
  ])
    report.fit(page1, label, value, x, top, w, h);
  const map = { x: 466.5, y: 63.1, w: 254.1, h: 462.9 };
  for (const asset of assets) {
    const x = map.x + (asset.x / 100) * map.w - 4,
      y = map.y + (asset.y / 100) * map.h - 4;
    page1.drawRectangle({
      x,
      y: HEIGHT - y - 8,
      width: 8,
      height: 8,
      borderWidth: 0.6,
      borderColor: api.rgb(0, 0.22, 0.42),
      color: api.rgb(1, 1, 1),
    });
    if (asset.id === state.assetId) report.check(page1, x, y, 8);
  }
  report.flushOverflow(0);
  const page2 = report.page(1);
  // Le eccedenze dello storico sono aggiunte dopo la tabella, senza perdere l'ordine delle pagine originali.
  diagnostics(report, page2, state.diagnosis);
  history(report, page2, state);
  report.flushOverflow(1);
  const page3 = report.page(2),
    first = state.priorities[0];
  function priority(page, row, dy = 0) {
    if (!row) return;
    report.risk(page, row.risk, 129, 58.7 - dy, 48);
    for (const [i, x] of [207.6, 392.2, 477.5, 576.8].entries())
      if (row.window === WINDOWS[i]) report.check(page, x, 74 - dy);
    report.fit(page, "Anomalie attese", row.anomalies, 285, 86.4 - dy, 452, 56);
  }
  priority(page3, first);
  report.fit(
    page3,
    "Note aggiuntive",
    state.inspectionNotes,
    118,
    160.1,
    620,
    55,
  );
  for (const row of state.priorities.slice(1)) {
    const continuation = report.continuation(2);
    report.slice(continuation, 2, 32, 30, 720, 115, 32, 30);
    priority(continuation, row);
  }
  await photographs(report, page3, state.photos);
  report.flushOverflow(2);
  immediate(report, state);
  report.flushOverflow(3);
  preventive(report, state);
  report.flushOverflow(4);
  pdf.setTitle(baseName(state, assets));
  pdf.setAuthor("Cròmo s.c.ar.l.");
  pdf.setCreator("Schede Restauro 2.0");
  return new Blob([await pdf.save()], { type: "application/pdf" });
}
