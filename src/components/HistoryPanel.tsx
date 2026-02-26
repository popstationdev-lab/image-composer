import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, RefreshCw, Trash2, Download, Clock, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GenerationResult } from "./ResultViewer";

export interface HistoryItem {
  id: string;
  thumbnailUrl: string;
  shortPrompt: string;
  createdAt: string;
  expiresAt: string;
  result?: GenerationResult;
}

interface HistoryPanelProps {
  items: HistoryItem[];
  onOpen: (item: HistoryItem) => void;
  onUpdate: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  open: boolean;
  onClose: () => void;
  loading?: boolean;
}

function daysUntil(dateStr: string): number {
  const now = new Date().getTime();
  const exp = new Date(dateStr).getTime();
  return Math.max(0, Math.ceil((exp - now) / (1000 * 60 * 60 * 24)));
}

function timeAgo(dateStr: string): string {
  const now = new Date().getTime();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function HistoryPanel({ items, onOpen, onUpdate, onDelete, onClear, open, onClose, loading }: HistoryPanelProps) {
  const [confirmClear, setConfirmClear] = useState(false);

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
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40"
          />
          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-surface-1 border-l border-border z-50 flex flex-col shadow-modal"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="text-base font-semibold text-foreground">History</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{items.length} generations · 24-day retention</p>
              </div>
              <div className="flex items-center gap-2">
                {items.length > 0 && (
                  <button
                    onClick={() => setConfirmClear(!confirmClear)}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-lg hover:bg-destructive/10"
                  >
                    Clear all
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Confirm clear */}
            <AnimatePresence>
              {confirmClear && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-5 py-3 bg-destructive/10 border-b border-destructive/20"
                >
                  <p className="text-sm text-destructive mb-2">Clear all history? This cannot be undone.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { onClear(); setConfirmClear(false); }}
                      className="px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-medium"
                    >
                      Clear all
                    </button>
                    <button
                      onClick={() => setConfirmClear(false)}
                      className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-xs text-muted-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                  <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <p className="text-xs text-muted-foreground">Loading history…</p>
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                  <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border flex items-center justify-center">
                    <Clock className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">No history yet</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Generated images will appear here</p>
                  </div>
                </div>
              ) : (
                items.map((item, i) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex gap-3 p-3 rounded-xl bg-surface-2 border border-border hover:border-border/80 group"
                  >
                    {/* Thumbnail */}
                    <div
                      className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer"
                      onClick={() => onOpen(item)}
                    >
                      <img
                        src={item.thumbnailUrl}
                        alt="Generation thumbnail"
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-xs font-mono text-foreground/70 line-clamp-2 cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => onOpen(item)}
                      >
                        {item.shortPrompt}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs text-muted-foreground">{timeAgo(item.createdAt)}</span>
                        <span className={cn(
                          "text-xs font-mono",
                          daysUntil(item.expiresAt) <= 3 ? "text-gold" : "text-muted-foreground"
                        )}>
                          · {daysUntil(item.expiresAt)}d left
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => onOpen(item)}
                          className="p-1.5 rounded-md bg-surface-3 text-muted-foreground hover:text-foreground transition-colors"
                          title="Open"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onUpdate(item)}
                          className="p-1.5 rounded-md bg-surface-3 text-muted-foreground hover:text-foreground transition-colors"
                          title="Update"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onDelete(item.id)}
                          className="p-1.5 rounded-md bg-surface-3 text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
