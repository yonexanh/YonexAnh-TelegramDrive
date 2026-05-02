import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { toast } from 'sonner';

import { TelegramAccountProfile, TelegramFile, TelegramFolder, BandwidthStats, FileFilters, FileMetaRecord, RecentItem, WorkspaceView, ActivityLogItem, GoogleDriveSettings } from '../types';
import { formatBytes, getFileCategory, isAudioFile, isMediaFile, isPdfFile, isVideoFile } from '../utils';

// Components
import { Sidebar } from './dashboard/Sidebar';
import { TopBar } from './dashboard/TopBar';
import { FileExplorer } from './dashboard/FileExplorer';
import { TransferCenter } from './dashboard/TransferCenter';
import { MoveToFolderModal } from './dashboard/MoveToFolderModal';
import { PreviewModal } from './dashboard/PreviewModal';
import { MediaPlayer } from './dashboard/MediaPlayer';
import { DragDropOverlay } from './dashboard/DragDropOverlay';
import { PdfViewer } from './dashboard/PdfViewer';
import { AdvancedSearchPanel } from './dashboard/AdvancedSearchPanel';
import { DetailsPanel } from './dashboard/DetailsPanel';
import { RenameModal } from './dashboard/RenameModal';
import { LocalSyncPanel } from './dashboard/LocalSyncPanel';
import { DiagnosticsPanel } from './dashboard/DiagnosticsPanel';
import { TagManagerPanel, TagStat } from './dashboard/TagManagerPanel';
import { BackupRestorePanel, isMetadataBackupFile } from './dashboard/BackupRestorePanel';
import { ActivityLogPanel } from './dashboard/ActivityLogPanel';
import { StorageAnalyticsPanel } from './dashboard/StorageAnalyticsPanel';
import { GoogleDrivePanel } from './dashboard/GoogleDrivePanel';

// Hooks
import { useTelegramConnection } from '../hooks/useTelegramConnection';
import { useFileOperations } from '../hooks/useFileOperations';
import { useFileUpload } from '../hooks/useFileUpload';
import { useFileDownload } from '../hooks/useFileDownload';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useLocalSync } from '../hooks/useLocalSync';
import { useLanguage } from '../context/LanguageContext';
import { useConfirm } from '../context/ConfirmContext';

const DEFAULT_FILTERS: FileFilters = {
    type: 'all',
    tagQuery: '',
    minSizeMb: '',
    maxSizeMb: '',
    date: 'any',
    favoritesOnly: false,
};

const DEFAULT_GOOGLE_DRIVE_SETTINGS: GoogleDriveSettings = {
    clientId: '',
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    email: null,
    name: null,
    folderId: null,
    folderName: 'YonexAnh Telegram Drive Backup',
    lastBackupAt: null,
    lastBackupResult: null,
};

const getFileKey = (file: Pick<TelegramFile, 'id' | 'folder_id'>, fallbackFolderId: number | null) => {
    const folderId = file.folder_id === undefined ? fallbackFolderId : file.folder_id;
    return `${folderId ?? 'home'}:${file.id}`;
};

const normalizeFile = (file: any, fallbackFolderId: number | null): TelegramFile => {
    const rawName = file.name || 'Unknown';
    return {
        ...file,
        folder_id: file.folder_id === undefined ? fallbackFolderId : file.folder_id,
        name: rawName,
        originalName: file.originalName || rawName,
        size: file.size || 0,
        sizeStr: formatBytes(file.size || 0),
        type: file.type || file.icon_type || (rawName.endsWith('/') ? 'folder' : 'file'),
    };
};

const isFilterActive = (filters: FileFilters) => (
    filters.type !== 'all' ||
    filters.tagQuery.trim() !== '' ||
    filters.minSizeMb.trim() !== '' ||
    filters.maxSizeMb.trim() !== '' ||
    filters.date !== 'any' ||
    filters.favoritesOnly
);

const dedupeFiles = (files: TelegramFile[]) => {
    const byKey = new Map<string, TelegramFile>();
    files.forEach((file) => {
        const key = getFileKey(file, file.folder_id ?? null);
        byKey.set(key, file);
    });
    return Array.from(byKey.values());
};

const normalizeSearchText = (value: string) => value.trim().toLowerCase();

const parseInlineTagSearch = (value: string) => {
    const normalized = normalizeSearchText(value);
    if (normalized.startsWith('#')) return normalized.slice(1).trim();
    if (normalized.startsWith('tag:')) return normalized.slice(4).trim();
    return '';
};

interface MetadataBackupSnapshot {
    schema: 'cloneya-telegram-drive-metadata';
    version: number;
    exportedAt: string;
    fileMeta: Record<string, FileMetaRecord>;
    recentItems: RecentItem[];
    activityLog: ActivityLogItem[];
    folders: TelegramFolder[];
}

interface MetadataBackupUploadResult {
    filename: string;
    folder_id: number | null;
}

interface GoogleDriveAuthResult {
    access_token: string;
    refresh_token?: string | null;
    expires_in: number;
    email?: string | null;
    name?: string | null;
}

interface GoogleDriveFolderResult {
    id: string;
    name: string;
}

interface GoogleDriveUploadResult {
    id: string;
    name: string;
    web_view_link?: string | null;
    web_content_link?: string | null;
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

export function Dashboard({ onLogout, onAddAccount }: { onLogout: () => void; onAddAccount: () => void }) {
    const queryClient = useQueryClient();
    const { t } = useLanguage();
    const { confirm } = useConfirm();


    const {
        store, folders, activeFolderId, setActiveFolderId, accounts, activeAccountId, isSyncing, isConnected,
        handleLogout, handleSyncFolders, handleCreateFolder, handleFolderDelete, handleFolderRename, switchAccount, removeAccount
    } = useTelegramConnection(onLogout);

    const [activeView, setActiveView] = useState<WorkspaceView>('files');
    const [activeCollectionTag, setActiveCollectionTag] = useState<string | null>(null);
    const [previewFile, setPreviewFile] = useState<TelegramFile | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState<TelegramFile[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [fileMeta, setFileMeta] = useState<Record<string, FileMetaRecord>>({});
    const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
    const [activityLog, setActivityLog] = useState<ActivityLogItem[]>([]);
    const [backupBusy, setBackupBusy] = useState(false);
    const [googleDriveSettings, setGoogleDriveSettings] = useState<GoogleDriveSettings>(DEFAULT_GOOGLE_DRIVE_SETTINGS);
    const [googleDriveBusy, setGoogleDriveBusy] = useState(false);
    const [metadataLoaded, setMetadataLoaded] = useState(false);
    const [firstRunChecked, setFirstRunChecked] = useState(false);
    const [filters, setFilters] = useState<FileFilters>(DEFAULT_FILTERS);
    const [renamingFile, setRenamingFile] = useState<TelegramFile | null>(null);
    const [renamingFolder, setRenamingFolder] = useState<{ id: number; name: string } | null>(null);
    const [internalDragFileId, _setInternalDragFileId] = useState<number | null>(null);
    const internalDragRef = useRef<number | null>(null);
    const loggedUploadIdsRef = useRef<Set<string>>(new Set());

    const setInternalDragFileId = (id: number | null) => {
        internalDragRef.current = id;
        _setInternalDragFileId(id);
    };
    const [playingFile, setPlayingFile] = useState<TelegramFile | null>(null);
    const [pdfFile, setPdfFile] = useState<TelegramFile | null>(null);
    const [previewContextFiles, setPreviewContextFiles] = useState<TelegramFile[]>([]);
    const [previewContextIndex, setPreviewContextIndex] = useState(-1);

    useEffect(() => {
        if (!store) return;

        let cancelled = false;
        setMetadataLoaded(false);
        setFirstRunChecked(false);
        setSelectedIds([]);
        setSearchTerm("");
        setSearchResults([]);
        setFileMeta({});
        setRecentItems([]);
        setActivityLog([]);
        setGoogleDriveSettings(DEFAULT_GOOGLE_DRIVE_SETTINGS);

        store.get<'grid' | 'list'>('viewMode').then((saved) => {
            if (!cancelled && saved) setViewMode(saved);
        });
        Promise.all([
            store.get<Record<string, FileMetaRecord>>('fileMeta'),
            store.get<RecentItem[]>('recentItems'),
            store.get<ActivityLogItem[]>('activityLog'),
            store.get<GoogleDriveSettings>('googleDriveSettings')
        ]).then(([savedMeta, savedRecent, savedActivity, savedGoogleDrive]) => {
            if (cancelled) return;
            if (savedMeta) setFileMeta(savedMeta);
            if (savedRecent) setRecentItems(savedRecent.slice(0, 80));
            if (savedActivity) setActivityLog(savedActivity.slice(0, 240));
            if (savedGoogleDrive) setGoogleDriveSettings({ ...DEFAULT_GOOGLE_DRIVE_SETTINGS, ...savedGoogleDrive });
            setMetadataLoaded(true);
        });

        return () => {
            cancelled = true;
        };
    }, [store]);

    useEffect(() => {
        if (store) {
            store.set('viewMode', viewMode).then(() => store.save());
        }
    }, [store, viewMode]);

    useEffect(() => {
        if (!store || !metadataLoaded) return;
        store.set('fileMeta', fileMeta).then(() => store.save());
    }, [store, metadataLoaded, fileMeta]);

    useEffect(() => {
        if (!store || !metadataLoaded) return;
        store.set('recentItems', recentItems.slice(0, 80)).then(() => store.save());
    }, [store, metadataLoaded, recentItems]);

    useEffect(() => {
        if (!store || !metadataLoaded) return;
        store.set('activityLog', activityLog.slice(0, 240)).then(() => store.save());
    }, [store, metadataLoaded, activityLog]);

    useEffect(() => {
        if (!store || !metadataLoaded) return;
        store.set('googleDriveSettings', googleDriveSettings).then(() => store.save());
    }, [store, metadataLoaded, googleDriveSettings]);

    useEffect(() => {
        if (!store || !metadataLoaded || firstRunChecked) return;
        store.get<boolean>('diagnosticsSeen').then((seen) => {
            if (!seen) {
                setActiveView('diagnostics');
                store.set('diagnosticsSeen', true).then(() => store.save());
            }
            setFirstRunChecked(true);
        });
    }, [store, metadataLoaded, firstRunChecked]);


    const { data: allFiles = [], isLoading, error } = useQuery({
        queryKey: ['files', activeAccountId, activeFolderId],
        queryFn: () => invoke<any[]>('cmd_get_files', { folderId: activeFolderId }).then(res => res.map(f => normalizeFile(f, activeFolderId))),
        enabled: !!store,
    });

    const applyLocalMeta = useCallback((file: TelegramFile): TelegramFile => {
        const key = getFileKey(file, file.deletedFromFolderId ?? activeFolderId);
        const meta = fileMeta[key];
        return {
            ...file,
            originalName: file.originalName || file.name,
            name: meta?.name || file.name,
            isFavorite: !!meta?.favorite,
            deletedAt: meta?.deletedAt,
            deletedFromFolderId: meta?.deletedFromFolderId,
            tags: meta?.tags || [],
        };
    }, [activeFolderId, fileMeta]);

    const currentFiles = useMemo(() => allFiles
        .map(applyLocalMeta)
        .filter(file => !file.deletedAt), [allFiles, applyLocalMeta]);

    const favoriteFiles = useMemo(() => Object.values(fileMeta)
        .filter(meta => meta.favorite && meta.file && !meta.deletedAt)
        .sort((a, b) => (b.favoriteAt || 0) - (a.favoriteAt || 0))
        .map(meta => applyLocalMeta(meta.file as TelegramFile)), [fileMeta, applyLocalMeta]);

    const recentFiles = useMemo(() => recentItems
        .map(item => applyLocalMeta(item.file))
        .filter(file => !file.deletedAt)
        .filter((file, index, arr) => arr.findIndex(other => getFileKey(other, activeFolderId) === getFileKey(file, activeFolderId)) === index), [recentItems, applyLocalMeta, activeFolderId]);

    const trashFiles = useMemo(() => Object.values(fileMeta)
        .filter(meta => meta.deletedAt && meta.file)
        .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0))
        .map(meta => applyLocalMeta(meta.file as TelegramFile)), [fileMeta, applyLocalMeta]);

    const collectionTags = useMemo(() => Array.from(new Set(
        Object.values(fileMeta)
            .filter(meta => !meta.deletedAt)
            .flatMap(meta => meta.tags || [])
            .map(tag => tag.trim())
            .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b)), [fileMeta]);

    const collectionFiles = useMemo(() => Object.values(fileMeta)
        .filter(meta => !meta.deletedAt && meta.file && activeCollectionTag && (meta.tags || []).includes(activeCollectionTag))
        .map(meta => applyLocalMeta(meta.file as TelegramFile)), [activeCollectionTag, applyLocalMeta, fileMeta]);

    const taggedFiles = useMemo(() => Object.values(fileMeta)
        .filter(meta => !meta.deletedAt && meta.file && (meta.tags || []).length > 0)
        .map(meta => applyLocalMeta(meta.file as TelegramFile)), [applyLocalMeta, fileMeta]);

    const mediaFiles = useMemo(() => {
        const byKey = new Map<string, TelegramFile>();
        [...currentFiles, ...favoriteFiles, ...recentFiles, ...collectionFiles].forEach((file) => {
            if (file.type !== 'folder' && isMediaFile(file.originalName || file.name)) {
                byKey.set(getFileKey(file, activeFolderId), file);
            }
        });
        return Array.from(byKey.values());
    }, [activeFolderId, collectionFiles, currentFiles, favoriteFiles, recentFiles]);

    const knownActiveFiles = useMemo(() => {
        const byKey = new Map<string, TelegramFile>();
        [...currentFiles, ...favoriteFiles, ...recentFiles, ...taggedFiles].forEach((file) => {
            if (!file.deletedAt) {
                byKey.set(getFileKey(file, file.folder_id ?? null), file);
            }
        });
        Object.values(fileMeta).forEach((meta) => {
            if (!meta.file || meta.deletedAt) return;
            const file = applyLocalMeta(meta.file as TelegramFile);
            if (!file.deletedAt) {
                byKey.set(getFileKey(file, file.folder_id ?? null), file);
            }
        });
        return Array.from(byKey.values());
    }, [applyLocalMeta, currentFiles, favoriteFiles, fileMeta, recentFiles, taggedFiles]);

    const tagStats = useMemo<TagStat[]>(() => {
        const stats = new Map<string, TagStat>();
        Object.values(fileMeta).forEach((meta) => {
            if (!meta.file || meta.deletedAt) return;
            const file = applyLocalMeta(meta.file as TelegramFile);
            const tags = Array.from(new Set((meta.tags || []).map(tag => tag.trim()).filter(Boolean)));
            tags.forEach((tag) => {
                const existing = stats.get(tag) || { tag, count: 0, favoriteCount: 0, totalSize: 0 };
                existing.count += 1;
                existing.favoriteCount += meta.favorite ? 1 : 0;
                existing.totalSize += file.size || 0;
                stats.set(tag, existing);
            });
        });
        return Array.from(stats.values()).sort((a, b) => a.tag.localeCompare(b.tag));
    }, [applyLocalMeta, fileMeta]);

    const backupFiles = useMemo(() => (
        currentFiles.filter(file => file.type !== 'folder' && isMetadataBackupFile(file))
    ), [currentFiles]);

    const enrichedSearchResults = useMemo(() => searchResults.map(applyLocalMeta).filter(file => !file.deletedAt), [searchResults, applyLocalMeta]);

    const baseFiles = useMemo(() => {
        if (activeView === 'favorites') return favoriteFiles;
        if (activeView === 'recent') return recentFiles;
        if (activeView === 'trash') return trashFiles;
        if (activeView === 'media') return mediaFiles;
        if (activeView === 'collection') return collectionFiles;
        if (searchTerm.trim().length > 2 || filters.tagQuery.trim()) {
            return dedupeFiles([...currentFiles, ...taggedFiles, ...enrichedSearchResults]);
        }
        return currentFiles;
    }, [activeView, collectionFiles, currentFiles, enrichedSearchResults, favoriteFiles, filters.tagQuery, mediaFiles, recentFiles, searchTerm, taggedFiles, trashFiles]);

    const displayedFiles = useMemo(() => {
        const localTerm = normalizeSearchText(searchTerm);
        const inlineTagTerm = parseInlineTagSearch(searchTerm);
        const filterTagTerm = normalizeSearchText(filters.tagQuery);
        const minBytes = filters.minSizeMb.trim() ? Number(filters.minSizeMb) * 1024 * 1024 : null;
        const maxBytes = filters.maxSizeMb.trim() ? Number(filters.maxSizeMb) * 1024 * 1024 : null;
        const now = Date.now();
        const dateCutoff = filters.date === 'today'
            ? now - 24 * 60 * 60 * 1000
            : filters.date === 'week'
                ? now - 7 * 24 * 60 * 60 * 1000
                : filters.date === 'month'
                    ? now - 30 * 24 * 60 * 60 * 1000
                    : null;

        return baseFiles.filter((file) => {
            const tags = file.tags || [];
            const tagText = tags.join(' ').toLowerCase();

            if (localTerm) {
                const nameText = `${file.name} ${file.originalName || ''}`.toLowerCase();
                const tagSearchTerm = inlineTagTerm || localTerm;
                const matchesTag = tagSearchTerm ? tagText.includes(tagSearchTerm) : false;
                const matchesName = inlineTagTerm ? false : nameText.includes(localTerm);
                if (!matchesName && !matchesTag) return false;
            }

            if (filterTagTerm && !tagText.includes(filterTagTerm)) return false;
            if (filters.type !== 'all' && getFileCategory(file.originalName || file.name) !== filters.type) return false;
            if (filters.favoritesOnly && !file.isFavorite) return false;
            if (minBytes !== null && !Number.isNaN(minBytes) && file.size < minBytes) return false;
            if (maxBytes !== null && !Number.isNaN(maxBytes) && file.size > maxBytes) return false;
            if (dateCutoff && file.created_at) {
                const created = Date.parse(file.created_at);
                if (!Number.isNaN(created) && created < dateCutoff) return false;
            }
            return true;
        });
    }, [baseFiles, filters, searchTerm]);

    const { data: bandwidth } = useQuery({
        queryKey: ['bandwidth'],
        queryFn: () => invoke<BandwidthStats>('cmd_get_bandwidth'),
        refetchInterval: 5000,
        enabled: !!store
    });

    const { data: currentUser = null } = useQuery({
        queryKey: ['current-user', activeAccountId],
        queryFn: () => invoke<TelegramAccountProfile | null>('cmd_get_current_user').catch(() => null),
        enabled: !!store && isConnected,
        staleTime: 5 * 60 * 1000,
    });


    const {
        handleDelete, handleBulkDelete,
        handleBulkMove, handleGlobalSearch

    } = useFileOperations(activeFolderId, selectedIds, setSelectedIds, displayedFiles);

    const {
        uploadQueue,
        setUploadQueue,
        queuePaths,
        handleManualUpload,
        cancelAll: cancelUploads,
        cancelItem: cancelUpload,
        retryItem: retryUpload,
        pauseItem: pauseUpload,
        resumeItem: resumeUpload,
        isDragging
    } = useFileUpload(activeFolderId, store, currentFiles);
    const {
        downloadQueue,
        queueDownload,
        queueBulkDownload,
        clearFinished: clearDownloads,
        cancelAll: cancelDownloads,
        cancelItem: cancelDownload,
        retryItem: retryDownload,
        pauseItem: pauseDownload,
        resumeItem: resumeDownload,
        openDownloadedFile,
        revealDownloadedFile
    } = useFileDownload(store);

    const localSync = useLocalSync(store, activeFolderId, queuePaths);

    const getFolderName = useCallback((folderId: number | null | undefined) => {
        if (folderId === null || folderId === undefined) return t('sidebar.savedMessages');
        return folders.find(folder => folder.id === folderId)?.name || t('details.folder');
    }, [folders, t]);

    const recordActivity = useCallback((
        action: ActivityLogItem['action'],
        label: string,
        detail?: string,
        file?: TelegramFile,
    ) => {
        const fileKey = file ? getFileKey(file, file.folder_id ?? activeFolderId) : undefined;
        setActivityLog(items => [
            {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                action,
                label,
                detail,
                fileKey,
                fileName: file?.name,
                at: Date.now(),
            },
            ...items,
        ].slice(0, 240));
    }, [activeFolderId]);

    useEffect(() => {
        uploadQueue.forEach((item) => {
            if (item.status !== 'success' || loggedUploadIdsRef.current.has(item.id)) return;
            loggedUploadIdsRef.current.add(item.id);
            recordActivity(
                'upload',
                t('activity.label.upload'),
                `${item.path.split(/[\\/]/).pop() || item.path} -> ${getFolderName(item.folderId)}`,
            );
        });
    }, [getFolderName, recordActivity, t, uploadQueue]);

    const rememberRecent = useCallback((file: TelegramFile, action: RecentItem['action']) => {
        const normalized = applyLocalMeta(file);
        const key = getFileKey(normalized, activeFolderId);
        setRecentItems(items => [
            { key, file: normalized, action, at: Date.now() },
            ...items.filter(item => item.key !== key)
        ].slice(0, 80));
    }, [activeFolderId, applyLocalMeta]);

    const updateFileMeta = useCallback((file: TelegramFile, updater: (current: FileMetaRecord) => FileMetaRecord) => {
        const key = getFileKey(file, activeFolderId);
        setFileMeta(current => {
            const existing = current[key] || {};
            const next = updater(existing);
            return { ...current, [key]: next };
        });
    }, [activeFolderId]);

    const handleToggleFavorite = useCallback((file: TelegramFile) => {
        const wasFavorite = !!file.isFavorite;
        updateFileMeta(file, (current) => {
            const favorite = !current.favorite;
            return {
                ...current,
                favorite,
                favoriteAt: favorite ? Date.now() : current.favoriteAt,
                file: { ...file, isFavorite: favorite },
            };
        });
        rememberRecent(file, 'favorite');
        recordActivity(
            'favorite',
            wasFavorite ? t('activity.label.favoriteRemoved') : t('activity.label.favoriteAdded'),
            file.name,
            file,
        );
    }, [recordActivity, rememberRecent, t, updateFileMeta]);

    const handleAddTag = useCallback((file: TelegramFile, tag: string) => {
        const normalizedTag = tag.trim().replace(/\s+/g, ' ');
        if (!normalizedTag) return;

        updateFileMeta(file, (current) => {
            const tags = Array.from(new Set([...(current.tags || []), normalizedTag]));
            return {
                ...current,
                tags,
                file: { ...file, tags },
            };
        });
        rememberRecent(file, 'tag');
        recordActivity('tag_add', t('activity.label.tagAdded'), `${normalizedTag} -> ${file.name}`, file);
    }, [recordActivity, rememberRecent, t, updateFileMeta]);

    const handleRemoveTag = useCallback((file: TelegramFile, tag: string) => {
        updateFileMeta(file, (current) => {
            const tags = (current.tags || []).filter(item => item !== tag);
            return {
                ...current,
                tags,
                file: { ...file, tags },
            };
        });
        recordActivity('tag_remove', t('activity.label.tagRemoved'), `${tag} -> ${file.name}`, file);
    }, [recordActivity, t, updateFileMeta]);

    const handleMoveToTrash = useCallback((file: TelegramFile) => {
        const key = getFileKey(file, activeFolderId);
        const trashed = {
            ...file,
            deletedAt: Date.now(),
            deletedFromFolderId: file.folder_id === undefined ? activeFolderId : file.folder_id,
        };
        setFileMeta(current => ({
            ...current,
            [key]: {
                ...(current[key] || {}),
                deletedAt: trashed.deletedAt,
                deletedFromFolderId: trashed.deletedFromFolderId,
                file: trashed,
            }
        }));
        setSelectedIds(ids => ids.filter(id => id !== file.id));
        rememberRecent(file, 'trash');
        recordActivity('trash', t('activity.label.trash'), file.name, file);
        toast.success('Moved to Trash.');
    }, [activeFolderId, recordActivity, rememberRecent, t]);

    const handleRestoreFile = useCallback((file: TelegramFile) => {
        const key = getFileKey(file, file.deletedFromFolderId ?? activeFolderId);
        setFileMeta(current => {
            const existing = current[key];
            if (!existing) return current;
            const restoredFile = {
                ...(existing.file || file),
                deletedAt: undefined,
                deletedFromFolderId: undefined,
            };
            return {
                ...current,
                [key]: {
                    ...existing,
                    deletedAt: undefined,
                    deletedFromFolderId: undefined,
                    file: restoredFile,
                }
            };
        });
        setSelectedIds(ids => ids.filter(id => id !== file.id));
        rememberRecent(file, 'restore');
        recordActivity('restore', t('activity.label.restore'), file.name, file);
        toast.success('File restored.');
    }, [activeFolderId, recordActivity, rememberRecent, t]);

    const handleRenameFile = useCallback(async (file: TelegramFile, name: string) => {
        const key = getFileKey(file, activeFolderId);
        const renamed = { ...file, name, originalName: file.originalName || file.name };
        updateFileMeta(file, (current) => ({
            ...current,
            name,
            file: renamed,
        }));
        setRecentItems(items => [
            { key, file: renamed, action: 'rename' as const, at: Date.now() },
            ...items.filter(item => item.key !== key)
        ].slice(0, 80));
        recordActivity('rename', t('activity.label.rename'), `${file.name} -> ${name}`, renamed);
        toast.success('File renamed locally.');
    }, [activeFolderId, recordActivity, t, updateFileMeta]);

    const handleRenameFolderSubmit = useCallback(async (folderId: number, name: string) => {
        await handleFolderRename(folderId, name);
        recordActivity('folder', t('activity.label.folderRename'), name);
        if (activeFolderId === folderId) {
            queryClient.invalidateQueries({ queryKey: ['files'] });
        }
    }, [activeFolderId, handleFolderRename, queryClient, recordActivity, t]);

    const queueFileDownload = useCallback((file: TelegramFile) => {
        const folderId = file.folder_id === undefined ? activeFolderId : file.folder_id;
        queueDownload(file.id, file.name, folderId ?? null);
        rememberRecent(file, 'download');
        recordActivity('download', t('activity.label.download'), `${file.name} <- ${getFolderName(folderId)}`, file);
    }, [activeFolderId, getFolderName, queueDownload, recordActivity, rememberRecent, t]);

    const handleDeleteFile = useCallback((file: TelegramFile) => {
        if (!file.deletedAt) {
            handleMoveToTrash(file);
            return;
        }

        const folderId = file.folder_id === undefined ? activeFolderId : file.folder_id;
        const key = getFileKey(file, activeFolderId);
        handleDelete(file.id, folderId ?? null).then((deleted) => {
            if (!deleted) return;
            setSelectedIds(ids => ids.filter(id => id !== file.id));
            setFileMeta(current => {
                const next = { ...current };
                delete next[key];
                return next;
            });
            setRecentItems(items => items.filter(item => item.key !== key));
        });
    }, [activeFolderId, handleDelete, handleMoveToTrash]);

    const handleBulkDeleteAndCleanup = useCallback(async () => {
        if (selectedIds.length === 0) return;

        if (activeView !== 'trash') {
            displayedFiles
                .filter(file => selectedIds.includes(file.id))
                .forEach(handleMoveToTrash);
            setSelectedIds([]);
            return;
        }

        const deletedIds = await handleBulkDelete();
        if (!deletedIds || deletedIds.length === 0) return;
        const deletedKeys = new Set(
            displayedFiles
                .filter(file => deletedIds.includes(file.id))
                .map(file => getFileKey(file, activeFolderId))
        );
        setFileMeta(current => {
            const next = { ...current };
            deletedKeys.forEach(key => delete next[key]);
            return next;
        });
        setRecentItems(items => items.filter(item => !deletedKeys.has(item.key)));
        recordActivity('trash', t('activity.label.deleteForever'), `${deletedIds.length} ${t('activity.filesChanged')}`);
    }, [activeFolderId, activeView, displayedFiles, handleBulkDelete, handleMoveToTrash, recordActivity, selectedIds, t]);

    const handleBulkRestore = useCallback(() => {
        displayedFiles
            .filter(file => selectedIds.includes(file.id))
            .forEach(handleRestoreFile);
        setSelectedIds([]);
    }, [displayedFiles, handleRestoreFile, selectedIds]);


    const handleSelectAll = useCallback(() => {
        setSelectedIds(displayedFiles.map(f => f.id));
    }, [displayedFiles]);

    const handleKeyboardDelete = useCallback(() => {
        if (selectedIds.length > 0) {
            handleBulkDeleteAndCleanup();
        }
    }, [selectedIds, handleBulkDeleteAndCleanup]);

    const handleEscape = useCallback(() => {
        setSelectedIds([]);
        setSearchTerm("");
        setPreviewFile(null);
        setPlayingFile(null);
        setPdfFile(null);
    }, []);

    const handleFocusSearch = useCallback(() => {
        const searchInput = document.querySelector('input[data-search-input="true"]') as HTMLInputElement;
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    }, []);

    const handleEnter = useCallback(() => {
        if (selectedIds.length === 1) {
            const selected = displayedFiles.find(f => f.id === selectedIds[0]);
            if (selected) {
                if (selected.type === 'folder') {
                    setActiveFolderId(selected.id);
                } else {
                    handlePreview(selected, displayedFiles);
                }
            }
        }
    }, [selectedIds, displayedFiles, setActiveFolderId]);

    useKeyboardShortcuts({
        onSelectAll: handleSelectAll,
        onDelete: handleKeyboardDelete,
        onEscape: handleEscape,
        onSearch: handleFocusSearch,
        onEnter: handleEnter,
        enabled: !['sync', 'googleDrive', 'diagnostics', 'tags', 'backup', 'activity', 'analytics'].includes(activeView) && !previewFile && !playingFile && !pdfFile && !showMoveModal
    });


    useEffect(() => {
        setSelectedIds([]);
        setShowMoveModal(false);
        setSearchTerm("");
        setSearchResults([]);
        setPreviewFile(null);
        setPlayingFile(null);
        setPdfFile(null);
        setPreviewContextFiles([]);
        setPreviewContextIndex(-1);
    }, [activeFolderId]);

    useEffect(() => {
        setSelectedIds([]);
        setShowMoveModal(false);
    }, [activeView]);

    useEffect(() => {
        setSelectedIds([]);
    }, [activeCollectionTag]);


    useEffect(() => {
        if (activeView !== 'files' || searchTerm.length <= 2) {
            setSearchResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearching(true);
            const results = await handleGlobalSearch(searchTerm);
            setSearchResults(results.map((file: any) => normalizeFile(file, activeFolderId)));
            setIsSearching(false);
        }, 500);

        return () => clearTimeout(timer);
    }, [activeFolderId, activeView, searchTerm]);




    const handleFileClick = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if (e.metaKey || e.ctrlKey) {
            setSelectedIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
        } else {
            setSelectedIds([id]);
        }
    }

    const handlePreview = (file: TelegramFile, orderedFiles?: TelegramFile[]) => {
        rememberRecent(file, 'preview');
        const contextFiles = (orderedFiles || displayedFiles).filter((f) => f.type !== 'folder');
        const contextIndex = contextFiles.findIndex((f) => f.id === file.id);

        setPreviewContextFiles(contextFiles);
        setPreviewContextIndex(contextIndex);

        const typeName = file.originalName || file.name;
        const isMedia = isMediaFile(typeName);
        const isPdf = isPdfFile(typeName);

        if (isMedia) {
            setPlayingFile(file);
            setPreviewFile(null);
            setPdfFile(null);
        } else if (isPdf) {
            setPdfFile(file);
            setPreviewFile(null);
            setPlayingFile(null);
        } else {
            setPreviewFile(file);
            setPlayingFile(null);
            setPdfFile(null);
        }
    };

    const navigatePreview = useCallback((step: 1 | -1) => {
        if (previewContextFiles.length === 0) return;

        const currentFileId = previewFile?.id ?? playingFile?.id ?? pdfFile?.id;
        if (!currentFileId) return;

        const currentIndex = previewContextFiles.findIndex((f) => f.id === currentFileId);
        if (currentIndex === -1) return;

        const nextIndex = (currentIndex + step + previewContextFiles.length) % previewContextFiles.length;
        const nextFile = previewContextFiles[nextIndex];
        if (!nextFile) return;

        setPreviewContextIndex(nextIndex);

        const typeName = nextFile.originalName || nextFile.name;
        const isMedia = isMediaFile(typeName);
        const isPdf = isPdfFile(typeName);

        if (isMedia) {
            setPlayingFile(nextFile);
            setPreviewFile(null);
            setPdfFile(null);
        } else if (isPdf) {
            setPdfFile(nextFile);
            setPreviewFile(null);
            setPlayingFile(null);
        } else {
            setPreviewFile(nextFile);
            setPlayingFile(null);
            setPdfFile(null);
        }
    }, [previewContextFiles, previewFile, playingFile, pdfFile]);

    const handleNextPreview = useCallback(() => {
        navigatePreview(1);
    }, [navigatePreview]);

    const handlePrevPreview = useCallback(() => {
        navigatePreview(-1);
    }, [navigatePreview]);

    const previewNeighborFiles = useCallback(() => {
        if (previewContextFiles.length === 0) {
            return { nextFile: null as TelegramFile | null, prevFile: null as TelegramFile | null };
        }

        const currentFileId = previewFile?.id ?? playingFile?.id ?? pdfFile?.id;
        if (!currentFileId) {
            return { nextFile: null as TelegramFile | null, prevFile: null as TelegramFile | null };
        }

        const currentIdx = previewContextFiles.findIndex((f) => f.id === currentFileId);
        if (currentIdx === -1) {
            return { nextFile: null as TelegramFile | null, prevFile: null as TelegramFile | null };
        }

        const nextIdx = (currentIdx + 1) % previewContextFiles.length;
        const prevIdx = (currentIdx - 1 + previewContextFiles.length) % previewContextFiles.length;

        return {
            nextFile: previewContextFiles[nextIdx] || null,
            prevFile: previewContextFiles[prevIdx] || null,
        };
    }, [previewContextFiles, previewFile, playingFile, pdfFile]);

    const handleDropOnFolder = async (e: React.DragEvent, targetFolderId: number | null) => {
        e.preventDefault();
        e.stopPropagation();

        const dataTransferFileId = e.dataTransfer.getData("application/x-telegram-file-id");

        if (activeFolderId === targetFolderId) return;

        const fileId = internalDragRef.current || (dataTransferFileId ? parseInt(dataTransferFileId) : null);

        if (fileId) {
            try {
                const idsToMove = selectedIds.includes(fileId) ? selectedIds : [fileId];
                const movingFiles = displayedFiles.filter((f) => idsToMove.includes(f.id));
                const sourceIds = Array.from(new Set(movingFiles.map((f) => f.folder_id === undefined ? activeFolderId : f.folder_id)));
                if (sourceIds.length > 1) {
                    toast.error("Move selection must come from one folder.");
                    return;
                }
                const sourceFolderId = sourceIds[0] === undefined ? activeFolderId : sourceIds[0];

                await invoke('cmd_move_files', {
                    messageIds: idsToMove,
                    sourceFolderId,
                    targetFolderId: targetFolderId
                });

                queryClient.invalidateQueries({ queryKey: ['files'] });

                if (selectedIds.includes(fileId)) setSelectedIds([]);

                toast.success(`Moved ${idsToMove.length} file(s).`);
                recordActivity('move', t('activity.label.move'), `${idsToMove.length} ${t('activity.filesChanged')} -> ${getFolderName(targetFolderId)}`);

                setInternalDragFileId(null);
            } catch {
                toast.error(`Failed to move file(s).`);
            }
        }
    }

    const handleOpenTag = useCallback((tag: string) => {
        setActiveView('collection');
        setActiveCollectionTag(tag);
        setSelectedIds([]);
    }, []);

    const handleRenameTag = useCallback((tag: string, nextTag: string) => {
        const normalizedTag = nextTag.trim().replace(/\s+/g, ' ');
        if (!normalizedTag || normalizedTag === tag) return;

        const affected = Object.values(fileMeta).filter(meta => (meta.tags || []).includes(tag)).length;
        if (affected === 0) return;

        setFileMeta(current => {
            const next = { ...current };
            Object.entries(current).forEach(([key, meta]) => {
                if (!(meta.tags || []).includes(tag)) return;
                const tags = Array.from(new Set((meta.tags || []).map(item => item === tag ? normalizedTag : item)));
                next[key] = {
                    ...meta,
                    tags,
                    file: meta.file ? { ...meta.file, tags } : meta.file,
                };
            });
            return next;
        });

        if (activeCollectionTag === tag) setActiveCollectionTag(normalizedTag);
        recordActivity('tag_rename', t('activity.label.tagRenamed'), `${tag} -> ${normalizedTag} (${affected} ${t('activity.filesChanged')})`);
        toast.success(t('tags.renamed'));
    }, [activeCollectionTag, fileMeta, recordActivity, t]);

    const handleDeleteTag = useCallback(async (tag: string) => {
        const affected = Object.values(fileMeta).filter(meta => (meta.tags || []).includes(tag)).length;
        if (affected === 0) return;

        const ok = await confirm({
            title: t('tags.deleteTitle'),
            message: `${t('tags.deleteMessage')} "${tag}"?`,
            confirmText: t('tags.delete'),
            cancelText: t('common.cancel'),
            variant: 'danger',
        });
        if (!ok) return;

        setFileMeta(current => {
            const next = { ...current };
            Object.entries(current).forEach(([key, meta]) => {
                if (!(meta.tags || []).includes(tag)) return;
                const tags = (meta.tags || []).filter(item => item !== tag);
                next[key] = {
                    ...meta,
                    tags,
                    file: meta.file ? { ...meta.file, tags } : meta.file,
                };
            });
            return next;
        });

        if (activeCollectionTag === tag) {
            setActiveCollectionTag(null);
            setActiveView('tags');
        }
        recordActivity('tag_delete', t('activity.label.tagDeleted'), `${tag} (${affected} ${t('activity.filesChanged')})`);
        toast.success(t('tags.deleted'));
    }, [activeCollectionTag, confirm, fileMeta, recordActivity, t]);

    const createMetadataSnapshot = useCallback((): MetadataBackupSnapshot => ({
        schema: 'cloneya-telegram-drive-metadata',
        version: 1,
        exportedAt: new Date().toISOString(),
        fileMeta,
        recentItems: recentItems.slice(0, 80),
        activityLog: activityLog.slice(0, 240),
        folders,
    }), [activityLog, fileMeta, folders, recentItems]);

    const handleCreateMetadataBackup = useCallback(async (folderId: number | null) => {
        setBackupBusy(true);
        try {
            const snapshot = createMetadataSnapshot();
            const result = await invoke<MetadataBackupUploadResult>('cmd_upload_metadata_backup', {
                content: JSON.stringify(snapshot, null, 2),
                folderId,
            });
            queryClient.invalidateQueries({ queryKey: ['files'] });
            recordActivity('backup', t('activity.label.backup'), `${result.filename} -> ${getFolderName(folderId)}`);
            toast.success(t('backup.created'));
        } catch (error) {
            toast.error(`${t('backup.failed')}: ${error}`);
        } finally {
            setBackupBusy(false);
        }
    }, [createMetadataSnapshot, getFolderName, queryClient, recordActivity, t]);

    const handleRestoreMetadataBackup = useCallback(async (file: TelegramFile) => {
        const ok = await confirm({
            title: t('backup.restoreConfirmTitle'),
            message: `${t('backup.restoreConfirmMessage')}\n\n${file.name}`,
            confirmText: t('backup.restore'),
            cancelText: t('common.cancel'),
            variant: 'info',
        });
        if (!ok) return;

        setBackupBusy(true);
        try {
            const folderId = file.folder_id === undefined ? activeFolderId : file.folder_id;
            const content = await invoke<string>('cmd_read_metadata_backup', {
                messageId: file.id,
                folderId,
            });
            const parsed = JSON.parse(content) as unknown;
            if (!isPlainRecord(parsed) || !isPlainRecord(parsed.fileMeta)) {
                throw new Error(t('backup.invalid'));
            }

            const snapshot = parsed as Partial<MetadataBackupSnapshot>;
            setFileMeta(snapshot.fileMeta as Record<string, FileMetaRecord>);
            setRecentItems(Array.isArray(snapshot.recentItems) ? snapshot.recentItems.slice(0, 80) : []);
            setActivityLog(Array.isArray(snapshot.activityLog) ? snapshot.activityLog.slice(0, 240) : []);
            recordActivity('metadata_restore', t('activity.label.metadataRestore'), file.name, file);
            toast.success(t('backup.restored'));
        } catch (error) {
            toast.error(`${t('backup.restoreFailed')}: ${error}`);
        } finally {
            setBackupBusy(false);
        }
    }, [activeFolderId, confirm, recordActivity, t]);

    const handleClearActivityLog = useCallback(async () => {
        if (activityLog.length === 0) return;
        const ok = await confirm({
            title: t('activity.clear'),
            message: t('activity.clearConfirm'),
            confirmText: t('activity.clear'),
            cancelText: t('common.cancel'),
            variant: 'danger',
        });
        if (ok) setActivityLog([]);
    }, [activityLog.length, confirm, t]);

    const applyGoogleDriveAuth = useCallback((auth: GoogleDriveAuthResult) => {
        setGoogleDriveSettings(current => ({
            ...current,
            accessToken: auth.access_token,
            refreshToken: auth.refresh_token || current.refreshToken,
            expiresAt: Date.now() + Math.max(60, auth.expires_in || 3600) * 1000,
            email: auth.email ?? current.email ?? null,
            name: auth.name ?? current.name ?? null,
        }));
    }, []);

    const getGoogleDriveAccessToken = useCallback(async () => {
        if (googleDriveSettings.accessToken && googleDriveSettings.expiresAt && googleDriveSettings.expiresAt > Date.now() + 60_000) {
            return googleDriveSettings.accessToken;
        }
        if (!googleDriveSettings.clientId.trim() || !googleDriveSettings.refreshToken) {
            throw new Error(t('gdrive.connectRequired'));
        }
        const auth = await invoke<GoogleDriveAuthResult>('cmd_google_drive_refresh_access_token', {
            clientId: googleDriveSettings.clientId,
            refreshToken: googleDriveSettings.refreshToken,
        });
        applyGoogleDriveAuth(auth);
        return auth.access_token;
    }, [applyGoogleDriveAuth, googleDriveSettings.accessToken, googleDriveSettings.clientId, googleDriveSettings.expiresAt, googleDriveSettings.refreshToken, t]);

    const handleGoogleDriveClientIdChange = useCallback((clientId: string) => {
        setGoogleDriveSettings(current => ({ ...current, clientId }));
    }, []);

    const handleGoogleDriveFolderNameChange = useCallback((folderName: string) => {
        setGoogleDriveSettings(current => ({ ...current, folderName, folderId: null }));
    }, []);

    const handleGoogleDriveConnect = useCallback(async () => {
        setGoogleDriveBusy(true);
        try {
            const auth = await invoke<GoogleDriveAuthResult>('cmd_google_drive_begin_auth', {
                clientId: googleDriveSettings.clientId,
            });
            applyGoogleDriveAuth(auth);
            recordActivity('google_drive', t('activity.label.googleDriveConnect'), auth.email || auth.name || t('gdrive.connected'));
            toast.success(t('gdrive.connected'));
        } catch (error) {
            toast.error(`${t('gdrive.connectFailed')}: ${error}`);
        } finally {
            setGoogleDriveBusy(false);
        }
    }, [applyGoogleDriveAuth, googleDriveSettings.clientId, recordActivity, t]);

    const handleGoogleDriveDisconnect = useCallback(async () => {
        const ok = await confirm({
            title: t('gdrive.disconnect'),
            message: t('gdrive.disconnectConfirm'),
            confirmText: t('gdrive.disconnect'),
            cancelText: t('common.cancel'),
            variant: 'danger',
        });
        if (!ok) return;
        setGoogleDriveSettings(current => ({
            ...current,
            accessToken: null,
            refreshToken: null,
            expiresAt: null,
            email: null,
            name: null,
            folderId: null,
            lastBackupResult: null,
        }));
        recordActivity('google_drive', t('activity.label.googleDriveDisconnect'));
    }, [confirm, recordActivity, t]);

    const ensureGoogleDriveFolder = useCallback(async () => {
        const accessToken = await getGoogleDriveAccessToken();
        const folder = await invoke<GoogleDriveFolderResult>('cmd_google_drive_ensure_folder', {
            accessToken,
            folderName: googleDriveSettings.folderName,
        });
        setGoogleDriveSettings(current => ({
            ...current,
            folderId: folder.id,
            folderName: folder.name,
        }));
        return folder;
    }, [getGoogleDriveAccessToken, googleDriveSettings.folderName]);

    const handleGoogleDriveEnsureFolder = useCallback(async () => {
        setGoogleDriveBusy(true);
        try {
            const folder = await ensureGoogleDriveFolder();
            recordActivity('google_drive', t('activity.label.googleDriveFolder'), folder.name);
            toast.success(t('gdrive.folderReady'));
        } catch (error) {
            toast.error(`${t('gdrive.folderFailed')}: ${error}`);
        } finally {
            setGoogleDriveBusy(false);
        }
    }, [ensureGoogleDriveFolder, recordActivity, t]);

    const handleGoogleDriveBackupFile = useCallback(async (file: TelegramFile) => {
        setGoogleDriveBusy(true);
        try {
            const accessToken = await getGoogleDriveAccessToken();
            const folder = googleDriveSettings.folderId
                ? { id: googleDriveSettings.folderId, name: googleDriveSettings.folderName }
                : await ensureGoogleDriveFolder();
            const folderId = file.folder_id === undefined ? activeFolderId : file.folder_id;
            const result = await invoke<GoogleDriveUploadResult>('cmd_google_drive_backup_telegram_file', {
                messageId: file.id,
                folderId,
                accessToken,
                driveFolderId: folder.id,
                filename: file.name,
                mimeType: file.mime_type || null,
            });
            const link = result.web_view_link || result.web_content_link || '';
            setGoogleDriveSettings(current => ({
                ...current,
                folderId: folder.id,
                folderName: folder.name,
                lastBackupAt: Date.now(),
                lastBackupResult: link || result.name,
            }));
            recordActivity('google_drive', t('activity.label.googleDriveBackup'), `${file.name} -> ${folder.name}`, file);
            toast.success(t('gdrive.backupDone'));
        } catch (error) {
            toast.error(`${t('gdrive.backupFailed')}: ${error}`);
        } finally {
            setGoogleDriveBusy(false);
        }
    }, [activeFolderId, ensureGoogleDriveFolder, getGoogleDriveAccessToken, googleDriveSettings.folderId, googleDriveSettings.folderName, recordActivity, t]);

    const handleCreateFolderAndLog = useCallback(async (name: string) => {
        await handleCreateFolder(name);
        recordActivity('folder', t('activity.label.folderCreate'), name);
    }, [handleCreateFolder, recordActivity, t]);

    const handleMoveSelection = useCallback((targetFolderId: number | null) => {
        const count = selectedIds.length;
        void handleBulkMove(targetFolderId, () => {
            recordActivity('move', t('activity.label.move'), `${count} ${t('activity.filesChanged')} -> ${getFolderName(targetFolderId)}`);
            setShowMoveModal(false);
        });
    }, [getFolderName, handleBulkMove, recordActivity, selectedIds.length, t]);

    const handleRunLocalSync = useCallback(async () => {
        await localSync.runSync();
        recordActivity('sync', t('activity.label.sync'), localSync.settings.path || t('sync.notRun'));
    }, [localSync, recordActivity, t]);

    const currentFolderName = activeView === 'favorites'
        ? t('sidebar.favorites')
        : activeView === 'recent'
            ? t('sidebar.recent')
            : activeView === 'trash'
                ? t('common.trash')
                : activeView === 'media'
                    ? t('sidebar.media')
                    : activeView === 'tags'
                        ? t('sidebar.tagManager')
                        : activeView === 'backup'
                            ? t('sidebar.backup')
                            : activeView === 'activity'
                                ? t('sidebar.activity')
                                : activeView === 'analytics'
                                    ? t('sidebar.analytics')
                                    : activeView === 'sync'
                                        ? t('sidebar.localSync')
                                        : activeView === 'googleDrive'
                                            ? t('sidebar.googleDrive')
                                            : activeView === 'diagnostics'
                                                ? t('diagnostics.title')
                                                : activeView === 'collection'
                                                    ? activeCollectionTag || 'Collection'
                                                    : activeFolderId === null
                                                        ? t('sidebar.savedMessages')
                                                        : folders.find(f => f.id === activeFolderId)?.name || t('details.folder');


    const handleRootDragOver = (e: React.DragEvent) => {
        if (internalDragRef.current) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
        }
    };

    const handleRootDragEnter = (e: React.DragEvent) => {
        if (internalDragRef.current) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
        }
    };

    const previewNeighbors = previewNeighborFiles();

    const handleQueuedBulkDownload = async () => {
        const targetFiles = displayedFiles.filter((f) => selectedIds.includes(f.id) && f.type !== 'folder');
        if (targetFiles.length === 0) {
            toast.info("No files selected.");
            return;
        }

        const queued = await queueBulkDownload(targetFiles, activeFolderId);
        if (queued) {
            targetFiles.forEach(file => rememberRecent(file, 'download'));
            recordActivity('download', t('activity.label.bulkDownload'), `${targetFiles.length} ${t('activity.filesChanged')}`);
            setSelectedIds([]);
        }
    };

    const handleQueuedFolderDownload = async () => {
        const targetFiles = displayedFiles.filter((f) => f.type !== 'folder');
        if (targetFiles.length === 0) {
            toast.info("Folder is empty.");
            return;
        }

        const queued = await queueBulkDownload(targetFiles, activeFolderId);
        if (queued) {
            targetFiles.forEach(file => rememberRecent(file, 'download'));
            recordActivity('download', t('activity.label.folderDownload'), `${targetFiles.length} ${t('activity.filesChanged')} <- ${getFolderName(activeFolderId)}`);
        }
    };

    const selectedFile = selectedIds.length === 1
        ? displayedFiles.find(file => file.id === selectedIds[0]) || null
        : null;

    const filtersActive = showFilters || isFilterActive(filters);

    return (
        <div
            className="flex h-screen w-full overflow-hidden bg-telegram-bg relative"
            onClick={() => setSelectedIds([])}
            onDragOver={handleRootDragOver}
            onDragEnter={handleRootDragEnter}
        >

            <AnimatePresence>
                {showMoveModal && (
                    <MoveToFolderModal
                        folders={folders}
                        onClose={() => setShowMoveModal(false)}
                        onSelect={handleMoveSelection}
                        activeFolderId={activeFolderId}
                        key="move-modal"
                    />
                )}
                {playingFile && (
                    <MediaPlayer
                        file={playingFile}
                        onClose={() => setPlayingFile(null)}
                        onNext={handleNextPreview}
                        onPrev={handlePrevPreview}
                        currentIndex={previewContextIndex}
                        totalItems={previewContextFiles.length}
                        activeFolderId={playingFile.folder_id === undefined ? activeFolderId : playingFile.folder_id}
                        key="media-player"
                    />
                )}
                {pdfFile && (
                    <PdfViewer
                        file={pdfFile}
                        onClose={() => setPdfFile(null)}
                        onNext={handleNextPreview}
                        onPrev={handlePrevPreview}
                        currentIndex={previewContextIndex}
                        totalItems={previewContextFiles.length}
                        activeFolderId={pdfFile.folder_id === undefined ? activeFolderId : pdfFile.folder_id}
                        key="pdf-viewer"
                    />
                )}
                {isDragging && internalDragFileId === null && <DragDropOverlay key="drag-drop-overlay" />}
            </AnimatePresence>

            <Sidebar
                folders={folders}
                activeFolderId={activeFolderId}
                activeView={activeView}
                collectionTags={collectionTags}
                activeCollectionTag={activeCollectionTag}
                setActiveFolderId={setActiveFolderId}
                setActiveView={setActiveView}
                setActiveCollectionTag={setActiveCollectionTag}
                onDrop={handleDropOnFolder}
                onDelete={handleFolderDelete}
                onRename={(id, name) => setRenamingFolder({ id, name })}
                onCreate={handleCreateFolderAndLog}
                isSyncing={isSyncing}
                isConnected={isConnected}
                onSync={handleSyncFolders}
                onLogout={handleLogout}
                onAddAccount={onAddAccount}
                onSwitchAccount={switchAccount}
                onRemoveAccount={removeAccount}
                bandwidth={bandwidth || null}
                account={currentUser}
                accounts={accounts}
                activeAccountId={activeAccountId}
            />

            <main className="flex-1 flex flex-col" onClick={(e) => { if (e.target === e.currentTarget) setSelectedIds([]); }}>
                <TopBar
                    currentFolderName={currentFolderName}
                    selectedIds={selectedIds}
                    onShowMoveModal={() => setShowMoveModal(true)}
                    onUpload={handleManualUpload}
                    onBulkDownload={handleQueuedBulkDownload}
                    onBulkDelete={handleBulkDeleteAndCleanup}
                    onBulkRestore={handleBulkRestore}
                    onDownloadFolder={handleQueuedFolderDownload}
                    onToggleFilters={() => setShowFilters(v => !v)}
                    filtersActive={filtersActive}
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    isTrashView={activeView === 'trash'}
                    canUpload={activeView === 'files'}
                    canDownloadFolder={activeView === 'files' || activeView === 'media' || activeView === 'collection'}
                />
                {showFilters && (
                    <AdvancedSearchPanel
                        filters={filters}
                        resultCount={displayedFiles.length}
                        availableTags={collectionTags}
                        onChange={setFilters}
                        onClear={() => setFilters(DEFAULT_FILTERS)}
                    />
                )}
                {activeView === 'files' && searchTerm.length > 2 && (
                    <div className="px-6 pt-4 pb-0">
                        <h2 className="text-sm font-medium text-telegram-subtext">
                            {t('search.resultsFor')} <span className="text-telegram-primary">"{searchTerm}"</span>
                        </h2>
                    </div>
                )}
                <div className="flex-1 min-h-0 flex">
                    {activeView === 'sync' ? (
                        <LocalSyncPanel
                            settings={localSync.settings}
                            folders={folders}
                            isRunning={localSync.isRunning}
                            lastResult={localSync.lastResult}
                            onChooseFolder={localSync.chooseFolder}
                            onRunSync={handleRunLocalSync}
                            onEnabledChange={localSync.setEnabled}
                            onTargetFolderChange={localSync.setTargetFolder}
                            onIntervalChange={localSync.setIntervalMinutes}
                            onResetState={localSync.resetSyncState}
                        />
                    ) : activeView === 'googleDrive' ? (
                        <GoogleDrivePanel
                            settings={googleDriveSettings}
                            files={currentFiles}
                            isBusy={googleDriveBusy}
                            onClientIdChange={handleGoogleDriveClientIdChange}
                            onConnect={handleGoogleDriveConnect}
                            onDisconnect={handleGoogleDriveDisconnect}
                            onFolderNameChange={handleGoogleDriveFolderNameChange}
                            onEnsureFolder={handleGoogleDriveEnsureFolder}
                            onBackupFile={handleGoogleDriveBackupFile}
                            onOpenDriveFile={(url) => void openExternal(url)}
                            onOpenSetupLink={(url) => void openExternal(url)}
                        />
                    ) : activeView === 'diagnostics' ? (
                        <DiagnosticsPanel />
                    ) : activeView === 'tags' ? (
                        <TagManagerPanel
                            tagStats={tagStats}
                            onOpenTag={handleOpenTag}
                            onRenameTag={handleRenameTag}
                            onDeleteTag={handleDeleteTag}
                        />
                    ) : activeView === 'backup' ? (
                        <BackupRestorePanel
                            folders={folders}
                            activeFolderId={activeFolderId}
                            backupFiles={backupFiles}
                            selectedFile={selectedFile}
                            isBusy={backupBusy}
                            onCreateBackup={handleCreateMetadataBackup}
                            onRestoreBackup={handleRestoreMetadataBackup}
                        />
                    ) : activeView === 'activity' ? (
                        <ActivityLogPanel
                            items={activityLog}
                            onClear={handleClearActivityLog}
                        />
                    ) : activeView === 'analytics' ? (
                        <StorageAnalyticsPanel
                            files={knownActiveFiles}
                            folders={folders}
                            tagStats={tagStats}
                        />
                    ) : (
                        <>
                            <div className="flex-1 min-w-0 flex flex-col">
                                {activeView === 'media' && (
                                    <div className="px-6 pt-4">
                                        <div className="console-panel rounded-lg px-4 py-3 flex items-center gap-3 text-sm text-telegram-subtext">
                                            <span className="metadata-pill px-2.5 py-1 text-telegram-primary">{mediaFiles.length} media</span>
                                            <span>{mediaFiles.filter(file => isVideoFile(file.originalName || file.name)).length} video</span>
                                            <span>{mediaFiles.filter(file => isAudioFile(file.originalName || file.name)).length} audio</span>
                                        </div>
                                    </div>
                                )}
                                <FileExplorer
                                    files={displayedFiles}
                                    loading={activeView === 'files' && (isLoading || isSearching)}
                                    error={activeView === 'files' ? error : null}
                                    viewMode={viewMode}
                                    selectedIds={selectedIds}
                                    activeFolderId={activeFolderId}
                                    onFileClick={handleFileClick}
                                    onDelete={(id) => {
                                        const file = displayedFiles.find(f => f.id === id);
                                        if (file) handleDeleteFile(file);
                                    }}
                                    onDownload={(id) => {
                                        const file = displayedFiles.find(f => f.id === id);
                                        if (file) queueFileDownload(file);
                                    }}
                                    onPreview={handlePreview}
                                    onRename={setRenamingFile}
                                    onDetails={(file) => setSelectedIds([file.id])}
                                    onToggleFavorite={handleToggleFavorite}
                                    onRestore={handleRestoreFile}
                                    onManualUpload={handleManualUpload}
                                    onSelectionClear={() => setSelectedIds([])}
                                    emptyTitle={
                                        activeView === 'favorites' ? t('empty.favoritesTitle')
                                            : activeView === 'recent' ? t('empty.recentTitle')
                                                : activeView === 'trash' ? t('empty.trashTitle')
                                                    : activeView === 'media' ? t('empty.mediaTitle')
                                                        : activeView === 'collection' ? t('empty.collectionTitle')
                                                            : undefined
                                    }
                                    emptyMessage={
                                        activeView === 'favorites' ? t('empty.favoritesMessage')
                                            : activeView === 'recent' ? t('empty.recentMessage')
                                                : activeView === 'trash' ? t('empty.trashMessage')
                                                    : activeView === 'media' ? t('empty.mediaMessage')
                                                        : activeView === 'collection' ? t('empty.collectionMessage')
                                                            : undefined
                                    }
                                    showUploadInEmpty={activeView === 'files'}
                                    showUploadTile={activeView === 'files'}
                                    onDrop={handleDropOnFolder}
                                    onDragStart={(fileId) => setInternalDragFileId(fileId)}
                                    onDragEnd={() => setTimeout(() => setInternalDragFileId(null), 50)}
                                />
                            </div>
                            {selectedFile && (
                                <DetailsPanel
                                    file={selectedFile}
                                    folders={folders}
                                    onClose={() => setSelectedIds([])}
                                    onPreview={(file) => handlePreview(file, displayedFiles)}
                                    onDownload={queueFileDownload}
                                    onDelete={handleDeleteFile}
                                    onRestore={handleRestoreFile}
                                    onRename={setRenamingFile}
                                    onMove={() => setShowMoveModal(true)}
                                    onToggleFavorite={handleToggleFavorite}
                                    onAddTag={handleAddTag}
                                    onRemoveTag={handleRemoveTag}
                                />
                            )}
                        </>
                    )}
                </div>
            </main>

            {previewFile && (
                <PreviewModal
                    file={previewFile}
                    activeFolderId={previewFile.folder_id === undefined ? activeFolderId : previewFile.folder_id}
                    onClose={() => setPreviewFile(null)}
                    onNext={handleNextPreview}
                    onPrev={handlePrevPreview}
                    currentIndex={previewContextIndex}
                    totalItems={previewContextFiles.length}
                    nextFile={previewNeighbors.nextFile}
                    prevFile={previewNeighbors.prevFile}
                />
            )}


            <TransferCenter
                uploads={uploadQueue}
                downloads={downloadQueue}
                onClearUploads={() => setUploadQueue(q => q.filter(i => i.status !== 'success' && i.status !== 'error' && i.status !== 'cancelled'))}
                onClearDownloads={clearDownloads}
                onCancelUploads={cancelUploads}
                onCancelDownloads={cancelDownloads}
                onCancelUpload={cancelUpload}
                onRetryUpload={retryUpload}
                onPauseUpload={pauseUpload}
                onResumeUpload={resumeUpload}
                onCancelDownload={cancelDownload}
                onRetryDownload={retryDownload}
                onPauseDownload={pauseDownload}
                onResumeDownload={resumeDownload}
                onOpenDownload={openDownloadedFile}
                onRevealDownload={revealDownloadedFile}
            />
            {renamingFile && (
                <RenameModal
                    title={t('rename.fileTitle')}
                    description={t('rename.fileDescription')}
                    initialName={renamingFile.name}
                    onClose={() => setRenamingFile(null)}
                    onSubmit={(name) => handleRenameFile(renamingFile, name)}
                />
            )}
            {renamingFolder && (
                <RenameModal
                    title={t('rename.folderTitle')}
                    description={t('rename.folderDescription')}
                    initialName={renamingFolder.name}
                    onClose={() => setRenamingFolder(null)}
                    onSubmit={(name) => handleRenameFolderSubmit(renamingFolder.id, name)}
                />
            )}
        </div>
    );
}
