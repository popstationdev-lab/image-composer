import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, RefreshCw } from "lucide-react";
import { PromptBuilder, PromptParams } from "./PromptBuilder";
import type { GenerationResult } from "./ResultViewer";

interface UpdateModalProps {
  open: boolean;
  onClose: () => void;
  original: GenerationResult;
  initialParams: PromptParams;
  onSubmit: (params: PromptParams) => void;
}

export function UpdateModal({ open, onClose, original, initialParams, onSubmit }: UpdateModalProps) {
  const [params, setParams] = useState<PromptParams>(initialParams);

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/70 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-2xl mx-auto bg-surface-1 rounded-2xl border border-border shadow-modal z-50 max-h-[85vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
              <div>
                <h2 className="text-base font-semibold text-foreground">Update Generation</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Adjust settings and re-run</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Original thumbnail */}
              <div className="px-6 pt-4 pb-3 border-b border-border">
                <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-2 block">Original Output</span>
                <div className="flex gap-3 items-start">
                  <img
                    src={original.outputs[0]?.url}
                    alt="Original"
                    className="w-20 h-20 rounded-lg object-cover border border-border flex-shrink-0"
                  />
                  <p className="text-xs font-mono text-foreground/60 leading-relaxed line-clamp-4">{original.prompt}</p>
                </div>
              </div>

              {/* Prompt builder */}
              <div className="px-6 py-5">
                <PromptBuilder params={params} onChange={setParams} />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border flex-shrink-0">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg bg-surface-2 border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { onSubmit(params); onClose(); }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity shadow-cyan"
              >
                <RefreshCw className="w-4 h-4" />
                Re-generate
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
