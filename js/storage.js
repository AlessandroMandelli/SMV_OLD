/** Conserva soltanto la bozza. I documenti delle versioni precedenti non vengono cancellati. */
const DB_NAME = "SchedeRestauroV3";
const DRAFT_KEY = "current-structured-v1";
let database;
export function openStorage() {
  return new Promise((resolve, reject) => {
    let finished = false;
    const timeout = setTimeout(() => {
      finished = true;
      reject(Error("Il browser non ha aperto il salvataggio locale."));
    }, 3500);
    const request = indexedDB.open(DB_NAME, 1);
    const fail = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      reject(error);
    };
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("drafts"))
        request.result.createObjectStore("drafts");
    };
    request.onsuccess = () => {
      if (finished) {
        request.result.close();
        return;
      }
      finished = true;
      clearTimeout(timeout);
      database = request.result;
      database.onversionchange = () => database.close();
      resolve();
    };
    request.onerror = () => fail(request.error);
    request.onblocked = () =>
      fail(Error("Chiudi le altre finestre della scheda e riprova."));
  });
}
function transaction(mode, action) {
  return new Promise((resolve, reject) => {
    if (!database) {
      reject(Error("Salvataggio locale non disponibile."));
      return;
    }
    const tx = database.transaction("drafts", mode),
      request = action(tx.objectStore("drafts"));
    let result;
    const timeout = setTimeout(() => {
      tx.abort();
      reject(Error("Il salvataggio locale non risponde."));
    }, 3500);
    request.onsuccess = () => (result = request.result);
    tx.oncomplete = () => {
      clearTimeout(timeout);
      resolve(result);
    };
    tx.onerror = tx.onabort = () => {
      clearTimeout(timeout);
      reject(tx.error || request.error || Error("Operazione annullata."));
    };
  });
}
export const loadDraft = () => transaction("readonly", (s) => s.get(DRAFT_KEY));
export const saveDraft = (state) =>
  transaction("readwrite", (s) => s.put(state, DRAFT_KEY));
export const loadLegacyDraft = () =>
  transaction("readonly", (s) => s.get("current"));
export const removeDraft = () =>
  transaction("readwrite", (s) => {
    s.delete("current");
    return s.delete(DRAFT_KEY);
  });
