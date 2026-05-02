import { CloudUpload, DatabaseBackup, FileJson, RotateCcw, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TelegramFile, TelegramFolder } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

interface BackupRestorePanelProps {
    folders: TelegramFolder[];
    activeFolderId: number | null;
    backupFiles: TelegramFile[];
    selectedFile: TelegramFile | null;
    isBusy: boolean;
    onCreateBackup: (folderId: number | null) => void;
    onRestoreBackup: (file: TelegramFile) => void;
}

export function BackupRestorePanel({
    folders,
    activeFolderId,
    backupFiles,
    selectedFile,
    isBusy,
    onCreateBackup,
    onRestoreBackup,
}: BackupRestorePanelProps) {
    const { t } = useLanguage();
    const selectedBackup = selectedFile && isMetadataBackupFile(selectedFile) ? selectedFile : null;
    const [targetFolderId, setTargetFolderId] = useState<number | null>(activeFolderId);

    useEffect(() => {
        setTargetFolderId(activeFolderId);
    }, [activeFolderId]);

    return (
        <div className="flex-1 overflow-auto p-6 custom-scrollbar">
            <div className="max-w-5xl space-y-4">
                <div className="console-panel rounded-lg p-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.18em] text-telegram-subtext">{t('backup.console')}</p>
                            <h2 className="text-xl font-semibold text-telegram-text mt-1">{t('backup.title')}</h2>
                            <p className="text-sm text-telegram-subtext mt-2 max-w-2xl">{t('backup.description')}</p>
                        </div>
                        <div className="w-11 h-11 rounded-lg bg-telegram-primary/10 border border-telegram-primary/25 flex items-center justify-center">
                            <DatabaseBackup className="w-5 h-5 text-telegram-primary" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 mt-5">
                        <select
                            value={targetFolderId ?? 'home'}
                            onChange={(event) => {
                                const folderId = event.target.value === 'home' ? null : Number(event.target.value);
                                setTargetFolderId(folderId);
                            }}
                            disabled={isBusy}
                            className="bg-telegram-bg/60 border border-telegram-border rounded-lg px-3 py-3 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/60 disabled:opacity-60"
                        >
                            <option value="home">{t('backup.backupToHome')}</option>
                            {folders.map(folder => (
                                <option key={folder.id} value={folder.id}>{t('backup.backupTo')} {folder.name}</option>
                            ))}
                        </select>
                        <button
                            onClick={() => onCreateBackup(targetFolderId)}
                            disabled={isBusy}
                            className="command-button px-4 py-3 text-telegram-primary disabled:opacity-50"
                        >
                            <CloudUpload className="w-4 h-4" />
                            {isBusy ? t('backup.running') : t('backup.create')}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="console-panel rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <ShieldCheck className="w-4 h-4 text-telegram-primary" />
                            <h3 className="text-sm font-semibold text-telegram-text">{t('backup.restoreSelected')}</h3>
                        </div>
                        {selectedBackup ? (
                            <div className="space-y-3">
                                <p className="text-sm text-telegram-text break-words">{selectedBackup.name}</p>
                                <button
                                    onClick={() => onRestoreBackup(selectedBackup)}
                                    disabled={isBusy}
                                    className="command-button px-4 py-2 text-telegram-primary disabled:opacity-50"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    {t('backup.restore')}
                                </button>
                            </div>
                        ) : (
                            <p className="text-sm text-telegram-subtext">{t('backup.selectHint')}</p>
                        )}
                    </div>

                    <div className="console-panel rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <FileJson className="w-4 h-4 text-telegram-secondary" />
                            <h3 className="text-sm font-semibold text-telegram-text">{t('backup.visibleBackups')}</h3>
                        </div>
                        <div className="space-y-2 max-h-72 overflow-auto custom-scrollbar">
                            {backupFiles.map(file => (
                                <button
                                    key={file.id}
                                    onClick={() => onRestoreBackup(file)}
                                    disabled={isBusy}
                                    className="w-full flex items-center gap-3 rounded-lg border border-telegram-border bg-telegram-bg/45 px-3 py-2 text-left hover:bg-telegram-hover disabled:opacity-50"
                                >
                                    <FileJson className="w-4 h-4 text-telegram-secondary shrink-0" />
                                    <span className="min-w-0 flex-1 truncate text-sm text-telegram-text">{file.name}</span>
                                    <span className="text-xs text-telegram-subtext">{t('backup.restore')}</span>
                                </button>
                            ))}
                            {backupFiles.length === 0 && (
                                <p className="text-sm text-telegram-subtext">{t('backup.noVisibleBackups')}</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function isMetadataBackupFile(file: TelegramFile) {
    const name = (file.originalName || file.name).toLowerCase();
    return name.endsWith('.tdrive-backup.json') || (name.includes('telegram-drive-metadata') && name.endsWith('.json'));
}
