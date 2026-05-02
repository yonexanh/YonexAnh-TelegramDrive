import { RotateCcw, Tag } from 'lucide-react';
import { FileFilters, FileFilterType } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

interface AdvancedSearchPanelProps {
    filters: FileFilters;
    resultCount: number;
    availableTags: string[];
    onChange: (filters: FileFilters) => void;
    onClear: () => void;
}

const typeOptions: { value: FileFilterType; labelKey: string }[] = [
    { value: 'all', labelKey: 'filters.allTypes' },
    { value: 'image', labelKey: 'filters.images' },
    { value: 'video', labelKey: 'filters.videos' },
    { value: 'audio', labelKey: 'filters.audio' },
    { value: 'pdf', labelKey: 'filters.pdf' },
    { value: 'document', labelKey: 'filters.documents' },
    { value: 'archive', labelKey: 'filters.archives' },
    { value: 'other', labelKey: 'filters.other' },
];

export function AdvancedSearchPanel({ filters, resultCount, availableTags, onChange, onClear }: AdvancedSearchPanelProps) {
    const { t } = useLanguage();

    const update = <K extends keyof FileFilters>(key: K, value: FileFilters[K]) => {
        onChange({ ...filters, [key]: value });
    };

    return (
        <div className="px-6 pt-4">
            <div className="console-panel rounded-lg p-4 flex flex-wrap items-end gap-3">
                <div className="min-w-[150px]">
                    <label className="block text-[10px] uppercase tracking-[0.16em] text-telegram-subtext mb-1.5">{t('filters.type')}</label>
                    <select
                        value={filters.type}
                        onChange={(e) => update('type', e.target.value as FileFilterType)}
                        className="w-full bg-telegram-bg/60 border border-telegram-border rounded-lg px-3 py-2 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/60"
                    >
                        {typeOptions.map(option => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
                    </select>
                </div>

                <div className="min-w-[170px] flex-1 max-w-[240px]">
                    <label className="block text-[10px] uppercase tracking-[0.16em] text-telegram-subtext mb-1.5">{t('filters.tag')}</label>
                    <div className="relative">
                        <Tag className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-telegram-subtext" />
                        <input
                            value={filters.tagQuery}
                            onChange={(e) => update('tagQuery', e.target.value)}
                            list="tag-filter-options"
                            placeholder={t('filters.tagPlaceholder')}
                            className="w-full bg-telegram-bg/60 border border-telegram-border rounded-lg pl-9 pr-3 py-2 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/60"
                        />
                        {availableTags.length > 0 && (
                            <datalist id="tag-filter-options">
                                {availableTags.map(tag => <option key={tag} value={tag} />)}
                            </datalist>
                        )}
                    </div>
                </div>

                <div className="w-28">
                    <label className="block text-[10px] uppercase tracking-[0.16em] text-telegram-subtext mb-1.5">{t('filters.minMb')}</label>
                    <input
                        value={filters.minSizeMb}
                        onChange={(e) => update('minSizeMb', e.target.value)}
                        inputMode="decimal"
                        className="w-full bg-telegram-bg/60 border border-telegram-border rounded-lg px-3 py-2 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/60"
                    />
                </div>

                <div className="w-28">
                    <label className="block text-[10px] uppercase tracking-[0.16em] text-telegram-subtext mb-1.5">{t('filters.maxMb')}</label>
                    <input
                        value={filters.maxSizeMb}
                        onChange={(e) => update('maxSizeMb', e.target.value)}
                        inputMode="decimal"
                        className="w-full bg-telegram-bg/60 border border-telegram-border rounded-lg px-3 py-2 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/60"
                    />
                </div>

                <div className="min-w-[130px]">
                    <label className="block text-[10px] uppercase tracking-[0.16em] text-telegram-subtext mb-1.5">{t('filters.date')}</label>
                    <select
                        value={filters.date}
                        onChange={(e) => update('date', e.target.value as FileFilters['date'])}
                        className="w-full bg-telegram-bg/60 border border-telegram-border rounded-lg px-3 py-2 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/60"
                    >
                        <option value="any">{t('filters.anyTime')}</option>
                        <option value="today">{t('filters.today')}</option>
                        <option value="week">{t('filters.thisWeek')}</option>
                        <option value="month">{t('filters.thisMonth')}</option>
                    </select>
                </div>

                <label className="flex items-center gap-2 px-3 py-2 border border-telegram-border rounded-lg text-sm text-telegram-text bg-telegram-bg/40">
                    <input
                        type="checkbox"
                        checked={filters.favoritesOnly}
                        onChange={(e) => update('favoritesOnly', e.target.checked)}
                        className="accent-telegram-primary"
                    />
                    {t('filters.favorites')}
                </label>

                <button onClick={onClear} className="command-button px-3 py-2 text-sm">
                    <RotateCcw className="w-4 h-4" />
                    {t('filters.reset')}
                </button>

                <div className="ml-auto text-xs text-telegram-subtext pb-2">
                    {resultCount} {resultCount === 1 ? t('filters.result') : t('filters.results')}
                </div>
            </div>
        </div>
    );
}
