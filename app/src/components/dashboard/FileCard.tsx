import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Download, Eye, Folder, Star, Trash2 } from 'lucide-react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { TelegramFile } from '../../types';
import { FileTypeIcon } from '../FileTypeIcon';

interface FileCardProps {
    file: TelegramFile;
    onDelete: () => void;
    onDownload: () => void;
    onToggleFavorite?: () => void;
    onPreview?: () => void;
    isSelected: boolean;
    onClick?: (e: React.MouseEvent) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    onDrop?: (e: React.DragEvent, folderId: number) => void;
    onDragStart?: (fileId: number) => void;
    onDragEnd?: () => void;
    activeFolderId?: number | null;
    height?: number;
}

// Check if file is an image type that can have a thumbnail
function isImageFile(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
}

const THUMBNAIL_CONCURRENCY = 4;

type ThumbnailTask = {
    messageId: number;
    folderId: number | null;
    resolve: (value: string) => void;
    reject: (error: unknown) => void;
};

let activeThumbnailRequests = 0;
const thumbnailQueue: ThumbnailTask[] = [];
const thumbnailRequestCache = new Map<string, Promise<string>>();

const pumpThumbnailQueue = () => {
    while (activeThumbnailRequests < THUMBNAIL_CONCURRENCY && thumbnailQueue.length > 0) {
        const task = thumbnailQueue.shift();
        if (!task) return;

        activeThumbnailRequests += 1;
        invoke<string>('cmd_get_thumbnail', {
            messageId: task.messageId,
            folderId: task.folderId
        })
            .then(task.resolve)
            .catch(task.reject)
            .finally(() => {
                activeThumbnailRequests -= 1;
                pumpThumbnailQueue();
            });
    }
};

const queueThumbnailRequest = (messageId: number, folderId: number | null) => {
    const key = `${folderId ?? 'home'}:${messageId}`;
    const cached = thumbnailRequestCache.get(key);
    if (cached) return cached;

    const request = new Promise<string>((resolve, reject) => {
        thumbnailQueue.push({ messageId, folderId, resolve, reject });
        pumpThumbnailQueue();
    });
    thumbnailRequestCache.set(key, request);
    request.then((value) => {
        if (!value) thumbnailRequestCache.delete(key);
    }).catch(() => {
        thumbnailRequestCache.delete(key);
    });

    return request;
};

export function FileCard({ file, onDelete, onDownload, onToggleFavorite, onPreview, isSelected, onClick, onContextMenu, onDrop, onDragStart, onDragEnd, activeFolderId, height }: FileCardProps) {
    const isFolder = file.type === 'folder';
    const [isDragOver, setIsDragOver] = useState(false);
    const [thumbnail, setThumbnail] = useState<string | null>(null);
    const [thumbnailLoading, setThumbnailLoading] = useState(false);

    // Lazy load thumbnail for image files
    useEffect(() => {
        const filename = file.originalName || file.name;
        setThumbnail(null);

        if (isFolder || !isImageFile(filename)) return;

        let cancelled = false;
        setThumbnailLoading(true);

        queueThumbnailRequest(file.id, activeFolderId ?? null).then((result) => {
            if (!cancelled && result) {
                setThumbnail(result.startsWith('data:') ? result : convertFileSrc(result));
            }
        }).catch(() => {
            // Silently fail - will show icon instead
        }).finally(() => {
            if (!cancelled) setThumbnailLoading(false);
        });

        return () => { cancelled = true; };
    }, [file.id, file.name, file.originalName, activeFolderId, isFolder]);

    return (
        <div
            className="relative"
            onContextMenu={onContextMenu}
            onClick={onClick}
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
        >
            <motion.div
                draggable={!isFolder}
                onDragStart={(e: any) => {
                    if (onDragStart) onDragStart(file.id);
                    e.dataTransfer.setData("application/x-telegram-file-id", file.id.toString());
                    e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                    if (onDragEnd) onDragEnd();
                }}
                whileHover={{ y: -2 }}
                className={`group cursor-pointer bg-telegram-surface rounded-lg overflow-hidden border hover:shadow-[0_8px_28px_rgba(0,0,0,0.18)] transition-all relative
                ${isSelected ? 'border-telegram-primary bg-telegram-primary/5 ring-1 ring-telegram-primary' : 'border-telegram-border hover:border-telegram-primary/50'}
                ${isDragOver ? 'ring-2 ring-telegram-primary bg-telegram-primary/20 scale-105' : ''}`}
                style={height ? { height: `${height}px` } : { aspectRatio: '4/3' }}
            >
                {/* Thumbnail or Icon */}
                {thumbnail ? (
                    <div className="absolute inset-0">
                        <img
                            src={thumbnail}
                            alt={file.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                            onError={() => setThumbnail(null)}
                        />
                        {/* Gradient overlay for text readability */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    </div>
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                        {isFolder ? (
                            <Folder className="w-12 h-12 text-telegram-primary" />
                        ) : thumbnailLoading && isImageFile(file.originalName || file.name) ? (
                            <div className="w-8 h-8 border-2 border-telegram-primary/30 border-t-telegram-primary rounded-full animate-spin" />
                        ) : (
                            <FileTypeIcon filename={file.originalName || file.name} size="lg" />
                        )}
                    </div>
                )}

                {/* Selection Checkmark */}
                <div className={`absolute top-2 left-2 w-5 h-5 rounded border flex items-center justify-center transition-all z-10 ${isSelected ? 'bg-telegram-primary border-telegram-primary' : 'border-white/50 bg-black/30 opacity-0 group-hover:opacity-100'}`}>
                    {isSelected && <div className="w-2 h-2 bg-[#06201c] rounded-sm" />}
                </div>

                {/* File info overlay at bottom */}
                <div className={`absolute bottom-0 left-0 right-0 p-3 ${thumbnail ? 'text-white' : 'text-telegram-text'}`}>
                    <h3 className="text-sm font-medium truncate w-full" title={file.name}>{file.name}</h3>
                    <p className={`text-xs mt-0.5 ${thumbnail ? 'text-white/70' : 'text-telegram-subtext'}`}>{file.sizeStr}</p>
                </div>

                {/* Quick actions on hover */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
                    {onToggleFavorite && (
                        <button onClick={(e) => { e.stopPropagation(); onToggleFavorite() }} className="file-action-btn p-1 bg-black/50 rounded-full hover:bg-telegram-secondary hover:text-white text-white/70" title={file.isFavorite ? 'Remove Favorite' : 'Add Favorite'}>
                            <Star className={`w-3 h-3 ${file.isFavorite ? 'fill-telegram-secondary text-telegram-secondary' : ''}`} />
                        </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); if (onPreview) onPreview() }} className="file-action-btn p-1 bg-black/50 rounded-full hover:bg-telegram-primary hover:text-white text-white/70" title="Preview">
                        <Eye className="w-3 h-3" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onDownload() }} className="file-action-btn p-1 bg-black/50 rounded-full hover:bg-green-500 hover:text-white text-white/70" title="Download">
                        <Download className="w-3 h-3" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="file-action-btn p-1 bg-black/50 rounded-full hover:bg-red-500 hover:text-white text-white/70" title={file.deletedAt ? 'Delete Forever' : 'Move to Trash'}>
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            </motion.div>
        </div>
    )
}
