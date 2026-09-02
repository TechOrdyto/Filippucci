"use client";

import { useEffect, useMemo, useState } from "react";
import MentionInput from "./components/MentionInput";
import ProductDetail from "./components/ProductDetail";
import RenderResult, { type RenderVariant } from "./components/RenderResult";
import FloorplanViewer from "./components/FloorplanViewer";
import StudioHeader from "./components/StudioHeader";
import SceneStatus from "./components/SceneStatus";
import { catalog, findProductById, parseMentions } from "./lib/catalog";
import type {
  FloorplanRoom,
  ObjectProductAssignment,
  ProductMention,
  Product,
  Wall,
} from "./lib/types";
import type { CameraPosition, Viewpoint } from "./lib/camera/types";
import { generateViewpoints, DEFAULT_CAMERA_CONFIG } from "./lib/camera/viewpoints";
import { buildCameraPrompt } from "./lib/camera/prompt-builder";
import { CadFloorPlanSource, type FloorPlanOpeningHint } from "./floorplan/source";
import { useFloorPlan } from "./floorplan/use-floor-plan";
import { getObject } from "./floorplan/model";
import { boundsFromPolygon, pointInPolygon, polygonCenter } from "./floorplan/geometry";
import { planAreaToSquareMeters } from "./floorplan/units";
import type { Selection } from "./floorplan/types";
import {
  buildRenderScene,
  validateRenderScene,
} from "./lib/rendering/scene";
import {
  readProjectSession,
  writeProjectSession,
} from "./lib/project-session";
import floorplanDxfData from "./data/floorplan-dxf-casa-enri.json";

export default function InteriorPocPage() {
  const [prompt, setPrompt] = useState("");
  const [mentions, setMentions] = useState<ProductMention[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [renderedSceneSignature, setRenderedSceneSignature] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<RenderVariant[]>([]);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("Tutti");
  const [wallFinish, setWallFinish] = useState("");
  const [floorFinish, setFloorFinish] = useState("");
  const [generationWarnings, setGenerationWarnings] = useState<string[]>([]);
  const [catalogActionMessage, setCatalogActionMessage] = useState<string | null>(null);

  // Camera 2D state
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [camera, setCamera] = useState<CameraPosition | null>(null);
  const [viewpoints, setViewpoints] = useState<Viewpoint[]>([]);
  const [selectedViewpointId, setSelectedViewpointId] = useState<string | null>(null);
  const [isCameraMode, setIsCameraMode] = useState(false);
  const [isCameraConfirmed, setIsCameraConfirmed] = useState(false);
  const [objectAssignments, setObjectAssignments] = useState<Record<string, string>>({});
  const [objectAssignmentTargetId, setObjectAssignmentTargetId] = useState<string | null>(null);
  const [isObjectAssignmentOpen, setIsObjectAssignmentOpen] = useState(false);
  const [isSessionHydrated, setIsSessionHydrated] = useState(false);

  // Nuovo modulo planimetria
  const {
    model,
    selection,
    selectRoom,
    selectObject,
    clearSelection,
  } = useFloorPlan();

  const geometry = useMemo(
    () => new CadFloorPlanSource(floorplanDxfData as any).getGeometry(),
    []
  );

  useEffect(() => {
    const savedSession = readProjectSession();
    if (savedSession?.floorplanId === model.id) {
      setSelectedRoomId(savedSession.selectedRoomId);
      setObjectAssignments(savedSession.objectAssignments);
      setPrompt(savedSession.prompt);
      setMentions(parseMentions(savedSession.prompt));
      setWallFinish(savedSession.wallFinish);
      setFloorFinish(savedSession.floorFinish);
      setCamera(savedSession.camera);
      setViewpoints(savedSession.viewpoints);
      setSelectedViewpointId(savedSession.selectedViewpointId);
      setIsCameraConfirmed(Boolean(savedSession.isCameraConfirmed && savedSession.camera));
      setImageUrl(savedSession.imageUrl);
      setRenderedSceneSignature(savedSession.renderSignature);
    }
    setIsSessionHydrated(true);
  }, [model.id]);

  useEffect(() => {
    if (!isSessionHydrated) return;
    writeProjectSession({
      version: 1,
      floorplanId: model.id,
      selectedRoomId,
      objectAssignments,
      prompt,
      wallFinish,
      floorFinish,
      camera,
      viewpoints,
      selectedViewpointId,
      isCameraConfirmed,
      imageUrl,
      renderSignature: renderedSceneSignature,
      updatedAt: new Date().toISOString(),
    });
  }, [
    camera,
    floorFinish,
    imageUrl,
    isCameraConfirmed,
    isSessionHydrated,
    model.id,
    objectAssignments,
    prompt,
    renderedSceneSignature,
    selectedRoomId,
    selectedViewpointId,
    viewpoints,
    wallFinish,
  ]);

  // Adattatore semantico: le linee walls restano quelle grezze del DXF,
  // qui vengono solo esposte al calcolo delle visuali per evitare camere
  // troppo vicine ai muri.
  const cameraWalls = useMemo<Wall[]>(
    () =>
      geometry.vectorLines
        .filter((line) => line.layer === "walls")
        .map((line, index) => ({
          id: `camera-wall-${index}`,
          start: line.start,
          end: line.end,
          thickness: 3,
          openings: [],
        })),
    [geometry]
  );

  const explicitProducts = useMemo(
    () => mentions.map((m) => findProductById(m.productId)).filter(Boolean),
    [mentions]
  );

  const activeRoomObjectIds = useMemo(() => {
    if (!selectedRoomId) return null;
    return new Set(
      model.objects
        .filter((object) => object.roomId === selectedRoomId)
        .map((object) => object.id)
    );
  }, [model, selectedRoomId]);

  const renderAssignments = useMemo(
    () =>
      Object.entries(objectAssignments)
        .filter(([objectId]) => !activeRoomObjectIds || activeRoomObjectIds.has(objectId))
        .map(([objectId, productId]) => ({ objectId, productId })),
    [activeRoomObjectIds, objectAssignments]
  );

  const renderProducts = useMemo(() => {
    const productIds = new Set([
      ...explicitProducts.map((product) => (product as Product).id),
      ...renderAssignments.map((assignment) => assignment.productId),
    ]);
    return Array.from(productIds)
      .map((productId) => findProductById(productId))
      .filter((product): product is Product => Boolean(product));
  }, [explicitProducts, renderAssignments]);

  const renderScene = useMemo(
    () =>
      buildRenderScene({
        model,
        roomId: selectedRoomId,
        camera,
        assignments: renderAssignments,
        products: renderProducts,
        prompt,
        finishes: { walls: wallFinish, floor: floorFinish },
        openings: (geometry.openings ?? []).map((opening) => ({
          id: opening.id,
          type: opening.type,
          position: { x: opening.position[0], y: opening.position[1] },
          width: opening.width,
          height: opening.height,
          wall: opening.wall,
          exposure: opening.exposure,
        })),
      }),
    [
      camera,
      floorFinish,
      geometry.openings,
      model,
      prompt,
      renderAssignments,
      renderProducts,
      selectedRoomId,
      wallFinish,
    ]
  );

  const sceneValidation = useMemo(
    () => validateRenderScene(renderScene),
    [renderScene]
  );

  const sceneSignature = useMemo(
    () =>
      JSON.stringify({
        floorplanId: model.id,
        roomId: selectedRoomId,
        camera,
        objectAssignments: Object.entries(objectAssignments).sort(([left], [right]) =>
          left.localeCompare(right)
        ),
        prompt: prompt.trim(),
        wallFinish: wallFinish.trim(),
        floorFinish: floorFinish.trim(),
      }),
    [camera, floorFinish, model.id, objectAssignments, prompt, selectedRoomId, wallFinish]
  );
  const isRenderStale = Boolean(
    imageUrl && (!renderedSceneSignature || renderedSceneSignature !== sceneSignature)
  );

  const activeRoom = selectedRoomId
    ? model.rooms.find((room) => room.id === selectedRoomId) ?? null
    : null;
  const activeRoomAssignmentCount = activeRoom
    ? renderScene.objects.filter((object) => object.roomId === activeRoom.id).length
    : 0;

  const toCameraRoom = (room: any): FloorplanRoom => {
    const points = room.geometry.points as [number, number][];
    const bounds = boundsFromPolygon(points);
    const openings = (geometry.openings ?? [])
      .filter((opening) => pointInPolygon(opening.position[0], opening.position[1], points))
      .map((opening: FloorPlanOpeningHint) => ({
        id: opening.id,
        type: opening.type,
        position: { x: opening.position[0], y: opening.position[1] },
        width: opening.width,
        height: opening.height ?? 2.1,
        wall: opening.wall,
        exposure: opening.exposure ?? opening.wall,
      }));
    return {
      id: room.id,
      name: room.name,
      area: Math.round(planAreaToSquareMeters(bounds.width * bounds.height) * 100) / 100,
      bounds,
      polygon: points,
      openings,
    };
  };

  const focusRoom = (roomId: string) => {
    const roomChanged = selectedRoomId !== roomId;
    setSelectedRoomId(roomId);
    if (roomChanged) setIsCameraConfirmed(false);
    const room = model.rooms.find((r) => r.id === roomId);
    if (!room) return;
    const center = polygonCenter(room.geometry.points);
    const nextViewpoints = generateViewpoints(toCameraRoom(room), cameraWalls);
    const recommended = nextViewpoints[0];
    setViewpoints(nextViewpoints);
    setSelectedViewpointId(recommended?.id ?? null);
    setCamera(
      recommended
        ? {
            x: recommended.position.x,
            y: recommended.position.y,
            rotation: recommended.rotation,
            fov: recommended.fov,
            roomId,
          }
        : {
            x: Math.round(center.x * 100) / 100,
            y: Math.round(center.y * 100) / 100,
            rotation: 0,
            fov: DEFAULT_CAMERA_CONFIG.defaultFov,
            roomId,
          }
    );
  };

  const closeObjectAssignment = () => {
    setIsObjectAssignmentOpen(false);
  };

  const handleAssignObjectProduct = (objectId: string, productId: string) => {
    setObjectAssignments((current) => ({ ...current, [objectId]: productId }));
    setObjectAssignmentTargetId(objectId);
    setIsObjectAssignmentOpen(false);
  };

  const handleRemoveObjectProduct = (objectId: string) => {
    setObjectAssignments((current) => {
      const next = { ...current };
      delete next[objectId];
      return next;
    });
    setIsObjectAssignmentOpen(false);
  };

  const handleSelect = (sel: Selection | null) => {
    if (!sel) {
      clearSelection();
      closeObjectAssignment();
      setObjectAssignmentTargetId(null);
      return;
    }
    if (sel.type === "room") {
      selectRoom(sel.id);
      focusRoom(sel.id);
      closeObjectAssignment();
      setObjectAssignmentTargetId(null);
    } else {
      selectObject(sel.id);
      const obj = getObject(model, sel.id);
      if (obj) {
        focusRoom(obj.roomId);
        setObjectAssignmentTargetId(obj.id);
        setIsObjectAssignmentOpen(true);
      }
    }
  };
  const handleSelectViewpoint = (vp: Viewpoint) => {
    setIsCameraConfirmed(false);
    setSelectedViewpointId(vp.id);
    setCamera({
      x: vp.position.x,
      y: vp.position.y,
      rotation: vp.rotation,
      fov: vp.fov,
      roomId: vp.roomId,
    });
  };

  const handleRotateCamera = (delta: number) => {
    setIsCameraConfirmed(false);
    setSelectedViewpointId(null);
    setCamera((current) => {
      if (!current) return current;
      return {
        ...current,
        rotation: ((current.rotation + delta) % 360 + 360) % 360,
      };
    });
  };

  const handleToggleCamera = () => {
    if (!selectedRoomId) return;
    closeObjectAssignment();
    setObjectAssignmentTargetId(null);
    setIsCameraMode((active) => !active);
  };

  const handleConfirmCamera = () => {
    if (!camera || !selectedRoomId) return;
    setIsCameraConfirmed(true);
    setError(null);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    if (!isCameraConfirmed) {
      setError("Conferma il punto di vista prima di generare il render.");
      return;
    }

    if (sceneValidation.errors.length > 0) {
      setError(sceneValidation.errors[0]);
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGenerationWarnings([]);

    try {
      const allObjectAssignmentEntries: ObjectProductAssignment[] = Object.entries(
        objectAssignments
      ).map(([objectId, productId]) => ({ objectId, productId }));
      const activeObjectAssignmentEntries = allObjectAssignmentEntries.filter(
        ({ objectId }) => !activeRoomObjectIds || activeRoomObjectIds.has(objectId)
      );
      const requestProductIds = Array.from(
        new Set([
          ...explicitProducts.map((product) => (product as any).id),
          ...activeObjectAssignmentEntries.map((assignment) => assignment.productId),
        ])
      );
      const requestObjectIds = Array.from(
        new Set([
          ...activeObjectAssignmentEntries.map((assignment) => assignment.objectId),
          ...(selection?.type === "object" &&
          (!activeRoomObjectIds || activeRoomObjectIds.has(selection.id))
            ? [selection.id]
            : []),
        ])
      );
      const selectedRoom = model.rooms.find((r) => r.id === selectedRoomId);
      // La visuale resta quella scelta anche se l'utente torna al modo arredi
      // prima di premere "Genera render".
      const activeCamera = camera;
      const finishPrompt = [
        wallFinish.trim() ? `Pareti: ${wallFinish.trim()}.` : "",
        floorFinish.trim() ? `Pavimento: ${floorFinish.trim()}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
      const designPrompt = [finishPrompt, prompt.trim()].filter(Boolean).join(" ");
      const finalPrompt =
        activeCamera && selectedRoom
          ? buildCameraPrompt(
              {
                roomId: activeCamera.roomId,
                roomName: selectedRoom.name,
                position: { x: activeCamera.x, y: activeCamera.y },
                roomBounds: boundsFromPolygon(selectedRoom.geometry.points),
                rotation: activeCamera.rotation,
                fov: activeCamera.fov,
                viewDirection: {
                  x: Math.cos(((activeCamera.rotation - 90) * Math.PI) / 180),
                  y: Math.sin(((activeCamera.rotation - 90) * Math.PI) / 180),
                },
                visibilityContext: { facing: "room", distanceToWall: 0 },
              },
              designPrompt
            )
          : designPrompt;

      const res = await fetch("/interior-poc/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: finalPrompt,
          productIds: requestProductIds,
          explicitProductIds: explicitProducts.map((product) => (product as Product).id),
          floorplanId: model.id,
          roomId: selectedRoomId,
          objectIds: requestObjectIds,
          objectAssignments: activeObjectAssignmentEntries,
          finishes: {
            walls: wallFinish.trim() || null,
            floor: floorFinish.trim() || null,
          },
          camera: activeCamera
            ? {
                x: activeCamera.x,
                y: activeCamera.y,
                rotation: activeCamera.rotation,
                fov: activeCamera.fov,
              }
            : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Errore nella generazione");
      }

      const data = await res.json();
      const generatedImage: RenderVariant = {
        id: crypto.randomUUID(),
        imageUrl: data.imageUrl,
        prompt: designPrompt,
        createdAt: new Date(),
      };
      setGenerationWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      setImageUrl(data.imageUrl);
      setRenderedSceneSignature(sceneSignature);
      setGeneratedImages((previous) => [generatedImage, ...previous].slice(0, 8));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la generazione del render.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteImage = (variantId?: string) => {
    const target = variantId
      ? generatedImages.find((variant) => variant.id === variantId)
      : generatedImages.find((variant) => variant.imageUrl === imageUrl);

    if (!target && !imageUrl) return;
    if (!window.confirm("Eliminare il render selezionato? L’operazione non può essere annullata.")) {
      return;
    }

    if (!target) {
      setImageUrl(null);
      setRenderedSceneSignature(null);
      setGenerationWarnings([]);
      return;
    }

    const remainingImages = generatedImages.filter((variant) => variant.id !== target.id);
    setGeneratedImages(remainingImages);

    if (target.imageUrl === imageUrl) {
      setImageUrl(remainingImages[0]?.imageUrl ?? null);
      setRenderedSceneSignature(null);
      setGenerationWarnings([]);
    }
  };

  const hasSelectedEnvironment = Boolean(selectedRoomId);
  const hasConfirmedView = Boolean(selectedRoomId && camera && isCameraConfirmed);
  const hasIndications = Boolean(prompt.trim());
  const currentStep =
    !hasSelectedEnvironment
      ? 1
      : !hasConfirmedView
        ? 2
        : !hasIndications
          ? 3
          : 4;
  const nextAction = !hasSelectedEnvironment
    ? { label: "Seleziona un ambiente", href: "#piantina" }
    : sceneValidation.errors.length > 0 || !hasConfirmedView
      ? { label: "Imposta e conferma il punto di vista", href: "#piantina" }
      : !hasIndications
        ? { label: "Inserisci finiture e note", href: "#indicazioni" }
        : isRenderStale
          ? { label: "Aggiorna il render", href: "#risultato" }
          : !imageUrl
            ? { label: "Genera il render", href: "#indicazioni" }
            : { label: "Rivedi il render", href: "#risultato" };
  const catalogCategories = [
    "Tutti",
    ...Array.from(new Set(catalog.map((product) => product.category))),
  ];
  const filteredCatalog = catalog.filter((product) => {
    const query = catalogQuery.trim().toLowerCase();
    const matchesCategory = catalogCategory === "Tutti" || product.category === catalogCategory;
    const matchesQuery =
      !query ||
      [product.name, product.collection, product.category, product.designer]
        .join(" ")
        .toLowerCase()
        .includes(query);
    return matchesCategory && matchesQuery;
  });

  const handleUseProduct = (productName: string) => {
    const nextPrompt = `${prompt.trim()}${prompt.trim() ? " " : ""}@${productName} `;
    setPrompt(nextPrompt);
    setMentions(parseMentions(nextPrompt));
    setCatalogActionMessage(`${productName} aggiunto alle indicazioni.`);
  };

  return (
    <main className="studio-shell min-h-screen">
      <StudioHeader active="demo" />

      <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8 lg:pt-10">
        <section className="mb-8">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start md:gap-8">
            <div className="max-w-3xl">
              <p className="eyebrow mb-3">Configurazione della scena</p>
              <h1 className="display-title text-4xl leading-[0.98] text-[var(--text)] sm:text-5xl">
                Configura la scena del progetto.
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-[var(--text-muted)]">
                Seleziona l’ambiente, associa gli articoli, imposta il punto di vista e inserisci
                le indicazioni necessarie per generare il render.
              </p>
            </div>
            <div className="shrink-0 text-left md:pt-0 md:text-right">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-soft)]">Progetto</p>
              <p className="mt-1 text-sm font-medium text-[var(--text)]">{model.name}</p>
            </div>
          </div>
        </section>

        <nav aria-label="Passaggi di configurazione" className="panel mb-8 overflow-hidden rounded-2xl">
          <ol className="grid grid-cols-2 divide-x divide-y divide-[var(--border)] sm:grid-cols-4 sm:divide-y-0">
            {[
              [1, "Ambiente e articoli", "Seleziona l’ambiente e associa gli articoli"],
              [2, "Punto di vista", "Imposta e conferma la visuale"],
              [3, "Finiture e note", "Definisci materiali e indicazioni"],
              [4, "Render", "Visualizza il risultato"],
            ].map(([step, title, description]) => {
              const stepNumber = step as number;
              const isActive = currentStep === stepNumber;
              const isComplete = currentStep > stepNumber;
              return (
                <li
                  key={stepNumber}
                  aria-current={isActive ? "step" : undefined}
                  className={`flex items-center gap-3 px-4 py-4 sm:px-5 ${
                    isActive ? "bg-[var(--accent-soft)]" : ""
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                      isActive || isComplete
                        ? "border-[var(--accent-strong)] bg-[var(--accent-strong)] text-white"
                        : "border-[var(--border-strong)] text-[var(--text-muted)]"
                    }`}
                  >
                    {isComplete ? "✓" : stepNumber}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-[var(--text)]">{title}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-[var(--text-muted)]">
                      {description}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]">
          <div className="contents lg:col-start-1 lg:row-start-1 lg:flex lg:flex-col lg:gap-6 lg:self-stretch">
            <div className="order-3">
            <section id="indicazioni" className="panel rounded-2xl p-5 sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow mb-2">03 · Indicazioni</p>
                  <h3 className="display-title text-2xl text-[var(--text)]">Imposta finiture e indicazioni.</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                    Inserisci colori, materiali, note e riferimenti agli articoli da usare nel render.
                  </p>
                </div>
              </div>

              <div className="mb-2">
                <p className="text-xs font-semibold text-[var(--text)]">Indicazioni per il render</p>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                  Inserisci almeno una nota per abilitare la generazione.
                </p>
              </div>

              <MentionInput
                value={prompt}
                onChange={setPrompt}
                onMentionsChange={setMentions}
              />

              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <div className="mb-3">
                  <p className="eyebrow mb-1">Finiture</p>
                  <p className="text-xs leading-5 text-[var(--text-muted)]">
                    Specifica le finiture da applicare all’ambiente. Sono facoltative.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-[var(--text)]">
                      Pareti
                    </span>
                    <input
                      value={wallFinish}
                      onChange={(event) => setWallFinish(event.target.value)}
                      className="field-shell w-full rounded-xl px-3 py-2.5 text-sm text-[var(--text)] outline-none"
                      placeholder="es. bianco caldo opaco"
                      aria-label="Finitura pareti"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-[var(--text)]">
                      Pavimento
                    </span>
                    <input
                      value={floorFinish}
                      onChange={(event) => setFloorFinish(event.target.value)}
                      className="field-shell w-full rounded-xl px-3 py-2.5 text-sm text-[var(--text)] outline-none"
                      placeholder="es. rovere naturale"
                      aria-label="Finitura pavimento"
                    />
                  </label>
                </div>
              </div>

              <div className="mt-4">
                <p className="eyebrow mb-2">Esempi rapidi</p>
                <div className="flex flex-wrap gap-2" aria-label="Esempi di indicazioni">
                  {[
                    "Soggiorno luminoso e minimale",
                    "Toni caldi e legno naturale",
                    "Immagine elegante e ordinata",
                    "Colori neutri e materiali naturali",
                  ].map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => {
                        setPrompt(example);
                        setMentions(parseMentions(example));
                      }}
                      className="ghost-action rounded-full px-3 py-1.5 text-xs"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>

              {explicitProducts.length > 0 && (
                <div className="mt-5 border-t border-[var(--border)] pt-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="eyebrow">Articoli nel render</span>
                    <span className="text-xs text-[var(--text-soft)]">Catalogo Molteni&amp;C</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {explicitProducts.map((product) => (
                      <span
                        key={(product as any).id}
                        className="soft-badge inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                        {(product as any).name}
                      </span>
                    ))}
                  </div>

                  {/* Dettaglio prodotto: base dati completa (varianti, misure, prezzi) */}
                  {explicitProducts.map((product) => (
                    <div key={`detail-${(product as any).id}`} className="mt-3">
                      <ProductDetail product={product as any} />
                    </div>
                  ))}
                </div>
              )}

              {sceneValidation.errors.length > 0 && (
                <p className="mt-5 rounded-xl border border-[color-mix(in_srgb,var(--accent-strong)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-3 py-2.5 text-xs leading-5 text-[var(--text-muted)]">
                  {sceneValidation.errors[0]}
                </p>
              )}

              {sceneValidation.errors.length === 0 && sceneValidation.warnings.length > 0 && (
                <p className="mt-5 text-xs leading-5 text-[var(--text-soft)]">
                  {sceneValidation.warnings[0]}
                </p>
              )}

              <button
                type="button"
                onClick={handleGenerate}
                disabled={
                  !prompt.trim() ||
                  isGenerating ||
                  sceneValidation.errors.length > 0 ||
                  !isCameraConfirmed
                }
                className="primary-action mt-6 flex w-full items-center justify-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold"
              >
                <span aria-hidden="true">{isGenerating ? "···" : "→"}</span>
                {isGenerating ? "Generazione in corso…" : "Genera render"}
              </button>
              <p className="mt-3 text-center text-xs text-[var(--text-soft)]">
                {isGenerating
                  ? "La generazione richiede normalmente 20–40 secondi."
                  : !selectedRoomId
                    ? "Seleziona prima un ambiente dalla planimetria."
                    : !isCameraConfirmed
                      ? "Imposta e conferma il punto di vista dalla planimetria."
                      : !prompt.trim()
                        ? "Inserisci almeno una indicazione per generare il render."
                        : "La generazione richiede normalmente 20–40 secondi."}
              </p>
            </section>
            </div>

            {/* MODULO PLANIMETRIA — solo piantina centrale */}
            <div className="order-1">
              <section id="piantina" className="panel rounded-2xl p-5 sm:p-6">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow mb-2">01 · Piantina</p>
                <h3 className="display-title text-2xl text-[var(--text)]">Seleziona ambiente e arredi.</h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Seleziona un ambiente o un elemento. Associa gli articoli dal catalogo, poi imposta il punto di vista.
                </p>
                  </div>
                </div>

                <FloorplanViewer
                  geometry={geometry}
                  model={model}
                  selection={selection}
                  focusRoomId={selectedRoomId}
                  camera={camera}
                  viewpoints={viewpoints}
                  selectedViewpointId={selectedViewpointId}
                  isCameraConfirmed={isCameraConfirmed}
                  isCameraMode={isCameraMode}
                  catalog={catalog}
                  objectAssignments={objectAssignments}
                  objectAssignmentTargetId={objectAssignmentTargetId}
                  isObjectAssignmentOpen={isObjectAssignmentOpen}
                  onSelect={handleSelect}
                  onAssignObjectProduct={handleAssignObjectProduct}
                  onRemoveObjectProduct={handleRemoveObjectProduct}
                  onCloseObjectAssignment={closeObjectAssignment}
                  onSelectViewpoint={handleSelectViewpoint}
                  onRotateCamera={handleRotateCamera}
                  onToggleCamera={handleToggleCamera}
                  onConfirmCamera={handleConfirmCamera}
                />

              </section>
            </div>
          </div>

          <div className="contents lg:col-start-2 lg:row-start-1 lg:flex lg:flex-col lg:gap-6 lg:self-stretch">
            <div className="order-4">
              <SceneStatus
                roomName={activeRoom?.name ?? null}
                camera={camera}
                isCameraConfirmed={isCameraConfirmed}
                assignedCount={activeRoomAssignmentCount}
                wallFinish={wallFinish}
                floorFinish={floorFinish}
                prompt={prompt}
                hasImage={Boolean(imageUrl)}
                renderStale={isRenderStale}
                errors={sceneValidation.errors}
                warnings={sceneValidation.warnings}
                nextAction={nextAction}
              />
            </div>
            <aside id="risultato" className="order-5 lg:sticky lg:top-24 lg:self-stretch">
              <RenderResult
                imageUrl={imageUrl}
                generatedImages={generatedImages}
                isLoading={isGenerating}
                isStale={isRenderStale}
                error={error}
                warnings={generationWarnings}
                onRegenerate={handleGenerate}
                onSelectImage={setImageUrl}
                onDeleteImage={handleDeleteImage}
              />
            </aside>
          </div>
        </div>

        <section className="mt-12 border-t border-[var(--border)] pt-8">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="eyebrow mb-2">Arredi</p>
              <h2 className="display-title text-3xl text-[var(--text)]">Associa un articolo alla scena.</h2>
            </div>
            <div className="text-right">
              <p className="text-sm text-[var(--text-muted)]">{filteredCatalog.length} di {catalog.length} prodotti</p>
              {catalogActionMessage && (
                <p className="mt-1 text-xs text-[var(--success)]" role="status">
                  {catalogActionMessage}
                </p>
              )}
            </div>
          </div>

          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="field-shell flex min-h-11 w-full items-center gap-3 rounded-xl px-4 lg:max-w-sm">
              <span aria-hidden="true" className="text-sm text-[var(--accent)]">⌕</span>
              <span className="sr-only">Cerca negli articoli</span>
              <input
                type="search"
                value={catalogQuery}
                onChange={(event) => setCatalogQuery(event.target.value)}
                placeholder="Cerca articolo o collezione"
                className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-soft)]"
              />
            </label>
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtra per categoria">
              {catalogCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setCatalogCategory(category)}
                    aria-pressed={catalogCategory === category}
                    className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                    catalogCategory === category
                      ? "bg-[var(--accent-strong)] text-white"
                      : "ghost-action"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {filteredCatalog.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredCatalog.map((product) => (
              <article key={product.id} className="catalog-card rounded-2xl p-3">
                <div className="flex gap-4">
                  {product.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="h-24 w-24 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-strong)] text-xs font-semibold uppercase tracking-widest text-[var(--text-soft)]">
                      {product.category.slice(0, 3)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1 py-1">
                    <p className="eyebrow truncate">{product.category}</p>
                    <h3 className="mt-1 truncate text-sm font-semibold text-[var(--text)]">{product.name}</h3>
                    <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{product.designer}</p>
                    <p className="mt-2 text-xs text-[var(--text-soft)]">
                      {product.dimensions
                        ? `${product.dimensions.width} × ${product.dimensions.depth} × ${product.dimensions.height} cm`
                        : "Dimensioni su richiesta"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUseProduct(product.name)}
                  className="ghost-action mt-3 w-full rounded-xl px-3 py-2 text-xs font-semibold"
                >
                  Aggiungi alle indicazioni
                </button>
              </article>
            ))}
            </div>
          ) : (
            <div className="panel-muted rounded-2xl border border-dashed border-[var(--border-strong)] p-8 text-center">
              <p className="text-sm text-[var(--text-muted)]">Nessun elemento corrisponde alla ricerca.</p>
              <button
                type="button"
                onClick={() => {
                  setCatalogQuery("");
                  setCatalogCategory("Tutti");
                }}
                className="mt-3 text-xs font-semibold text-[var(--accent-strong)] underline underline-offset-4"
              >
                Azzera filtri
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
