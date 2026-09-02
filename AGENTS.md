# AGENTS.md — Indicazioni per agenti AI su questo progetto

Questo file guida gli agenti AI (Copilot, Claude Code, ecc.) che lavorano su
**Filippucci Interior POC**. Leggilo prima di modificare codice.

## Come leggere e usare la memoria del progetto

Il progetto ha **due livelli di memoria**:

### 1. Memoria locale dell'agente (fuori dal repo)
- **Repository memory**: `/memories/repo/filippucci.md` — fatti verificati su
  questo progetto: architettura, sorgenti di verità, script, env vars, lavoro
  recente, lezioni apprese. È la fonte primaria: consultala all'inizio di ogni
  sessione e aggiornala quando scopri qualcosa di nuovo.
- **User memory**: `/memories/` — procedure ricorrenti cross-progetto
  (pubblicazione Vercel, DNS Aruba, preview review). Rilevanti quando si
  pubblica o si configura l'infrastruttura.
- **Session memory**: `/memories/session/` — stato della conversazione in
  corso (piani, decisioni temporanee). Si azzera a fine sessione.

> Nota: la memoria vive nella macchina dell'agente, NON nel repo. Non cercarla
> nel filesystem del progetto.

### 2. Memoria nel repo (documentazione persistente)
- `docs/` — documentazione di progetto (architettura, decisioni, procedure).
- I commenti in testa ai file (es. `// Orchestratore saga...`) sono parte
  della memoria di design: rispettali quando modifichi il file.

### Regole d'uso della memoria
1. **Prima di lavorare**: leggi `/memories/repo/filippucci.md` per il contesto.
2. **Dopo ogni lavoro significativo**: aggiorna la repository memory con
   commit/decisioni/lezioni apprese (breve, puntuale).
3. **Quando scopri un fatto verificato** (comando, path, comportamento):
   registralo subito nella memoria, non aspettare la fine.
4. **Non duplicare**: se un fatto è già in memoria, aggiornalo invece di
   riscriverlo.
5. **Non committare la memoria**: `/memories/` è fuori dal repo e non va
   inclusa nei commit.

## Comandi essenziali

```bash
npm run dev        # dev server (localhost:3000)
npm run lint       # typecheck: tsc --noEmit (NON è eslint)
npm run build      # build di produzione
bash scripts/start-ocr-server.sh   # sidecar PaddleOCR su :8001 (serve per l'ingest)
node scripts/hash-password.mjs <pw>  # hash bcrypt per lib/auth/users.ts
```

## Architettura in breve

- **`/interior-poc`** — PoC Interior Design: planimetria DXF-first + camera 2D +
  catalogo prodotti + generazione render.
- **Planimetria**: la geometria viene SOLO dal DXF (`data/floorplan-dxf.json`,
  layer `walls`/`details`); il modello semantico (stanze/oggetti) è separato in
  `data/floorplan-model.json`. Non importare piantine via AI/OCR.
- **Ingest cataloghi**: saga idempotente con compensazione
  (`lib/ingestion/`): save-document → normalize (pdftoppm) → run-ocr
  (PaddleOCR + AI vision) → interpret-catalog → crop-product-images →
  validate-catalog → persist-catalog. Stato in `data/ingestion/saga-state/`.
- **AI**: client unificato `lib/ai-client.ts` — opencode zen (free) con
  fallback OpenAI. OCR ibrido: PaddleOCR (bbox reali) + AI vision (JSON).
- **Auth**: Auth.js v5 Credentials + JWT, RBAC in `lib/auth/roles.ts`.
  Ogni API route fa la propria guard server-side (il middleware lascia
  passare `/api/`).

## Convenzioni

- Commenti in italiano, nomi file/identificatori in inglese.
- Funzioni pure e immutabilità per la geometria (model.ts, geometry.ts).
- Step della saga: atomici, idempotenti, con compensazione.
- Sorgenti di verità nei JSON in `data/` — non hardcodare geometria/prodotti.
- Env vars in `.env.local` (mai committare). Nomi: `OPENCODE_*`, `OPENAI_*`,
  `AUTH_SECRET`.