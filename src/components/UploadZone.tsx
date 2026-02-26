import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, ImageIcon, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadedFile {
  id: string;
  file: File;
  preview: string;
  width?: number;
  height?: number;
  error?: string;
  warning?: string;
}

interface UploadZoneProps {
  label: string;
  required?: boolean;
  description?: string;
  value?: UploadedFile | null;
  onChange: (file: UploadedFile | null) => void;
  className?: string;
  compact?: boolean;
}

const MAX_SIZE_MB = 25;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"];

function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type) && !file.name.toLowerCase().endsWith(".heic")) {
    return "Format not supported. Use JPG, PNG, WEBP, or HEIC.";
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return `File too large. Max ${MAX_SIZE_MB}MB allowed.`;
  }
  return null;
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export function UploadZone({ label, required, description, value, onChange, className, compact }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    const error = validateFile(file);
    const preview = error ? "" : URL.createObjectURL(file);
    const id = crypto.randomUUID();

    if (!error) {
      const { width, height } = await getImageDimensions(file);
      const shortSide = Math.min(width, height);
      const dimensionWarning = shortSide > 0 && shortSide < 1600
        ? `Shortest side is ${shortSide}px — recommended ≥1600px for best quality.`
        : undefined;
      onChange({ id, file, preview, width, height, warning: dimensionWarning });
    } else {
      onChange({ id, file, preview: "", error });
    }
  }, [onChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {required && <span className="text-xs text-primary font-mono">*</span>}
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}

      <AnimatePresence mode="wait">
        {value && !value.error ? (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "relative rounded-xl overflow-hidden border border-border group",
              !compact && "min-h-[12rem] max-h-[24rem]",
              compact && "min-h-[8rem] max-h-[16rem]"
            )}
            style={{
              aspectRatio: value.width && value.height ? `${value.width} / ${value.height}` : undefined
            }}
          >
            <img
              src={value.preview}
              alt={label}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                onClick={() => inputRef.current?.click()}
                className="text-xs text-foreground bg-secondary border border-border px-3 py-1.5 rounded-lg hover:bg-surface-3 transition-colors"
              >
                Replace
              </button>
              <button
                onClick={() => onChange(null)}
                className="text-xs text-destructive bg-destructive/10 border border-destructive/30 px-3 py-1.5 rounded-lg hover:bg-destructive/20 transition-colors"
              >
                Remove
              </button>
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/90 to-transparent px-3 py-2">
              {value.width && (
                <span className="text-xs font-mono text-muted-foreground">
                  {value.width} × {value.height}px
                </span>
              )}
            </div>
            <div className="absolute top-2 right-2">
              <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              </div>
            </div>
            {value.warning && (
              <div className="absolute top-2 left-2 bg-gold/20 border border-gold/40 rounded-lg px-2 py-1 flex items-center gap-1.5 backdrop-blur-sm">
                <AlertCircle className="w-3 h-3 text-gold" />
                <span className="text-xs text-gold font-medium">{value.warning}</span>
              </div>
            )}
            {value.error && (
              <div className="absolute top-2 left-2 bg-destructive/20 border border-destructive/40 rounded-lg px-2 py-1 flex items-center gap-1.5 backdrop-blur-sm">
                <AlertCircle className="w-3 h-3 text-destructive" />
                <span className="text-xs text-destructive font-medium">{value.error}</span>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={cn(
              "upload-zone rounded-xl cursor-pointer flex flex-col items-center justify-center gap-2 transition-all",
              compact ? "h-32" : "h-48",
              dragging && "dragging"
            )}
          >
            <motion.div
              animate={dragging ? { scale: 1.15 } : { scale: 1 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center"
            >
              <ImageIcon className="w-5 h-5 text-muted-foreground" />
            </motion.div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                <span className="text-primary font-medium">Click to upload</span> or drag & drop
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG, HEIC · max 25MB</p>
            </div>
            {value?.error && (
              <div className="flex items-center gap-1.5 text-destructive">
                <AlertCircle className="w-3.5 h-3.5" />
                <span className="text-xs">{value.error}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.heic,.heif,.webp"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}

export type { UploadedFile };
