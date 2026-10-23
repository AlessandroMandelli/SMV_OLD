# Schede Restauro 2.0

PWA per la schedatura del Sacro Monte di Varese. Versione aggiornata del 23 ottobre 2026.

## Caricamento su GitHub Pages

1. Conserva una copia della versione attualmente pubblicata.
2. Estrai lo ZIP e copia **il suo contenuto nella radice della repository**. Non aggiungere una cartella contenitore.
3. In **Settings → Pages**, pubblica il branch utilizzato, cartella `/ (root)`.
4. Attendi il completamento del deploy, apri l'indirizzo GitHub Pages e ricarica la pagina. Per aggiornare una PWA già aperta, chiudi e riapri le sue finestre.

Il sito è già compilato: per pubblicarlo non servono Node, npm, un server applicativo o chiavi API. Le cartelle `assets`, `js` e `vendor`, insieme al file `app.bundle.js`, devono essere caricate integralmente. La grafica del PDF e i suoi font sono inclusi nel pacchetto.

## Modifiche di questa versione

- Nessuna icona sui tre pulsanti principali o sul pulsante Installa app della home.
- Rimossi lo stato “Pronta anche offline” e l'archivio locale dei documenti, sia dall'interfaccia sia dal codice attivo. Il salvataggio della **bozza** rimane. I documenti delle versioni precedenti già presenti nel browser non vengono cancellati.
- Selezione del bene senza l'etichetta visibile “Cappella o arco”.
- Nuovo sfondo illustrato ricavato dal mockup approvato, al posto del precedente disegno vettoriale semplificato.
- Checkbox del Primo Arco spostato a sinistra e in basso; i 14 punti originali restano invariati.
- Il comando finale scarica PDF e JSON senza una finestra di conferma dell'app. Chrome può chiedere il permesso per i download multipli: è una richiesta del browser, non dell'app.
- Menu Opzioni senza icone, nell'ordine: Torna alla home, Reset scheda, Installa app.
- L'avvio della home non attende l'apertura della bozza. Un blocco di IndexedDB non disabilita i pulsanti Nuova scheda e Importa JSON.
- Distribuzione con JavaScript classico già raccolto in un bundle, per evitare dipendenze dall'avvio dei moduli ES e dal caricamento separato dell'anagrafica.

## Installazione e uso offline

“Installa app” usa il prompt nativo quando Chrome o Edge lo rende disponibile. Negli altri casi mostra le istruzioni per il browser. Se la PWA è già installata, il browser potrebbe non proporre nuovamente l'installazione. Su iPhone/iPad si usa Condividi → Aggiungi alla schermata Home; su Safari Mac Aggiungi al Dock.

La PWA deve essere pubblicata via HTTPS per l'installazione e il service worker. La compilazione della home può partire anche aprendo l'HTML locale, ma installazione, risorse del PDF e uso offline completo richiedono GitHub Pages o un server statico su localhost.

Tutte le risorse di esecuzione sono locali. Al primo accesso con connessione il service worker prepara la cache; lascia terminare il caricamento prima di usare la PWA senza connessione. L'assenza dell'indicazione testuale nella home non disattiva questa funzione.

## Dati e compilazione

Sono selezionabili 14 cappelle e tre archi. Il punto della mappa viene selezionato e bloccato automaticamente. Le posizioni delle 14 cappelle sono quelle della repository originale.

L'interfaccia è organizzata in sei sezioni. Il PDF ha una struttura indipendente: usa le cinque pagine del nuovo riferimento, aggiungendo continuazioni per i dati eccedenti. Non esiste un limite di sette pagine.

ID e Oggetto sono condivisi fra le sezioni. Le date sono inizializzate alla creazione e modificabili separatamente; riaprire la bozza non le aggiorna. Lo storico usa mese e anno. I numeri usano virgola decimale e punto delle migliaia. Le misure aggiungono l'unità m.

I dati specifici dei beni rimangono modificabili finché non saranno disponibili le anagrafiche. I dati comuni bloccati seguono il Word commentato. Le azioni preventive appartengono alle rispettive righe diagnostiche. Eliminare una riga diagnostica con azioni collegate richiede conferma.

Fotografie da fotocamera o caricamento, anche multiplo, senza didascalie. Sono ottimizzate in JPEG, qualità 90%, lato massimo 2400 pixel. Gli originali sul dispositivo rimangono invariati. Il JSON contiene tutte le foto; i PDF le inseriscono intere e senza deformazioni.

La bozza resta su questo dispositivo e nel profilo browser utilizzato. Per conservarla e trasferirla scarica il JSON insieme al PDF. Reset elimina la bozza dopo conferma. Nessuna integrazione Nextcloud o sincronizzazione verso servizi esterni.

## Fedeltà del PDF

`assets/pdf-template.pdf` è una copia del riferimento **Scheda_TIPO.pdf** fornito dall'utente. Le pagine vengono incorporate come grafica vettoriale originale: non vengono ricostruiti indirizzi, intestazioni, grassetti, font, loghi o piè di pagina. “Varese” rimane sulla stessa riga dell'indirizzo. I loghi superiori compaiono nelle pagine corrispondenti al modello (prima pagina, manutenzione immediata, azioni preventive); le pagine dello storico e delle priorità mantengono soltanto il piè di pagina originale.

I dati compilati vengono sovrapposti ai campi, a 9,5 pt e con minimo 8 pt. Si usano i sottoinsiemi Arial incorporati nel PDF originale. Poiché il riferimento contiene solo alcuni caratteri di Arial, i caratteri mancanti nei testi aggiunti usano Liberation Sans, compatibile con le metriche di Arial. **I font delle parti originali restano integralmente quelli del PDF fornito.** I simboli non disponibili vengono segnalati, senza eliminarli silenziosamente.

Le pagine di continuazione riutilizzano porzioni vettoriali del modello, preservando lo stile dei rispettivi blocchi. Le tabelle possono aggiungere righe e pagine; intestazioni ripetute. I livelli e i rientri degli elenchi puntati delle azioni preventive vengono dal PDF originale. Un testo eccedente viene segnalato con “segue” nel campo e riportato nella continuazione, senza perdere contenuto. Le fotografie occupano due riquadri per pagina, coerentemente con il nuovo riferimento.

## File del progetto

- `index.html`, `styles.css`: interfaccia responsive.
- `app.bundle.js`: JavaScript già compilato, usato dal sito.
- `pwa-install.js`, `sw.js`, `manifest.webmanifest`: installazione e cache.
- `js/app.js`: compilazione, navigazione, fotografie, import/export.
- `js/model.js`: modello dati e validazione.
- `js/storage.js`: sola bozza locale.
- `js/pdf.js`: composizione del PDF sul modello originale.
- `js/legacy.js`: recupero delle bozze precedenti.
- `assets/beni.json`: anagrafiche e posizioni; `js/catalog.js` è la copia generata per il bundle.
- `assets/home-landscape.png`: illustrazione della home.
- `vendor`: PDF-lib e Fontkit inclusi localmente con le licenze.

Le future anagrafiche si inseriscono nell'oggetto `fixed` di ogni bene: `object`, `chronology`, `author`, `altitude`, `distance`, `subject`, `height`, `width`, `depth`, `materials`. I valori sono stringhe; le misure non includono m.

## Modifica dei sorgenti

Solo chi modifica il codice deve eseguire `npm install` e poi `npm run build` dalla cartella del progetto. Questo aggiorna `app.bundle.js`, `js/catalog.js` e l'elenco delle risorse offline. Incrementare `VERSION` nello script `tools/build.mjs` per ogni nuova distribuzione. Il pacchetto già consegnato è pronto da copiare senza questi passaggi.

Vedere `VERIFICHE.md` per i controlli eseguiti e i limiti dell'ambiente di verifica.
