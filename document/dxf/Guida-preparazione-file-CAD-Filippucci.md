# Filippucci Interior

## Guida operativa per la preparazione dei file CAD

**Standard CAD v1.0 — 2 settembre 2026**

### Obiettivo

Filippucci Interior usa la planimetria per permettere all’utente di:

- scegliere una stanza;
- selezionare uno o più elementi d’arredo;
- sostituire o valorizzare i prodotti del cliente;
- scegliere una visuale per il render.

Per ottenere questo risultato il DXF deve distinguere la geometria fisica della casa dalla grafica tecnica e dagli oggetti selezionabili. Non serve ridisegnare tutto: serve consegnare poche categorie coerenti e riconoscibili.

> **Regola d’oro:** il livello identifica la categoria, il blocco identifica l’oggetto.

## 1. Standard minimo dei livelli

I nomi sono fissi, in maiuscolo, senza accenti e senza spazi. Non creare un livello per ogni stanza o per ogni mobile.

| Livello | Obbligo | Contiene | Non contiene |
| --- | --- | --- | --- |
| `FP_WALLS` | obbligatorio | muri perimetrali e divisori | porte, finestre, quote, arredi |
| `FP_DOORS` | se presenti | ante, archi di apertura e porte scorrevoli | tratti di muro |
| `FP_WINDOWS` | se presenti | telai, ante e sagoma delle finestre | quote e davanzali decorativi |
| `FP_ROOMS` | consigliato | una polilinea chiusa per ogni stanza | retini, testi e linee di costruzione |
| `FP_OBJECTS` | per gli elementi selezionabili | mobili/prodotti in blocchi | arredi non interattivi e dettagli tecnici |
| `FP_NOTES` | facoltativo | testi, quote e annotazioni | geometria necessaria alla selezione |

I livelli nativi del professionista possono rimanere nel file. L’applicazione utilizzerà i livelli `FP_*` come interfaccia standard.

## 2. Come creare un file nuovo

### 2.1 Impostazione iniziale

1. Partire dal template Filippucci, quando disponibile.
2. Lavorare in **Model Space**, sul piano XY.
3. Impostare e mantenere le unità in **centimetri**.
4. Creare i sei livelli `FP_*` con tipo linea `Continuous`.
5. Non scalare o ruotare la planimetria per adattarla al foglio.
6. Salvare in formato **DXF AutoCAD 2018/R2018**.

Il punto zero e l’orientamento devono rimanere coerenti durante tutto il disegno. Il cartiglio e le viste di stampa non devono diventare parte della geometria della pianta.

### 2.2 Disegnare o classificare i muri

Sul livello `FP_WALLS` inserire:

- muri esterni;
- muri interni;
- pilastri o setti che costituiscono un ostacolo fisico;
- il perimetro reale del piano.

Se il muro è rappresentato da due linee, entrambe possono stare su `FP_WALLS`. Le linee devono essere agganciate con gli snap e non devono avere sovrapposizioni, micro-segmenti o duplicati.

In corrispondenza di una porta o di una finestra, il tracciato del muro deve lasciare visibile l’apertura. L’anta, l’arco e il telaio vanno sui rispettivi livelli.

### 2.3 Porte

Sul livello `FP_DOORS` inserire l’anta e, quando presente, l’arco di apertura. Una porta può essere una polilinea o un blocco.

Nome consigliato per un blocco porta:

`DOOR_090_01`

Il numero indica l’identificativo, mentre `090` può indicare la larghezza in centimetri. Il nome è consigliato, non è necessario per la prima demo.

### 2.4 Finestre

Sul livello `FP_WINDOWS` inserire la geometria dell’apertura e del telaio. Una finestra complessa può essere un unico blocco.

Nome consigliato:

`WINDOW_120_01`

La quota della finestra non sostituisce la sua geometria: le quote devono stare su `FP_NOTES`.

### 2.5 Stanze

Sul livello `FP_ROOMS` disegnare una **polilinea chiusa** per ogni area calpestabile:

- una polilinea per stanza;
- nessun retino;
- nessuna linea di costruzione;
- seguire il bordo interno dei muri;
- chiudere il contorno in corrispondenza della soglia della porta;
- non includere l’arco di apertura nella polilinea.

Il nome della stanza non è obbligatorio: se manca, l’applicazione potrà usare “Stanza 1”, “Stanza 2” e così via. Se serve un nome leggibile, aggiungere un testo su `FP_NOTES` nel formato:

`ROOM: SOGGIORNO`

Il testo deve stare all’interno della stanza e non deve essere usato come contorno.

## 3. Arredi raggruppati e non raggruppati

### 3.1 Quando creare un unico blocco

Un mobile deve essere un unico blocco quando l’utente lo selezionerà o sostituirà come elemento intero.

Esempi:

- divano composto da più linee;
- letto con testiera e struttura;
- armadio completo;
- tavolo con piano e gambe;
- cucina o composizione che deve essere cambiata insieme.

Nome consigliato:

`OBJ_DIVANO_01`

Il blocco può contenere tutti i segmenti grafici dell’oggetto. Non esploderlo dopo averlo creato. Il punto di inserimento dovrebbe essere al centro dell’oggetto o sul suo punto di appoggio a pavimento; la scala deve rimanere 1:1.

### 3.2 Quando separare un oggetto in più blocchi

Usare più blocchi solo quando l’applicazione deve permettere una selezione indipendente.

Esempio di divano modulare:

- `OBJ_DIVANO_01_A`
- `OBJ_DIVANO_01_B`
- `OBJ_DIVANO_01_C`

Se invece il divano viene cambiato sempre come insieme, deve rimanere un solo blocco `OBJ_DIVANO_01`.

### 3.3 Elementi non interattivi

Non è necessario raggruppare ogni elemento della tavola. Complementi, sanitari, simboli o arredi che l’utente non dovrà selezionare possono rimanere nei livelli nativi o nei livelli tecnici esclusi dall’importazione.

Il raggruppamento obbligatorio riguarda solo gli elementi che il cliente deve poter scegliere, sostituire o usare come riferimento per il render.

### 3.4 Gruppi CAD o blocchi?

Preferire i **blocchi nominati** ai gruppi generici. I blocchi vengono conservati nel DXF come `BLOCK` + `INSERT` e sono più affidabili da leggere. Evitare blocchi anonimi, blocchi nidificati inutilmente e riferimenti esterni.

## 4. Regole di geometria

- Usare geometria 2D reale: `LINE`, `LWPOLYLINE`, `ARC`, `CIRCLE` quando necessari.
- Evitare immagini, PDF sotto fondo, proxy objects e riferimenti esterni.
- Non usare un retino come unica definizione di muro o stanza.
- Non usare il testo come unica definizione di porta, finestra o arredo.
- Eliminare linee duplicate e segmenti di costruzione dai livelli `FP_*`.
- Mantenere la geometria nella posizione reale e con proporzioni 1:1.
- Evitare di mescolare prospetti, sezioni e dettagli costruttivi nella pianta del Model Space.
- Quote, testi, cartiglio e annotazioni devono stare su `FP_NOTES` o sui livelli nativi tecnici.

## 5. Come lavorare su un file esistente

Non ridisegnare la tavola se non è necessario.

1. Salvare una copia di lavoro con un nuovo nome.
2. Conservare tutti i livelli nativi come riferimento.
3. Creare i livelli `FP_*`.
4. Copiare nei livelli `FP_*` solo la geometria utile, senza cancellare subito l’originale.
5. Trasformare in blocchi gli elementi che devono essere selezionabili.
6. Disegnare le polilinee chiuse delle stanze se il contorno automatico non è sufficiente.
7. Verificare i livelli isolandoli uno alla volta.
8. Consegnare il DXF R2018 e segnalare eventuali elementi non classificati.

Per ridurre il lavoro, non è necessario spostare ogni linea della tavola: muri, aperture, stanze e soli oggetti interattivi sono le informazioni prioritarie.

## 6. Procedura di consegna consigliata

Nome file:

`CLIENTE_PROGETTO_PIANO_DATA.dxf`

Esempio:

`FILIPPUCCI_CASA_ENRI_PIANO_20260902.dxf`

Consegnare:

- il DXF in formato R2018;
- il DWG originale, se disponibile;
- una breve nota per eventuali geometrie lasciate nei livelli nativi;
- facoltativamente uno screenshot della pianta con i livelli `FP_*` isolati.

## 7. Checklist finale

Prima di inviare il file, controllare:

- [ ] unità in centimetri;
- [ ] Model Space e piano XY;
- [ ] livelli `FP_WALLS`, `FP_DOORS`, `FP_WINDOWS`, `FP_ROOMS`, `FP_OBJECTS`, `FP_NOTES` presenti;
- [ ] muri separati da porte e finestre;
- [ ] porte e finestre rappresentate con geometria, non solo con quote o testi;
- [ ] una polilinea chiusa per ogni stanza, quando disponibile;
- [ ] ogni mobile selezionabile raccolto in un unico blocco;
- [ ] componenti separati solo se devono essere selezionati separatamente;
- [ ] nessun retino usato come unico contorno semantico;
- [ ] nessuna scala o rotazione involontaria;
- [ ] nessuna immagine o riferimento esterno necessario per leggere la pianta;
- [ ] file riaperto dopo il salvataggio senza errori di ripristino.

## 8. La regola pratica per non aumentare il lavoro

Il geometra non deve preparare una tavola diversa per ogni cliente né raggruppare ogni linea. Il flusso consigliato è un template con i livelli `FP_*` già presenti e una piccola procedura di export.

Il lavoro manuale si limita a:

1. classificare muri, porte e finestre;
2. chiudere le stanze quando richiesto;
3. creare blocchi solo per i prodotti che l’utente dovrà selezionare.

Tutto il resto — filtraggio dei livelli, lettura delle coordinate, assegnazione della stanza e generazione delle visuali — viene gestito dall’applicazione.

### Se il tempo è poco: ordine delle priorità

1. Separare i muri dalle porte e dalle finestre.
2. Mettere in blocco gli arredi/prodotti che l’utente dovrà selezionare.
3. Disegnare le polilinee chiuse delle stanze.
4. Sistemare quote, testi e dettagli nei livelli tecnici.

Se non è possibile completare tutto, consegnare comunque il file indicando chiaramente cosa manca. Un file parziale ma dichiarato è più utile di un file apparentemente completo ma ambiguo.

### Cosa resta automatico nell’applicazione

- filtraggio dei livelli tecnici;
- lettura delle coordinate e della scala;
- riconoscimento della stanza che contiene un arredo;
- gestione dello zoom e del trascinamento della pianta;
- proposta delle visuali e attivazione della camera;
- visualizzazione e selezione dei blocchi presenti su `FP_OBJECTS`.
