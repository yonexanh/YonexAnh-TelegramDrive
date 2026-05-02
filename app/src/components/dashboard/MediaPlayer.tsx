import { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Music } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { TelegramFile } from '../../types';
import { isVideoFile, isAudioFile } from '../../utils';

interface MediaPlayerProps {
    file: TelegramFile;
    onClose: () => void;
    onNext?: () => void;
    onPrev?: () => void;
    currentIndex?: number;
    totalItems?: number;
    activeFolderId: number | null;
}

export function MediaPlayer({ file, onClose, onNext, onPrev, currentIndex, totalItems, activeFolderId }: MediaPlayerProps) {
    const [streamToken, setStreamToken] = useState<string | null>(null);

    useEffect(() => {
        invoke<string>('cmd_get_stream_token').then(setStreamToken).catch(() => {});
    }, []);

    const folderIdParam = activeFolderId !== null ? activeFolderId.toString() : 'home';
    const streamUrl = streamToken
        ? `http://localhost:14200/stream/${folderIdParam}/${file.id}?token=${streamToken}`
        : null;

    const typeName = file.originalName || file.name;
    const isVideo = isVideoFile(typeName);
    const isAudio = isAudioFile(typeName);

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
        <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-5 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
            <div className="relative w-full max-w-6xl flex flex-col items-center" onClick={e => e.stopPropagation()}>
                <button
                    onClick={onPrev}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2.5 text-white/65 hover:text-white bg-black/45 hover:bg-white/10 rounded-lg transition-all z-10 border border-white/10 backdrop-blur-md"
                    title="Previous (ArrowLeft / J)"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>

                <button
                    onClick={onNext}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 text-white/65 hover:text-white bg-black/45 hover:bg-white/10 rounded-lg transition-all z-10 border border-white/10 backdrop-blur-md"
                    title="Next (ArrowRight / L)"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>

                <button
                    onClick={onClose}
                    className="absolute -top-14 right-0 p-2.5 text-white/65 hover:text-white bg-black/45 hover:bg-white/10 rounded-lg transition-all border border-white/10 backdrop-blur-md"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="w-full aspect-video bg-black rounded-lg overflow-hidden shadow-2xl ring-1 ring-white/10 flex items-center justify-center">
                    {!streamUrl ? (
                        <div className="flex flex-col items-center gap-4 text-white">
                            <div className="w-10 h-10 border-4 border-telegram-primary border-t-transparent rounded-full animate-spin"></div>
                            <p>Preparing stream...</p>
                        </div>
                    ) : isVideo ? (
                        <video
                            src={streamUrl}
                            controls
                            autoPlay
                            className="w-full h-full object-contain"
                        />
                    ) : isAudio ? (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-[#0f1413]">
                            <div className="w-28 h-28 rounded-lg bg-telegram-surface border border-white/10 flex items-center justify-center mb-8 shadow-xl animate-pulse-slow">
                                <Music className="w-12 h-12 text-telegram-primary" />
                            </div>
                            <audio src={streamUrl} controls autoPlay className="w-full max-w-md" />
                        </div>
                    ) : (
                        <div className="text-white">Unsupported media type</div>
                    )}
                </div>

                <div className="mt-4 text-center rounded-lg bg-black/45 border border-white/10 backdrop-blur-md px-4 py-3">
                    <h3 className="text-base font-semibold text-white max-w-2xl truncate">{file.name}</h3>
                    <p className="text-xs text-white/50 mt-1">
                        Streaming from Telegram Drive
                        {typeof currentIndex === 'number' && typeof totalItems === 'number' && totalItems > 0 && (
                            <span className="ml-2">- {currentIndex + 1}/{totalItems}</span>
                        )}
                    </p>
                </div>
            </div>
        </div>
    );
}
