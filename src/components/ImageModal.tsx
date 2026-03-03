import { motion, AnimatePresence } from "framer-motion";
import { X, Download, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { BlurredImage } from "./ui/BlurredImage";

interface ImageModalProps {
    isOpen: boolean;
    onClose: () => void;
    imageUrl: string;
    title?: string;
}

export function ImageModal({ isOpen, onClose, imageUrl, title }: ImageModalProps) {
    const [zoom, setZoom] = useState(false);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                />

                {/* Modal Content */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="relative w-full max-w-6xl h-full max-h-[90vh] bg-surface-1 rounded-2xl border border-border shadow-modal flex flex-col overflow-hidden pointer-events-auto"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-2/50 backdrop-blur-sm z-10">
                        <div className="flex flex-col">
                            {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setZoom(!zoom)}
                                className="w-9 h-9 rounded-lg bg-surface-2 border border-border flex items-center justify-center text-foreground hover:bg-surface-3 transition-colors"
                                title={zoom ? "Zoom Out" : "Zoom In"}
                            >
                                {zoom ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
                            </button>
                            <a
                                href={imageUrl}
                                download
                                className="w-9 h-9 rounded-lg bg-surface-2 border border-border flex items-center justify-center text-foreground hover:bg-surface-3 transition-colors"
                                title="Download"
                            >
                                <Download className="w-4 h-4" />
                            </a>
                            <button
                                onClick={onClose}
                                className="w-9 h-9 rounded-lg bg-surface-2 border border-border flex items-center justify-center text-foreground hover:bg-surface-3 transition-colors"
                                title="Close"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Image Container */}
                    <div
                        className={cn(
                            "flex-1 w-full flex items-center justify-center overflow-auto no-scrollbar p-6 bg-black/10",
                            zoom ? "cursor-zoom-out" : "cursor-zoom-in"
                        )}
                        onClick={() => setZoom(!zoom)}
                    >
                        <BlurredImage
                            src={imageUrl}
                            alt={title || "Image Preview"}
                            containerClassName={cn(
                                "transition-all duration-300 rounded-lg shadow-2xl",
                                zoom ? "min-w-full min-h-full" : "w-full h-full"
                            )}
                            className="w-full h-full object-contain"
                        />
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
