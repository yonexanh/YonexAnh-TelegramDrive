export interface TelegramFile {
    id: number;
    folder_id?: number | null;
    name: string;
    originalName?: string;
    size: number;
    sizeStr: string; // Formatted size
    created_at?: string;
    mime_type?: string | null;
    file_ext?: string | null;
    type?: 'folder' | 'file'; // implied icon_type
    isFavorite?: boolean;
    deletedAt?: number;
    deletedFromFolderId?: number | null;
    tags?: string[];
    // Add other fields if backend sends them
}

export interface TelegramFolder {
    id: number;
    name: string;
    parent_id?: number;
}

export interface TelegramAccountProfile {
    account_id?: string | null;
    id: number;
    full_name: string;
    username?: string | null;
    phone?: string | null;
}

export interface SavedTelegramAccount {
    account_id: string;
    telegram_id: number;
    full_name: string;
    username?: string | null;
    phone?: string | null;
    last_active_at: string;
}

export interface AccountListResult {
    active_account_id?: string | null;
    accounts: SavedTelegramAccount[];
}

export interface QueueItem {
    id: string;
    path: string;
    folderId: number | null;
    source?: 'manual' | 'sync';
    status: 'pending' | 'uploading' | 'paused' | 'success' | 'error' | 'cancelled';
    error?: string;
    progress?: number; // 0-100
}

export interface BandwidthStats {
    up_bytes: number;
    down_bytes: number;
}

export interface DownloadItem {
    id: string;
    messageId: number;
    filename: string;
    savePath?: string;
    folderId: number | null;
    status: 'pending' | 'downloading' | 'paused' | 'success' | 'error' | 'cancelled';
    error?: string;
    progress?: number; // 0-100
}

export interface FileMetaRecord {
    name?: string;
    favorite?: boolean;
    favoriteAt?: number;
    deletedAt?: number;
    deletedFromFolderId?: number | null;
    tags?: string[];
    file?: TelegramFile;
}

export type ActivityAction =
    | 'upload'
    | 'download'
    | 'rename'
    | 'favorite'
    | 'trash'
    | 'restore'
    | 'tag_add'
    | 'tag_remove'
    | 'tag_rename'
    | 'tag_delete'
    | 'backup'
    | 'metadata_restore'
    | 'move'
    | 'sync'
    | 'google_drive'
    | 'folder';

export interface ActivityLogItem {
    id: string;
    action: ActivityAction;
    label: string;
    detail?: string;
    fileKey?: string;
    fileName?: string;
    at: number;
}

export interface RecentItem {
    key: string;
    file: TelegramFile;
    action: 'preview' | 'download' | 'upload' | 'rename' | 'favorite' | 'trash' | 'restore' | 'tag';
    at: number;
}

export type WorkspaceView = 'files' | 'favorites' | 'recent' | 'trash' | 'media' | 'tags' | 'backup' | 'activity' | 'analytics' | 'sync' | 'googleDrive' | 'diagnostics' | 'collection';

export interface GoogleDriveSettings {
    clientId: string;
    accessToken: string | null;
    refreshToken: string | null;
    expiresAt: number | null;
    email?: string | null;
    name?: string | null;
    folderId?: string | null;
    folderName: string;
    lastBackupAt?: number | null;
    lastBackupResult?: string | null;
}

export type FileFilterType = 'all' | 'image' | 'video' | 'audio' | 'pdf' | 'document' | 'archive' | 'other';

export interface FileFilters {
    type: FileFilterType;
    tagQuery: string;
    minSizeMb: string;
    maxSizeMb: string;
    date: 'any' | 'today' | 'week' | 'month';
    favoritesOnly: boolean;
}

export interface LocalFileInfo {
    path: string;
    name: string;
    size: number;
    modified: number;
}

export interface LocalSyncSettings {
    enabled: boolean;
    path: string | null;
    folderId: number | null;
    intervalMinutes: number;
    lastRun?: number;
}

export type LocalSyncState = Record<string, string>;

export interface HealthCheckItem {
    key: string;
    label: string;
    status: 'ok' | 'warning' | 'error';
    detail: string;
}

export interface HealthReport {
    generated_at: string;
    checks: HealthCheckItem[];
}
