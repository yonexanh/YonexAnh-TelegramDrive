import { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LocalFileInfo, QueueItem, TelegramFile } from '../types';
import { useFileDrop } from './useFileDrop';
import type { Store } from '@tauri-apps/plugin-store';

interface ProgressPayload {
    id: string;
    percent: number;
}

interface QueueOptions {
    source?: QueueItem['source'];
    folderId?: number | null;
    silent?: boolean;
    skipDuplicates?: boolean;
}

export function useFileUpload(activeFolderId: number | null, store: Store | null, duplicateFiles: TelegramFile[] = []) {
    const queryClient = useQueryClient();
    const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
    const [processing, setProcessing] = useState(false);
    const [initialized, setInitialized] = useState(false);
    const cancelledRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        cancelledRef.current.clear();
        setUploadQueue([]);
        setProcessing(false);
        setInitialized(false);
    }, [store]);

    const duplicateKeys = useMemo(() => new Set(
        duplicateFiles
            .filter(file => file.type !== 'folder')
            .map(file => `${(file.originalName || file.name).toLowerCase()}:${file.size || 0}`)
    ), [duplicateFiles]);

    // Listen for progress events from Rust
    useEffect(() => {
        let unlisten: UnlistenFn | undefined;
        listen<ProgressPayload>('upload-progress', (event) => {
            setUploadQueue(q => q.map(i =>
                i.id === event.payload.id ? { ...i, progress: event.payload.percent } : i
            ));
        }).then(fn => { unlisten = fn; });
        return () => { unlisten?.(); };
    }, []);

    useEffect(() => {
        if (!store || initialized) return;
        store.get<QueueItem[]>('uploadQueue').then((saved) => {
            if (saved && saved.length > 0) {
                const pending = saved.filter(i => i.status === 'pending');
                if (pending.length > 0) {
                    setUploadQueue(pending);
                    toast.info(`Restored ${pending.length} pending uploads`);
                }
            }
            setInitialized(true);
        });
    }, [store, initialized]);

    useEffect(() => {
        if (!store || !initialized) return;
        const pending = uploadQueue.filter(i => i.status === 'pending');
        store.set('uploadQueue', pending).then(() => store.save());
    }, [store, uploadQueue, initialized]);

    useEffect(() => {
        if (processing) return;
        const nextItem = uploadQueue.find(i => i.status === 'pending');
        if (nextItem) {
            processItem(nextItem);
        }
    }, [uploadQueue, processing]);

    const queuePaths = useCallback(async (paths: string[], options: QueueOptions = {}) => {
        if (paths.length === 0) return 0;

        let localInfos: LocalFileInfo[] = paths.map(path => ({
            path,
            name: path.split(/[\\/]/).pop() || path,
            size: 0,
            modified: 0,
        }));

        try {
            localInfos = await invoke<LocalFileInfo[]>('cmd_get_local_file_info', { paths });
        } catch {
            // Keep the fallback names; upload itself will surface path errors.
        }

        const queuedPathSet = new Set(
            uploadQueue
                .filter(item => item.status === 'pending' || item.status === 'uploading' || item.status === 'paused')
                .map(item => item.path)
        );

        const skipDuplicates = options.skipDuplicates !== false;
        const skippedDuplicate = localInfos.filter(info => (
            skipDuplicates && duplicateKeys.has(`${info.name.toLowerCase()}:${info.size}`)
        ));
        const skippedQueued = localInfos.filter(info => queuedPathSet.has(info.path));

        const uploadInfos = localInfos.filter(info => (
            !queuedPathSet.has(info.path) &&
            !(skipDuplicates && duplicateKeys.has(`${info.name.toLowerCase()}:${info.size}`))
        ));

        if (uploadInfos.length === 0) {
            if (!options.silent) {
                const skipped = skippedDuplicate.length + skippedQueued.length;
                toast.info(skipped > 0 ? `Skipped ${skipped} already known file${skipped === 1 ? '' : 's'}.` : 'No files queued.');
            }
            return 0;
        }

        const newItems: QueueItem[] = uploadInfos.map((info) => ({
            id: Math.random().toString(36).substr(2, 9),
            path: info.path,
            folderId: options.folderId === undefined ? activeFolderId : options.folderId,
            source: options.source || 'manual',
            status: 'pending'
        }));

        setUploadQueue(prev => [...prev, ...newItems]);

        if (!options.silent) {
            toast.info(`Queued ${newItems.length} file${newItems.length === 1 ? '' : 's'} for upload`);
            if (skippedDuplicate.length > 0) {
                toast.info(`Skipped ${skippedDuplicate.length} duplicate file${skippedDuplicate.length === 1 ? '' : 's'} in this folder.`);
            }
            if (skippedQueued.length > 0) {
                toast.info(`Skipped ${skippedQueued.length} file${skippedQueued.length === 1 ? '' : 's'} already in the transfer queue.`);
            }
        }

        return newItems.length;
    }, [activeFolderId, duplicateKeys, uploadQueue]);

    const processItem = async (item: QueueItem) => {
        setProcessing(true);
        setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'uploading', progress: 0 } : i));
        try {
            await invoke('cmd_upload_file', { path: item.path, folderId: item.folderId, transferId: item.id });
            // Check if cancelled during upload
            if (cancelledRef.current.has(item.id)) {
                cancelledRef.current.delete(item.id);
            } else {
                setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'success', progress: 100 } : i));
                queryClient.invalidateQueries({ queryKey: ['files'] });
            }
        } catch (e) {
            if (!cancelledRef.current.has(item.id)) {
                setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: String(e) } : i));
                toast.error(`Upload failed for ${item.path.split('/').pop()}: ${e}`);
            } else {
                cancelledRef.current.delete(item.id);
            }
        } finally {
            setProcessing(false);
        }
    };

    const handleManualUpload = async () => {
        try {
            const selected = await open({ multiple: true, directory: false });
            if (selected) {
                const paths = Array.isArray(selected) ? selected : [selected];
                await queuePaths(paths);
            }
        } catch {
            toast.error("Failed to open file dialog");
        }
    };

    const cancelAll = () => {
        setUploadQueue(q => {
            const uploading = q.find(i => i.status === 'uploading');
            if (uploading) cancelledRef.current.add(uploading.id);
            return q
                .filter(i => i.status !== 'pending')
                .map(i => i.status === 'uploading' || i.status === 'paused' ? { ...i, status: 'cancelled' as const } : i);
        });
        toast.info('All uploads cancelled');
    };

    const cancelItem = (id: string) => {
        setUploadQueue(q => q.map(i => {
            if (i.id !== id) return i;
            if (i.status === 'uploading') cancelledRef.current.add(i.id);
            return { ...i, status: 'cancelled' as const };
        }));
    };

    const retryItem = (id: string) => {
        cancelledRef.current.delete(id);
        setUploadQueue(q => q.map(i => i.id === id ? {
            ...i,
            status: 'pending' as const,
            error: undefined,
            progress: undefined
        } : i));
    };

    const pauseItem = (id: string) => {
        setUploadQueue(q => q.map(i => i.id === id && i.status === 'pending' ? { ...i, status: 'paused' as const } : i));
    };

    const resumeItem = (id: string) => {
        setUploadQueue(q => q.map(i => i.id === id && i.status === 'paused' ? { ...i, status: 'pending' as const } : i));
    };

    const { isDragging } = useFileDrop((paths) => {
        void queuePaths(paths);
    });

    return {
        uploadQueue,
        setUploadQueue,
        queuePaths,
        handleManualUpload,
        cancelAll,
        cancelItem,
        retryItem,
        pauseItem,
        resumeItem,
        isDragging
    };
}
