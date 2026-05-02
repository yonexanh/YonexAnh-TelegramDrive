import { useState } from 'react';
import { Activity, AtSign, BarChart3, Cloud, Clock3, DatabaseBackup, Film, HardDrive, Folder, History, Phone, Plus, RefreshCw, LogOut, Star, Tag, Tags, Trash2, UserRound } from 'lucide-react';
import { SidebarItem } from './SidebarItem';
import { BandwidthWidget } from './BandwidthWidget';
import { TelegramAccountProfile, TelegramFolder, BandwidthStats, WorkspaceView } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { APP_AUTHOR, APP_VERSION } from '../../version';

interface SidebarProps {
    folders: TelegramFolder[];
    activeFolderId: number | null;
    activeView: WorkspaceView;
    collectionTags: string[];
    activeCollectionTag: string | null;
    setActiveFolderId: (id: number | null) => void;
    setActiveView: (view: WorkspaceView) => void;
    setActiveCollectionTag: (tag: string | null) => void;
    onDrop: (e: React.DragEvent, folderId: number | null) => void;
    onDelete: (id: number, name: string) => void;
    onRename: (id: number, name: string) => void;
    onCreate: (name: string) => Promise<void>;
    isSyncing: boolean;
    isConnected: boolean;
    onSync: () => void;
    onLogout: () => void;
    bandwidth: BandwidthStats | null;
    account: TelegramAccountProfile | null;
}

export function Sidebar({
    folders, activeFolderId, activeView, collectionTags, activeCollectionTag, setActiveFolderId, setActiveView, setActiveCollectionTag, onDrop, onDelete, onRename, onCreate,
    isSyncing, isConnected, onSync, onLogout, bandwidth, account
}: SidebarProps) {
    const { t } = useLanguage();
    const [showNewFolderInput, setShowNewFolderInput] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const accountName = account?.full_name?.trim() || account?.username || account?.phone || t('sidebar.account');
    const accountUsername = account?.username ? `@${account.username}` : null;
    const accountPhone = account?.phone ? (account.phone.startsWith('+') ? account.phone : `+${account.phone}`) : null;

    const submitCreate = async () => {
        if (!newFolderName.trim()) return;
        try {
            await onCreate(newFolderName);
            setNewFolderName("");
            setShowNewFolderInput(false);
        } catch {
            // handled by parent
        }
    }

    const openFolder = (id: number | null) => {
        setActiveView('files');
        setActiveCollectionTag(null);
        setActiveFolderId(id);
    };

    const openView = (view: WorkspaceView) => {
        setActiveView(view);
        setActiveCollectionTag(null);
    };

    const openCollection = (tag: string) => {
        setActiveView('collection');
        setActiveCollectionTag(tag);
    };

    const sectionLabel = (label: string, extraClass = '') => (
        <div className={`px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-white/40 font-semibold ${extraClass}`}>
            {label}
        </div>
    );

    return (
        <aside className="w-72 bg-[#111715] text-white border-r border-black/20 flex flex-col p-3" onClick={e => e.stopPropagation()}>
            <div className="px-3 py-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-telegram-primary text-[#06201c] flex items-center justify-center shadow-lg shadow-telegram-primary/10">
                    <img src="/logo.svg" className="w-7 h-7" alt="Logo" />
                </div>
                <div className="min-w-0">
                    <span className="font-bold text-base tracking-tight block truncate">Telegram Drive</span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/45">{t('sidebar.driveConsole')}</span>
                </div>
            </div>

            <nav className="flex-1 px-1 pb-3 space-y-1 overflow-y-auto min-h-0 custom-scrollbar">
                {sectionLabel(t('sidebar.library'), 'pt-3')}
                <SidebarItem
                    icon={HardDrive}
                    label={t('sidebar.savedMessages')}
                    active={activeView === 'files' && activeFolderId === null}
                    onClick={() => openFolder(null)}
                    onDrop={(e: React.DragEvent) => onDrop(e, null)}
                    folderId={null}
                />
                <SidebarItem
                    icon={Star}
                    label={t('sidebar.favorites')}
                    active={activeView === 'favorites'}
                    onClick={() => openView('favorites')}
                    onDrop={(e: React.DragEvent) => e.preventDefault()}
                    folderId={null}
                />
                <SidebarItem
                    icon={Clock3}
                    label={t('sidebar.recent')}
                    active={activeView === 'recent'}
                    onClick={() => openView('recent')}
                    onDrop={(e: React.DragEvent) => e.preventDefault()}
                    folderId={null}
                />
                <SidebarItem
                    icon={Trash2}
                    label={t('common.trash')}
                    active={activeView === 'trash'}
                    onClick={() => openView('trash')}
                    onDrop={(e: React.DragEvent) => e.preventDefault()}
                    folderId={null}
                />
                <SidebarItem
                    icon={Film}
                    label={t('sidebar.media')}
                    active={activeView === 'media'}
                    onClick={() => openView('media')}
                    onDrop={(e: React.DragEvent) => e.preventDefault()}
                    folderId={null}
                />
                {sectionLabel(t('sidebar.tools'), 'pt-4')}
                <SidebarItem
                    icon={Tag}
                    label={t('sidebar.tagManager')}
                    active={activeView === 'tags'}
                    onClick={() => openView('tags')}
                    onDrop={(e: React.DragEvent) => e.preventDefault()}
                    folderId={null}
                />
                <SidebarItem
                    icon={DatabaseBackup}
                    label={t('sidebar.backup')}
                    active={activeView === 'backup'}
                    onClick={() => openView('backup')}
                    onDrop={(e: React.DragEvent) => e.preventDefault()}
                    folderId={null}
                />
                <SidebarItem
                    icon={History}
                    label={t('sidebar.activity')}
                    active={activeView === 'activity'}
                    onClick={() => openView('activity')}
                    onDrop={(e: React.DragEvent) => e.preventDefault()}
                    folderId={null}
                />
                <SidebarItem
                    icon={BarChart3}
                    label={t('sidebar.analytics')}
                    active={activeView === 'analytics'}
                    onClick={() => openView('analytics')}
                    onDrop={(e: React.DragEvent) => e.preventDefault()}
                    folderId={null}
                />
                <SidebarItem
                    icon={RefreshCw}
                    label={t('sidebar.localSync')}
                    active={activeView === 'sync'}
                    onClick={() => openView('sync')}
                    onDrop={(e: React.DragEvent) => e.preventDefault()}
                    folderId={null}
                />
                <SidebarItem
                    icon={Cloud}
                    label={t('sidebar.googleDrive')}
                    active={activeView === 'googleDrive'}
                    onClick={() => openView('googleDrive')}
                    onDrop={(e: React.DragEvent) => e.preventDefault()}
                    folderId={null}
                />
                <SidebarItem
                    icon={Activity}
                    label={t('diagnostics.title')}
                    active={activeView === 'diagnostics'}
                    onClick={() => openView('diagnostics')}
                    onDrop={(e: React.DragEvent) => e.preventDefault()}
                    folderId={null}
                />
                {folders.length > 0 && sectionLabel(t('sidebar.folders'), 'pt-4')}
                {folders.map(folder => (
                    <SidebarItem
                        key={folder.id}
                        icon={Folder}
                        label={folder.name}
                        active={activeView === 'files' && activeFolderId === folder.id}
                        onClick={() => openFolder(folder.id)}
                        onDrop={(e: React.DragEvent) => onDrop(e, folder.id)}
                        onDelete={() => onDelete(folder.id, folder.name)}
                        onRename={() => onRename(folder.id, folder.name)}
                        folderId={folder.id}
                    />
                ))}
                {collectionTags.length > 0 && (
                    <div className="pt-3">
                        <div className="px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-white/40 font-semibold">
                            {t('sidebar.collections')}
                        </div>
                        {collectionTags.map(tag => (
                            <SidebarItem
                                key={tag}
                                icon={Tags}
                                label={tag}
                                active={activeView === 'collection' && activeCollectionTag === tag}
                                onClick={() => openCollection(tag)}
                                onDrop={(e: React.DragEvent) => e.preventDefault()}
                                folderId={null}
                            />
                        ))}
                    </div>
                )}
            </nav>

            <div className="px-1 pb-3 border-b border-white/10">
                {showNewFolderInput ? (
                    <div className="px-2 py-2">
                        <input
                            autoFocus
                            type="text"
                            className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-telegram-primary"
                            placeholder={t('details.folder')}
                            value={newFolderName}
                            onChange={e => setNewFolderName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && submitCreate()}
                            onBlur={() => !newFolderName && setShowNewFolderInput(false)}
                        />
                    </div>
                ) : (
                    <button
                        onClick={() => setShowNewFolderInput(true)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/65 hover:bg-white/10 hover:text-white transition-colors border border-dashed border-white/15"
                    >
                        <Plus className="w-4 h-4" />
                        {t('sidebar.createFolder')}
                    </button>
                )}
            </div>

            <div className="pt-3 px-1">
                <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3">
                    <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-telegram-primary/15 border border-telegram-primary/25 flex items-center justify-center shrink-0">
                            <UserRound className="w-4 h-4 text-telegram-primary" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-[0.16em] text-white/40 mb-1">{t('sidebar.account')}</p>
                            <p className="text-sm font-semibold text-white truncate" title={accountName}>{accountName}</p>
                            {account ? (
                                <div className="mt-1 flex flex-col gap-0.5 text-[11px] text-white/55">
                                    {accountUsername && (
                                        <span className="flex items-center gap-1 truncate" title={accountUsername}>
                                            <AtSign className="w-3 h-3 shrink-0" />
                                            <span className="truncate">{accountUsername}</span>
                                        </span>
                                    )}
                                    {accountPhone && (
                                        <span className="flex items-center gap-1 truncate" title={accountPhone}>
                                            <Phone className="w-3 h-3 shrink-0" />
                                            <span className="truncate">{accountPhone}</span>
                                        </span>
                                    )}
                                </div>
                            ) : (
                                <p className="text-[11px] text-white/45 mt-1">{t('sidebar.accountLoading')}</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 text-white/55 text-xs px-2">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                    <span>{isConnected ? t('sidebar.connected') : t('sidebar.disconnected')}</span>
                </div>

                <div className="flex gap-2 mt-4">
                    <button
                        onClick={onSync}
                        disabled={isSyncing}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-telegram-primary hover:text-[#06201c] bg-telegram-primary/10 hover:bg-telegram-primary rounded-lg transition-colors ${isSyncing ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={t('common.sync')}
                    >
                        <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                        {isSyncing ? t('sidebar.syncing') : t('common.sync')}
                    </button>
                    <button
                        onClick={onLogout}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-red-300 hover:text-white bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
                        title={t('common.signOut')}
                    >
                        <LogOut className="w-3 h-3" />
                        {t('sidebar.logout')}
                    </button>
                </div>

                {bandwidth && <BandwidthWidget bandwidth={bandwidth} />}

                <div className="mt-3 px-2 pt-3 border-t border-white/10 text-[10px] uppercase tracking-[0.14em] text-white/35 leading-5">
                    <div>{t('sidebar.version')} {APP_VERSION}</div>
                    <div>{t('sidebar.author')} {APP_AUTHOR}</div>
                </div>
            </div>

        </aside>
    )
}
