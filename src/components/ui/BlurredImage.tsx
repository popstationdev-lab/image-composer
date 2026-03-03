import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface BlurredImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    containerClassName?: string;
}

export function BlurredImage({ src, alt, className, containerClassName, ...props }: BlurredImageProps) {
    const [isLoading, setIsLoading] = useState(true);

    return (
        <div className={cn("relative overflow-hidden bg-surface-2", containerClassName)}>
            <AnimatePresence>
                {isLoading && (
                    <motion.div
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-10 flex items-center justify-center bg-surface-2/80 backdrop-blur-md"
                    >
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    </motion.div>
                )}
            </AnimatePresence>

            <img
                src={src}
                alt={alt}
                className={cn(
                    "transition-all duration-700",
                    isLoading ? "scale-105 blur-lg opacity-50" : "scale-100 blur-0 opacity-100",
                    className
                )}
                onLoad={() => setIsLoading(false)}
                {...props}
            />
        </div>
    );
}
