import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';
import type { Store } from '@tauri-apps/plugin-store';
import { LocalFileInfo, LocalSyncSettings, LocalSyncState } from '../types';

const DEFAULT_SYNC_SETTINGS: LocalSyncSettings = {
    enabled: false,
    path: null,
    folderId: null,
    intervalMinutes: 10,
};

const signatureFor = (file: LocalFileInfo) => `${file.size}:${file.modified}`;

export function useLocalSync(
    store: Store | null,
    fallbackFolderId: number | null,
    queuePaths: (paths: string[], options?: { source?: 'manual' | 'sync'; folderId?: number | null; silent?: boolean; skipDuplicates?: boolean }) => Promise<number>,
) {
    const [settings, setSettings] = useState<LocalSyncSettings>(DEFAULT_SYNC_SETTINGS);
    const [syncState, setSyncState] = useState<LocalSyncState>({});
    const [loaded, setLoaded] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [lastResult, setLastResult] = useState<string>('Not run yet');

    useEffect(() => {
        setSettings(DEFAULT_SYNC_SETTINGS);
        setSyncState({});
        setLoaded(false);
        setIsRunning(false);
        setLastResult('Not run yet');
    }, [store]);

    useEffect(() => {
        if (!store || loaded) return;

        Promise.all([
            store.get<LocalSyncSettings>('localSyncSettings'),
            store.get<LocalSyncState>('localSyncState'),
        ]).then(([savedSettings, savedState]) => {
            if (savedSettings) setSettings({ ...DEFAULT_SYNC_SETTINGS, ...savedSettings });
            if (savedState) setSyncState(savedState);
            setLoaded(true);
        });
    }, [store, loaded]);

    useEffect(() => {
        if (!store || !loaded) return;
        store.set('localSyncSettings', settings).then(() => store.save());
    }, [store, loaded, settings]);

    useEffect(() => {
        if (!store || !loaded) return;
        store.set('localSyncState', syncState).then(() => store.save());
    }, [store, loaded, syncState]);

    const runSync = useCallback(async () => {
        if (!settings.path) {
            toast.info('Choose a local folder before syncing.');
            return;
        }

        setIsRunning(true);
        try {
            const files = await invoke<LocalFileInfo[]>('cmd_scan_local_folder', { path: settings.path });
            const nextFiles = files.filter((file) => syncState[file.path] !== signatureFor(file));

            if (nextFiles.length === 0) {
                const message = `No changes found in ${files.length} file${files.length === 1 ? '' : 's'}.`;
                setLastResult(message);
                setSettings(current => ({ ...current, lastRun: Date.now() }));
                if (!settings.enabled) toast.info(message);
                return;
            }

            const queued = await queuePaths(nextFiles.map(file => file.path), {
                source: 'sync',
                folderId: settings.folderId,
                silent: true,
                skipDuplicates: settings.folderId === fallbackFolderId,
            });

            setSyncState(current => {
                const next = { ...current };
                nextFiles.forEach((file) => {
                    next[file.path] = signatureFor(file);
                });
                return next;
            });

            const message = `Queued ${queued} changed file${queued === 1 ? '' : 's'} from local sync.`;
            setLastResult(message);
            setSettings(current => ({ ...current, lastRun: Date.now() }));
            if (queued > 0) toast.success(message);
        } catch (error) {
            const message = `Local sync failed: ${error}`;
            setLastResult(message);
            toast.error(message);
        } finally {
            setIsRunning(false);
        }
    }, [fallbackFolderId, queuePaths, settings.enabled, settings.folderId, settings.path, syncState]);

    useEffect(() => {
        if (!loaded || !settings.enabled || !settings.path) return;

        void runSync();
        const interval = window.setInterval(() => {
            void runSync();
        }, Math.max(1, settings.intervalMinutes) * 60 * 1000);

        return () => window.clearInterval(interval);
    }, [loaded, runSync, settings.enabled, settings.intervalMinutes, settings.path]);

    const chooseFolder = useCallback(async () => {
        const selected = await open({
            directory: true,
            multiple: false,
            title: 'Choose local folder to sync',
        });

        if (!selected || Array.isArray(selected)) return;

        setSettings(current => ({
            ...current,
            path: selected,
            folderId: fallbackFolderId,
        }));
        setLastResult('Folder selected. Run sync or enable automatic sync.');
    }, [fallbackFolderId]);

    const setEnabled = useCallback((enabled: boolean) => {
        setSettings(current => ({ ...current, enabled }));
        toast.info(enabled ? 'Local sync enabled.' : 'Local sync disabled.');
    }, []);

    const setTargetFolder = useCallback((folderId: number | null) => {
        setSettings(current => ({ ...current, folderId }));
    }, []);

    const setIntervalMinutes = useCallback((intervalMinutes: number) => {
        setSettings(current => ({ ...current, intervalMinutes: Math.max(1, intervalMinutes) }));
    }, []);

    const resetSyncState = useCallback(() => {
        setSyncState({});
        setLastResult('Sync memory reset. The next run will inspect every file.');
        toast.info('Local sync memory reset.');
    }, []);

    return {
        settings,
        isRunning,
        lastResult,
        chooseFolder,
        runSync,
        setEnabled,
        setTargetFolder,
        setIntervalMinutes,
        resetSyncState,
    };
}
