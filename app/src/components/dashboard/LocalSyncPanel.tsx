import { FolderOpen, Play, RotateCcw, ToggleLeft, ToggleRight } from 'lucide-react';
import { LocalSyncSettings, TelegramFolder } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

interface LocalSyncPanelProps {
    settings: LocalSyncSettings;
    folders: TelegramFolder[];
    isRunning: boolean;
    lastResult: string;
    onChooseFolder: () => void;
    onRunSync: () => void;
    onEnabledChange: (enabled: boolean) => void;
    onTargetFolderChange: (folderId: number | null) => void;
    onIntervalChange: (minutes: number) => void;
    onResetState: () => void;
}

export function LocalSyncPanel({
    settings,
    folders,
    isRunning,
    lastResult,
    onChooseFolder,
    onRunSync,
    onEnabledChange,
    onTargetFolderChange,
    onIntervalChange,
    onResetState,
}: LocalSyncPanelProps) {
    const { t } = useLanguage();

    return (
        <div className="flex-1 overflow-auto p-6 custom-scrollbar">
            <div className="max-w-3xl space-y-4">
                <div className="console-panel rounded-lg p-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.18em] text-telegram-subtext">{t('sync.automation')}</p>
                            <h2 className="text-xl font-semibold text-telegram-text mt-1">{t('sync.title')}</h2>
                        </div>
                        <button
                            onClick={() => onEnabledChange(!settings.enabled)}
                            className={`command-button px-3 py-2 ${settings.enabled ? 'text-telegram-primary border-telegram-primary/40' : 'text-telegram-subtext'}`}
                        >
                            {settings.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                            {settings.enabled ? t('sync.enabled') : t('sync.disabled')}
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
                        <button onClick={onChooseFolder} className="command-button justify-start px-3 py-3">
                            <FolderOpen className="w-4 h-4" />
                            <span className="truncate">{settings.path || t('sync.chooseFolder')}</span>
                        </button>

                        <select
                            value={settings.folderId ?? 'home'}
                            onChange={(e) => onTargetFolderChange(e.target.value === 'home' ? null : Number(e.target.value))}
                            className="bg-telegram-surface border border-telegram-border rounded-lg px-3 py-3 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/60"
                        >
                            <option value="home">{t('sidebar.savedMessages')}</option>
                            {folders.map(folder => (
                                <option key={folder.id} value={folder.id}>{folder.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 mt-4">
                        <label className="flex items-center gap-3 bg-telegram-bg border border-telegram-border rounded-lg px-3 py-3">
                            <span className="text-sm text-telegram-subtext shrink-0">{t('sync.interval')}</span>
                            <input
                                type="number"
                                min={1}
                                value={settings.intervalMinutes}
                                onChange={(e) => onIntervalChange(Number(e.target.value))}
                                className="w-full bg-transparent text-sm text-telegram-text focus:outline-none"
                            />
                            <span className="text-sm text-telegram-subtext">{t('sync.minutes')}</span>
                        </label>

                        <button onClick={onRunSync} disabled={isRunning || !settings.path} className="command-button px-4 py-3 disabled:opacity-50">
                            <Play className={`w-4 h-4 ${isRunning ? 'animate-pulse' : ''}`} />
                            {isRunning ? t('sync.syncing') : t('sync.syncNow')}
                        </button>

                        <button onClick={onResetState} className="command-button px-4 py-3 text-telegram-subtext">
                            <RotateCcw className="w-4 h-4" />
                            {t('sync.reset')}
                        </button>
                    </div>
                </div>

                <div className="console-panel rounded-lg p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-telegram-subtext mb-2">{t('sync.status')}</p>
                    <p className="text-sm text-telegram-text">{lastResult}</p>
                    {settings.lastRun && (
                        <p className="text-xs text-telegram-subtext mt-2">{t('sync.lastRun')}: {new Date(settings.lastRun).toLocaleString()}</p>
                    )}
                </div>
            </div>
        </div>
    );
}
