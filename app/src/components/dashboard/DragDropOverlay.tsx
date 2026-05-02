import { motion } from 'framer-motion';
import { UploadCloud } from 'lucide-react';

export function DragDropOverlay() {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center pointer-events-none p-6"
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="console-panel bg-telegram-surface text-telegram-text rounded-lg p-8 flex flex-col items-center gap-4 shadow-2xl border-2 border-dashed border-telegram-primary/50 max-w-md w-full"
            >
                <div className="p-4 bg-telegram-primary/10 rounded-lg">
                    <UploadCloud className="w-12 h-12 text-telegram-primary animate-bounce" />
                </div>
                <div className="text-center">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-telegram-primary font-semibold mb-2">Ready to upload</p>
                    <h3 className="text-xl font-semibold text-telegram-text">Release files here</h3>
                    <p className="text-telegram-subtext text-sm mt-1">They will be queued into the current folder.</p>
                </div>
            </motion.div>
        </motion.div>
    );
}
