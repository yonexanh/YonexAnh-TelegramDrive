import { invoke } from '@tauri-apps/api/core';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext';
import { TelegramFile } from '../types';

export function useFileOperations(
    activeFolderId: number | null,
    selectedIds: number[],
    setSelectedIds: (ids: number[]) => void,
    displayedFiles: TelegramFile[]
) {
    const queryClient = useQueryClient();
    const { confirm } = useConfirm();

    const handleDelete = async (id: number, folderIdOverride?: number | null) => {
        if (!await confirm({ title: "Delete File", message: "Are you sure you want to delete this file?", confirmText: "Delete", variant: 'danger' })) return false;
        try {
            const folderId = folderIdOverride === undefined ? activeFolderId : folderIdOverride;
            await invoke('cmd_delete_file', { messageId: id, folderId });
            queryClient.invalidateQueries({ queryKey: ['files', folderId] });
            toast.success("File deleted");
            return true;
        } catch (e) {
            toast.error(`Delete failed: ${e}`);
            return false;
        }
    }

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return [];
        if (!await confirm({ title: "Delete Files", message: `Are you sure you want to delete ${selectedIds.length} files?`, confirmText: "Delete All", variant: 'danger' })) return [];

        let success = 0;
        let fail = 0;
        const deletedIds: number[] = [];
        for (const id of selectedIds) {
            const file = displayedFiles.find(f => f.id === id);
            const folderId = file?.folder_id === undefined ? activeFolderId : file.folder_id;
            try {
                await invoke('cmd_delete_file', { messageId: id, folderId });
                success++;
                deletedIds.push(id);
            } catch {
                fail++;
            }
        }
        setSelectedIds([]);
        queryClient.invalidateQueries({ queryKey: ['files', activeFolderId] });
        if (success > 0) toast.success(`Deleted ${success} files.`);
        if (fail > 0) toast.error(`Failed to delete ${fail} files.`);
        return deletedIds;
    }

    const handleDownload = async (id: number, name: string) => {
        try {
            const savePath = await import('@tauri-apps/plugin-dialog').then(d => d.save({
                defaultPath: name,
            }));
            if (!savePath) return;
            toast.info(`Download started: ${name}`);
            await invoke('cmd_download_file', { messageId: id, savePath, folderId: activeFolderId });
            toast.success(`Download complete: ${name}`);
        } catch (e) {
            toast.error(`Download failed: ${e}`);
        }
    }

    const handleBulkDownload = async () => {
        if (selectedIds.length === 0) return;
        try {
            const dirPath = await import('@tauri-apps/plugin-dialog').then(d => d.open({
                directory: true, multiple: false, title: "Select Download Destination"
            }));
            if (!dirPath) return;
            let successCount = 0;
            const targetFiles = displayedFiles.filter((f) => selectedIds.includes(f.id));
            toast.info(`Starting batch download of ${targetFiles.length} files...`);

            for (const file of targetFiles) {
                const filePath = `${dirPath}/${file.name}`;
                try {
                    await invoke('cmd_download_file', { messageId: file.id, savePath: filePath, folderId: activeFolderId });
                    successCount++;
                } catch (e) { }
            }
            toast.success(`Downloaded ${successCount} files.`);
            setSelectedIds([]);
        } catch (e) {
            toast.error(`Bulk download failed: ${e}`);
        }
    }

    const handleBulkMove = async (targetFolderId: number | null, onSuccess?: () => void) => {
        if (selectedIds.length === 0) return;
        try {
            const selectedFiles = displayedFiles.filter((f) => selectedIds.includes(f.id));
            const sourceIds = Array.from(new Set(selectedFiles.map((f) => f.folder_id === undefined ? activeFolderId : f.folder_id)));
            if (sourceIds.length > 1) {
                toast.error('Move selection must come from the same folder.');
                return;
            }
            const sourceFolderId = sourceIds[0] === undefined ? activeFolderId : sourceIds[0];
            await invoke('cmd_move_files', {
                messageIds: selectedIds,
                sourceFolderId,
                targetFolderId: targetFolderId
            });
            toast.success(`Moved ${selectedIds.length} files.`);
            queryClient.invalidateQueries({ queryKey: ['files', sourceFolderId] });
            setSelectedIds([]);
            if (onSuccess) onSuccess();
        } catch {
            toast.error('Failed to move files');
        }
    };

    const handleDownloadFolder = async () => {
        if (displayedFiles.length === 0) {
            toast.info("Folder is empty.");
            return;
        }
        try {
            const dirPath = await import('@tauri-apps/plugin-dialog').then(d => d.open({
                directory: true, multiple: false, title: "Download Folder To..."
            }));
            if (!dirPath) return;
            let successCount = 0;
            toast.info(`Downloading folder contents (${displayedFiles.length} files)...`);
            for (const file of displayedFiles) {
                const filePath = `${dirPath}/${file.name}`;
                try {
                    await invoke('cmd_download_file', { messageId: file.id, savePath: filePath, folderId: activeFolderId });
                    successCount++;
                } catch (e) { }
            }
            toast.success(`Folder Download Complete: ${successCount} files.`);
        } catch (e) {
            toast.error("Error: " + e);
        }
    }

    return {
        handleDelete,
        handleBulkDelete,
        handleDownload,
        handleBulkDownload,
        handleBulkMove,
        handleDownloadFolder,
        handleGlobalSearch: async (query: string) => {
            try {
                return await invoke<TelegramFile[]>('cmd_search_global', { query });
            } catch {
                return [];
            }
        }
    };
}
