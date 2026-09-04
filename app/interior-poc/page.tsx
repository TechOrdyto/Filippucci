"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MentionInput from "./components/MentionInput";
import ProductDetail from "./components/ProductDetail";
import FinishField from "./components/FinishField";
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
import { CadFloorPlanSource, type FloorPlanOpeningHint } from "./floorplan/source";
import { useFloorPlan } from "./floorplan/use-floor-plan";
import { getObject } from "./floorplan/model";
import { boundsFromPolygon, geometryCenter, pointInPolygon, polygonCenter } from "./floorplan/geometry";
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
  const [wallFinish, setWallFinish] = useState("");
  const [floorFinish, setFloorFinish] = useState("");
  const [doorFinish, setDoorFinish] = useState("");
  const [windowFinish, setWindowFinish] = useState("");
  const [generationWarnings, setGenerationWarnings] = useState<string[]>([]);

  // Camera 2D state
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [camera, setCamera] = useState<CameraPosition | null>(null);
  const [viewpoints, setViewpoints] = useState<Viewpoint[]>([]);
  const [selectedViewpointId, setSelectedViewpointId] = useState<string | null>(null);
  const [isCameraMode, setIsCameraMode] = useState(false);
  const [isCameraConfirmed, setIsCameraConfirmed] = useState(false);
  const [cameraAttentionTarget, setCameraAttentionTarget] = useState<
    "toggle" | "confirm" | null
  >(null);
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
      setObjectAssignments(savedSession.objectAssignments);
      setPrompt(savedSession.prompt);
      setMentions(parseMentions(savedSession.prompt));
      setWallFinish(savedSession.wallFinish);
      setFloorFinish(savedSession.floorFinish);
      setDoorFinish(savedSession.doorFinish);
      setWindowFinish(savedSession.windowFinish);
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
      doorFinish,
      windowFinish,
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
    doorFinish,
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
    windowFinish,
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

    const selectedRoom = model.rooms.find((room) => room.id === selectedRoomId);
    if (!selectedRoom) return new Set<string>();

    return new Set(
      model.objects
        .filter((object) => {
          if (object.roomId !== selectedRoomId) return false;
          const center = geometryCenter(object.geometry);
          return pointInPolygon(center.x, center.y, selectedRoom.geometry.points);
        })
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
        finishes: {
          walls: wallFinish,
          floor: floorFinish,
          doors: doorFinish,
          windows: windowFinish,
        },
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
      doorFinish,
      floorFinish,
      geometry.openings,
      model,
      prompt,
      renderAssignments,
      renderProducts,
      selectedRoomId,
      wallFinish,
      windowFinish,
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
        doorFinish: doorFinish.trim(),
        windowFinish: windowFinish.trim(),
      }),
    [camera, doorFinish, floorFinish, model.id, objectAssignments, prompt, selectedRoomId, wallFinish, windowFinish]
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

  const resetActiveEnvironment = () => {
    clearSelection();
    closeObjectAssignment();
    setObjectAssignmentTargetId(null);
    setSelectedRoomId(null);
    setCamera(null);
    setViewpoints([]);
    setSelectedViewpointId(null);
    setIsCameraMode(false);
    setIsCameraConfirmed(false);
    setCameraAttentionTarget(null);
  };

  const handleSelectViewpoint = (vp: Viewpoint) => {
    setIsCameraConfirmed(false);
    setCameraAttentionTarget("confirm");
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
    setCameraAttentionTarget("confirm");
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
    const nextCameraMode = !isCameraMode;
    setCameraAttentionTarget(nextCameraMode && camera ? "confirm" : null);
    closeObjectAssignment();
    setObjectAssignmentTargetId(null);
    setIsCameraMode(nextCameraMode);
  };

  const handleConfirmCamera = () => {
    if (!camera || !selectedRoomId) return;
    setCameraAttentionTarget(null);
    setIsCameraConfirmed(true);
    setError(null);
  };

  const focusCameraAction = (target: "toggle" | "confirm") => {
    setCameraAttentionTarget(target);

    const actionId = target === "confirm" ? "conferma-visuale" : "imposta-visuale";
    document.getElementById(actionId)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  const handleGenerate = async () => {
    if (!selectedRoomId || !camera || !isCameraConfirmed) {
      setError(
        selectedRoomId
          ? "Imposta e conferma la visuale prima di generare il render."
          : "Seleziona un ambiente e imposta la visuale prima di generare il render."
      );
      focusCameraAction(isCameraMode && Boolean(camera) ? "confirm" : "toggle");
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
      // Il prompt canonico (server) costruisce la sezione CAMERA dal contratto
      // di scena: qui inviamo solo le indicazioni utente pulite (senza mention
      // tecniche @prodotto) e le finiture come campi separati.
      const designPrompt = prompt.trim();

      const res = await fetch("/interior-poc/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: designPrompt,
          productIds: requestProductIds,
          explicitProductIds: explicitProducts.map((product) => (product as Product).id),
          floorplanId: model.id,
          roomId: selectedRoomId,
          objectIds: requestObjectIds,
          objectAssignments: activeObjectAssignmentEntries,
          finishes: {
            walls: wallFinish.trim() || null,
            floor: floorFinish.trim() || null,
            doors: doorFinish.trim() || null,
            windows: windowFinish.trim() || null,
          },
          camera: activeCamera
            ? {
                x: activeCamera.x,
                y: activeCamera.y,
                rotation: activeCamera.rotation,
                fov: activeCamera.fov,
                height: activeCamera.height ?? 1.5,
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
      resetActiveEnvironment();
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
  const hasPendingObjectAssignment = Boolean(
    selection?.type === "object" && !objectAssignments[selection.id]
  );
  const currentStep =
    !hasSelectedEnvironment
      ? 1
      : hasPendingObjectAssignment
        ? 2
        : !isCameraMode && selection?.type !== "object"
          ? 2
        : !hasConfirmedView
          ? 3
          : imageUrl || isRenderStale
            ? 5
            : 4;
  const nextAction = !hasSelectedEnvironment
    ? { label: "Seleziona un ambiente dalla planimetria." }
    : hasPendingObjectAssignment
      ? { label: "Associa un articolo all’elemento selezionato." }
      : !hasConfirmedView
        ? !isCameraMode && selection?.type !== "object"
          ? { label: "Seleziona un elemento e associa un articolo, oppure imposta la visuale." }
          : !isCameraMode
            ? { label: "Imposta la visuale dalla planimetria." }
            : { label: "Controlla e conferma la visuale." }
        : sceneValidation.errors.length > 0
          ? { label: "Controlla la configurazione." }
          : isRenderStale
            ? { label: "Aggiorna il render per applicare le modifiche." }
            : !imageUrl
              ? { label: "Aggiungi finiture e note facoltative, poi genera il render." }
              : { label: "Rivedi il render o modifica la configurazione." };
  return (
    <main className="studio-shell min-h-screen">
      <StudioHeader active="demo" />

      <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8 lg:pt-10">
        <section className="mb-8">
          <div className="flex justify-start">
            <div className="shrink-0 text-left">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-soft)]">Progetto</p>
              <p className="mt-1 text-sm font-medium text-[var(--text)]">{model.name}</p>
            </div>
          </div>
        </section>

        <nav aria-label="Passaggi di configurazione" className="panel mb-8 overflow-hidden rounded-2xl">
          <ol className="grid grid-cols-2 divide-x divide-y divide-[var(--border)] sm:grid-cols-5 sm:divide-y-0">
            {[
              [1, "Ambiente", "Seleziona l’ambiente"],
              [2, "Articoli", "Seleziona elementi e associa gli articoli"],
              [3, "Visuale", "Imposta e conferma la visuale"],
              [4, "Finiture e note", "Facoltative · aggiungi dettagli"],
              [5, "Render", "Genera il risultato"],
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
                  <p className="eyebrow mb-2">Indicazioni</p>
                  <h3 className="display-title text-2xl text-[var(--text)]">Imposta finiture e indicazioni.</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                    Inserisci colori, materiali, note e riferimenti agli articoli da usare nel render.
                  </p>
                </div>
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
                  <FinishField
                    id="finitura-pareti"
                    label="Pareti"
                    value={wallFinish}
                    onChange={setWallFinish}
                    placeholder="es. bianco caldo opaco"
                  />
                  <FinishField
                    id="finitura-pavimento"
                    label="Pavimento"
                    value={floorFinish}
                    onChange={setFloorFinish}
                    placeholder="es. rovere naturale"
                  />
                  <FinishField
                    id="finitura-porte"
                    label="Porte"
                    value={doorFinish}
                    onChange={setDoorFinish}
                    placeholder="es. porte laccate bianche"
                  />
                  <FinishField
                    id="finitura-finestre"
                    label="Finestre"
                    value={windowFinish}
                    onChange={setWindowFinish}
                    placeholder="es. infissi in legno naturale"
                  />
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

              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="primary-action mt-6 flex w-full items-center justify-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold"
              >
                <span aria-hidden="true">{isGenerating ? "···" : "→"}</span>
                {isGenerating ? "Generazione in corso…" : "Genera render"}
              </button>
              <Link
                href="/listini"
                className="ghost-action mt-3 flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold"
              >
                Preventivo
              </Link>
            </section>
            </div>

            {/* MODULO PLANIMETRIA — solo piantina centrale */}
            <div className="order-1">
              <section id="piantina" className="panel rounded-2xl p-5 sm:p-6">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow mb-2">Piantina</p>
                <h3 className="display-title text-2xl text-[var(--text)]">Seleziona ambiente e arredi.</h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Seleziona prima un ambiente. Poi scegli gli elementi, associa gli articoli dal catalogo e imposta la visuale.
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
                  cameraAttentionTarget={cameraAttentionTarget}
                />

              </section>
            </div>
          </div>

          <div className="contents lg:col-start-2 lg:row-start-1 lg:flex lg:flex-col lg:gap-6 lg:self-start lg:sticky lg:top-24">
            <div className="order-4">
              <SceneStatus
                roomName={activeRoom?.name ?? null}
                camera={camera}
                isCameraConfirmed={isCameraConfirmed}
                isCameraMode={isCameraMode}
                assignedCount={activeRoomAssignmentCount}
                wallFinish={wallFinish}
                floorFinish={floorFinish}
                doorFinish={doorFinish}
                windowFinish={windowFinish}
                prompt={prompt}
                renderStale={isRenderStale}
                errors={sceneValidation.errors}
                onConfirmCamera={handleConfirmCamera}
                cameraAttentionTarget={cameraAttentionTarget}
                nextAction={nextAction}
              />
            </div>
            <aside id="risultato" className="order-5">
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

      </div>

      <footer className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2 border-t border-[var(--border)] py-6 text-xs text-[var(--text-soft)] sm:flex-row sm:items-center sm:justify-between">
          <p>Progetto demo · Casa privata</p>
          <a
            href="https://www.ordyto.it"
            target="_blank"
            rel="noreferrer"
            className="font-semibold transition-colors hover:text-[var(--text)]"
          >
            Powered by Ordyto
          </a>
        </div>
      </footer>
    </main>
  );
}
