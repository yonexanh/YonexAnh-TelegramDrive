import { useState } from 'react';
import { Download, Eye, Folder, Star, Trash2 } from 'lucide-react';
import { TelegramFile } from '../../types';
import { FileTypeIcon } from '../FileTypeIcon';

interface FileListItemProps {
    file: TelegramFile;
    selectedIds: number[];
    onFileClick: (e: React.MouseEvent, id: number) => void;
    handleContextMenu: (e: React.MouseEvent, file: TelegramFile) => void;
    onDragStart?: (fileId: number) => void;
    onDragEnd?: () => void;
    onDrop?: (e: React.DragEvent, folderId: number) => void;
    onPreview: (file: TelegramFile) => void;
    onDownload: (id: number, name: string) => void;
    onDelete: (id: number) => void;
    onToggleFavorite: (file: TelegramFile) => void;
}

export function FileListItem({
    file, selectedIds, onFileClick, handleContextMenu,
    onDragStart, onDragEnd, onDrop,
    onPreview, onDownload, onDelete, onToggleFavorite
}: FileListItemProps) {
    const [isDragOver, setIsDragOver] = useState(false);
    const isFolder = file.type === 'folder';

    return (
        <div
            onClick={(e) => onFileClick(e, file.id)}
            onContextMenu={(e) => handleContextMenu(e, file)}
            draggable
            onDragStart={(e) => {
                if (onDragStart) onDragStart(file.id);
                e.dataTransfer.setData("application/x-telegram-file-id", file.id.toString());
                e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
                if (onDragEnd) onDragEnd();
            }}
            onDragOver={(e) => {
                if (isFolder) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isDragOver) setIsDragOver(true);
                }
            }}
            onDragLeave={(e) => {
                if (isFolder) {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOver(false);
                }
            }}
            onDrop={(e) => {
                if (isFolder && onDrop) {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOver(false);
                    onDrop(e, file.id);
                }
            }}
            className={`group grid grid-cols-[2rem_2fr_7rem_10rem] gap-4 items-center px-4 py-3 rounded-lg cursor-pointer border transition-all hover:bg-telegram-hover
                ${selectedIds.includes(file.id) ? 'bg-telegram-primary/10 border-telegram-primary/35' : 'border-transparent'}
                ${isDragOver ? 'ring-2 ring-telegram-primary bg-telegram-primary/20' : ''}
            `}
        >
            <div className="flex justify-center">
                {isFolder ? <Folder className="w-5 h-5 text-telegram-primary" /> : <FileTypeIcon filename={file.originalName || file.name} className="w-5 h-5" />}
            </div>
            <div className="truncate text-sm text-telegram-text font-medium relative pr-8 flex items-center gap-2">
                {file.isFavorite && <Star className="w-3.5 h-3.5 fill-telegram-secondary text-telegram-secondary shrink-0" />}
                <span className="truncate">{file.name}</span>
                {/* List Actions */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex items-center bg-telegram-surface border border-telegram-border shadow-lg rounded-lg px-1">
                    <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(file) }} className="p-1 hover:text-telegram-secondary text-telegram-subtext" title={file.isFavorite ? 'Remove Favorite' : 'Add Favorite'}><Star className={`w-4 h-4 ${file.isFavorite ? 'fill-telegram-secondary text-telegram-secondary' : ''}`} /></button>
                    <button onClick={(e) => { e.stopPropagation(); onPreview(file) }} className="p-1 hover:text-telegram-text text-telegram-subtext" title="Preview"><Eye className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); onDownload(file.id, file.name) }} className="p-1 hover:text-telegram-text text-telegram-subtext" title="Download"><Download className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(file.id) }} className="p-1 hover:text-red-400 text-telegram-subtext" title={file.deletedAt ? 'Delete Forever' : 'Move to Trash'}><Trash2 className="w-4 h-4" /></button>
                </div>
            </div>
            <div className="text-right text-xs text-telegram-subtext truncate">{file.sizeStr}</div>
            <div className="text-right text-xs text-telegram-subtext font-mono opacity-50 truncate">{file.created_at || '-'}</div>
        </div>
    );
}
