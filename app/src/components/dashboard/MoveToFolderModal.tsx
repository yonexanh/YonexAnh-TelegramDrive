import { X, HardDrive, Folder } from 'lucide-react';
import { TelegramFolder } from '../../types';

interface MoveToFolderModalProps {
    folders: TelegramFolder[];
    onClose: () => void;
    onSelect: (id: number | null) => void;
    activeFolderId: number | null;
}

export function MoveToFolderModal({ folders, onClose, onSelect, activeFolderId }: MoveToFolderModalProps) {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="console-panel bg-telegram-surface rounded-lg w-full max-w-[420px] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-telegram-border flex justify-between items-start gap-4">
                    <div>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-telegram-subtext">Move selection</p>
                        <h3 className="text-telegram-text font-semibold mt-1">Choose destination</h3>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover transition-colors"><X className="w-4 h-4" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                    {activeFolderId !== null && (
                        <button
                            onClick={() => onSelect(null)}
                            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-left text-telegram-text hover:bg-telegram-hover border border-transparent hover:border-telegram-border transition-colors"
                        >
                            <div className="w-9 h-9 rounded-lg bg-telegram-primary/15 flex items-center justify-center text-telegram-primary">
                                <HardDrive className="w-4 h-4" />
                            </div>
                            <div>
                                <span className="font-semibold block">Saved Messages</span>
                                <span className="text-xs text-telegram-subtext">Root workspace</span>
                            </div>
                        </button>
                    )}

                    {folders.map((f) => {
                        if (f.id === activeFolderId) return null;
                        return (
                            <button
                                key={f.id}
                                onClick={() => onSelect(f.id)}
                                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-left text-telegram-text hover:bg-telegram-hover border border-transparent hover:border-telegram-border transition-colors"
                            >
                                <div className="w-9 h-9 rounded-lg bg-telegram-hover flex items-center justify-center text-telegram-primary">
                                    <Folder className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <span className="font-semibold block truncate">{f.name}</span>
                                    <span className="text-xs text-telegram-subtext">Folder</span>
                                </div>
                            </button>
                        )
                    })}

                    {folders.length === 0 && activeFolderId === null && (
                        <div className="p-6 text-center text-xs text-telegram-subtext">No other folders available. Create one first.</div>
                    )}
                </div>
            </div>
        </div>
    )
}
