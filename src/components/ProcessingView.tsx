import { motion } from "framer-motion";
import { Loader2, X, Clock, Cpu, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type GenerationStatus = "queued" | "processing" | "done" | "error";

interface ProcessingViewProps {
  status: GenerationStatus;
  estimatedSeconds?: number;
  elapsedSeconds?: number;
  onCancel?: () => void;
  error?: string;
  onRetry?: () => void;
}

const statusConfig = {
  queued: {
    label: "Queued",
    sublabel: "Waiting for available worker...",
    icon: Clock,
    dotClass: "queued",
  },
  processing: {
    label: "Processing",
    sublabel: "Generating your composition...",
    icon: Cpu,
    dotClass: "processing",
  },
  done: {
    label: "Complete",
    sublabel: "Your image is ready.",
    icon: CheckCircle2,
    dotClass: "done",
  },
  error: {
    label: "Error",
    sublabel: "Something went wrong.",
    icon: X,
    dotClass: "error",
  },
};

const steps = [
  { key: "queued", label: "Queued" },
  { key: "processing", label: "Processing" },
  { key: "done", label: "Complete" },
];

const stepIndex = (s: GenerationStatus) => {
  if (s === "error") return -1;
  return steps.findIndex((x) => x.key === s);
};

export function ProcessingView({ status, estimatedSeconds, elapsedSeconds = 0, onCancel, error, onRetry }: ProcessingViewProps) {
  const cfg = statusConfig[status];
  const Icon = cfg.icon;
  const currentStep = stepIndex(status);

  const progressPct = status === "done" ? 100
    : status === "processing" && estimatedSeconds
      ? Math.min(95, (elapsedSeconds / estimatedSeconds) * 100)
      : status === "queued" ? 5
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="flex flex-col items-center gap-8 py-12 px-6"
    >
      {/* Status icon */}
      <div className="relative">
        {status === "processing" && (
          <motion.div
            className="absolute inset-0 rounded-full border border-primary/30"
            animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
        <div className={cn(
          "w-20 h-20 rounded-full flex items-center justify-center border",
          status === "done" ? "bg-primary/10 border-primary/40" :
          status === "error" ? "bg-destructive/10 border-destructive/40" :
          "bg-surface-2 border-border"
        )}>
          {status === "processing" ? (
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          ) : (
            <Icon className={cn(
              "w-8 h-8",
              status === "done" ? "text-primary" :
              status === "error" ? "text-destructive" :
              "text-muted-foreground"
            )} />
          )}
        </div>
      </div>

      {/* Status text */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <div className={cn("status-dot", cfg.dotClass)} />
          <span className="text-lg font-semibold text-foreground">{cfg.label}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {error || cfg.sublabel}
        </p>
        {estimatedSeconds && status === "processing" && (
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            ~{Math.max(0, estimatedSeconds - elapsedSeconds)}s remaining
          </p>
        )}
      </div>

      {/* Progress bar */}
      {status !== "error" && (
        <div className="w-full max-w-sm">
          <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-cyan"
              initial={{ width: "0%" }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.8, ease: "easeInOut" }}
            />
          </div>
          <div className="flex justify-between mt-2">
            {steps.map((step, i) => (
              <div key={step.key} className="flex flex-col items-center gap-1">
                <div className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  i <= currentStep ? "bg-primary" : "bg-surface-3"
                )} />
                <span className={cn(
                  "text-xs transition-colors",
                  i <= currentStep ? "text-primary" : "text-muted-foreground"
                )}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skeleton placeholders */}
      {status === "processing" && (
        <div className="w-full max-w-sm grid grid-cols-3 gap-3">
          {[1, 2, 3].slice(0, 1).map((i) => (
            <div key={i} className="col-span-3 h-48 rounded-xl skeleton" />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {status === "error" && onRetry && (
          <button
            onClick={onRetry}
            className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Retry
          </button>
        )}
        {(status === "queued" || status === "processing") && onCancel && (
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-lg bg-surface-2 border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </motion.div>
  );
}
