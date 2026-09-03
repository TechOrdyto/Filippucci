# Filippucci Interior POC

PoC di Interior Design per Filippucci: planimetria DXF-first, catalogo prodotti
Molteni&C, camera 2D e generazione render.

## Avvio

```bash
npm install
npm run dev          # http://localhost:3000/interior-poc
```

Per l'ingest dei cataloghi serve anche il sidecar OCR:

```bash
bash scripts/start-ocr-server.sh   # PaddleOCR su localhost:8001
```

## Comandi

| Comando | Descrizione |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run lint` | Typecheck (`tsc --noEmit`) |
| `npm run build` | Build di produzione |
| `node scripts/extract-product-images.mjs <pdf> <output-dir> [max-pages]` | Estrae i ritagli fotografici nativi dalle pagine prodotto |
| `node scripts/hash-password.mjs <pw>` | Hash bcrypt per `lib/auth/users.ts` |

## Struttura

- `app/interior-poc/` — PoC: planimetria, camera, catalogo, generazione render.
- `app/interior-poc/floorplan/` — modulo planimetria (DXF-first).
- `app/interior-poc/lib/ingestion/` — saga pipeline per l'import cataloghi.
- `app/interior-poc/lib/ocr/` — client OCR ibrido (PaddleOCR + AI vision).
- `app/interior-poc/pipeline/ocr/` — sidecar FastAPI PaddleOCR.
- `data/` — sorgenti di verità (DXF, modello, catalogo, regole designer).
- `scripts/` — utility (import DXF, crop immagini, OCR server, ecc.).

### Estrazione immagini catalogo

`scripts/extract-product-images.mjs` individua le immagini raster incorporate nel
PDF tramite gli operatori PDF, scarta i compositi a pagina intera che possono
contenere testo editoriale e ritaglia solo le aree fotografiche. Se il quarto
argomento viene omesso analizza tutte le pagine del PDF. La stessa verifica viene
usata dalla saga di ingestione: i bbox AI/euristici restano diagnostici e non
vengono pubblicati come immagini prodotto non verificate.

## Documentazione per gli agenti AI

Vedi [`AGENTS.md`](./AGENTS.md) per le indicazioni su come leggere e usare la
memoria del progetto (repository memory, session memory, user memory) e le
convenzioni di sviluppo.
