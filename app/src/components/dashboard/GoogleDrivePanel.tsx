import { CheckCircle2, Cloud, ExternalLink, FolderInput, HardDrive, KeyRound, Link2, UploadCloud } from 'lucide-react';
import { useMemo, useState } from 'react';
import { GoogleDriveSettings, TelegramFile } from '../../types';
import { formatBytes } from '../../utils';
import { useLanguage } from '../../context/LanguageContext';

interface GoogleDrivePanelProps {
    settings: GoogleDriveSettings;
    files: TelegramFile[];
    isBusy: boolean;
    onClientIdChange: (clientId: string) => void;
    onConnect: () => void;
    onDisconnect: () => void;
    onFolderNameChange: (folderName: string) => void;
    onEnsureFolder: () => void;
    onBackupFile: (file: TelegramFile) => void;
    onOpenDriveFile?: (url: string) => void;
    onOpenSetupLink?: (url: string) => void;
}

export function GoogleDrivePanel({
    settings,
    files,
    isBusy,
    onClientIdChange,
    onConnect,
    onDisconnect,
    onFolderNameChange,
    onEnsureFolder,
    onBackupFile,
    onOpenDriveFile,
    onOpenSetupLink,
}: GoogleDrivePanelProps) {
    const { t } = useLanguage();
    const [selectedFileId, setSelectedFileId] = useState<string>('');
    const backupableFiles = useMemo(() => files.filter(file => file.type !== 'folder' && !file.deletedAt), [files]);
    const selectedFile = backupableFiles.find(file => String(file.id) === selectedFileId) || backupableFiles[0] || null;
    const connected = !!settings.accessToken || !!settings.refreshToken;
    const setupLinks = [
        { label: t('gdrive.link.cloudConsole'), url: 'https://console.cloud.google.com/' },
        { label: t('gdrive.link.driveApi'), url: 'https://console.cloud.google.com/apis/library/drive.googleapis.com' },
        { label: t('gdrive.link.consent'), url: 'https://console.cloud.google.com/apis/credentials/consent' },
        { label: t('gdrive.link.credentials'), url: 'https://console.cloud.google.com/apis/credentials' },
    ];

    return (
        <div className="flex-1 overflow-auto p-6 custom-scrollbar">
            <div className="max-w-5xl space-y-4">
                <div className="console-panel rounded-lg p-5 flex items-start justify-between gap-4">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-telegram-subtext">{t('gdrive.console')}</p>
                        <h2 className="text-xl font-semibold text-telegram-text mt-1">{t('gdrive.title')}</h2>
                        <p className="text-sm text-telegram-subtext mt-2 max-w-2xl">{t('gdrive.description')}</p>
                    </div>
                    <div className="w-11 h-11 rounded-lg bg-telegram-primary/10 border border-telegram-primary/25 flex items-center justify-center">
                        <Cloud className="w-5 h-5 text-telegram-primary" />
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[1fr_0.9fr] gap-4">
                    <div className="console-panel rounded-lg p-4 space-y-4">
                        <div className="flex items-center gap-2">
                            <KeyRound className="w-4 h-4 text-telegram-primary" />
                            <h3 className="text-sm font-semibold text-telegram-text">{t('gdrive.connection')}</h3>
                        </div>

                        <label className="block">
                            <span className="text-xs text-telegram-subtext">{t('gdrive.clientId')}</span>
                            <input
                                value={settings.clientId}
                                onChange={(event) => onClientIdChange(event.target.value)}
                                placeholder={t('gdrive.clientIdPlaceholder')}
                                className="mt-2 w-full bg-telegram-bg/60 border border-telegram-border rounded-lg px-3 py-2.5 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/60"
                            />
                        </label>

                        <div className="flex flex-wrap gap-2">
                            <button onClick={onConnect} disabled={isBusy || !settings.clientId.trim()} className="command-button px-4 py-2.5 text-telegram-primary disabled:opacity-50">
                                <Link2 className="w-4 h-4" />
                                {connected ? t('gdrive.reconnect') : t('gdrive.connect')}
                            </button>
                            {connected && (
                                <button onClick={onDisconnect} disabled={isBusy} className="command-button px-4 py-2.5 text-red-400 disabled:opacity-50">
                                    {t('gdrive.disconnect')}
                                </button>
                            )}
                        </div>

                        {connected ? (
                            <div className="rounded-lg border border-telegram-border bg-telegram-bg/45 px-3 py-3">
                                <div className="flex items-center gap-2 text-sm text-telegram-text">
                                    <CheckCircle2 className="w-4 h-4 text-telegram-primary" />
                                    <span className="font-semibold">{settings.name || settings.email || t('gdrive.connected')}</span>
                                </div>
                                {settings.email && <p className="text-xs text-telegram-subtext mt-1">{settings.email}</p>}
                            </div>
                        ) : (
                            <p className="text-sm text-telegram-subtext">{t('gdrive.connectHint')}</p>
                        )}
                    </div>

                    <div className="console-panel rounded-lg p-4 space-y-4">
                        <div className="flex items-center gap-2">
                            <FolderInput className="w-4 h-4 text-telegram-secondary" />
                            <h3 className="text-sm font-semibold text-telegram-text">{t('gdrive.targetFolder')}</h3>
                        </div>

                        <label className="block">
                            <span className="text-xs text-telegram-subtext">{t('gdrive.folderName')}</span>
                            <input
                                value={settings.folderName}
                                onChange={(event) => onFolderNameChange(event.target.value)}
                                className="mt-2 w-full bg-telegram-bg/60 border border-telegram-border rounded-lg px-3 py-2.5 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/60"
                            />
                        </label>

                        <button onClick={onEnsureFolder} disabled={isBusy || !connected || !settings.folderName.trim()} className="command-button px-4 py-2.5 text-telegram-primary disabled:opacity-50">
                            <HardDrive className="w-4 h-4" />
                            {settings.folderId ? t('gdrive.folderReady') : t('gdrive.createFolder')}
                        </button>

                        {settings.folderId && (
                            <p className="text-xs text-telegram-subtext break-all">{t('gdrive.folderId')}: {settings.folderId}</p>
                        )}
                    </div>
                </div>

                <div className="console-panel rounded-lg p-4 space-y-4">
                    <div className="flex items-center gap-2">
                        <ExternalLink className="w-4 h-4 text-telegram-primary" />
                        <h3 className="text-sm font-semibold text-telegram-text">{t('gdrive.setupTitle')}</h3>
                    </div>

                    <ol className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-telegram-subtext">
                        {[1, 2, 3, 4, 5, 6].map(step => (
                            <li key={step} className="rounded-lg border border-telegram-border bg-telegram-bg/45 px-3 py-2">
                                <span className="text-telegram-primary font-semibold mr-2">{step}.</span>
                                {t(`gdrive.setupStep${step}`)}
                            </li>
                        ))}
                    </ol>

                    <div className="flex flex-wrap gap-2">
                        {setupLinks.map(link => (
                            <button
                                key={link.url}
                                onClick={() => onOpenSetupLink?.(link.url)}
                                className="command-button px-3 py-2 text-xs text-telegram-primary"
                            >
                                <ExternalLink className="w-3 h-3" />
                                {link.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="console-panel rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-semibold text-telegram-text">{t('gdrive.backupFile')}</h3>
                            <p className="text-xs text-telegram-subtext mt-1">{t('gdrive.backupFileHint')}</p>
                        </div>
                        <div className="metadata-pill px-3 py-1.5 text-xs text-telegram-subtext">{backupableFiles.length} {t('analytics.files')}</div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3">
                        <select
                            value={selectedFile ? String(selectedFile.id) : ''}
                            onChange={(event) => setSelectedFileId(event.target.value)}
                            className="bg-telegram-bg/60 border border-telegram-border rounded-lg px-3 py-3 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/60"
                        >
                            {backupableFiles.map(file => (
                                <option key={file.id} value={file.id}>{file.name} - {formatBytes(file.size || 0)}</option>
                            ))}
                        </select>
                        <button onClick={() => selectedFile && onBackupFile(selectedFile)} disabled={isBusy || !connected || !selectedFile} className="command-button px-4 py-3 text-telegram-primary disabled:opacity-50">
                            <UploadCloud className="w-4 h-4" />
                            {isBusy ? t('backup.running') : t('gdrive.backup')}
                        </button>
                    </div>

                    {backupableFiles.length === 0 && (
                        <p className="text-sm text-telegram-subtext">{t('gdrive.noFiles')}</p>
                    )}

                    {settings.lastBackupResult && (
                        <div className="rounded-lg border border-telegram-border bg-telegram-bg/45 px-3 py-3 text-sm text-telegram-subtext">
                            <p>{settings.lastBackupResult}</p>
                            {settings.lastBackupAt && (
                                <p className="text-xs mt-1">{new Date(settings.lastBackupAt).toLocaleString()}</p>
                            )}
                            {settings.lastBackupResult.startsWith('https://') && onOpenDriveFile && (
                                <button onClick={() => onOpenDriveFile(settings.lastBackupResult || '')} className="command-button px-3 py-2 mt-3 text-telegram-primary text-xs">
                                    <ExternalLink className="w-3 h-3" />
                                    {t('gdrive.openInDrive')}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="console-panel rounded-lg p-4 text-sm text-telegram-subtext">
                    {t('gdrive.setupNote')}
                </div>
            </div>
        </div>
    );
}
