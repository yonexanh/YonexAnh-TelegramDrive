import { Languages } from 'lucide-react';
import { Language, useLanguage } from '../context/LanguageContext';

interface LanguageToggleProps {
    compact?: boolean;
    className?: string;
}

export function LanguageToggle({ compact = false, className = '' }: LanguageToggleProps) {
    const { language, setLanguage, t } = useLanguage();
    const options: { value: Language; label: string }[] = [
        { value: 'en', label: 'EN' },
        { value: 'vi', label: 'VN' },
    ];

    return (
        <div
            className={`inline-flex items-center gap-1 rounded-lg border border-telegram-border bg-telegram-surface/90 p-1 shadow-sm ${className}`}
            title={t('common.language')}
        >
            {!compact && <Languages className="w-4 h-4 text-telegram-subtext ml-1" />}
            {options.map(option => (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => setLanguage(option.value)}
                    className={`min-w-8 rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                        language === option.value
                            ? 'bg-telegram-primary text-[#06201c]'
                            : 'text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text'
                    }`}
                    aria-pressed={language === option.value}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}
