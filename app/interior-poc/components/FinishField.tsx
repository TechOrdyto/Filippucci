"use client";

import { useEffect, useRef, useState } from "react";

interface FinishFieldProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}

const MAX_REFERENCE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_REFERENCE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function FinishField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: FinishFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleReferenceChange = (file: File | undefined) => {
    if (!file) return;

    if (!ACCEPTED_REFERENCE_TYPES.includes(file.type)) {
      setError("Scegli un’immagine JPG, PNG o WEBP.");
      return;
    }

    if (file.size > MAX_REFERENCE_SIZE) {
      setError("L’immagine deve essere più piccola di 10 MB.");
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setError(null);
  };

  const handleRemoveReference = () => {
    setPreviewUrl(null);
    setFileName(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-[var(--text)]">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="field-shell w-full rounded-xl px-3 py-2.5 pr-12 text-sm text-[var(--text)] outline-none"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="ghost-action absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-lg leading-none"
          aria-label={`Aggiungi un’immagine di esempio per ${label.toLowerCase()}`}
          title={`Aggiungi un’immagine di esempio per ${label.toLowerCase()}`}
        >
          <span aria-hidden="true">+</span>
        </button>
        <input
          ref={inputRef}
          id={`${id}-reference-image`}
          type="file"
          accept={ACCEPTED_REFERENCE_TYPES.join(",")}
          onChange={(event) => handleReferenceChange(event.target.files?.[0])}
          className="sr-only"
          aria-label={`Immagine di esempio per ${label.toLowerCase()}`}
        />
      </div>

      {previewUrl && fileName && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt={`Anteprima immagine per ${label.toLowerCase()}`} className="h-9 w-9 rounded-md object-cover" />
          <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-muted)]">{fileName}</span>
          <button
            type="button"
            onClick={handleRemoveReference}
            className="shrink-0 px-1 text-[11px] font-semibold text-[var(--text-soft)] hover:text-[var(--text)]"
            aria-label={`Rimuovi l’immagine di esempio per ${label.toLowerCase()}`}
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <p className="mt-1 text-[11px] text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
