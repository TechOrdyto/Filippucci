"use client";

import { useState } from "react";

export interface RenderVariant {
  id: string;
  imageUrl: string;
  prompt: string;
  createdAt: Date;
}

type ActionIconName = "export" | "share" | "download";

function ActionIcon({ name }: { name: ActionIconName }) {
  const commonProps = {
    fill: "none",
    height: 16,
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
    width: 16,
  };

  if (name === "export") {
    return (
      <svg aria-hidden="true" {...commonProps}>
        <path d="M14 3h7v7" />
        <path d="M10 14 21 3" />
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      </svg>
    );
  }

  if (name === "share") {
    return (
      <svg aria-hidden="true" {...commonProps}>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.6 13.5 6.8 3.9M15.4 6.6 8.6 10.5" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" {...commonProps}>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

interface RenderResultProps {
  imageUrl?: string | null;
  generatedImages?: RenderVariant[];
  isLoading?: boolean;
  error?: string | null;
  onRegenerate?: () => void;
  onSelectImage?: (imageUrl: string) => void;
}

export default function RenderResult({
  imageUrl,
  generatedImages = [],
  isLoading = false,
  error = null,
  onRegenerate,
  onSelectImage,
}: RenderResultProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const visibleSlotCount = Math.max(4, Math.min(8, generatedImages.length));
  const renderSlots = Array.from({ length: visibleSlotCount }, (_, index) => generatedImages[index] ?? null);
  const selectedVariant = generatedImages.find((variant) => variant.imageUrl === imageUrl);

  const getFileName = () => {
    const extension = imageUrl?.startsWith("data:image/svg") ? "svg" : "png";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `render-filippucci-${timestamp}.${extension}`;
  };

  const handleExport = () => {
    if (!imageUrl) return;

    const exportWindow = window.open(imageUrl, "_blank", "noopener,noreferrer");
    setActionMessage(
      exportWindow
        ? "Immagine aperta in una nuova scheda."
        : "Consenti l’apertura della nuova scheda per esportare."
    );
  };

  const handleShare = async () => {
    if (!imageUrl) return;

    const title = "Render della proposta Filippucci";
    const text = selectedVariant?.prompt
      ? `Render creato con queste indicazioni: ${selectedVariant.prompt}`
      : "Render della proposta Filippucci";
    const shareUrl = imageUrl.startsWith("data:") ? window.location.href : imageUrl;

    try {
      if (navigator.share) {
        let imageFile: File | null = null;

        try {
          const response = await fetch(imageUrl);
          if (response.ok) {
            const blob = await response.blob();
            imageFile = new File([blob], getFileName(), {
              type: blob.type || "image/png",
            });
          }
        } catch {
          // Se il file non è condivisibile, usa il link alla pagina come fallback.
        }

        if (imageFile && navigator.canShare?.({ files: [imageFile] })) {
          await navigator.share({ title, text, files: [imageFile] });
        } else {
          await navigator.share({ title, text, url: shareUrl });
        }

        setActionMessage("Condivisione completata.");
        return;
      }

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        setActionMessage("Link copiato negli appunti.");
        return;
      }

      setActionMessage("La condivisione non è disponibile in questo browser.");
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      setActionMessage("La condivisione non è riuscita. Riprova.");
    }
  };

  const handleDownload = async () => {
    if (!imageUrl) return;

    const fileName = getFileName();

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error("Download non disponibile");

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      const link = document.createElement("a");
      link.href = imageUrl;
      link.download = fileName;
      link.target = "_blank";
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    setActionMessage("Download avviato.");
  };

  return (
    <section className="panel w-full rounded-2xl p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">04 · Risultato</p>
          <h3 className="display-title text-2xl text-[var(--text)]">La stanza prende forma.</h3>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {imageUrl && (
            <button
              type="button"
              onClick={() => setIsExpanded((v) => !v)}
              className="ghost-action rounded-full px-3 py-2 text-xs font-semibold"
            >
              {isExpanded ? "Riduci" : "Ingrandisci"}
            </button>
          )}
          <div className="flex items-center gap-1" role="group" aria-label="Azioni sull’immagine">
            <button
              type="button"
              onClick={handleExport}
              disabled={!imageUrl}
              className="ghost-action inline-flex h-9 w-9 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Esporta immagine"
              title="Esporta immagine"
            >
              <ActionIcon name="export" />
            </button>
            <button
              type="button"
              onClick={handleShare}
              disabled={!imageUrl}
              className="ghost-action inline-flex h-9 w-9 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Condividi immagine"
              title="Condividi immagine"
            >
              <ActionIcon name="share" />
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!imageUrl}
              className="ghost-action inline-flex h-9 w-9 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Scarica immagine"
              title="Scarica immagine"
            >
              <ActionIcon name="download" />
            </button>
          </div>
        </div>
      </div>

      {actionMessage && (
        <p className="-mt-2 mb-4 text-right text-[11px] text-[var(--accent)]" role="status">
          {actionMessage}
        </p>
      )}

      {error && (
        <div className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-4" role="alert">
          <p className="text-sm font-semibold text-[var(--danger)]">Non siamo riusciti a creare l’immagine.</p>
          <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{error}</p>
          <p className="mt-3 text-xs text-[var(--text-soft)]">Controlla la descrizione o prova un altro punto di vista.</p>
        </div>
      )}

      {!error && imageUrl && (
        <div className={`relative overflow-hidden rounded-xl bg-[var(--surface-strong)] ${isExpanded ? "max-h-none" : "max-h-[32rem]"}`}>
          {!imageLoaded && (
            <div className="absolute inset-0 z-[1] flex aspect-video items-center justify-center bg-[var(--surface-strong)]">
              <div className="text-center">
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
                <p className="text-sm text-[var(--text-muted)]">Stiamo preparando l’immagine…</p>
              </div>
            </div>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Render fotorealistico dell'ambiente"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageLoaded(false)}
            className={`w-full object-cover transition-all ${
              imageLoaded ? "block" : "hidden"
            } ${isExpanded ? "max-h-none" : "max-h-[32rem]"}`}
          />
          {isLoading && (
            <div className="absolute inset-0 z-[2] flex items-center justify-center bg-black/45 p-6 text-center backdrop-blur-[2px]">
              <div className="rounded-2xl border border-white/20 bg-black/45 px-5 py-4 text-white">
                <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
                <p className="text-sm font-semibold">Stiamo creando una nuova immagine</p>
                <p className="mt-1 text-xs text-white/70">Puoi continuare a leggere il brief.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {!isLoading && !error && !imageUrl && (
        <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] px-6 text-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-strong)] text-xl text-[var(--accent)]">✦</span>
          <p className="max-w-xs text-sm leading-6 text-[var(--text-muted)]">
            Seleziona una stanza, inserisci le indicazioni e qui apparirà l’immagine da mostrare al cliente.
          </p>
        </div>
      )}

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Cronologia immagini</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {generatedImages.length > 0
                ? "Clicca un’immagine per rivederla."
                : "Le immagini che crei appariranno qui."}
            </p>
          </div>
          <span className="rounded-full bg-[var(--surface-strong)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
            {generatedImages.length}/8
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Cronologia immagini generate">
          {renderSlots.map((variant, index) => {
            if (!variant) {
              return (
                <div
                  key={`empty-slot-${index}`}
                  aria-label={`Spazio libero per immagine ${index + 1}`}
                  className="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] px-2 text-center"
                >
                  <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-strong)] text-sm text-[var(--text-soft)]">+</span>
                  <span className="text-[11px] font-semibold text-[var(--text-muted)]">Spazio libero</span>
                  <span className="mt-1 text-[10px] text-[var(--text-soft)]">Immagine {index + 1}</span>
                </div>
              );
            }

            const isSelected = variant.imageUrl === imageUrl;
            return (
              <button
                key={variant.id}
                type="button"
                onClick={() => onSelectImage?.(variant.imageUrl)}
                aria-label={`Visualizza immagine ${generatedImages.length - index}`}
                aria-pressed={isSelected}
                className={`group overflow-hidden rounded-xl border text-left transition-all ${
                  isSelected
                    ? "border-[var(--accent-strong)] ring-2 ring-[color-mix(in_srgb,var(--accent)_22%,transparent)]"
                    : "border-[var(--border)] hover:border-[var(--border-strong)]"
                }`}
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-[var(--surface-strong)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={variant.imageUrl}
                    alt={`Anteprima immagine ${generatedImages.length - index}`}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {isSelected && (
                    <span className="absolute left-2 top-2 rounded-full bg-[var(--accent-strong)] px-2 py-1 text-[10px] font-semibold text-white">
                      Visualizzata
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 bg-[var(--surface-muted)] px-2.5 py-2">
                  <span className="text-[11px] font-semibold text-[var(--text)]">Immagine {generatedImages.length - index}</span>
                  <span className="text-[10px] text-[var(--text-soft)]">
                    {variant.createdAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {imageUrl && onRegenerate && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onRegenerate}
            disabled={isLoading}
            className="ghost-action rounded-xl px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            Crea un’altra immagine
          </button>
        </div>
      )}
    </section>
  );
}
