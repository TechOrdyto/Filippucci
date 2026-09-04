"use client";

import { useEffect, useRef, useState } from "react";

export interface RenderVariant {
  id: string;
  imageUrl: string;
  prompt: string;
  createdAt: Date;
}

type ActionIconName = "export" | "share" | "download" | "trash";

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

  if (name === "trash") {
    return (
      <svg aria-hidden="true" {...commonProps}>
        <path d="M4 7h16" />
        <path d="M10 11v6M14 11v6" />
        <path d="m6 7 1 14h10l1-14M9 7V4h6v3" />
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
  isStale?: boolean;
  error?: string | null;
  warnings?: string[];
  onRegenerate?: () => void;
  onSelectImage?: (imageUrl: string) => void;
  onDeleteImage?: (variantId?: string) => void;
}

export default function RenderResult({
  imageUrl,
  generatedImages = [],
  isLoading = false,
  isStale = false,
  error = null,
  warnings = [],
  onRegenerate,
  onSelectImage,
  onDeleteImage,
}: RenderResultProps) {
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const visibleSlotCount = Math.max(4, Math.min(8, generatedImages.length));
  const renderSlots = Array.from({ length: visibleSlotCount }, (_, index) => generatedImages[index] ?? null);
  const selectedVariant = generatedImages.find((variant) => variant.imageUrl === imageUrl);
  const lightboxVariantIndex = generatedImages.findIndex(
    (variant) => variant.imageUrl === lightboxImageUrl
  );
  const lightboxDialogRef = useRef<HTMLDivElement>(null);
  const lightboxCloseRef = useRef<HTMLButtonElement>(null);
  const lightboxTriggerRef = useRef<HTMLElement | null>(null);
  const generatedImagesRef = useRef(generatedImages);
  const lightboxIndexRef = useRef(lightboxVariantIndex);

  useEffect(() => {
    generatedImagesRef.current = generatedImages;
    lightboxIndexRef.current = lightboxVariantIndex;
  }, [generatedImages, lightboxVariantIndex]);

  useEffect(() => {
    if (!lightboxImageUrl) return;

    const dialog = lightboxDialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      lightboxCloseRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setLightboxImageUrl(null);
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const images = generatedImagesRef.current;
        const currentIndex = lightboxIndexRef.current;
        if (images.length < 2 || currentIndex < 0) return;

        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const nextIndex = (currentIndex + direction + images.length) % images.length;
        const nextImageUrl = images[nextIndex].imageUrl;
        onSelectImage?.(nextImageUrl);
        setLightboxImageUrl(nextImageUrl);
        return;
      }

      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      const trigger = lightboxTriggerRef.current;
      if (trigger?.isConnected) {
        window.requestAnimationFrame(() => trigger.focus());
      }
    };
    // The boolean dependency keeps focus management stable while navigating
    // between images inside the same lightbox.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(lightboxImageUrl)]);

  useEffect(() => {
    if (lightboxImageUrl && lightboxImageUrl !== imageUrl && lightboxVariantIndex < 0) {
      setLightboxImageUrl(null);
    }
  }, [imageUrl, lightboxImageUrl, lightboxVariantIndex]);

  useEffect(() => {
    setImageLoaded(false);
  }, [imageUrl]);

  const openLightbox = (nextImageUrl: string) => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement !== document.body) {
      lightboxTriggerRef.current = activeElement;
    }
    setLightboxImageUrl(nextImageUrl);
  };

  const selectAndOpenImage = (nextImageUrl: string) => {
    onSelectImage?.(nextImageUrl);
    setImageLoaded(false);
    openLightbox(nextImageUrl);
  };

  const getFileName = () => {
    const extension = imageUrl?.startsWith("data:image/svg") ? "svg" : "png";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `render-filipucci-${timestamp}.${extension}`;
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

    const title = "Render della scena Filipucci";
    const text = selectedVariant?.prompt
      ? `Render creato con queste indicazioni: ${selectedVariant.prompt}`
      : "Render della scena Filipucci";
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
          <p className="eyebrow mb-2">Risultato</p>
          <h3 className="display-title text-2xl text-[var(--text)]">Render della scena.</h3>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {imageUrl && (
            <button
              type="button"
              onClick={() => openLightbox(imageUrl)}
              className="ghost-action rounded-full px-3 py-2 text-xs font-semibold"
            >
              Ingrandisci
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
            <button
              type="button"
              onClick={() => onDeleteImage?.(selectedVariant?.id)}
              disabled={!imageUrl || !onDeleteImage}
              className="ghost-action inline-flex h-9 w-9 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Elimina render"
              title="Elimina render"
            >
              <ActionIcon name="trash" />
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
          <p className="text-sm font-semibold text-[var(--danger)]">Impossibile generare il render.</p>
          <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{error}</p>
          <p className="mt-3 text-xs text-[var(--text-soft)]">Controlla la configurazione o la visuale e riprova.</p>
        </div>
      )}

      {!error && warnings.length > 0 && (
        <div className="mb-4 rounded-xl border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] p-3" role="status">
          <p className="text-xs font-semibold text-[var(--accent-strong)]">Nota sulla generazione</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{warnings[0]}</p>
        </div>
      )}

      {!error && imageUrl && isStale && (
        <div className="mb-4 rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-3" role="status">
          <p className="text-xs font-semibold text-[var(--text)]">Configurazione modificata</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
            Questo render appartiene alla configurazione precedente. Rigeneralo per aggiornare l’immagine.
          </p>
        </div>
      )}

      {!error && imageUrl && (
        <div className="relative overflow-hidden rounded-xl bg-[var(--surface-strong)]">
          {!imageLoaded && (
            <div className="absolute inset-0 z-[1] flex aspect-video items-center justify-center bg-[var(--surface-strong)]">
              <div className="text-center">
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
                <p className="text-sm text-[var(--text-muted)]">Caricamento del render…</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => openLightbox(imageUrl)}
            className="block w-full cursor-zoom-in text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
            aria-label="Apri il render ingrandito"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Render dell’ambiente"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageLoaded(false)}
              className={`w-full object-cover transition-transform duration-300 hover:scale-[1.01] ${
                imageLoaded ? "block" : "hidden"
              }`}
            />
          </button>
          {isLoading && (
            <div
              className="absolute inset-0 z-[2] flex items-center justify-center bg-black/45 p-6 text-center backdrop-blur-[2px]"
              role="status"
              aria-live="polite"
            >
              <div className="rounded-2xl border border-white/20 bg-black/45 px-5 py-4 text-white">
                <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
                <p className="text-sm font-semibold">Generazione del render in corso</p>
                <p className="mt-1 text-xs text-white/70">Attendi il completamento.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {isLoading && !imageUrl && (
        <div
          className="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-6 text-center"
          role="status"
          aria-live="polite"
        >
          <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          <p className="text-sm font-semibold text-[var(--text)]">Generazione del render in corso</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Attendi il completamento.</p>
        </div>
      )}

      {!isLoading && !error && !imageUrl && (
        <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] px-6 text-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-strong)] text-xl text-[var(--accent)]">✦</span>
          <p className="max-w-xs text-sm leading-6 text-[var(--text-muted)]">
            Seleziona un ambiente, imposta la visuale e qui apparirà il render.
          </p>
        </div>
      )}

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Cronologia render della sessione</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {generatedImages.length > 0
                ? "Seleziona un render per visualizzarlo."
                : "I render generati in questa sessione appariranno qui."}
            </p>
          </div>
          <span className="rounded-full bg-[var(--surface-strong)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
            {generatedImages.length}/8
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Cronologia render generati">
          {renderSlots.map((variant, index) => {
            if (!variant) {
              return (
                <div
                  key={`empty-slot-${index}`}
                  aria-label={`Slot disponibile per render ${index + 1}`}
                  className="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] px-2 text-center"
                >
                  <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-strong)] text-sm text-[var(--text-soft)]">+</span>
                  <span className="text-[11px] font-semibold text-[var(--text-muted)]">Spazio libero</span>
                  <span className="mt-1 text-[10px] text-[var(--text-soft)]">Render {index + 1}</span>
                </div>
              );
            }

            const isSelected = variant.imageUrl === imageUrl;
            const renderNumber = generatedImages.length - index;
            return (
              <div
                key={variant.id}
                className={`group relative overflow-hidden rounded-xl border transition-all ${
                  isSelected
                    ? "border-[var(--accent-strong)] ring-2 ring-[color-mix(in_srgb,var(--accent)_22%,transparent)]"
                    : "border-[var(--border)] hover:border-[var(--border-strong)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectAndOpenImage(variant.imageUrl)}
                  aria-label={`Apri render ${renderNumber}`}
                  aria-pressed={isSelected}
                  className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-[var(--surface-strong)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={variant.imageUrl}
                      alt={`Anteprima render ${renderNumber}`}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    {isSelected && (
                      <span className="absolute left-2 top-2 rounded-full bg-[var(--accent-strong)] px-2 py-1 text-[10px] font-semibold text-white">
                        Selezionato
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 bg-[var(--surface-muted)] px-2.5 py-2">
                    <span className="text-[11px] font-semibold text-[var(--text)]">Render {renderNumber}</span>
                    <span className="text-[10px] text-[var(--text-soft)]">
                      {variant.createdAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </button>
                {onDeleteImage && (
                  <button
                    type="button"
                    onClick={() => onDeleteImage(variant.id)}
                    aria-label={`Elimina render ${renderNumber}`}
                    title="Elimina render"
                    className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] shadow-sm transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)] sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                  >
                    <ActionIcon name="trash" />
                  </button>
                )}
              </div>
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
            {isStale ? "Rigenera render" : "Genera un altro render"}
          </button>
        </div>
      )}

      {lightboxImageUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Render ingrandito"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm sm:p-8"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setLightboxImageUrl(null);
          }}
        >
          <div className="relative flex max-h-full w-full max-w-6xl flex-col gap-3">
            <div className="flex items-center justify-between gap-4 text-white">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Render della scena</p>
                {lightboxVariantIndex >= 0 && (
                  <p className="mt-1 text-sm text-white/90">
                    Render {generatedImages.length - lightboxVariantIndex} di {generatedImages.length}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {onDeleteImage && (
                  <button
                    type="button"
                    onClick={() => onDeleteImage(selectedVariant?.id)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/25 px-3 py-2 text-xs font-semibold text-white/85 transition-colors hover:border-white/50 hover:text-white"
                  >
                    <ActionIcon name="trash" />
                    Elimina
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setLightboxImageUrl(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/25 text-xl leading-none text-white/85 transition-colors hover:border-white/50 hover:text-white"
                  aria-label="Chiudi ingrandimento"
                  title="Chiudi ingrandimento"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="relative flex min-h-0 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-[var(--surface)] p-2 sm:p-4">
              {generatedImages.length > 1 && lightboxVariantIndex >= 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const nextIndex =
                      (lightboxVariantIndex - 1 + generatedImages.length) % generatedImages.length;
                    const nextImageUrl = generatedImages[nextIndex].imageUrl;
                    onSelectImage?.(nextImageUrl);
                    setLightboxImageUrl(nextImageUrl);
                  }}
                  className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/35 text-xl text-white transition-colors hover:bg-black/60"
                  aria-label="Render precedente"
                  title="Render precedente"
                >
                  ‹
                </button>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxImageUrl}
                alt="Render dell’ambiente ingrandito"
                className="max-h-[calc(100vh-9rem)] max-w-full object-contain"
              />
              {generatedImages.length > 1 && lightboxVariantIndex >= 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const nextIndex = (lightboxVariantIndex + 1) % generatedImages.length;
                    const nextImageUrl = generatedImages[nextIndex].imageUrl;
                    onSelectImage?.(nextImageUrl);
                    setLightboxImageUrl(nextImageUrl);
                  }}
                  className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/35 text-xl text-white transition-colors hover:bg-black/60"
                  aria-label="Render successivo"
                  title="Render successivo"
                >
                  ›
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
