import { HardDrive, LayoutGrid, List, Search, SlidersHorizontal, Sun, Moon, Upload } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { LanguageToggle } from '../LanguageToggle';

interface TopBarProps {
    currentFolderName: string;
    selectedIds: number[];
    onShowMoveModal: () => void;
    onUpload: () => void;
    onBulkDownload: () => void;
    onBulkDelete: () => void;
    onBulkRestore: () => void;
    onDownloadFolder: () => void;
    onToggleFilters: () => void;
    filtersActive: boolean;
    viewMode: 'grid' | 'list';
    setViewMode: (mode: 'grid' | 'list') => void;
    searchTerm: string;
    onSearchChange: (term: string) => void;
    isTrashView?: boolean;
    canUpload?: boolean;
    canDownloadFolder?: boolean;
}

export function TopBar({
    currentFolderName, selectedIds, onShowMoveModal, onBulkDownload, onBulkDelete,
    onBulkRestore, onUpload, onDownloadFolder, onToggleFilters, filtersActive, viewMode, setViewMode, searchTerm, onSearchChange,
    isTrashView = false, canUpload = true, canDownloadFolder = true
}: TopBarProps) {
    const { theme, toggleTheme } = useTheme();
    const { t } = useLanguage();

    return (
        <header className="h-[76px] border-b border-telegram-border flex items-center px-6 justify-between bg-telegram-bg/90 backdrop-blur-md sticky top-0 z-10" onClick={e => e.stopPropagation()}>
            <div className="min-w-0">
                <div className="flex items-center text-[11px] uppercase tracking-[0.18em] text-telegram-subtext select-none mb-1">
                    <span>{t('topbar.workspace')}</span>
                    <span className="mx-2 text-telegram-border">/</span>
                    <span className="text-telegram-primary">{t('topbar.telegramCloud')}</span>
                </div>
                <h2 className="text-xl font-semibold text-telegram-text truncate">{currentFolderName}</h2>
            </div>

            <div className="flex-1 max-w-xl mx-6 relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-telegram-subtext" />
                <input
                    data-search-input="true"
                    type="text"
                    placeholder={t('topbar.search')}
                    className="w-full bg-telegram-surface border border-telegram-border rounded-lg pl-10 pr-3 py-2.5 text-sm text-telegram-text placeholder:text-telegram-subtext focus:outline-none focus:border-telegram-primary/60 transition-colors shadow-sm"
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                />
            </div>

            <div className="flex items-center gap-2">
                {selectedIds.length > 0 && (
                    <div className="flex items-center gap-2 mr-2 animate-in fade-in slide-in-from-top-2 border border-telegram-border bg-telegram-surface rounded-lg p-1.5">
                        <span className="text-xs text-telegram-subtext px-2">{selectedIds.length} {t('topbar.selected')}</span>
                        {isTrashView ? (
                            <button onClick={onBulkRestore} className="px-3 py-1.5 bg-telegram-primary/10 hover:bg-telegram-primary/20 text-telegram-primary rounded-lg text-xs transition font-medium">{t('common.restore')}</button>
                        ) : (
                            <button onClick={onShowMoveModal} className="px-3 py-1.5 bg-telegram-primary/10 hover:bg-telegram-primary/20 text-telegram-primary rounded-lg text-xs transition font-medium">{t('common.move')}</button>
                        )}
                        <button onClick={onBulkDownload} className="px-3 py-1.5 bg-telegram-hover hover:bg-telegram-border rounded-lg text-xs text-telegram-text transition">{t('common.download')}</button>
                        <button onClick={onBulkDelete} className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs transition">{isTrashView ? t('common.deleteForever') : t('common.trash')}</button>
                    </div>
                )}

                {canUpload && (
                    <button onClick={onUpload} className="px-3 py-2 bg-telegram-primary hover:bg-telegram-primary/90 text-[#06201c] rounded-lg text-sm font-semibold flex items-center gap-2 transition shadow-sm" title={t('topbar.uploadFiles')}>
                        <Upload className="w-4 h-4" />
                        {t('common.upload')}
                    </button>
                )}

                {canDownloadFolder && (
                    <button onClick={onDownloadFolder} className="command-button p-2.5 text-telegram-subtext hover:text-telegram-text relative group" title={t('topbar.downloadFolder')}>
                        <HardDrive className="w-5 h-5" />
                        <span className="absolute -bottom-9 left-1/2 -translate-x-1/2 text-[10px] bg-telegram-surface border border-telegram-border px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                            {t('topbar.downloadAllFiles')}
                        </span>
                    </button>
                )}

                <button
                    onClick={onToggleFilters}
                    className={`command-button p-2.5 relative group ${filtersActive ? 'text-telegram-primary border-telegram-primary/40' : 'text-telegram-subtext hover:text-telegram-text'}`}
                    title={t('topbar.advancedSearch')}
                >
                    <SlidersHorizontal className="w-5 h-5" />
                    <span className="absolute -bottom-9 left-1/2 -translate-x-1/2 text-[10px] bg-telegram-surface border border-telegram-border px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                        {t('topbar.filters')}
                    </span>
                </button>

                <button
                    onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                    className="command-button p-2.5 text-telegram-subtext hover:text-telegram-text relative group"
                    title={t('topbar.toggleLayout')}
                >
                    {viewMode === 'grid' ? <List className="w-5 h-5" /> : <LayoutGrid className="w-5 h-5" />}
                    <span className="absolute -bottom-9 left-1/2 -translate-x-1/2 text-[10px] bg-telegram-surface border border-telegram-border px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                        {viewMode === 'grid' ? t('topbar.switchList') : t('topbar.switchGrid')}
                    </span>
                </button>

                <LanguageToggle compact />

                <button
                    onClick={toggleTheme}
                    className="command-button p-2.5 text-telegram-subtext hover:text-telegram-text relative group"
                    title={theme === 'dark' ? t('topbar.lightMode') : t('topbar.darkMode')}
                >
                    {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    <span className="absolute -bottom-9 left-1/2 -translate-x-1/2 text-[10px] bg-telegram-surface border border-telegram-border px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                        {theme === 'dark' ? t('topbar.lightMode') : t('topbar.darkMode')}
                    </span>
                </button>
            </div>
        </header>
    )
}
