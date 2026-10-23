# Verifiche della versione 2.0

Controlli effettuati sul pacchetto prima della consegna:

- Confronto delle coordinate dei 14 punti originali con la repository; invariati. Il primo arco è stato spostato a sinistra e in basso.
- Verifica della home, della selezione iniziale, delle voci del menu e dell'assenza dell'archivio e della finestra di conferma dopo l'esportazione.
- Esecuzione dell'interfaccia effettivamente distribuita (`app.bundle.js`) in ambiente DOM con salvataggio simulato: campi, righe e gruppi ripetibili, collegamenti fra diagnostica e azioni, date indipendenti, bozza e reset. Il comando finale carica le librerie PDF locali e avvia entrambi i download, senza dialoghi di conferma dell'app.
- Avvio della home con IndexedDB non rispondente; Nuova scheda e Importa JSON rimangono utilizzabili.
- Evento di installazione simulato: il clic chiama il prompt conservato. I browser che non lo espongono ricevono le istruzioni.
- PDF normale, PDF con fotografie aggiuntive e PDF con celle/testi molto lunghi. Controllo del testo finale per escludere perdite e confronto visivo con il modello originale.
- Confronto raster delle cinque pagine del modello vuoto a 144 dpi: nessun pixel differisce di oltre 3 livelli colore, esclusa l’area dei checkbox della mappa. Font, grassetti, loghi e disposizione originale risultano conservati.
- Controlli di sintassi, risorse locali, cache sotto un percorso GitHub Pages e integrità ZIP.

Il browser Chromium nativo non può essere avviato in questo ambiente, che non espone il filesystem di processo necessario. I test DOM e service worker non equivalgono a una prova in Chrome su un dispositivo fisico. Installazione nativa, fotocamera, aspetto responsive e autorizzazione dei download multipli vanno verificati dopo la pubblicazione sul dispositivo utilizzato.

La versione pubblicata e la repository non sono state modificate automaticamente.
