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
    <div>
      {previewUrl && fileName ? (
        <div className="flex min-w-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Anteprima della foto di riferimento"
            className="h-12 w-16 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[var(--text)]">Immagine di esempio</p>
            <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">{fileName}</p>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            className="shrink-0 text-[11px] font-semibold text-[var(--accent-strong)] underline underline-offset-4"
          >
            Rimuovi
          </button>
        </div>
      ) : (
        <label
          htmlFor="design-brief-reference-image"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          className="flex cursor-pointer items-center gap-2.5 text-xs transition-colors hover:text-[var(--text)]"
        >
          <input
            ref={inputRef}
            id="design-brief-reference-image"
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            onChange={(event) => handleFile(event.target.files?.[0])}
            className="sr-only"
          />
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] text-base text-[var(--accent)]">
            +
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] text-[var(--text-muted)]">Clicca o trascina per aggiungere immagini · materiali, porte, finestre o stile · JPG, PNG o WEBP</span>
          </span>
          <span className="shrink-0 text-[11px] text-[var(--text-soft)]">Facoltativa</span>
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
