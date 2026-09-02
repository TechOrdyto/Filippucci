# Casa Enri — preparazione per demo Filippucci

Questo file è una copia di lavoro del DXF originale. L’originale non va modificato.

## Regole generali

- Lavorare in **Model Space**.
- Mantenere le unità originali in **centimetri**.
- Non scalare, ruotare o spostare l’intera pianta.
- Non esplodere i blocchi già esistenti, quando rappresentano un elemento unico.
- Non creare un livello diverso per ogni stanza o per ogni mobile.
- Lasciare invariati i livelli originali finché la copia non viene verificata.
- Salvare in formato DXF AutoCAD 2018/R2018.

## Livelli Filippucci

I livelli con prefisso `FP_` sono stati aggiunti appositamente per l’importazione. Per la prima consegna è preferibile **copiare** la geometria nei livelli `FP_`, senza cancellare quella originale.

| Livello | Contenuto | Regola |
| --- | --- | --- |
| `FP_WALLS` | muri perimetrali e divisori | porte e finestre non devono essere incluse nel muro |
| `FP_DOORS` | anta e arco di apertura delle porte | una porta resta un elemento unico |
| `FP_WINDOWS` | sagoma/telaio delle finestre | mantenere l’apertura nel muro |
| `FP_ROOMS` | perimetro chiuso del pavimento di ogni stanza | una polilinea chiusa per stanza, senza retino |
| `FP_OBJECTS` | solo arredi selezionabili nell’app | un mobile/prodotto = un blocco |
| `FP_NOTES` | testi, quote e annotazioni | livello ignorato dall’app |

## Arredi composti

Un divano composto da più linee deve essere trasformato in un unico blocco, per esempio:

`OBJ_DIVANO_01`

Il blocco può contenere tutti i 3/4 elementi grafici del divano. Non serve creare blocchi per ogni complemento o per gli arredi che l’utente non dovrà selezionare.

## Indicazioni per questa pianta

Come riferimento, nella tavola attuale:

- `Linee-04` sembra contenere gran parte dei tracciati delle pareti;
- `Linee-02` contiene geometrie miste, compresi dettagli e arredi;
- `ARREDO`, `04 ARREDI` e `arredi` sono i candidati principali per gli elementi d’arredo;
- `Quote`, `PROSP`, `prosp1` e `VISTE_01` sono annotazioni o viste tecniche e non servono alla selezione;
- il livello `Finestre` da solo non è sufficiente per identificare tutte le finestre.

Non classificare automaticamente le geometrie dubbie: è meglio lasciarle nei livelli originali e segnalarle, così verranno verificate senza perdere informazioni.

## Controllo prima della consegna

- `FP_WALLS` contiene solo muri continui;
- ogni elemento in `FP_ROOMS` è chiuso;
- ogni arredo selezionabile è un singolo blocco in `FP_OBJECTS`;
- porte e finestre sono separate dai muri;
- la pianta mantiene posizione, scala e orientamento originali;
- il file si apre correttamente in AutoCAD senza messaggi di ripristino.
