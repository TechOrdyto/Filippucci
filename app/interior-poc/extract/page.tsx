"use client";

import { useRef, useState } from "react";

type ExtractType = "catalog" | "floorplan";

interface ExtractResult {
  type: ExtractType;
  source: "rule-based" | "ai";
  products?: any[];
  floorplan?: any;
  warnings: string[];
  pageCount: number;
  metadata?: Record<string, string>;
  preview?: string;
  provider?: "opencode" | "openai";
}

export default function ExtractPage() {
  const [extractType, setExtractType] = useState<ExtractType>("catalog");
  const [useAI, setUseAI] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setResult(null);

    // Leggi il file come base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      await processFile(file.name, base64);
    };
    reader.readAsDataURL(file);
  };

  const processFile = async (name: string, base64: string) => {
    setIsProcessing(true);
    setError(null);

    try {
      const res = await fetch("/interior-poc/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: extractType,
          fileName: name,
          fileData: base64,
          useAI,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Errore nell'estrazione");
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;

    const data = result.type === "catalog" ? result.products : result.floorplan;
    if (!data) return;

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.type}-extracted.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-4xl px-4">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            📄 Estrazione Cataloghi e Piantine
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Carica un PDF (catalogo Molteni&C o piantina) per estrarre dati strutturati
          </p>
        </header>

        {/* Configurazione */}
        <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Tipo di documento
              </label>
              <select
                value={extractType}
                onChange={(e) => setExtractType(e.target.value as ExtractType)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="catalog">Catalogo prodotti</option>
                <option value="floorplan">Piantina architettonica</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Interpretazione
              </label>
              <div className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2">
                <input
                  type="checkbox"
                  checked={useAI}
                  onChange={(e) => setUseAI(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm text-gray-700">
                  Usa AI (opencode/OpenAI) per interpretazione avanzata
                </span>
              </div>
            </div>
          </div>

          {/* Upload */}
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isProcessing ? "Elaborazione..." : "📤 Carica PDF"}
            </button>
            {fileName && (
              <span className="text-sm text-gray-600">{fileName}</span>
            )}
          </div>
        </section>

        {/* Errore */}
        {error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">Errore</p>
            <p className="mt-1 text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Risultato */}
        {result && (
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Risultato estrazione
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {result.type === "catalog"
                    ? `${result.products?.length ?? 0} prodotti estratti`
                    : "Piantina estratta"}{" "}
                  · {result.source} · {result.pageCount} pagine
                  {result.provider ? ` · ${result.provider}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownload}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                ⬇️ Scarica JSON
              </button>
            </div>

            {/* Warning */}
            {result.warnings.length > 0 && (
              <div className="mb-4 rounded-md bg-amber-50 p-3">
                {result.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-800">
                    ⚠️ {w}
                  </p>
                ))}
              </div>
            )}

            {/* Anteprima prodotti */}
            {result.type === "catalog" && result.products && (
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 font-medium text-gray-700">Nome</th>
                      <th className="px-3 py-2 font-medium text-gray-700">Categoria</th>
                      <th className="px-3 py-2 font-medium text-gray-700">Designer</th>
                      <th className="px-3 py-2 font-medium text-gray-700">Dimensioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.products.map((p, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-medium text-gray-900">
                          {p.name}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{p.category}</td>
                        <td className="px-3 py-2 text-gray-600">{p.designer}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {p.dimensions
                            ? `${p.dimensions.width}×${p.dimensions.depth}×${p.dimensions.height}`
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Anteprima piantina */}
            {result.type === "floorplan" && result.floorplan && (
              <div className="rounded-md bg-gray-50 p-4">
                <div className="mb-2 text-sm font-medium text-gray-900">
                  {result.floorplan.name}
                </div>
                <div className="mb-3 text-xs text-gray-600">
                  {result.floorplan.dimensions?.width}m ×{" "}
                  {result.floorplan.dimensions?.height}m · soffitto{" "}
                  {result.floorplan.ceilingHeight}m
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {result.floorplan.rooms?.map((room: any, i: number) => (
                    <div
                      key={i}
                      className="rounded-md border border-gray-200 bg-white p-3"
                    >
                      <div className="text-sm font-medium text-gray-900">
                        {room.name}
                      </div>
                      <div className="text-xs text-gray-600">
                        {room.area} mq · {room.bounds?.width}m × {room.bounds?.height}m
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Testo estratto */}
            {result.preview && (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-medium text-blue-600">
                  Vedi testo estratto
                </summary>
                <pre className="mt-2 max-h-64 overflow-y-auto rounded-md bg-gray-50 p-3 text-xs text-gray-700">
                  {result.preview}
                </pre>
              </details>
            )}
          </section>
        )}
      </div>
    </main>
  );
}