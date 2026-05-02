import { createContext, useContext, useState, ReactNode } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';

interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'info';
}

interface ConfirmContextType {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState<ConfirmOptions>({ title: '', message: '' });
    const [resolveRef, setResolveRef] = useState<((value: boolean) => void) | null>(null);

    const confirm = (opts: ConfirmOptions) => {
        setOptions(opts);
        setIsOpen(true);
        return new Promise<boolean>((resolve) => {
            setResolveRef(() => resolve);
        });
    };

    const handleConfirm = () => {
        setIsOpen(false);
        if (resolveRef) resolveRef(true);
    };

    const handleCancel = () => {
        setIsOpen(false);
        if (resolveRef) resolveRef(false);
    };

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="console-panel bg-telegram-surface rounded-lg p-5 w-[25rem] max-w-[calc(100vw-2rem)] shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start gap-4">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${options.variant === 'danger' ? 'bg-red-500/10 text-red-400' : 'bg-telegram-primary/10 text-telegram-primary'}`}>
                                {options.variant === 'danger' ? <AlertTriangle className="w-5 h-5" /> : <Info className="w-5 h-5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                    <h3 className="text-lg font-semibold text-telegram-text">{options.title}</h3>
                                    <button onClick={handleCancel} className="p-1.5 rounded-md text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <p className="text-telegram-subtext text-sm mt-2 whitespace-pre-line leading-6">{options.message}</p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={handleCancel} className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-telegram-hover text-telegram-subtext transition">
                                {options.cancelText || 'Cancel'}
                            </button>
                            <button
                                onClick={handleConfirm}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${options.variant === 'danger' ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-telegram-primary text-[#06201c] hover:bg-telegram-primary/90'}`}
                            >
                                {options.confirmText || 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    );
}

export const useConfirm = () => {
    const context = useContext(ConfirmContext);
    if (!context) throw new Error('useConfirm must be used within a ConfirmProvider');
    return context;
};
