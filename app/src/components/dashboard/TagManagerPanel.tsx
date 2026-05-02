import { Check, Edit3, Search, Tag, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { formatBytes } from '../../utils';

export interface TagStat {
    tag: string;
    count: number;
    favoriteCount: number;
    totalSize: number;
}

interface TagManagerPanelProps {
    tagStats: TagStat[];
    onOpenTag: (tag: string) => void;
    onRenameTag: (tag: string, nextTag: string) => void;
    onDeleteTag: (tag: string) => void;
}

export function TagManagerPanel({ tagStats, onOpenTag, onRenameTag, onDeleteTag }: TagManagerPanelProps) {
    const { t } = useLanguage();
    const [editingTag, setEditingTag] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    const [query, setQuery] = useState('');

    const filteredTags = tagStats.filter(stat => stat.tag.toLowerCase().includes(query.trim().toLowerCase()));

    const startEdit = (tag: string) => {
        setEditingTag(tag);
        setDraft(tag);
    };

    const submitRename = () => {
        if (!editingTag) return;
        const nextTag = draft.trim().replace(/\s+/g, ' ');
        if (nextTag && nextTag !== editingTag) {
            onRenameTag(editingTag, nextTag);
        }
        setEditingTag(null);
        setDraft('');
    };

    return (
        <div className="flex-1 overflow-auto p-6 custom-scrollbar">
            <div className="max-w-5xl space-y-4">
                <div className="console-panel rounded-lg p-5 flex items-start justify-between gap-4">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-telegram-subtext">{t('tags.manager')}</p>
                        <h2 className="text-xl font-semibold text-telegram-text mt-1">{t('tags.title')}</h2>
                        <p className="text-sm text-telegram-subtext mt-2">{t('tags.description')}</p>
                    </div>
                    <div className="metadata-pill px-3 py-1.5 text-xs text-telegram-primary">{tagStats.length} {t('tags.tags')}</div>
                </div>

                <div className="console-panel rounded-lg p-4">
                    <div className="relative max-w-sm">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-telegram-subtext" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={t('tags.searchPlaceholder')}
                            className="w-full bg-telegram-bg/60 border border-telegram-border rounded-lg pl-9 pr-3 py-2 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/60"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                    {filteredTags.map(stat => (
                        <div key={stat.tag} className="console-panel rounded-lg p-4 flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-telegram-primary/10 border border-telegram-primary/25 flex items-center justify-center shrink-0">
                                <Tag className="w-5 h-5 text-telegram-primary" />
                            </div>

                            <div className="min-w-0 flex-1">
                                {editingTag === stat.tag ? (
                                    <input
                                        autoFocus
                                        value={draft}
                                        onChange={(event) => setDraft(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') submitRename();
                                            if (event.key === 'Escape') setEditingTag(null);
                                        }}
                                        className="w-full max-w-sm bg-telegram-bg border border-telegram-border rounded-lg px-3 py-2 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/60"
                                    />
                                ) : (
                                    <button onClick={() => onOpenTag(stat.tag)} className="text-left text-base font-semibold text-telegram-text hover:text-telegram-primary truncate">
                                        {stat.tag}
                                    </button>
                                )}
                                <div className="flex flex-wrap items-center gap-3 text-xs text-telegram-subtext mt-1">
                                    <span>{stat.count} {t('tags.files')}</span>
                                    <span>{formatBytes(stat.totalSize)}</span>
                                    <span>{stat.favoriteCount} {t('sidebar.favorites').toLowerCase()}</span>
                                </div>
                            </div>

                            {editingTag === stat.tag ? (
                                <div className="flex gap-2">
                                    <button onClick={submitRename} className="command-button p-2 text-telegram-primary" title={t('common.continue')}>
                                        <Check className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => setEditingTag(null)} className="command-button p-2 text-telegram-subtext" title={t('common.cancel')}>
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <button onClick={() => startEdit(stat.tag)} className="command-button p-2 text-telegram-subtext" title={t('details.rename')}>
                                        <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => onDeleteTag(stat.tag)} className="command-button p-2 text-red-400" title={t('tags.delete')}>
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}

                    {filteredTags.length === 0 && (
                        <div className="console-panel rounded-lg p-8 text-center text-telegram-subtext">
                            {t('tags.empty')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
