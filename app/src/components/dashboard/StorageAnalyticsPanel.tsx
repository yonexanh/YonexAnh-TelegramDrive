import { BarChart3, Database, Folder, HardDrive, PieChart, Tags } from 'lucide-react';
import { useMemo } from 'react';
import { TelegramFile, TelegramFolder } from '../../types';
import { formatBytes, getFileCategory } from '../../utils';
import { useLanguage } from '../../context/LanguageContext';
import { TagStat } from './TagManagerPanel';

interface StorageAnalyticsPanelProps {
    files: TelegramFile[];
    folders: TelegramFolder[];
    tagStats: TagStat[];
}

interface Bucket {
    key: string;
    label: string;
    count: number;
    size: number;
}

function percent(value: number, total: number) {
    if (total <= 0) return 0;
    return Math.max(2, Math.round((value / total) * 100));
}

export function StorageAnalyticsPanel({ files, folders, tagStats }: StorageAnalyticsPanelProps) {
    const { t } = useLanguage();

    const stats = useMemo(() => {
        const activeFiles = files.filter(file => file.type !== 'folder' && !file.deletedAt);
        const totalSize = activeFiles.reduce((sum, file) => sum + (file.size || 0), 0);
        const favoriteCount = activeFiles.filter(file => file.isFavorite).length;

        const categoryMap = new Map<string, Bucket>();
        activeFiles.forEach((file) => {
            const key = getFileCategory(file.originalName || file.name);
            const existing = categoryMap.get(key) || {
                key,
                label: t(`analytics.category.${key}`),
                count: 0,
                size: 0,
            };
            existing.count += 1;
            existing.size += file.size || 0;
            categoryMap.set(key, existing);
        });

        const folderMap = new Map<string, Bucket>();
        activeFiles.forEach((file) => {
            const folderId = file.folder_id ?? null;
            const key = folderId === null ? 'home' : String(folderId);
            const folderName = folderId === null
                ? t('sidebar.savedMessages')
                : folders.find(folder => folder.id === folderId)?.name || t('details.folder');
            const existing = folderMap.get(key) || { key, label: folderName, count: 0, size: 0 };
            existing.count += 1;
            existing.size += file.size || 0;
            folderMap.set(key, existing);
        });

        return {
            activeFiles,
            totalSize,
            favoriteCount,
            categories: Array.from(categoryMap.values()).sort((a, b) => b.size - a.size),
            folders: Array.from(folderMap.values()).sort((a, b) => b.size - a.size).slice(0, 6),
            largestFiles: [...activeFiles].sort((a, b) => (b.size || 0) - (a.size || 0)).slice(0, 8),
            topTags: [...tagStats].sort((a, b) => b.totalSize - a.totalSize).slice(0, 6),
        };
    }, [files, folders, t, tagStats]);

    return (
        <div className="flex-1 overflow-auto p-6 custom-scrollbar">
            <div className="max-w-6xl space-y-4">
                <div className="console-panel rounded-lg p-5 flex items-start justify-between gap-4">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-telegram-subtext">{t('analytics.console')}</p>
                        <h2 className="text-xl font-semibold text-telegram-text mt-1">{t('analytics.title')}</h2>
                        <p className="text-sm text-telegram-subtext mt-2">{t('analytics.description')}</p>
                    </div>
                    <div className="w-11 h-11 rounded-lg bg-telegram-primary/10 border border-telegram-primary/25 flex items-center justify-center">
                        <BarChart3 className="w-5 h-5 text-telegram-primary" />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <MetricCard icon={HardDrive} label={t('analytics.totalSize')} value={formatBytes(stats.totalSize)} />
                    <MetricCard icon={Database} label={t('analytics.knownFiles')} value={String(stats.activeFiles.length)} />
                    <MetricCard icon={Tags} label={t('analytics.taggedFiles')} value={String(tagStats.reduce((sum, tag) => sum + tag.count, 0))} />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
                    <div className="console-panel rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-4">
                            <PieChart className="w-4 h-4 text-telegram-primary" />
                            <h3 className="text-sm font-semibold text-telegram-text">{t('analytics.byType')}</h3>
                        </div>
                        <div className="space-y-3">
                            {stats.categories.map(category => (
                                <BarRow
                                    key={category.key}
                                    label={category.label}
                                    value={`${category.count} ${t('analytics.files')}`}
                                    size={formatBytes(category.size)}
                                    percent={percent(category.size, stats.totalSize)}
                                />
                            ))}
                            {stats.categories.length === 0 && (
                                <p className="text-sm text-telegram-subtext">{t('analytics.empty')}</p>
                            )}
                        </div>
                    </div>

                    <div className="console-panel rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-4">
                            <Folder className="w-4 h-4 text-telegram-secondary" />
                            <h3 className="text-sm font-semibold text-telegram-text">{t('analytics.byFolder')}</h3>
                        </div>
                        <div className="space-y-3">
                            {stats.folders.map(folder => (
                                <BarRow
                                    key={folder.key}
                                    label={folder.label}
                                    value={`${folder.count} ${t('analytics.files')}`}
                                    size={formatBytes(folder.size)}
                                    percent={percent(folder.size, stats.totalSize)}
                                />
                            ))}
                            {stats.folders.length === 0 && (
                                <p className="text-sm text-telegram-subtext">{t('analytics.empty')}</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="console-panel rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-telegram-text mb-4">{t('analytics.largestFiles')}</h3>
                        <div className="space-y-2">
                            {stats.largestFiles.map(file => (
                                <div key={`${file.folder_id ?? 'home'}:${file.id}`} className="flex items-center gap-3 rounded-lg border border-telegram-border bg-telegram-bg/45 px-3 py-2">
                                    <span className="min-w-0 flex-1 truncate text-sm text-telegram-text">{file.name}</span>
                                    <span className="text-xs text-telegram-subtext shrink-0">{formatBytes(file.size || 0)}</span>
                                </div>
                            ))}
                            {stats.largestFiles.length === 0 && (
                                <p className="text-sm text-telegram-subtext">{t('analytics.empty')}</p>
                            )}
                        </div>
                    </div>

                    <div className="console-panel rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-telegram-text mb-4">{t('analytics.topTags')}</h3>
                        <div className="space-y-3">
                            {stats.topTags.map(tag => (
                                <BarRow
                                    key={tag.tag}
                                    label={tag.tag}
                                    value={`${tag.count} ${t('analytics.files')}`}
                                    size={formatBytes(tag.totalSize)}
                                    percent={percent(tag.totalSize, stats.totalSize)}
                                />
                            ))}
                            {stats.topTags.length === 0 && (
                                <p className="text-sm text-telegram-subtext">{t('analytics.noTags')}</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="console-panel rounded-lg p-4 flex flex-wrap gap-3 text-sm text-telegram-subtext">
                    <span>{t('analytics.favorites')}: <span className="text-telegram-text">{stats.favoriteCount}</span></span>
                    <span>{t('analytics.tags')}: <span className="text-telegram-text">{tagStats.length}</span></span>
                </div>
            </div>
        </div>
    );
}

function MetricCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
    return (
        <div className="console-panel rounded-lg p-4">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-telegram-hover border border-telegram-border flex items-center justify-center">
                    <Icon className="w-5 h-5 text-telegram-primary" />
                </div>
                <div>
                    <p className="text-xs text-telegram-subtext">{label}</p>
                    <p className="text-lg font-semibold text-telegram-text">{value}</p>
                </div>
            </div>
        </div>
    );
}

function BarRow({ label, value, size, percent: barPercent }: { label: string; value: string; size: string; percent: number }) {
    return (
        <div>
            <div className="flex items-center justify-between gap-3 mb-1">
                <span className="min-w-0 truncate text-sm font-medium text-telegram-text">{label}</span>
                <span className="text-xs text-telegram-subtext shrink-0">{size}</span>
            </div>
            <div className="h-2 rounded-full bg-telegram-bg overflow-hidden border border-telegram-border">
                <div className="h-full rounded-full bg-telegram-primary" style={{ width: `${barPercent}%` }} />
            </div>
            <p className="text-xs text-telegram-subtext mt-1">{value}</p>
        </div>
    );
}
