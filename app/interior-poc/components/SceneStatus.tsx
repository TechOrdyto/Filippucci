import Link from "next/link";
import type { CameraPosition } from "../lib/camera/types";

interface SceneStatusProps {
  roomName: string | null;
  camera: CameraPosition | null;
  isCameraConfirmed: boolean;
  assignedCount: number;
  wallFinish: string;
  floorFinish: string;
  prompt: string;
  hasImage: boolean;
  renderStale: boolean;
  errors: string[];
  warnings: string[];
  nextAction: {
    label: string;
    href: string;
  };
}

function StatusValue({ value, ready = false }: { value: string; ready?: boolean }) {
  return (
    <span
      className={`mt-1 block text-sm font-semibold ${
        ready ? "text-[var(--success)]" : "text-[var(--text)]"
      }`}
    >
      {value}
    </span>
  );
}

export default function SceneStatus({
  roomName,
  camera,
  isCameraConfirmed,
  assignedCount,
  wallFinish,
  floorFinish,
  prompt,
  hasImage,
  renderStale,
  errors,
  warnings,
  nextAction,
}: SceneStatusProps) {
  const isReady = Boolean(
    roomName && camera && isCameraConfirmed && prompt.trim() && errors.length === 0
  );
  const statusTitle = renderStale
    ? "Aggiorna il render."
    : isReady
      ? "Scena pronta per il render."
      : "Configurazione incompleta.";
  const statusLabel = renderStale ? "Da aggiornare" : isReady ? "Pronta" : "Da completare";

  return (
    <section className="panel rounded-2xl p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Stato scena</p>
          <h3 className="display-title text-2xl text-[var(--text)]">{statusTitle}</h3>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${
            isReady || renderStale
              ? "soft-badge border border-[var(--accent)]"
              : "border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)]"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3">
          <span className="eyebrow">Ambiente</span>
          <StatusValue value={roomName ?? "Da selezionare"} ready={Boolean(roomName)} />
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3">
          <span className="eyebrow">Visuale</span>
          <StatusValue
            value={
              camera
                ? `${Math.round(camera.rotation)}° · ${isCameraConfirmed ? "confermata" : "da confermare"}`
                : "Da impostare"
            }
            ready={Boolean(camera && isCameraConfirmed)}
          />
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3">
          <span className="eyebrow">Articoli assegnati</span>
          <StatusValue
            value={assignedCount > 0 ? `${assignedCount} ${assignedCount === 1 ? "articolo" : "articoli"}` : "Nessuno associato"}
            ready={assignedCount > 0}
          />
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3">
          <span className="eyebrow">Indicazioni</span>
          <StatusValue
            value={prompt.trim() ? "Inserite" : "Da inserire"}
            ready={Boolean(prompt.trim())}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3 text-xs sm:grid-cols-2">
        <div>
          <span className="block text-[var(--text-soft)]">Pareti</span>
          <span className="mt-1 block font-semibold text-[var(--text)]">{wallFinish.trim() || "Da definire"}</span>
        </div>
        <div>
          <span className="block text-[var(--text-soft)]">Pavimento</span>
          <span className="mt-1 block font-semibold text-[var(--text)]">{floorFinish.trim() || "Da definire"}</span>
        </div>
      </div>

      <div
        className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-3"
        role="status"
        aria-live="polite"
      >
        <div>
          <span className="eyebrow">Prossimo passo</span>
          <p className="mt-1 text-sm font-semibold text-[var(--text)]">{nextAction.label}</p>
        </div>
        <a
          href={nextAction.href}
          className="primary-action inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold"
        >
          Vai al passaggio <span className="ml-2" aria-hidden="true">→</span>
        </a>
      </div>

      {errors.length > 0 && (
        <p className="mt-4 rounded-xl border border-[var(--danger)] bg-[var(--surface-muted)] px-3 py-2.5 text-xs leading-5 text-[var(--text)]">
          {errors[0]}
        </p>
      )}
      {errors.length === 0 && warnings.length > 0 && (
        <p className="mt-4 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-muted)] px-3 py-2.5 text-xs leading-5 text-[var(--text-muted)]">
          {warnings[0]}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
        <span className="text-xs text-[var(--text-soft)]">
          {renderStale
            ? "Render da aggiornare"
            : hasImage
              ? "Render disponibile"
              : "Render non ancora generato"}
        </span>
        <div className="flex flex-wrap gap-2">
          <a href="#piantina" className="ghost-action rounded-xl px-3 py-2 text-xs font-semibold">
            Modifica piantina
          </a>
          <Link href="/listini" className="ghost-action rounded-xl px-3 py-2 text-xs font-semibold">
            Apri listino
          </Link>
        </div>
      </div>
    </section>
  );
}
