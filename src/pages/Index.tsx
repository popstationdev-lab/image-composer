import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, History, Upload, Wand2, ChevronRight, ChevronLeft, AlertTriangle, Plus, X } from "lucide-react";
import { UploadZone, UploadedFile } from "@/components/UploadZone";
import { PromptBuilder, PromptParams, assemblePrompt } from "@/components/PromptBuilder";
import { ProcessingView, GenerationStatus } from "@/components/ProcessingView";
import { ResultViewer, GenerationResult } from "@/components/ResultViewer";
import { HistoryPanel, HistoryItem } from "@/components/HistoryPanel";
import { UpdateModal } from "@/components/UpdateModal";
import { cn } from "@/lib/utils";
import {
  uploadAssets,
  generate,
  getGeneration,
  updateGeneration,
  deleteGeneration,
  getHistory,
  getDownloadUrl,
  getSessionId,
  type GenerationRecord,
  type HistoryItem as ApiHistoryItem,
} from "@/lib/api";
import { toast } from "sonner";

type AppStep = "upload" | "prompt" | "processing" | "result";

const defaultParams: PromptParams = {
  preserveHead: true,
  preserveOtherGarments: false,
  view: "front",
  fitStrictness: 50,
  shadowEnforcement: true,
  shadowLevel: "medium",
  framing: "preserve",
  resolution: "4k",
  variations: 1,
  quality: "balanced",
  customPrompt: "",
};

function StepIndicator({ step }: { step: AppStep }) {
  const steps: { key: AppStep; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "prompt", label: "Prompt" },
    { key: "processing", label: "Generate" },
    { key: "result", label: "Result" },
  ];
  const currentIdx = steps.findIndex((s) => s.key === step);

  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1">
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all",
            i === currentIdx
              ? "bg-primary/15 text-primary border border-primary/30"
              : i < currentIdx
                ? "text-muted-foreground"
                : "text-muted-foreground/40"
          )}>
            <span className={cn(
              "w-4 h-4 rounded-full flex items-center justify-center text-xs",
              i < currentIdx ? "bg-primary/20 text-primary" : ""
            )}>
              {i < currentIdx ? "✓" : i + 1}
            </span>
            <span className="hidden sm:block">{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <ChevronRight className={cn("w-3 h-3", i < currentIdx ? "text-muted-foreground" : "text-muted-foreground/20")} />
          )}
        </div>
      ))}
    </div>
  );
}

/** Convert API GenerationRecord to the shape ResultViewer expects */
function toGenerationResult(gen: GenerationRecord): GenerationResult {
  return {
    id: gen.id,
    outputs: gen.outputs.map((o) => ({
      id: o.id,
      url: o.url ?? "",
      thumbnailUrl: o.url ?? undefined,
      width: o.width ?? undefined,
      height: o.height ?? undefined,
    })),
    prompt: gen.prompt,
    params: gen.params as Record<string, unknown>,
    createdAt: gen.createdAt,
    nanoBananaResponseId: (gen.kieTaskIds ?? []).join(", "),
  };
}

/** Convert API HistoryItem to the local HistoryPanel shape */
function toHistoryItem(item: ApiHistoryItem, result?: GenerationResult): HistoryItem {
  return {
    id: item.id,
    thumbnailUrl: item.thumbnailUrl ?? "",
    shortPrompt: item.shortPrompt,
    createdAt: item.createdAt,
    expiresAt: item.expiresAt,
    result,
  };
}

const POLL_INTERVAL_MS = 3000;

export default function Index() {
  const [step, setStep] = useState<AppStep>("upload");

  // Upload state
  const [modelImage, setModelImage] = useState<UploadedFile | null>(null);
  const [garmentImage, setGarmentImage] = useState<UploadedFile | null>(null);
  const [fabricImage, setFabricImage] = useState<UploadedFile | null>(null);
  const [styleRefs, setStyleRefs] = useState<UploadedFile[]>([]);

  // Uploaded asset IDs from the backend
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // Prompt/generation state
  const [params, setParams] = useState<PromptParams>(defaultParams);
  const [genStatus, setGenStatus] = useState<GenerationStatus>("queued");
  const [elapsed, setElapsed] = useState(0);
  const [currentGenerationId, setCurrentGenerationId] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);

  // History
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Update modal
  const [updateTarget, setUpdateTarget] = useState<GenerationResult | null>(null);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);

  // Refs for polling and timer
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  // ─── Persist params ───────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem("composit-params");
    if (saved) { try { setParams(JSON.parse(saved)); } catch { /* ignore */ } }
  }, []);

  useEffect(() => {
    localStorage.setItem("composit-params", JSON.stringify(params));
  }, [params]);

  // ─── Ensure session exists on mount ───────────────────────────────────────
  useEffect(() => { getSessionId(); }, []);

  // ─── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const canProceedToPrompt = modelImage && !modelImage.error && garmentImage && !garmentImage.error;

  // ─── Step 1→2: Upload assets to backend ───────────────────────────────────
  const handleContinueToPrompt = async () => {
    if (!modelImage?.file || !garmentImage?.file) return;
    setUploading(true);

    try {
      const res = await uploadAssets({
        modelImage: modelImage.file,
        garmentImage: garmentImage.file,
        fabricImage: fabricImage?.file ?? null,
        styleRefs: styleRefs.map((s) => s.file),
      });
      setAssetIds(res.assets.map((a) => a.id));

      // Show any dimension warnings
      const warned = res.assets.filter((a) => a.warning);
      if (warned.length > 0) {
        toast.warning(warned.map((a) => `${a.role}: ${a.warning}`).join("\n"));
      }

      setStep("prompt");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  // ─── Step 2→3: Submit generation ─────────────────────────────────────────
  const handleGenerate = useCallback(async (overrideParams?: PromptParams, overrideAssetIds?: string[]) => {
    const activeParams = overrideParams ?? params;
    const activeAssets = overrideAssetIds ?? assetIds;
    const prompt = activeParams.customPrompt || assemblePrompt(activeParams);

    setStep("processing");
    setGenStatus("queued");
    setElapsed(0);
    cancelledRef.current = false;

    // Start elapsed timer
    elapsedRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

    try {
      const { generationId } = await generate({
        assetIds: activeAssets,
        prompt,
        params: activeParams,
      });

      setCurrentGenerationId(generationId);
      setGenStatus("processing");

      // ─── Poll every 3s until terminal state ───────────────────────────────
      pollRef.current = setInterval(async () => {
        if (cancelledRef.current) return;

        try {
          const gen = await getGeneration(generationId);

          if (gen.status === "processing") {
            setGenStatus("processing");
          }

          if (gen.status === "completed" || gen.status === "failed") {
            clearInterval(pollRef.current!);
            clearInterval(elapsedRef.current!);

            if (gen.status === "failed") {
              setGenStatus("done"); // ProcessingView doesn't have an "error" state
              toast.error(`Generation failed: ${gen.failureReason ?? "Unknown error"}`);
              setStep("prompt");
              return;
            }

            const genResult = toGenerationResult(gen);
            setResult(genResult);
            setGenStatus("done");
            setStep("result");

            // Add to history
            const historyItem = toHistoryItem(
              {
                id: gen.id,
                status: gen.status,
                prompt: gen.prompt,
                shortPrompt: gen.prompt.slice(0, 120),
                params: gen.params,
                parentGenerationId: gen.parentGenerationId,
                createdAt: gen.createdAt,
                completedAt: gen.completedAt,
                expiresAt: new Date(
                  new Date(gen.createdAt).getTime() + 24 * 24 * 60 * 60 * 1000
                ).toISOString(),
                thumbnailUrl: gen.outputs[0]?.url ?? null,
                outputCount: gen.outputs.length,
              },
              genResult
            );
            setHistory((h) => [historyItem, ...h.filter((i) => i.id !== gen.id)]);
          }
        } catch {
          // Non-fatal — polling errors are transient
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      clearInterval(elapsedRef.current!);
      toast.error(err instanceof Error ? err.message : "Generation failed to start");
      setStep("prompt");
    }
  }, [params, assetIds]);

  // ─── Cancel processing ────────────────────────────────────────────────────
  const handleCancel = () => {
    cancelledRef.current = true;
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    setStep("prompt");
    setGenStatus("queued");
  };

  // ─── Update (re-generate with new params) ────────────────────────────────
  const handleUpdate = (res: GenerationResult) => {
    setUpdateTarget(res);
    setUpdateModalOpen(true);
  };

  const handleUpdateSubmit = async (newParams: PromptParams) => {
    setParams(newParams);
    setUpdateModalOpen(false);
    setUpdateTarget(null);

    if (!updateTarget) return;

    // Re-use same assets; create a child generation
    try {
      const prompt = newParams.customPrompt || assemblePrompt(newParams);
      const { generationId } = await updateGeneration(updateTarget.id, {
        prompt,
        params: newParams,
        assetIds,
      });

      setCurrentGenerationId(generationId);
      setStep("processing");
      setGenStatus("queued");
      setElapsed(0);
      cancelledRef.current = false;

      elapsedRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      setGenStatus("processing");

      pollRef.current = setInterval(async () => {
        if (cancelledRef.current) return;
        try {
          const gen = await getGeneration(generationId);
          if (gen.status === "completed") {
            clearInterval(pollRef.current!);
            clearInterval(elapsedRef.current!);
            const genResult = toGenerationResult(gen);
            setResult(genResult);
            setGenStatus("done");
            setStep("result");
          } else if (gen.status === "failed") {
            clearInterval(pollRef.current!);
            clearInterval(elapsedRef.current!);
            toast.error(`Update failed: ${gen.failureReason ?? "Unknown error"}`);
            setStep("result");
          }
        } catch { /* transient */ }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  // ─── Download via blob (forces download) ────────────────────────────────
  const handleDownloadOutput = async (outputId: string, fallbackUrl?: string): Promise<string> => {
    try {
      const { url } = await getDownloadUrl(outputId);
      const response = await fetch(url);
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch (err) {
      console.error("Download failed:", err);
      return fallbackUrl ?? "";
    }
  };

  // ─── History Interactivity ────────────────────────────────────────────────
  // ─── History ──────────────────────────────────────────────────────────────
  const handleOpenHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const page = await getHistory(30);
      const items = page.items.map((item) => toHistoryItem(item));
      setHistory(items);
    } catch (err) {
      toast.error("Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleHistoryOpen = async (item: HistoryItem) => {
    setHistoryLoading(true);
    try {
      const fullGen = await getGeneration(item.id);

      // Populate results
      const genResult = toGenerationResult(fullGen);
      setResult(genResult);

      // Populate form details
      setParams(fullGen.params as unknown as PromptParams);

      // Populate asset IDs (so update works correctly)
      setAssetIds(fullGen.assets.map(a => a.id));

      // We don't have the original UploadedFile objects (previews/files), 
      // but we can at least set the IDs so the backend "update" works.
      // For a perfect UX, we'd need to fetch the assets to show previews.

      setStep("result");
      setHistoryOpen(false);
    } catch (err) {
      toast.error("Failed to load details");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDeleteHistory = async (id: string) => {
    setHistory((h) => h.filter((item) => item.id !== id));
    try { await deleteGeneration(id); } catch { /* soft-fail */ }
  };

  const addStyleRef = (file: UploadedFile | null) => {
    if (file && styleRefs.length < 3) {
      setStyleRefs((refs) => [...refs, file]);
    }
  };

  const handleNewComposition = () => {
    setStep("upload");
    setModelImage(null);
    setGarmentImage(null);
    setFabricImage(null);
    setStyleRefs([]);
    setAssetIds([]);
    setResult(null);
    setParams(defaultParams);
    setCurrentGenerationId(null);
  };

  const handleBackToPrompt = () => {
    setStep("prompt");
  };

  return (
    <div className="min-h-screen gradient-hero flex flex-col">
      {/* Header */}
      <header className="glass border-b border-border sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-cyan flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold text-foreground tracking-tight">Composit</span>
            <span className="hidden sm:block text-xs text-muted-foreground border border-border rounded-full px-2 py-0.5 font-mono">
              AI Fashion
            </span>
          </div>

          <StepIndicator step={step} />

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleOpenHistory}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden sm:block">History</span>
              {history.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-mono">
                  {history.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8">
        <AnimatePresence mode="wait">

          {/* ─── UPLOAD STEP ─── */}
          {step === "upload" && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
              className="flex flex-col gap-8"
            >
              <div className="text-center py-8">
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                  <h1 className="text-4xl sm:text-5xl font-bold text-gradient-cyan mb-3 tracking-tight leading-tight">
                    Product-on-Model<br />Imagery
                  </h1>
                  <p className="text-base text-muted-foreground max-w-md mx-auto">
                    Upload a model photo and garment source. Our AI composes a photo-realistic result in minutes.
                  </p>
                </motion.div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="rounded-2xl bg-surface-1 border border-border shadow-card p-6"
              >
                <div className="flex items-center gap-2 mb-5">
                  <Upload className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Upload Assets</h2>
                  <span className="ml-auto text-xs text-muted-foreground">JPG · PNG · HEIC · max 25MB</span>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 mb-4">
                  <UploadZone
                    label="Model Image"
                    required
                    description="Portrait or full-body photo of the model"
                    value={modelImage}
                    onChange={setModelImage}
                  />
                  <UploadZone
                    label="Garment Source"
                    required
                    description="Hanger, flat-lay, or worn garment photo"
                    value={garmentImage}
                    onChange={setGarmentImage}
                  />
                </div>

                <details className="group">
                  <summary className="cursor-pointer list-none flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3 select-none">
                    <Plus className="w-3.5 h-3.5 group-open:rotate-45 transition-transform" />
                    Optional references
                    <span className="text-xs text-muted-foreground/60">(fabric detail, style refs)</span>
                  </summary>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <UploadZone
                      label="Fabric Detail"
                      description="Close-up texture or fabric reference"
                      value={fabricImage}
                      onChange={setFabricImage}
                      compact
                    />
                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-foreground">Style References
                        <span className="text-xs text-muted-foreground ml-1.5">({styleRefs.length}/3)</span>
                      </span>
                      {styleRefs.length < 3 && (
                        <UploadZone label="" description="Mood or style inspiration" value={null} onChange={addStyleRef} compact />
                      )}
                      {styleRefs.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                          {styleRefs.map((ref, i) => (
                            <div key={ref.id} className="relative w-14 h-14 rounded-lg overflow-hidden border border-border">
                              <img src={ref.preview} alt="" className="w-full h-full object-cover" />
                              <button
                                onClick={() => setStyleRefs((r) => r.filter((_, j) => j !== i))}
                                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-background/80 flex items-center justify-center"
                              >
                                <X className="w-2.5 h-2.5 text-foreground" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </details>

                <p className="text-xs text-muted-foreground mt-5 pb-1 border-t border-border pt-4">
                  By uploading you confirm you have rights to edit and use these images.
                </p>
              </motion.div>

              <div className="flex justify-end">
                <button
                  onClick={handleContinueToPrompt}
                  disabled={!canProceedToPrompt || uploading}
                  className={cn(
                    "flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all",
                    canProceedToPrompt && !uploading
                      ? "bg-primary text-primary-foreground hover:opacity-90 shadow-cyan hover:shadow-cyan-lg"
                      : "bg-surface-2 border border-border text-muted-foreground cursor-not-allowed"
                  )}
                >
                  {uploading ? "Uploading…" : "Continue to Prompt"}
                  {!uploading && <ChevronRight className="w-4 h-4" />}
                </button>
              </div>
            </motion.div>
          )}

          {/* ─── PROMPT STEP ─── */}
          {step === "prompt" && (
            <motion.div
              key="prompt"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
            >
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 flex flex-col gap-4">
                  <div className="rounded-2xl bg-surface-1 border border-border shadow-card p-4 flex flex-col gap-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assets</h3>
                    {modelImage?.preview && (
                      <div>
                        <span className="text-xs text-muted-foreground mb-1 block">Model</span>
                        <img src={modelImage.preview} alt="Model" className="w-full h-32 object-cover rounded-lg border border-border" />
                      </div>
                    )}
                    {garmentImage?.preview && (
                      <div>
                        <span className="text-xs text-muted-foreground mb-1 block">Garment</span>
                        <img src={garmentImage.preview} alt="Garment" className="w-full h-32 object-cover rounded-lg border border-border" />
                      </div>
                    )}
                    {fabricImage?.preview && (
                      <div>
                        <span className="text-xs text-muted-foreground mb-1 block">Fabric</span>
                        <img src={fabricImage.preview} alt="Fabric" className="w-full h-20 object-cover rounded-lg border border-border" />
                      </div>
                    )}
                    <button
                      onClick={() => setStep("upload")}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors text-left mt-1"
                    >
                      ← Change assets
                    </button>
                  </div>

                  <div className="rounded-xl bg-surface-1 border border-border p-4">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Estimated Output</h3>
                    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Resolution</span>
                        <span className="font-mono text-foreground uppercase">{params.resolution}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Variations</span>
                        <span className="font-mono text-foreground">{params.variations}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Quality</span>
                        <span className="font-mono text-foreground capitalize">{params.quality}</span>
                      </div>
                      <div className="flex justify-between mt-1 pt-1 border-t border-border">
                        <span>Est. time</span>
                        <span className="font-mono text-primary">
                          ~{params.quality === "fast" ? "1-2" : params.quality === "balanced" ? "2-4" : "4-8"} min
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-2 flex flex-col gap-4">
                  <div className="rounded-2xl bg-surface-1 border border-border shadow-card p-6">
                    <div className="flex items-center gap-2 mb-5">
                      <Wand2 className="w-4 h-4 text-primary" />
                      <h2 className="text-sm font-semibold text-foreground">Prompt Builder</h2>
                    </div>
                    <PromptBuilder params={params} onChange={setParams} />
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <AlertTriangle className="w-3.5 h-3.5 text-gold" />
                      Outputs will expire after 24 days
                    </div>
                    <button
                      onClick={() => handleGenerate()}
                      className="flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 shadow-cyan hover:shadow-cyan-lg transition-all"
                    >
                      <Sparkles className="w-4 h-4" />
                      Generate
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── PROCESSING STEP ─── */}
          {step === "processing" && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
              className="rounded-2xl bg-surface-1 border border-border shadow-card"
            >
              <ProcessingView
                status={genStatus}
                estimatedSeconds={params.quality === "fast" ? 90 : params.quality === "balanced" ? 180 : 360}
                elapsedSeconds={elapsed}
                onCancel={handleCancel}
              />
            </motion.div>
          )}

          {/* ─── RESULT STEP ─── */}
          {step === "result" && result && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
              className="flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Result</h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleBackToPrompt}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Back to prompt
                  </button>
                  <div className="w-px h-3 bg-border" />
                  <button
                    onClick={handleNewComposition}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5 rotate-45" />
                    New composition
                  </button>
                </div>
              </div>

              <div className="rounded-2xl bg-surface-1 border border-border shadow-card p-6">
                <ResultViewer
                  result={result}
                  onUpdate={handleUpdate}
                  onDownloadOutput={handleDownloadOutput}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* History panel */}
      <HistoryPanel
        items={history}
        onOpen={handleHistoryOpen}
        onUpdate={(item) => item.result && handleUpdate(item.result)}
        onDelete={handleDeleteHistory}
        onClear={() => setHistory([])}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        loading={historyLoading}
      />

      {/* Update modal */}
      {updateTarget && (
        <UpdateModal
          open={updateModalOpen}
          onClose={() => { setUpdateModalOpen(false); setUpdateTarget(null); }}
          original={updateTarget}
          initialParams={params}
          onSubmit={handleUpdateSubmit}
        />
      )}
    </div>
  );
}
