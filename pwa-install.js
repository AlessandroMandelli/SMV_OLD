/** Installazione indipendente dall'editor e dal PDF, come nella versione stabile. */
(() => {
  let promptEvent = null,
    installedThisSession = false,
    prompting = false;
  const standalone = () =>
    installedThisSession ||
    matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true;
  function refresh() {
    const button = document.getElementById("installHeader");
    if (button) {
      button.hidden = standalone();
      button.disabled = prompting;
    }
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    promptEvent = event;
    refresh();
  });
  window.addEventListener("appinstalled", () => {
    installedThisSession = true;
    promptEvent = null;
    refresh();
  });
  function help(message) {
    document.getElementById("dialogTitle").textContent = "Installa app";
    document.getElementById("dialogMessage").textContent = message;
    document.getElementById("messageDialog").showModal();
  }
  async function install() {
    if (standalone()) {
      help("L’app è già aperta in modalità installata.");
      return;
    }
    if (promptEvent) {
      const event = promptEvent;
      promptEvent = null;
      prompting = true;
      refresh();
      try {
        await event.prompt();
        await event.userChoice;
      } catch {
        help("Apri il menu di Chrome o Edge e scegli Installa app.");
      } finally {
        prompting = false;
        refresh();
      }
      return;
    }
    if (location.protocol === "file:") {
      help(
        "Apri l’indirizzo HTTPS pubblicato su GitHub Pages per installare l’app. Il file aperto direttamente dal computer non può essere installato.",
      );
      return;
    }
    const ios =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios)
      help(
        "Nel menu Condividi scegli “Aggiungi alla schermata Home”. Se la voce non compare, apri lo stesso sito in Safari.",
      );
    else
      help(
        "Se Chrome non mostra il prompt, usa l’icona di installazione nella barra degli indirizzi oppure il menu ⋮ del browser → Trasmetti, salva e condividi → Installa pagina come app (o Installa app). Se è già installata, aprila dall’elenco delle applicazioni. Su Safari Mac usa Aggiungi al Dock.",
      );
  }
  function mount() {
    document.getElementById("installHeader").addEventListener("click", install);
    document.getElementById("installMenu").addEventListener("click", () => {
      document.getElementById("options").open = false;
      install();
    });
    refresh();
    if ("serviceWorker" in navigator && isSecureContext)
      navigator.serviceWorker
        .register("./sw.js", { scope: "./", updateViaCache: "none" })
        .then((reg) => reg.update())
        .catch((error) => console.warn("Preparazione PWA:", error));
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
  // Se manca un file della distribuzione, mostra un errore invece di lasciare tasti muti.
  setTimeout(() => {
    if (window.RestauroAppReady) return;
    const status = document.getElementById("homeStatus");
    if (status) {
      status.hidden = false;
      status.textContent =
        "Avvio non completato: ricarica la pagina. Se persiste, controlla di aver caricato anche app.bundle.js e le cartelle dello ZIP.";
    }
  }, 8000);
})();
