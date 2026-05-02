import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, RefreshCw, Sparkles } from 'lucide-react';

interface UpdateBannerProps {
    available: boolean;
    version: string | null;
    downloading: boolean;
    progress: number;
    onUpdate: () => void;
    onDismiss: () => void;
}

export function UpdateBanner({
    available,
    version,
    downloading,
    progress,
    onUpdate,
    onDismiss
}: UpdateBannerProps) {
    return (
        <AnimatePresence>
            {available && (
                <motion.div
                    initial={{ opacity: 0, y: -50, x: '-50%' }}
                    animate={{ opacity: 1, y: 0, x: '-50%' }}
                    exit={{ opacity: 0, y: -50, x: '-50%' }}
                    className="fixed top-4 left-1/2 z-50 w-[min(92vw,720px)] rounded-lg border border-telegram-border bg-telegram-surface/95 p-3 shadow-2xl backdrop-blur-md"
                >
                    <div className="flex items-center justify-center gap-4">
                        <Sparkles className="w-5 h-5 text-telegram-secondary animate-pulse" />

                        <span className="text-telegram-text font-medium text-sm">
                            {downloading ? (
                                <>Downloading update... {progress}%</>
                            ) : (
                                <>A new version ({version}) is available!</>
                            )}
                        </span>

                        {downloading ? (
                            <div className="flex items-center gap-2">
                                <RefreshCw className="w-4 h-4 text-telegram-primary animate-spin" />
                                <div className="w-32 h-2 bg-telegram-border rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full bg-telegram-primary rounded-full"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress}%` }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={onUpdate}
                                className="flex items-center gap-2 px-4 py-2 bg-telegram-primary text-[#06201c] font-semibold rounded-lg hover:bg-telegram-primary/90 transition-colors shadow-md"
                            >
                                <Download className="w-4 h-4" />
                                Update Now
                            </button>
                        )}

                        {!downloading && (
                            <button
                                onClick={onDismiss}
                                className="p-2 text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover rounded-lg transition-colors"
                                title="Dismiss"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
