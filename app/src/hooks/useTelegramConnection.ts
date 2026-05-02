import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Store } from '@tauri-apps/plugin-store';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext';
import { AccountListResult, SavedTelegramAccount, TelegramAccountProfile, TelegramFolder } from '../types';
import { useNetworkStatus } from './useNetworkStatus';

const LEGACY_ACCOUNT_ID = 'legacy';

const WORKSPACE_KEYS = [
    'folders',
    'activeFolderId',
    'viewMode',
    'fileMeta',
    'recentItems',
    'activityLog',
    'googleDriveSettings',
    'diagnosticsSeen',
    'uploadQueue',
    'downloadQueue',
    'localSyncSettings',
    'localSyncState',
];

const workspaceStoreName = (accountId: string | null | undefined) => {
    const safe = (accountId || LEGACY_ACCOUNT_ID).replace(/[^a-zA-Z0-9_-]/g, '_');
    return `workspace-${safe}.json`;
};

async function getConfigStore() {
    const config = await Store.load('config.json');
    const savedId = await config.get<string>('api_id');
    const savedHash = await config.get<string>('api_hash');

    if (savedId && savedHash) return config;

    const legacy = await Store.load('settings.json');
    const legacyId = await legacy.get<string>('api_id');
    const legacyHash = await legacy.get<string>('api_hash');
    if (legacyId && legacyHash) {
        await config.set('api_id', legacyId);
        await config.set('api_hash', legacyHash);
        await config.save();
    }

    return config;
}

async function migrateLegacyWorkspace(config: Store, workspace: Store, accountId: string) {
    if (accountId !== LEGACY_ACCOUNT_ID) return;

    const migrated = await workspace.get<boolean>('legacyWorkspaceMigrated');
    if (migrated) return;

    for (const key of WORKSPACE_KEYS) {
        const existing = await workspace.get<unknown>(key);
        if (existing !== undefined) continue;

        const value = await config.get<unknown>(key);
        if (value !== undefined) {
            await workspace.set(key, value);
        }
    }

    await workspace.set('legacyWorkspaceMigrated', true);
    await workspace.save();
}

export function useTelegramConnection(onLogoutParent: () => void) {
    const queryClient = useQueryClient();
    const { confirm } = useConfirm();

    const [configStore, setConfigStore] = useState<Store | null>(null);
    const [store, setStore] = useState<Store | null>(null);
    const [folders, setFolders] = useState<TelegramFolder[]>([]);
    const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
    const [accounts, setAccounts] = useState<SavedTelegramAccount[]>([]);
    const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isConnected, setIsConnected] = useState(true);

    const networkIsOnline = useNetworkStatus();

    const getApiId = async () => {
        const source = configStore || await getConfigStore();
        if (!configStore) setConfigStore(source);

        const apiIdStr = await source.get<string>('api_id');
        const apiId = apiIdStr ? parseInt(apiIdStr, 10) : NaN;
        if (!apiIdStr || Number.isNaN(apiId)) {
            throw new Error('Telegram API ID is not configured.');
        }

        return apiId;
    };

    const hydrateWorkspace = async (nextStore: Store) => {
        setStore(nextStore);

        const savedFolders = await nextStore.get<TelegramFolder[]>('folders');
        setFolders(savedFolders || []);

        const savedActiveFolderId = await nextStore.get<number | null>('activeFolderId');
        setActiveFolderId(savedActiveFolderId === undefined ? null : savedActiveFolderId);
    };

    const loadWorkspace = async (accountId: string, config: Store) => {
        const nextStore = await Store.load(workspaceStoreName(accountId));
        await migrateLegacyWorkspace(config, nextStore, accountId);
        await hydrateWorkspace(nextStore);
    };

    const refreshAccounts = async () => {
        const result = await invoke<AccountListResult>('cmd_get_accounts');
        setAccounts(result.accounts);
        setActiveAccountId(result.active_account_id || result.accounts[0]?.account_id || null);
        return result;
    };

    useEffect(() => {
        let cancelled = false;

        const initStore = async () => {
            try {
                const config = await getConfigStore();
                if (cancelled) return;
                setConfigStore(config);

                const apiIdStr = await config.get<string>('api_id');
                const apiId = apiIdStr ? parseInt(apiIdStr, 10) : NaN;
                if (!apiIdStr || Number.isNaN(apiId)) {
                    onLogoutParent();
                    return;
                }

                await invoke('cmd_connect', { apiId });
                const connected = await invoke<boolean>('cmd_check_connection');
                if (!connected) throw new Error('Telegram session is not connected.');

                const accountList = await invoke<AccountListResult>('cmd_get_accounts');
                const nextActiveAccountId = accountList.active_account_id || accountList.accounts[0]?.account_id || LEGACY_ACCOUNT_ID;

                if (cancelled) return;
                setAccounts(accountList.accounts);
                setActiveAccountId(nextActiveAccountId);
                await loadWorkspace(nextActiveAccountId, config);
                setIsConnected(true);
                queryClient.invalidateQueries({ queryKey: ['files'] });
            } catch {
                const shouldRetry = window.confirm('Failed to connect to Telegram. Retry?');
                if (shouldRetry) {
                    window.location.reload();
                } else {
                    onLogoutParent();
                }
            }
        };

        initStore();
        return () => {
            cancelled = true;
        };
    }, [queryClient, onLogoutParent]);

    useEffect(() => {
        setIsConnected(networkIsOnline);
    }, [networkIsOnline]);

    const switchAccount = async (accountId: string, showToast = true, force = false) => {
        if (accountId === activeAccountId && !force) return;

        try {
            const config = configStore || await getConfigStore();
            if (!configStore) setConfigStore(config);
            const apiId = await getApiId();

            const profile = await invoke<TelegramAccountProfile>('cmd_switch_account', { accountId, apiId });
            const accountList = await invoke<AccountListResult>('cmd_get_accounts');
            setAccounts(accountList.accounts);
            setActiveAccountId(accountList.active_account_id || accountId);

            queryClient.clear();
            await loadWorkspace(accountList.active_account_id || accountId, config);
            setIsConnected(true);

            if (showToast) {
                toast.success(`Switched to ${profile.full_name || profile.username || 'Telegram account'}.`);
            }
        } catch (e) {
            toast.error(`Switch account failed: ${e}`);
            throw e;
        }
    };

    const removeAccount = async (accountId: string) => {
        const account = accounts.find(item => item.account_id === accountId);
        const label = account?.full_name || account?.username || account?.phone || 'this account';
        if (!await confirm({
            title: 'Remove Account',
            message: `Remove ${label} from this device? The Telegram files remain in Telegram.`,
            confirmText: 'Remove',
            variant: 'danger'
        })) return;

        try {
            const result = await invoke<AccountListResult>('cmd_remove_account', { accountId });
            setAccounts(result.accounts);

            if (accountId === activeAccountId) {
                if (result.active_account_id) {
                    await switchAccount(result.active_account_id, false, true);
                } else {
                    setActiveAccountId(null);
                    setStore(null);
                    setFolders([]);
                    setActiveFolderId(null);
                    queryClient.clear();
                    onLogoutParent();
                }
            }

            toast.success('Account removed from this device.');
        } catch (e) {
            toast.error(`Remove account failed: ${e}`);
        }
    };

    const isNetworkError = (error: string): boolean => {
        const keywords = ['timeout', 'connection', 'network', 'socket', 'disconnected', 'EOF', 'ECONNREFUSED', 'overflow'];
        return keywords.some(k => error.toLowerCase().includes(k.toLowerCase()));
    };

    const forceLogout = async () => {
        setIsConnected(false);
        try {
            await invoke('cmd_clean_cache').catch(() => { });
        } catch {
            // best effort cleanup
        }
        toast.error('Connection lost. Please log in again.');
        onLogoutParent();
    };

    const handleLogout = async () => {
        if (!await confirm({
            title: 'Sign Out',
            message: 'Sign out of the active Telegram account on this device?',
            confirmText: 'Sign Out',
            variant: 'danger'
        })) return;

        try {
            await invoke('cmd_logout');
            await invoke('cmd_clean_cache');
            const result = await refreshAccounts();

            if (result.active_account_id) {
                await switchAccount(result.active_account_id, false, true);
            } else {
                setStore(null);
                setFolders([]);
                setActiveFolderId(null);
                queryClient.clear();
                onLogoutParent();
            }
        } catch {
            toast.error('Error signing out');
            onLogoutParent();
        }
    };

    const handleSyncFolders = async () => {
        if (!store) return;
        setIsSyncing(true);
        try {
            const foundFolders = await invoke<TelegramFolder[]>('cmd_scan_folders');
            const merged = [...folders];
            let added = 0;
            for (const f of foundFolders) {
                if (!merged.find(existing => existing.id === f.id)) {
                    merged.push(f);
                    added++;
                }
            }
            if (added > 0) {
                setFolders(merged);
                await store.set('folders', merged);
                await store.save();
                toast.success(`Scan complete. Found ${added} new folders.`);
            } else {
                toast.info('Scan complete. No new folders found.');
            }
        } catch {
            toast.error('Sync failed');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleCreateFolder = async (name: string) => {
        if (!store) return;
        try {
            const newFolder = await invoke<TelegramFolder>('cmd_create_folder', { name });
            const updated = [...folders, newFolder];
            setFolders(updated);
            await store.set('folders', updated);
            await store.save();
            toast.success(`Folder "${name}" created.`);
        } catch (e) {
            toast.error(`Failed to create folder: ${e}`);
            throw e;
        }
    };

    const handleFolderDelete = async (folderId: number, folderName: string) => {
        if (!await confirm({
            title: 'Delete Folder',
            message: `Are you sure you want to delete "${folderName}"?\nThis will delete the channel on Telegram.`,
            confirmText: 'Delete',
            variant: 'danger'
        })) return;

        try {
            await invoke('cmd_delete_folder', { folderId });
            const updated = folders.filter(f => f.id !== folderId);
            setFolders(updated);
            if (store) {
                await store.set('folders', updated);
                await store.save();
            }
            if (activeFolderId === folderId) setActiveFolderId(null);
            toast.success(`Folder "${folderName}" deleted.`);
        } catch (e: unknown) {
            const errStr = String(e);
            if (errStr.includes('not found')) {
                if (await confirm({
                    title: 'Folder Not Found',
                    message: `Folder "${folderName}" not found on Telegram (it may have been deleted externally).\nRemove from this app?`,
                    confirmText: 'Remove',
                    variant: 'info'
                })) {
                    const updated = folders.filter(f => f.id !== folderId);
                    setFolders(updated);
                    if (store) {
                        await store.set('folders', updated);
                        await store.save();
                    }
                    if (activeFolderId === folderId) setActiveFolderId(null);
                }
            } else {
                toast.error(`Failed to delete folder: ${e}`);
            }
        }
    };

    const handleFolderRename = async (folderId: number, name: string) => {
        if (!store) return;
        const trimmed = name.trim();
        if (!trimmed) return;

        try {
            await invoke('cmd_rename_folder', { folderId, name: trimmed });
            const updated = folders.map(f => f.id === folderId ? { ...f, name: trimmed } : f);
            setFolders(updated);
            await store.set('folders', updated);
            await store.save();
            toast.success(`Folder renamed to "${trimmed}".`);
        } catch (e) {
            toast.error(`Failed to rename folder: ${e}`);
            throw e;
        }
    };

    const handleSetActiveFolderId = async (id: number | null) => {
        setActiveFolderId(id);
        if (store) {
            await store.set('activeFolderId', id);
            await store.save();
        }
    };

    return {
        store,
        folders,
        activeFolderId,
        accounts,
        activeAccountId,
        setActiveFolderId: handleSetActiveFolderId,
        isSyncing,
        isConnected,
        handleLogout,
        handleSyncFolders,
        handleCreateFolder,
        handleFolderDelete,
        handleFolderRename,
        switchAccount,
        removeAccount,
        isNetworkError,
        forceLogout
    };
}
