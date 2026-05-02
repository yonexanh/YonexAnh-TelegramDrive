import { useEffect, useRef, useState } from 'react';
import { Eye, HardDrive, Trash2, FolderOpen, Pencil, Play, FileText, Info, Star, RotateCcw } from 'lucide-react';
import { TelegramFile } from '../../types';
import { isMediaFile, isPdfFile } from '../../utils';
import { useLanguage } from '../../context/LanguageContext';

interface ContextMenuProps {
    x: number;
    y: number;
    file: TelegramFile;
    onClose: () => void;
    onDownload: () => void;
    onDelete: () => void;
    onPreview: () => void;
    onRename: () => void;
    onDetails: () => void;
    onToggleFavorite: () => void;
    onRestore?: () => void;
}

export function ContextMenu({ x, y, file, onClose, onDownload, onDelete, onPreview, onRename, onDetails, onToggleFavorite, onRestore }: ContextMenuProps) {
    const { t } = useLanguage();
    const [adjustedPos, setAdjustedPos] = useState({ x, y });
    const menuRef = useRef<HTMLDivElement>(null);

    // Adjust position to stay in bounds
    useEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            let newX = x;
            let newY = y;

            if (x + rect.width > window.innerWidth) {
                newX = x - rect.width;
            }
            if (y + rect.height > window.innerHeight) {
                newY = y - rect.height;
            }
            setAdjustedPos({ x: newX, y: newY });
        }
    }, [x, y]);

    // Close on outside click
    useEffect(() => {
        const handleClick = () => onClose();
        const handleResize = () => onClose();

        window.addEventListener('click', handleClick);
        window.addEventListener('resize', handleResize);
        window.addEventListener('contextmenu', handleClick); // Close if right click elsewhere

        return () => {
            window.removeEventListener('click', handleClick);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('contextmenu', handleClick);
        };
    }, [onClose]);

    const itemClass = "flex items-center gap-2.5 px-2.5 py-2 text-sm text-telegram-text hover:bg-telegram-hover rounded-md transition-colors text-left w-full";

    return (
        <div
            ref={menuRef}
            className="fixed z-50 min-w-[220px] bg-telegram-surface/95 backdrop-blur-xl border border-telegram-border rounded-lg shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-0.5"
            style={{ left: adjustedPos.x, top: adjustedPos.y }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div className="px-2.5 py-2 border-b border-telegram-border mb-1">
                <p className="text-[10px] uppercase tracking-[0.16em] text-telegram-subtext">{t('context.fileActions')}</p>
                <p className="text-xs text-telegram-text font-medium truncate max-w-[190px]" title={file.name}>{file.name}</p>
            </div>

            {file.type !== 'folder' && (
                <button onClick={onPreview} className={itemClass}>
                    {isMediaFile(file.originalName || file.name) ? (
                        <>
                            <Play className="w-4 h-4 text-telegram-primary" />
                            {t('context.play')}
                        </>
                    ) : isPdfFile(file.originalName || file.name) ? (
                        <>
                            <FileText className="w-4 h-4 text-red-400" />
                            {t('context.viewPdf')}
                        </>
                    ) : (
                        <>
                            <Eye className="w-4 h-4 text-telegram-primary" />
                            {t('details.preview')}
                        </>
                    )}
                </button>
            )}

            {file.type === 'folder' && (
                <button onClick={onPreview} className={itemClass}>
                    <FolderOpen className="w-4 h-4 text-telegram-primary" />
                    {t('context.open')}
                </button>
            )}

            <button onClick={onDownload} className={itemClass}>
                <HardDrive className="w-4 h-4 text-telegram-secondary" />
                {t('common.download')}
            </button>

            <button onClick={onDetails} className={itemClass}>
                <Info className="w-4 h-4 text-telegram-primary" />
                {t('context.details')}
            </button>

            {file.deletedAt && onRestore ? (
                <button onClick={onRestore} className={itemClass}>
                    <RotateCcw className="w-4 h-4 text-telegram-primary" />
                    {t('common.restore')}
                </button>
            ) : (
                <>
                    <button onClick={onToggleFavorite} className={itemClass}>
                        <Star className={`w-4 h-4 ${file.isFavorite ? 'fill-telegram-secondary text-telegram-secondary' : 'text-telegram-secondary'}`} />
                        {file.isFavorite ? t('context.removeFavorite') : t('context.addFavorite')}
                    </button>

                    <button onClick={onRename} className={itemClass}>
                        <Pencil className="w-4 h-4" />
                        {t('details.rename')}
                    </button>
                </>
            )}

            <div className="h-px bg-telegram-border my-1" />

            <button onClick={onDelete} className="flex items-center gap-2.5 px-2.5 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-md transition-colors text-left w-full">
                <Trash2 className="w-4 h-4" />
                {file.deletedAt ? t('common.deleteForever') : t('context.moveToTrash')}
            </button>
        </div>
    );
}
