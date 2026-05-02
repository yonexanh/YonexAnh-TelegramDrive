import { useState, useEffect, useRef } from 'react';
import { X, File, ChevronLeft, ChevronRight } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { TelegramFile } from '../../types';
import { isImageFile } from '../../utils';

const PREVIEW_CACHE_TTL_MS = 5 * 60 * 1000;
const PREVIEW_CACHE_MAX_ITEMS = 8;
const PREVIEW_PREFETCH_MAX_BYTES = 8 * 1024 * 1024;

type PreviewCacheValue = {
    src: string;
    cachedAt: number;
};

const previewCache = new Map<string, PreviewCacheValue>();
const pendingPrefetch = new Set<string>();

const getPreviewCacheKey = (fileId: number, folderId: number | null) => `${folderId ?? 'home'}:${fileId}`;

const touchPreviewCache = (key: string, value: PreviewCacheValue) => {
    if (previewCache.has(key)) previewCache.delete(key);
    previewCache.set(key, value);

    while (previewCache.size > PREVIEW_CACHE_MAX_ITEMS) {
        const oldestKey = previewCache.keys().next().value;
        if (!oldestKey) break;
        previewCache.delete(oldestKey);
    }
};

const getCachedPreview = (key: string): string | null => {
    const value = previewCache.get(key);
    if (!value) return null;

    if (Date.now() - value.cachedAt > PREVIEW_CACHE_TTL_MS) {
        previewCache.delete(key);
        return null;
    }

    touchPreviewCache(key, value);
    return value.src;
};

const rememberPreview = (key: string, src: string) => {
    touchPreviewCache(key, { src, cachedAt: Date.now() });
};

const forgetPreview = (key: string) => {
    previewCache.delete(key);
};

const isSafeToPrefetch = (file: TelegramFile) => (
    isImageFile(file.originalName || file.name) &&
    (file.size || 0) > 0 &&
    file.size <= PREVIEW_PREFETCH_MAX_BYTES
);

interface PreviewModalProps {
    file: TelegramFile;
    onClose: () => void;
    onNext?: () => void;
    onPrev?: () => void;
    currentIndex?: number;
    totalItems?: number;
    nextFile?: TelegramFile | null;
    prevFile?: TelegramFile | null;
    activeFolderId: number | null;
}

export function PreviewModal({ file, onClose, onNext, onPrev, currentIndex, totalItems, nextFile, prevFile, activeFolderId }: PreviewModalProps) {
    const [src, setSrc] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadNonce, setReloadNonce] = useState(0);
    const [retryCount, setRetryCount] = useState(0);
    const latestRequestRef = useRef(0);

    useEffect(() => {
        setRetryCount(0);
        setReloadNonce(0);
    }, [file.id, activeFolderId]);

    useEffect(() => {
        const load = async () => {
            const key = getPreviewCacheKey(file.id, activeFolderId);
            const shouldBypassCache = reloadNonce > 0;
            const requestId = ++latestRequestRef.current;
            const cachedSrc = shouldBypassCache ? null : getCachedPreview(key);

            if (cachedSrc) {
                if (requestId !== latestRequestRef.current) return;
                setSrc(cachedSrc);
                setLoading(false);
                setError(null);
                return;
            }

            setLoading(true);
            setError(null);
            try {
                const path = await invoke<string>('cmd_get_preview', {
                    messageId: file.id,
                    folderId: activeFolderId
                });
                if (requestId !== latestRequestRef.current) return;

                if (path) {
                    if (path.startsWith('data:')) {
                        setSrc(path);
                        rememberPreview(key, path);
                    } else {
                        const converted = convertFileSrc(path);
                        setSrc(converted);
                        rememberPreview(key, converted);
                    }
                } else {
                    setError("Preview not available");
                }
            } catch (e) {
                if (requestId !== latestRequestRef.current) return;
                setError(String(e));
            } finally {
                if (requestId !== latestRequestRef.current) return;
                setLoading(false);
            }
        };
        load();
    }, [file, activeFolderId, reloadNonce]);

    useEffect(() => {
        const candidates = [nextFile, prevFile].filter((f): f is TelegramFile => !!f && isSafeToPrefetch(f));

        candidates.forEach((candidate) => {
            const key = getPreviewCacheKey(candidate.id, activeFolderId);
            if (getCachedPreview(key) || pendingPrefetch.has(key)) return;

            pendingPrefetch.add(key);
            invoke<string>('cmd_get_preview', {
                messageId: candidate.id,
                folderId: activeFolderId
            }).then((path) => {
                if (!path) return;
                const normalized = path.startsWith('data:') ? path : convertFileSrc(path);
                rememberPreview(key, normalized);
            }).catch(() => {
                // Ignore prefetch errors, main preview flow will handle user-visible failures.
            }).finally(() => {
                pendingPrefetch.delete(key);
            });
        });
    }, [nextFile, prevFile, activeFolderId]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }

            const key = e.key.toLowerCase();

            if (e.key === 'ArrowRight' || key === 'l') {
                e.preventDefault();
                onNext?.();
                return;
            }

            if (e.key === 'ArrowLeft' || key === 'j') {
                e.preventDefault();
                onPrev?.();
                return;
            }

            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, onNext, onPrev]);

    return (
        <div className="fixed inset-0 z-[150] bg-black/90 flex items-center justify-center p-5 backdrop-blur-sm" onClick={onClose}>
            <div className="relative max-w-6xl w-full h-[calc(100vh-2.5rem)] flex flex-col items-center justify-center" onClick={e => e.stopPropagation()}>
                <div className="absolute top-0 left-0 right-0 flex items-center justify-between gap-4">
                    <div className="min-w-0 rounded-lg bg-black/45 border border-white/10 backdrop-blur-md px-3 py-2 text-white">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Preview</p>
                        <p className="text-sm font-medium truncate max-w-md">{file.name}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2.5 text-white/70 hover:text-white bg-black/45 hover:bg-white/10 rounded-lg transition-colors border border-white/10 backdrop-blur-md"
                        title="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <button
                    onClick={onPrev}
                    className="absolute left-0 top-1/2 -translate-y-1/2 p-2.5 bg-black/45 hover:bg-white/10 rounded-lg transition-colors border border-white/10 backdrop-blur-md"
                    style={{ color: '#ffffff' }}
                    title="Previous (ArrowLeft / J)"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>

                <button
                    onClick={onNext}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-2.5 bg-black/45 hover:bg-white/10 rounded-lg transition-colors border border-white/10 backdrop-blur-md"
                    style={{ color: '#ffffff' }}
                    title="Next (ArrowRight / L)"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>

                {loading && (
                    <div className="console-panel bg-black/45 rounded-lg px-8 py-7 flex flex-col items-center gap-4 text-white border-white/10">
                        <div className="w-10 h-10 border-4 border-telegram-primary border-t-transparent rounded-full animate-spin"></div>
                        <div className="text-center">
                            <p className="font-semibold">Loading preview</p>
                            <p className="text-xs text-white/50 mt-1">Downloading from Telegram...</p>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="text-red-400 bg-red-500/10 p-5 rounded-lg border border-red-500/20 max-w-md">
                        <p className="font-semibold">Preview error</p>
                        <p className="text-sm mt-1">{error}</p>
                    </div>
                )}

                {!loading && !error && src && (
                    <div className="flex flex-col items-center">
                        {isImageFile(file.originalName || file.name) ? (
                            <img
                                src={src}
                                className="max-w-[calc(100vw-7rem)] max-h-[calc(100vh-8rem)] object-contain rounded-lg shadow-2xl bg-black border border-white/10"
                                alt="Preview"
                                decoding="async"
                                onError={() => {
                                    const key = getPreviewCacheKey(file.id, activeFolderId);
                                    forgetPreview(key);

                                    if (retryCount < 1) {
                                        setRetryCount((prev) => prev + 1);
                                        setReloadNonce((prev) => prev + 1);
                                        return;
                                    }

                                    setError('Failed to render image preview');
                                }}
                            />
                        ) : (
                            <div className="console-panel bg-black/45 p-8 rounded-lg text-center border-white/10 shadow-2xl">
                                <File className="w-16 h-16 text-telegram-primary mx-auto mb-4" />
                                <h3 className="text-xl text-white font-medium mb-2">{file.name}</h3>
                                <p className="text-white/55 mb-6">Preview not supported in app.</p>
                                <p className="text-xs text-white/40">File type: {file.name.split('.').pop()}</p>
                            </div>
                        )}
                    </div>
                )}

                <div className="absolute bottom-0 rounded-lg bg-black/45 border border-white/10 backdrop-blur-md px-3 py-2 text-white/60 text-sm">
                    {file.name}
                    {typeof currentIndex === 'number' && typeof totalItems === 'number' && totalItems > 0 && (
                        <span className="ml-3">{currentIndex + 1}/{totalItems}</span>
                    )}
                </div>
            </div>
        </div>
    );
}
