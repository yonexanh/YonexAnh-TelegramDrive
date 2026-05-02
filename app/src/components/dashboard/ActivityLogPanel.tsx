import {
    Clock3,
    DatabaseBackup,
    Download,
    Eraser,
    Folder,
    History,
    MoveRight,
    Pencil,
    RotateCcw,
    Search,
    Star,
    Tag,
    Trash2,
    Upload,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { ActivityAction, ActivityLogItem } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

interface ActivityLogPanelProps {
    items: ActivityLogItem[];
    onClear: () => void;
}

const FILTERS: Array<'all' | ActivityAction> = [
    'all',
    'upload',
    'download',
    'tag_add',
    'backup',
    'metadata_restore',
    'google_drive',
    'rename',
    'trash',
    'restore',
];

function formatActivityTime(value: number) {
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
}

function actionIcon(action: ActivityAction) {
    switch (action) {
        case 'upload':
            return Upload;
        case 'download':
            return Download;
        case 'rename':
        case 'tag_rename':
            return Pencil;
        case 'favorite':
            return Star;
        case 'trash':
        case 'tag_delete':
            return Trash2;
        case 'restore':
        case 'metadata_restore':
            return RotateCcw;
        case 'tag_add':
        case 'tag_remove':
            return Tag;
        case 'backup':
            return DatabaseBackup;
        case 'move':
            return MoveRight;
        case 'sync':
            return History;
        case 'folder':
            return Folder;
        default:
            return Clock3;
    }
}

export function ActivityLogPanel({ items, onClear }: ActivityLogPanelProps) {
    const { t } = useLanguage();
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<'all' | ActivityAction>('all');

    const orderedItems = useMemo(() => {
        const search = query.trim().toLowerCase();
        return [...items]
            .sort((a, b) => b.at - a.at)
            .filter((item) => filter === 'all' || item.action === filter)
            .filter((item) => {
                if (!search) return true;
                return `${item.label} ${item.detail || ''} ${item.fileName || ''}`.toLowerCase().includes(search);
            });
    }, [filter, items, query]);

    const todayCount = items.filter(item => item.at > Date.now() - 24 * 60 * 60 * 1000).length;

    return (
        <div className="flex-1 overflow-auto p-6 custom-scrollbar">
            <div className="max-w-5xl space-y-4">
                <div className="console-panel rounded-lg p-5 flex items-start justify-between gap-4">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-telegram-subtext">{t('activity.console')}</p>
                        <h2 className="text-xl font-semibold text-telegram-text mt-1">{t('activity.title')}</h2>
                        <p className="text-sm text-telegram-subtext mt-2">{t('activity.description')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="metadata-pill px-3 py-1.5 text-xs text-telegram-primary">
                            {todayCount} {t('activity.today')}
                        </div>
                        <button
                            onClick={onClear}
                            disabled={items.length === 0}
                            className="command-button px-3 py-2 text-xs text-telegram-subtext disabled:opacity-50"
                            title={t('activity.clear')}
                        >
                            <Eraser className="w-4 h-4" />
                            {t('activity.clear')}
                        </button>
                    </div>
                </div>

                <div className="console-panel rounded-lg p-4 space-y-3">
                    <div className="relative max-w-md">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-telegram-subtext" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={t('activity.searchPlaceholder')}
                            className="w-full bg-telegram-bg/60 border border-telegram-border rounded-lg pl-9 pr-3 py-2 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/60"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {FILTERS.map(item => (
                            <button
                                key={item}
                                onClick={() => setFilter(item)}
                                className={`metadata-pill px-3 py-1.5 text-xs ${filter === item ? 'text-telegram-primary border-telegram-primary/40' : 'text-telegram-subtext hover:text-telegram-text'}`}
                            >
                                {item === 'all' ? t('activity.all') : t(`activity.action.${item}`)}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="console-panel rounded-lg overflow-hidden">
                    {orderedItems.map(item => {
                        const Icon = actionIcon(item.action);
                        return (
                            <div key={item.id} className="flex items-start gap-4 px-4 py-3 border-b border-telegram-border last:border-b-0">
                                <div className="w-9 h-9 rounded-lg bg-telegram-hover border border-telegram-border flex items-center justify-center shrink-0">
                                    <Icon className="w-4 h-4 text-telegram-primary" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="text-sm font-semibold text-telegram-text truncate">{item.label}</p>
                                        <span className="text-xs text-telegram-subtext shrink-0">{formatActivityTime(item.at)}</span>
                                    </div>
                                    {item.detail && <p className="text-xs text-telegram-subtext mt-1 break-words">{item.detail}</p>}
                                    {item.fileName && <p className="text-xs text-telegram-primary/80 mt-1 truncate">{item.fileName}</p>}
                                </div>
                            </div>
                        );
                    })}
                    {orderedItems.length === 0 && (
                        <div className="p-8 text-center text-sm text-telegram-subtext">
                            {t('activity.empty')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
