import { useState } from 'react';
import { Download, Eye, FolderInput, Pencil, Plus, RotateCcw, Star, Tag, Trash2, X } from 'lucide-react';
import { TelegramFile, TelegramFolder } from '../../types';
import { formatBytes, getFileCategory } from '../../utils';
import { FileTypeIcon } from '../FileTypeIcon';
import { useLanguage } from '../../context/LanguageContext';

interface DetailsPanelProps {
    file: TelegramFile;
    folders: TelegramFolder[];
    onClose: () => void;
    onPreview: (file: TelegramFile) => void;
    onDownload: (file: TelegramFile) => void;
    onDelete: (file: TelegramFile) => void;
    onRename: (file: TelegramFile) => void;
    onMove: () => void;
    onToggleFavorite: (file: TelegramFile) => void;
    onRestore?: (file: TelegramFile) => void;
    onAddTag: (file: TelegramFile, tag: string) => void;
    onRemoveTag: (file: TelegramFile, tag: string) => void;
}

export function DetailsPanel({
    file,
    folders,
    onClose,
    onPreview,
    onDownload,
    onDelete,
    onRename,
    onMove,
    onToggleFavorite,
    onRestore,
    onAddTag,
    onRemoveTag,
}: DetailsPanelProps) {
    const { t } = useLanguage();
    const [tagInput, setTagInput] = useState('');
    const folderName = file.folder_id === null || file.folder_id === undefined
        ? t('sidebar.savedMessages')
        : folders.find(f => f.id === file.folder_id)?.name || t('details.folder');
    const category = getFileCategory(file.originalName || file.name);
    const tags = file.tags || [];

    const submitTag = () => {
        const tag = tagInput.trim();
        if (!tag) return;
        onAddTag(file, tag);
        setTagInput('');
    };

    return (
        <aside
            className="w-80 shrink-0 border-l border-telegram-border bg-telegram-surface/60 p-4 overflow-y-auto custom-scrollbar"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-telegram-subtext">{t('details.inspector')}</p>
                    <h3 className="text-base font-semibold text-telegram-text mt-1">{t('details.fileDetails')}</h3>
                </div>
                <button onClick={onClose} className="p-2 rounded-lg text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="console-panel rounded-lg p-5 text-center mb-4">
                <div className="w-16 h-16 mx-auto rounded-lg bg-telegram-hover border border-telegram-border flex items-center justify-center mb-4">
                    <FileTypeIcon filename={file.originalName || file.name} size="lg" />
                </div>
                <h4 className="text-sm font-semibold text-telegram-text break-words">{file.name}</h4>
                {file.originalName && file.originalName !== file.name && (
                    <p className="text-xs text-telegram-subtext mt-1 break-words">{t('details.original')}: {file.originalName}</p>
                )}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
                <button onClick={() => onPreview(file)} className="command-button px-3 py-2 text-sm">
                    <Eye className="w-4 h-4" />
                    {t('details.preview')}
                </button>
                <button onClick={() => onDownload(file)} className="command-button px-3 py-2 text-sm">
                    <Download className="w-4 h-4" />
                    {t('common.download')}
                </button>
                {file.deletedAt && onRestore ? (
                    <button onClick={() => onRestore(file)} className="command-button px-3 py-2 text-sm">
                        <RotateCcw className="w-4 h-4" />
                        {t('common.restore')}
                    </button>
                ) : (
                    <>
                        <button onClick={() => onRename(file)} className="command-button px-3 py-2 text-sm">
                            <Pencil className="w-4 h-4" />
                            {t('details.rename')}
                        </button>
                        <button onClick={() => onToggleFavorite(file)} className="command-button px-3 py-2 text-sm">
                            <Star className={`w-4 h-4 ${file.isFavorite ? 'fill-telegram-secondary text-telegram-secondary' : ''}`} />
                            {file.isFavorite ? t('details.unpin') : t('details.pin')}
                        </button>
                        <button onClick={onMove} className="command-button px-3 py-2 text-sm">
                            <FolderInput className="w-4 h-4" />
                            {t('common.move')}
                        </button>
                    </>
                )}
                <button onClick={() => onDelete(file)} className="px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 text-red-400 bg-red-500/10 hover:bg-red-500/20">
                    <Trash2 className="w-4 h-4" />
                    {file.deletedAt ? t('common.deleteForever') : t('common.trash')}
                </button>
            </div>

            {!file.deletedAt && (
                <div className="console-panel rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Tag className="w-4 h-4 text-telegram-primary" />
                        <p className="text-[10px] uppercase tracking-[0.16em] text-telegram-subtext">{t('details.tags')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-3">
                        {tags.length === 0 && <span className="text-xs text-telegram-subtext">{t('details.noTags')}</span>}
                        {tags.map(tag => (
                            <button
                                key={tag}
                                onClick={() => onRemoveTag(file, tag)}
                                className="metadata-pill px-2.5 py-1 text-xs flex items-center gap-1 text-telegram-text hover:text-red-400"
                            >
                                {tag}
                                <X className="w-3 h-3" />
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <input
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && submitTag()}
                            placeholder={t('details.addTag')}
                            className="min-w-0 flex-1 bg-telegram-bg border border-telegram-border rounded-lg px-3 py-2 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/60"
                        />
                        <button onClick={submitTag} className="command-button px-3 py-2">
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            <div className="console-panel rounded-lg divide-y divide-telegram-border overflow-hidden">
                <DetailRow label={t('details.type')} value={category} />
                <DetailRow label={t('details.size')} value={formatBytes(file.size || 0)} />
                <DetailRow label={t('details.folder')} value={folderName} />
                <DetailRow label={t('details.created')} value={file.created_at || '-'} />
                <DetailRow label={t('details.messageId')} value={String(file.id)} />
                {file.mime_type && <DetailRow label="MIME" value={file.mime_type} />}
            </div>
        </aside>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-telegram-subtext">{label}</p>
            <p className="text-sm text-telegram-text mt-1 break-words">{value}</p>
        </div>
    );
}
