import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Activity, CheckCircle2, RefreshCw, TriangleAlert, XCircle } from 'lucide-react';
import { HealthReport } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

export function DiagnosticsPanel() {
    const { t } = useLanguage();
    const [report, setReport] = useState<HealthReport | null>(null);
    const [connectionOk, setConnectionOk] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const [health, connection] = await Promise.all([
                invoke<HealthReport>('cmd_health_check'),
                invoke<boolean>('cmd_check_connection').catch(() => false),
            ]);
            setReport(health);
            setConnectionOk(connection);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const checks = [
        ...(report?.checks || []),
        {
            key: 'telegram_auth',
            label: t('diagnostics.telegramAuth'),
            status: connectionOk ? 'ok' as const : 'warning' as const,
            detail: connectionOk ? t('diagnostics.authActive') : t('diagnostics.authInactive'),
        },
    ];

    return (
        <div className="flex-1 overflow-auto p-6 custom-scrollbar">
            <div className="max-w-3xl space-y-4">
                <div className="console-panel rounded-lg p-5 flex items-start justify-between gap-4">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-telegram-subtext">{t('diagnostics.healthCheck')}</p>
                        <h2 className="text-xl font-semibold text-telegram-text mt-1">{t('diagnostics.title')}</h2>
                        {report?.generated_at && (
                            <p className="text-xs text-telegram-subtext mt-2">{new Date(report.generated_at).toLocaleString()}</p>
                        )}
                    </div>
                    <button onClick={refresh} disabled={loading} className="command-button px-3 py-2 disabled:opacity-50">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        {t('diagnostics.refresh')}
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-3">
                    {checks.map(check => (
                        <div key={check.key} className="console-panel rounded-lg p-4 flex gap-3">
                            <div className="mt-0.5">
                                {check.status === 'ok' ? (
                                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                                ) : check.status === 'error' ? (
                                    <XCircle className="w-5 h-5 text-red-400" />
                                ) : (
                                    <TriangleAlert className="w-5 h-5 text-yellow-400" />
                                )}
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-sm font-semibold text-telegram-text">{check.label}</h3>
                                <p className="text-xs text-telegram-subtext mt-1 break-words">{check.detail}</p>
                            </div>
                        </div>
                    ))}
                    {loading && checks.length === 1 && (
                        <div className="console-panel rounded-lg p-6 flex items-center gap-3 text-telegram-subtext">
                            <Activity className="w-5 h-5 animate-pulse" />
                            {t('diagnostics.running')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
