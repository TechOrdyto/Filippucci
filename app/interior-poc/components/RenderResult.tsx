"use client";

import { useState } from "react";

interface RenderResultProps {
  imageUrl?: string | null;
  isLoading?: boolean;
  error?: string | null;
  onRegenerate?: () => void;
}

export default function RenderResult({
  imageUrl,
  isLoading = false,
  error = null,
  onRegenerate,
}: RenderResultProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">📸 Render Fotorealistico</h3>
        {imageUrl && (
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            {isExpanded ? "Comprimi" : "Espandi"}
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex aspect-video items-center justify-center rounded-md bg-gray-50">
          <div className="text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm text-gray-500">Generazione render in corso...</p>
            <p className="mt-1 text-xs text-gray-400">
              L'AI sta componendo l'ambiente (20-40 secondi)
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">Errore nella generazione</p>
          <p className="mt-1 text-sm text-red-600">{error}</p>
        </div>
      )}

      {!isLoading && !error && imageUrl && (
        <div className="overflow-hidden rounded-md">
          {!imageLoaded && (
            <div className="flex aspect-video items-center justify-center rounded-md bg-gray-50">
              <div className="text-center">
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                <p className="text-sm text-gray-500">Caricamento render...</p>
                <p className="mt-1 text-xs text-gray-400">
                  L'immagine fotorealistica sta arrivando (20-40 secondi)
                </p>
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
            } ${isExpanded ? "max-h-none" : "max-h-96"}`}
          />
        </div>
      )}

      {!isLoading && !error && !imageUrl && (
        <div className="flex aspect-video items-center justify-center rounded-md bg-gray-50">
          <p className="text-sm text-gray-400">
            Inserisci una descrizione e genera il render per vedere il risultato
          </p>
        </div>
      )}

      {imageUrl && onRegenerate && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onRegenerate}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            🔄 Rigenera
          </button>
        </div>
      )}
    </div>
  );
}