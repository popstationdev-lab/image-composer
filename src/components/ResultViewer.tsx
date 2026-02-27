import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Download, RefreshCw, Eye, ChevronLeft, ChevronRight, SplitSquareHorizontal, Clock, Info, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageModal } from "./ImageModal";

export interface GenerationOutput {
  id: string;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
}

export interface GenerationResult {
  id: string;
  outputs: GenerationOutput[];
  prompt: string;
  params: Record<string, unknown>;
  createdAt: string;
  modelImageUrl?: string;
  nanoBananaResponseId?: string;
}

interface ResultViewerProps {
  result: GenerationResult;
  onUpdate: (result: GenerationResult) => void;
  onDownloadOutput?: (outputId: string, fallbackUrl?: string) => Promise<string>;
}

function BeforeAfterSlider({ beforeUrl, afterUrl }: { beforeUrl: string; afterUrl: string }) {
  const [split, setSplit] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleMove = (clientX: number) => {
    if (!containerRef.current || !dragging.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.max(5, Math.min(95, ((clientX - rect.left) / rect.width) * 100));
    setSplit(pct);
  };

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl overflow-hidden select-none cursor-col-resize h-80"
      onMouseMove={(e) => handleMove(e.clientX)}
      onMouseUp={() => { dragging.current = false; }}
      onMouseLeave={() => { dragging.current = false; }}
      onTouchMove={(e) => handleMove(e.touches[0].clientX)}
      onTouchEnd={() => { dragging.current = false; }}
    >
      {/* After (bottom layer) */}
      <img src={afterUrl} alt="After" className="absolute inset-0 w-full h-full object-cover" />
      {/* Before (clipped) */}
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${split}%` }}>
        <img src={beforeUrl} alt="Before" className="absolute inset-0 w-full h-full object-cover" style={{ width: `${100 / (split / 100)}%` }} />
      </div>
      {/* Divider */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-foreground/60"
        style={{ left: `${split}%` }}
        onMouseDown={(e) => { e.preventDefault(); dragging.current = true; }}
        onTouchStart={() => { dragging.current = true; }}
      >
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-foreground border-2 border-background flex items-center justify-center shadow-lg">
          <ChevronLeft className="w-3 h-3 text-background absolute -translate-x-1" />
          <ChevronRight className="w-3 h-3 text-background absolute translate-x-1" />
        </div>
      </div>
      {/* Labels */}
      <div className="absolute bottom-3 left-3">
        <span className="text-xs px-2 py-1 rounded-md bg-background/80 text-foreground font-medium">Before</span>
      </div>
      <div className="absolute bottom-3 right-3">
        <span className="text-xs px-2 py-1 rounded-md bg-background/80 text-foreground font-medium">After</span>
      </div>
    </div>
  );
}

export function ResultViewer({ result, onUpdate, onDownloadOutput }: ResultViewerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showCompare, setShowCompare] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const selected = result.outputs[selectedIndex];

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const url = onDownloadOutput
        ? await onDownloadOutput(selected.id, selected.url)
        : selected.url;
      const a = document.createElement("a");
      a.href = url;
      a.download = `composit-${result.id}-${selectedIndex + 1}.jpg`;
      a.click();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col gap-4"
    >
      {/* Main image */}
      <div className="relative rounded-xl overflow-hidden bg-surface-2 border border-border group">
        {showCompare && result.modelImageUrl ? (
          <BeforeAfterSlider beforeUrl={result.modelImageUrl} afterUrl={selected.url} />
        ) : (
          <motion.img
            key={selected.url}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            src={selected.url}
            alt="Generated output"
            className="w-full object-contain max-h-[520px] cursor-pointer"
            onClick={() => setShowModal(true)}
          />
        )}

        {/* Overlay actions */}
        <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setShowModal(true)}
            className="w-8 h-8 rounded-lg bg-background/80 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className={cn(
              "w-8 h-8 rounded-lg border flex items-center justify-center transition-colors",
              showInfo
                ? "bg-primary/20 border-primary/40 text-primary"
                : "bg-background/80 border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <Info className="w-4 h-4" />
          </button>
          {result.modelImageUrl && (
            <button
              onClick={() => setShowCompare(!showCompare)}
              className={cn(
                "w-8 h-8 rounded-lg border flex items-center justify-center transition-colors",
                showCompare
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "bg-background/80 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <SplitSquareHorizontal className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {showModal && (
        <ImageModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          imageUrl={selected.url}
          title={`Generation Result - Variation ${selectedIndex + 1}`}
        />
      )}

      {/* Thumbnails for variations */}
      {result.outputs.length > 1 && (
        <div className="flex gap-2">
          {result.outputs.map((output, i) => (
            <button
              key={output.id}
              onClick={() => setSelectedIndex(i)}
              className={cn(
                "flex-1 h-20 rounded-lg overflow-hidden border transition-all",
                i === selectedIndex ? "border-primary shadow-cyan" : "border-border opacity-60 hover:opacity-80"
              )}
            >
              <img src={output.url} alt={`Variation ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Info panel */}
      {showInfo && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="rounded-xl border border-border bg-surface-1 p-4"
        >
          <div className="flex flex-col gap-3">
            <div>
              <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Prompt</span>
              <p className="text-xs font-mono text-foreground/70 mt-1 leading-relaxed">{result.prompt}</p>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                {new Date(result.createdAt).toLocaleString()}
              </span>
              {result.nanoBananaResponseId && (
                <span className="font-mono">ID: {result.nanoBananaResponseId}</span>
              )}
              {selected.width && (
                <span className="font-mono">{selected.width} × {selected.height}px</span>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-all",
            downloading ? "opacity-75 cursor-wait" : "hover:opacity-90"
          )}
        >
          {downloading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {downloading ? "Downloading..." : "Download"}
        </button>
        <button
          onClick={() => onUpdate(result)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-surface-2 border border-border text-sm text-foreground hover:bg-surface-3 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Update
        </button>
      </div>
    </motion.div>
  );
}
