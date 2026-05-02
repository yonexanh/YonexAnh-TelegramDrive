import { BandwidthStats } from '../../types';
import { formatBytes } from '../../utils';

interface BandwidthWidgetProps {
    bandwidth: BandwidthStats | null;
}

export function BandwidthWidget({ bandwidth }: BandwidthWidgetProps) {
    if (!bandwidth) return null;

    const totalBytes = bandwidth.up_bytes + bandwidth.down_bytes;
    const limit = 250 * 1024 * 1024 * 1024; // 250GB
    const percent = Math.min((totalBytes / limit) * 100, 100);

    return (
        <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] p-3 text-xs text-white/60 space-y-2">
            <div className="flex items-center justify-between">
                <span className="font-semibold uppercase tracking-[0.16em] text-[10px]">Daily quota</span>
                <span className="text-white/80">{Math.round(percent)}%</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <div
                    className="bg-telegram-primary h-full rounded-full transition-all duration-500"
                    style={{ width: `${percent}%` }}
                ></div>
            </div>
            <div className="flex justify-between text-[10px]">
                <span>{formatBytes(totalBytes)}</span>
                <span>250 GB</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 text-[10px]">
                <span>Up {formatBytes(bandwidth.up_bytes)}</span>
                <span className="text-right">Down {formatBytes(bandwidth.down_bytes)}</span>
            </div>
        </div>
    );
}
