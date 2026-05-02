import { AlertCircle, Check, Download, ExternalLink, FolderOpen, Pause, Play, RotateCcw, Upload, X } from "lucide-react";
import { DownloadItem, QueueItem } from "../../types";

interface TransferCenterProps {
    uploads: QueueItem[];
    downloads: DownloadItem[];
    onClearUploads: () => void;
    onClearDownloads: () => void;
    onCancelUploads: () => void;
    onCancelDownloads: () => void;
    onCancelUpload: (id: string) => void;
    onRetryUpload: (id: string) => void;
    onPauseUpload: (id: string) => void;
    onResumeUpload: (id: string) => void;
    onCancelDownload: (id: string) => void;
    onRetryDownload: (id: string) => void;
    onPauseDownload: (id: string) => void;
    onResumeDownload: (id: string) => void;
    onOpenDownload: (id: string) => void;
    onRevealDownload: (id: string) => void;
}

const fileNameFromPath = (path: string) => path.split(/[\\/]/).pop() || path;

export function TransferCenter({
    uploads,
    downloads,
    onClearUploads,
    onClearDownloads,
    onCancelUploads,
    onCancelDownloads,
    onCancelUpload,
    onRetryUpload,
    onPauseUpload,
    onResumeUpload,
    onCancelDownload,
    onRetryDownload,
    onPauseDownload,
    onResumeDownload,
    onOpenDownload,
    onRevealDownload,
}: TransferCenterProps) {
    const total = uploads.length + downloads.length;
    if (total === 0) return null;

    const activeUploads = uploads.some(i => i.status === 'pending' || i.status === 'uploading' || i.status === 'paused');
    const finishedUploads = uploads.some(i => i.status === 'success' || i.status === 'error' || i.status === 'cancelled');
    const activeDownloads = downloads.some(i => i.status === 'pending' || i.status === 'downloading' || i.status === 'paused');
    const finishedDownloads = downloads.some(i => i.status === 'success' || i.status === 'error' || i.status === 'cancelled');

    return (
        <div className="fixed bottom-4 right-4 w-[25rem] max-w-[calc(100vw-2rem)] console-panel rounded-lg overflow-hidden z-[100]">
            <div className="px-4 py-3 border-b border-telegram-border bg-telegram-bg/70 flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-semibold text-telegram-text">Transfer Center</h4>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-telegram-subtext">{total} item{total === 1 ? '' : 's'} in queue</p>
                </div>
                <div className="h-2 w-2 rounded-full bg-telegram-primary shadow-[0_0_12px_rgba(45,212,191,0.75)]" />
            </div>

            <div className="max-h-[26rem] overflow-y-auto p-3 space-y-4 custom-scrollbar">
                {uploads.length > 0 && (
                    <section className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-telegram-subtext">
                                <Upload className="w-3.5 h-3.5 text-telegram-primary" />
                                Uploads
                            </div>
                            <div className="flex gap-2">
                                {activeUploads && (
                                    <button onClick={onCancelUploads} className="px-2 py-1 rounded-md text-[11px] text-red-400 hover:bg-red-500/10 transition-colors">Cancel All</button>
                                )}
                                {finishedUploads && (
                                    <button onClick={onClearUploads} className="px-2 py-1 rounded-md text-[11px] text-telegram-primary hover:bg-telegram-hover transition-colors">Clear Finished</button>
                                )}
                            </div>
                        </div>
                        {uploads.map(item => (
                            <TransferRow
                                key={item.id}
                                id={item.id}
                                name={fileNameFromPath(item.path)}
                                status={item.status}
                                progress={item.progress}
                                error={item.error}
                                accent="upload"
                                onCancel={onCancelUpload}
                                onRetry={onRetryUpload}
                                onPause={onPauseUpload}
                                onResume={onResumeUpload}
                            />
                        ))}
                    </section>
                )}

                {downloads.length > 0 && (
                    <section className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-telegram-subtext">
                                <Download className="w-3.5 h-3.5 text-telegram-secondary" />
                                Downloads
                            </div>
                            <div className="flex gap-2">
                                {activeDownloads && (
                                    <button onClick={onCancelDownloads} className="px-2 py-1 rounded-md text-[11px] text-red-400 hover:bg-red-500/10 transition-colors">Cancel All</button>
                                )}
                                {finishedDownloads && (
                                    <button onClick={onClearDownloads} className="px-2 py-1 rounded-md text-[11px] text-telegram-primary hover:bg-telegram-hover transition-colors">Clear Finished</button>
                                )}
                            </div>
                        </div>
                        {downloads.map(item => (
                            <TransferRow
                                key={item.id}
                                id={item.id}
                                name={item.filename}
                                status={item.status}
                                progress={item.progress}
                                error={item.error}
                                accent="download"
                                canOpen={item.status === 'success' && !!item.savePath}
                                onCancel={onCancelDownload}
                                onRetry={onRetryDownload}
                                onPause={onPauseDownload}
                                onResume={onResumeDownload}
                                onOpen={onOpenDownload}
                                onReveal={onRevealDownload}
                            />
                        ))}
                    </section>
                )}
            </div>
        </div>
    );
}

function TransferRow({
    id,
    name,
    status,
    progress,
    error,
    accent,
    canOpen,
    onCancel,
    onRetry,
    onPause,
    onResume,
    onOpen,
    onReveal,
}: {
    id: string;
    name: string;
    status: QueueItem['status'] | DownloadItem['status'];
    progress?: number;
    error?: string;
    accent: 'upload' | 'download';
    canOpen?: boolean;
    onCancel: (id: string) => void;
    onRetry: (id: string) => void;
    onPause: (id: string) => void;
    onResume: (id: string) => void;
    onOpen?: (id: string) => void;
    onReveal?: (id: string) => void;
}) {
    const active = status === 'uploading' || status === 'downloading';
    const color = accent === 'upload' ? 'bg-telegram-primary' : 'bg-telegram-secondary';
    const showRetry = status === 'error' || status === 'cancelled';
    const showPause = status === 'pending';
    const showResume = status === 'paused';
    const showCancel = status === 'pending' || status === 'uploading' || status === 'downloading' || status === 'paused';

    return (
        <div className="flex flex-col gap-2 p-3 bg-telegram-bg/55 border border-telegram-border rounded-lg">
            <div className="flex items-center gap-3 text-sm">
                <StatusIcon status={status} accent={accent} />
                <div className="flex-1 truncate text-telegram-text font-medium" title={name}>{name}</div>
                {active && progress !== undefined && (
                    <div className="text-[11px] text-telegram-secondary font-mono">{progress}%</div>
                )}
                {status === 'paused' && <div className="text-[11px] text-telegram-secondary">Paused</div>}
                {status === 'cancelled' && <div className="text-[11px] text-telegram-subtext">Cancelled</div>}
                {status === 'error' && <div className="text-[11px] text-red-400">Error</div>}
            </div>

            {active && (
                <div className="w-full bg-telegram-border h-1 rounded-full overflow-hidden">
                    {progress !== undefined ? (
                        <div
                            className={`${color} h-full rounded-full transition-all duration-300`}
                            style={{ width: `${progress}%` }}
                        />
                    ) : (
                        <div className={`${color} h-full w-full animate-progress-indeterminate`} />
                    )}
                </div>
            )}

            {status === 'error' && error && (
                <div className="flex items-center gap-1 text-xs text-red-400">
                    <AlertCircle className="w-3 h-3" />
                    <span className="truncate">{error}</span>
                </div>
            )}

            {(showRetry || showPause || showResume || showCancel || canOpen) && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                    {showPause && <ActionButton onClick={() => onPause(id)} icon={Pause} label="Pause" />}
                    {showResume && <ActionButton onClick={() => onResume(id)} icon={Play} label="Resume" />}
                    {showRetry && <ActionButton onClick={() => onRetry(id)} icon={RotateCcw} label="Retry" />}
                    {canOpen && onOpen && <ActionButton onClick={() => onOpen(id)} icon={ExternalLink} label="Open" />}
                    {canOpen && onReveal && <ActionButton onClick={() => onReveal(id)} icon={FolderOpen} label="Reveal" />}
                    {showCancel && <ActionButton onClick={() => onCancel(id)} icon={X} label="Cancel" danger />}
                </div>
            )}
        </div>
    );
}

function ActionButton({
    onClick,
    icon: Icon,
    label,
    danger,
}: {
    onClick: () => void;
    icon: React.ElementType;
    label: string;
    danger?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] border transition-colors ${danger
                ? 'border-red-500/20 text-red-400 hover:bg-red-500/10'
                : 'border-telegram-border text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover'
            }`}
        >
            <Icon className="w-3 h-3" />
            {label}
        </button>
    );
}

function StatusIcon({
    status,
    accent,
}: {
    status: QueueItem['status'] | DownloadItem['status'];
    accent: 'upload' | 'download';
}) {
    if (status === 'pending') {
        return <div className="w-4 h-4 rounded-md bg-telegram-secondary/15 flex items-center justify-center"><div className="w-2 h-2 bg-telegram-secondary rounded-sm" /></div>;
    }
    if (status === 'paused') {
        return <div className="w-4 h-4 rounded-md bg-telegram-secondary/15 flex items-center justify-center"><Pause className="w-3 h-3 text-telegram-secondary" /></div>;
    }
    if (status === 'uploading' || status === 'downloading') {
        const border = accent === 'upload' ? 'border-telegram-primary' : 'border-telegram-secondary';
        return <div className={`w-4 h-4 rounded-full border-2 ${border} border-t-transparent animate-spin`} />;
    }
    if (status === 'success') {
        return <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center"><Check className="w-3 h-3 text-green-500" /></div>;
    }
    if (status === 'error') {
        return <div className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center"><X className="w-3 h-3 text-red-500" /></div>;
    }
    return <div className="w-4 h-4 rounded-full bg-gray-500/20 flex items-center justify-center"><X className="w-3 h-3 text-gray-400" /></div>;
}
