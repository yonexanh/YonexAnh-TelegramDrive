import { FileUp, FolderOpen, Upload } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface EmptyStateProps {
    onUpload: () => void;
    title?: string;
    message?: string;
    showUpload?: boolean;
}

export function EmptyState({
    onUpload,
    title,
    message,
    showUpload = true,
}: EmptyStateProps) {
    const { t } = useLanguage();
    const displayTitle = title || t('empty.defaultTitle');
    const displayMessage = message || t('empty.defaultMessage');

    return (
        <div className="h-full min-h-[420px] flex items-center justify-center px-8">
            <div className="console-panel rounded-lg p-8 text-center max-w-md w-full">
                <div className="w-14 h-14 rounded-lg bg-telegram-primary/10 border border-telegram-primary/25 flex items-center justify-center mx-auto mb-6">
                    <FolderOpen className="w-7 h-7 text-telegram-primary" />
                </div>

                <h3 className="text-xl font-semibold text-telegram-text mb-2">
                    {displayTitle}
                </h3>
                <p className="text-telegram-subtext text-sm mb-6">
                    {displayMessage}
                </p>

                {showUpload && (
                    <div className="flex items-center justify-center gap-3">
                        <button
                            onClick={onUpload}
                            className="inline-flex items-center gap-2 px-5 py-3 bg-telegram-primary text-[#06201c] font-semibold rounded-lg hover:bg-telegram-primary/90 transition-all shadow-lg shadow-telegram-primary/10"
                        >
                            <Upload className="w-5 h-5" />
                            {t('empty.uploadFiles')}
                        </button>
                        <div className="metadata-pill inline-flex items-center gap-2 px-3 py-2 text-xs">
                            <FileUp className="w-4 h-4" />
                            {t('empty.dragDrop')}
                        </div>
                    </div>
                )}

                <p className="text-xs text-telegram-subtext/60 mt-6">
                    {t('empty.tipSearch')}
                </p>
            </div>
        </div>
    );
}
