import { useEffect, useState } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';

export function useFileDrop(onDropPaths: (paths: string[]) => void) {
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
            return;
        }

        let mounted = true;
        let unlisten: (() => void) | undefined;

        getCurrentWebview().onDragDropEvent((event) => {
            if (!mounted) return;

            if (event.payload.type === 'enter' || event.payload.type === 'over') {
                setIsDragging(true);
                return;
            }

            if (event.payload.type === 'drop') {
                setIsDragging(false);
                if (event.payload.paths.length > 0) {
                    onDropPaths(event.payload.paths);
                }
                return;
            }

            setIsDragging(false);
        }).then((fn) => {
            unlisten = fn;
        }).catch(() => {
            setIsDragging(false);
        });

        return () => {
            mounted = false;
            unlisten?.();
        };
    }, [onDropPaths]);

    return { isDragging };
}
