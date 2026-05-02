import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

interface SidebarItemProps {
    icon: React.ElementType;
    label: string;
    active: boolean;
    onClick: () => void;
    onDrop: (e: React.DragEvent) => void;
    onDelete?: () => void;
    onRename?: () => void;
    folderId: number | null;
}

/**
 * SidebarItem - Pure DOM event-based drop handling
 *
 * With Tauri's dragDropEnabled: false, DOM events work reliably.
 * This component handles internal file moves via standard React drag events.
 */
export function SidebarItem({ icon: Icon, label, active = false, onClick, onDrop, onDelete, onRename }: SidebarItemProps) {
    const [isOver, setIsOver] = useState(false);

    return (
        <button
            onClick={onClick}
            onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOver(true);
            }}
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
            }}
            onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Only clear if truly leaving (not entering a child element)
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX;
                const y = e.clientY;
                if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                    setIsOver(false);
                }
            }}
            onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOver(false);
                if (onDrop) onDrop(e);
            }}
            onContextMenu={(e) => {
                if (onDelete) {
                    e.preventDefault();
                    onDelete();
                }
            }}
            className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${active
                ? 'bg-telegram-primary text-[#06201c] shadow-lg shadow-telegram-primary/10'
                : isOver
                    ? 'bg-telegram-primary/25 text-white ring-2 ring-telegram-primary scale-[1.02] shadow-lg'
                    : 'text-white/60 hover:bg-white/10 hover:text-white'
                }`}
        >
            <Icon className={`w-4 h-4 ${isOver && !active ? 'text-telegram-primary' : ''}`} />
            <span className="flex-1 text-left truncate">{label}</span>
            {(onRename || onDelete) && (
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
                    {onRename && (
                        <span onClick={(e) => { e.stopPropagation(); onRename(); }} className="p-1 hover:text-telegram-primary">
                            <Pencil className="w-3 h-3" />
                        </span>
                    )}
                    {onDelete && (
                        <span onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1 hover:text-red-300">
                            <Trash2 className="w-3 h-3" />
                        </span>
                    )}
                </div>
            )}
        </button>
    )
}
