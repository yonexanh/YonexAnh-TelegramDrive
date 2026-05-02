import { useEffect, useState } from 'react';
import { Pencil, X } from 'lucide-react';

interface RenameModalProps {
    title: string;
    description?: string;
    initialName: string;
    onClose: () => void;
    onSubmit: (name: string) => Promise<void> | void;
}

export function RenameModal({ title, description, initialName, onClose, onSubmit }: RenameModalProps) {
    const [name, setName] = useState(initialName);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setName(initialName);
    }, [initialName]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed || trimmed === initialName) {
            onClose();
            return;
        }

        setSaving(true);
        try {
            await onSubmit(trimmed);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={onClose}>
            <form
                onSubmit={submit}
                className="console-panel bg-telegram-surface rounded-lg w-full max-w-[420px] p-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4 mb-5">
                    <div>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-telegram-primary font-semibold">Rename</p>
                        <h3 className="text-lg font-semibold text-telegram-text mt-1">{title}</h3>
                        {description && <p className="text-sm text-telegram-subtext mt-1">{description}</p>}
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-lg text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="relative">
                    <Pencil className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-telegram-subtext" />
                    <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-telegram-bg/60 border border-telegram-border rounded-lg pl-10 pr-3 py-3 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/60"
                    />
                </div>

                <div className="flex justify-end gap-3 mt-5">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-telegram-subtext hover:bg-telegram-hover">
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={saving || !name.trim()}
                        className="px-4 py-2 rounded-lg text-sm font-semibold bg-telegram-primary text-[#06201c] hover:bg-telegram-primary/90 disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </form>
        </div>
    );
}
