import { motion, AnimatePresence } from "framer-motion";
import { X, Download, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

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
                    className="absolute inset-0 bg-background/90 backdrop-blur-md"
                />

                {/* Modal Content */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="relative w-full max-w-5xl h-full flex flex-col items-center justify-center pointer-events-none"
                >
                    {/* Header */}
                    <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 pointer-events-auto">
                        <div className="flex flex-col">
                            {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setZoom(!zoom)}
                                className="w-10 h-10 rounded-full bg-surface-2/80 border border-border flex items-center justify-center text-foreground hover:bg-surface-3 transition-colors backdrop-blur-sm"
                                title={zoom ? "Zoom Out" : "Zoom In"}
                            >
                                {zoom ? <ZoomOut className="w-5 h-5" /> : <ZoomIn className="w-5 h-5" />}
                            </button>
                            <a
                                href={imageUrl}
                                download
                                className="w-10 h-10 rounded-full bg-surface-2/80 border border-border flex items-center justify-center text-foreground hover:bg-surface-3 transition-colors backdrop-blur-sm"
                                title="Download"
                            >
                                <Download className="w-5 h-5" />
                            </a>
                            <button
                                onClick={onClose}
                                className="w-10 h-10 rounded-full bg-surface-2/80 border border-border flex items-center justify-center text-foreground hover:bg-surface-3 transition-colors backdrop-blur-sm"
                                title="Close"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Image Container */}
                    <div
                        className={cn(
                            "w-full h-full flex items-center justify-center overflow-auto pointer-events-auto no-scrollbar",
                            zoom ? "cursor-zoom-out" : "cursor-zoom-in"
                        )}
                        onClick={() => setZoom(!zoom)}
                    >
                        <img
                            src={imageUrl}
                            alt={title || "Image Preview"}
                            className={cn(
                                "transition-all duration-300 rounded-lg shadow-2xl",
                                zoom ? "min-w-full object-contain" : "max-w-full max-h-full object-contain"
                            )}
                        />
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
