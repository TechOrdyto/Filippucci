"use client";

import { useEffect, useRef, useState } from "react";

interface ReferenceImagePickerProps {
  onChange?: (file: File | null) => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ReferenceImagePicker({ onChange }: ReferenceImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFile = (file: File | undefined) => {
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Scegli un’immagine JPG, PNG o WEBP.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("La foto deve essere più piccola di 10 MB.");
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setError(null);
    onChange?.(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    handleFile(event.dataTransfer.files[0]);
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    setFileName(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
    onChange?.(null);
  };

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-2">
        <p className="eyebrow">Foto della stanza</p>
        <span className="text-[11px] text-[var(--text-soft)]">Facoltativa</span>
      </div>

      {previewUrl && fileName ? (
        <div className="flex items-center gap-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Anteprima della stanza caricata"
            className="h-20 w-28 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[var(--text)]">Foto aggiunta</p>
            <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">{fileName}</p>
            <button
              type="button"
              onClick={handleRemove}
              className="mt-2 text-[11px] font-semibold text-[var(--accent-strong)] underline underline-offset-4"
            >
              Rimuovi foto
            </button>
          </div>
        </div>
      ) : (
        <label
          htmlFor="room-reference-image"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] px-4 py-3 transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-strong)]"
        >
          <input
            ref={inputRef}
            id="room-reference-image"
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            onChange={(event) => handleFile(event.target.files?.[0])}
            className="sr-only"
          />
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] text-lg text-[var(--accent)]">
            +
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-[var(--text)]">Aggiungi una foto della stanza</span>
            <span className="mt-1 block text-[11px] text-[var(--text-muted)]">Clicca o trascina qui un’immagine del cliente · JPG, PNG o WEBP</span>
          </span>
        </label>
      )}

      {error && (
        <p className="mt-2 text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
