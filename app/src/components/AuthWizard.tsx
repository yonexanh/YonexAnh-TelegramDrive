import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Key, Lock, ArrowRight, Settings, ShieldCheck, Sun, Moon, HelpCircle, ExternalLink, X, Database, Shield, Wifi } from "lucide-react";
import { load } from '@tauri-apps/plugin-store';
import { useTheme } from '../context/ThemeContext';
import { open } from '@tauri-apps/plugin-shell';
import { LanguageToggle } from './LanguageToggle';
import { useLanguage } from '../context/LanguageContext';

type Step = "setup" | "phone" | "code" | "password";

function AuthThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const { t } = useLanguage();
    return (
        <button
            onClick={toggleTheme}
            className="p-2.5 rounded-lg border border-telegram-border bg-telegram-surface/80 hover:bg-telegram-hover transition-colors"
            title={theme === 'dark' ? t('topbar.lightMode') : t('topbar.darkMode')}
        >
            {theme === 'dark' ? (
                <Sun className="w-5 h-5 text-telegram-secondary" />
            ) : (
                <Moon className="w-5 h-5 text-telegram-text" />
            )}
        </button>
    );
}

function AuthQuickControls() {
    return (
        <div className="absolute top-5 right-5 z-10 flex items-center gap-2">
            <LanguageToggle compact />
            <AuthThemeToggle />
        </div>
    );
}

export function AuthWizard({ onLogin }: { onLogin: () => void }) {
    const { t } = useLanguage();
    const isBrowser = typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window);

    if (isBrowser) {
        return (
            <div className="relative flex flex-col items-center justify-center h-full max-w-lg mx-auto p-8 text-center">
                <AuthQuickControls />
                <div className="w-20 h-20 bg-red-500/10 rounded-lg flex items-center justify-center mb-6 border border-red-500/20">
                    <ShieldCheck className="w-10 h-10 text-red-500" />
                </div>
                <h1 className="text-2xl font-bold text-telegram-text mb-4">{t('auth.desktopRequired')}</h1>
                <p className="text-gray-400 mb-6 leading-relaxed">
                    {t('auth.desktopRequiredBody')}
                </p>
                <div className="p-4 bg-telegram-surface rounded-lg border border-telegram-border text-sm text-telegram-subtext">
                    {t('auth.desktopRequiredHint')}
                </div>
            </div>
        )
    }

    const [step, setStep] = useState<Step>("setup");
    const [loading, setLoading] = useState(false);

    const [apiId, setApiId] = useState("");
    const [apiHash, setApiHash] = useState("");

    const [phone, setPhone] = useState("");
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [floodWait, setFloodWait] = useState<number | null>(null);
    const [showHelp, setShowHelp] = useState(false);


    useEffect(() => {
        if (!floodWait) return;
        const interval = setInterval(() => {
            setFloodWait(prev => {
                if (prev === null || prev <= 1) return null;
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [floodWait]);

    useEffect(() => {
        const initStore = async () => {
            try {
                const store = await load('config.json');
                const savedId = await store.get<string>('api_id');
                const savedHash = await store.get<string>('api_hash');

                if (savedId && savedHash) {
                    setApiId(savedId);
                    setApiHash(savedHash);
                }
            } catch {
                // config not found, starting fresh
            }
        };
        initStore();
    }, []);

    const saveCredentials = async () => {
        try {
            const store = await load('config.json');
            await store.set('api_id', apiId);
            await store.set('api_hash', apiHash);
            await store.save();
        } catch {
            // store write failure, non-critical
        }
    };

    const handleSetupSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (apiId.includes(' ') || apiHash.includes(' ')) {
            setError(t('auth.apiIdNoSpaces'));
            return;
        }

        if (!apiId || !apiHash) {
            setError(t('auth.credentialsRequired'));
            return;
        }
        setError(null);
        await saveCredentials();
        setStep("phone");
    };

    const handlePhoneSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const idInt = parseInt(apiId, 10);
            if (isNaN(idInt)) throw new Error(t('auth.apiIdNumber'));

            await invoke("cmd_auth_request_code", {
                phone,
                apiId: idInt,
                apiHash: apiHash
            });
            setStep("code");
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : JSON.stringify(err);
            if (msg.includes("FLOOD_WAIT_")) {
                const parts = msg.split("FLOOD_WAIT_");
                if (parts[1]) {
                    const seconds = parseInt(parts[1]);
                    if (!isNaN(seconds)) {
                        setFloodWait(seconds);
                        return;
                    }
                }
            }
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleCodeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const res = await invoke<{ success: boolean; next_step?: string }>("cmd_auth_sign_in", { code });
            if (res.success) {
                onLogin();
            } else if (res.next_step === "password") {
                setStep("password");
            } else {
                setError(t('auth.unknownError'));
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const res = await invoke<{ success: boolean; next_step?: string }>("cmd_auth_check_password", { password });
            if (res.success) {
                onLogin();
            } else {
                setError(t('auth.passwordFailed'));
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full w-full auth-gradient grid grid-cols-[0.92fr_1.08fr] gap-6 p-8 relative overflow-hidden">
            <AuthQuickControls />

            <section className="console-panel rounded-lg p-8 flex flex-col justify-between min-w-0">
                <div>
                    <div className="flex items-center gap-3 mb-10">
                        <div className="w-11 h-11 rounded-lg bg-telegram-primary text-[#06201c] flex items-center justify-center shadow-lg shadow-telegram-primary/10">
                            <Shield className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-telegram-text tracking-tight">Telegram Drive</h1>
                            <p className="text-xs uppercase tracking-[0.22em] text-telegram-subtext">{t('auth.privateConsole')}</p>
                        </div>
                    </div>

                    <div className="max-w-md">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-telegram-primary mb-4">{t('auth.localFirstCloud')}</p>
                        <h2 className="text-4xl font-semibold text-telegram-text leading-tight mb-5">
                            {t('auth.headline')}
                        </h2>
                        <p className="text-sm leading-6 text-telegram-subtext">
                            {t('auth.description')}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-telegram-border bg-telegram-hover p-4">
                        <Database className="w-5 h-5 text-telegram-primary mb-3" />
                        <p className="text-xs text-telegram-subtext">{t('auth.storage')}</p>
                        <p className="text-sm font-semibold text-telegram-text">{t('sidebar.savedMessages')}</p>
                    </div>
                    <div className="rounded-lg border border-telegram-border bg-telegram-hover p-4">
                        <ShieldCheck className="w-5 h-5 text-telegram-primary mb-3" />
                        <p className="text-xs text-telegram-subtext">{t('auth.privacy')}</p>
                        <p className="text-sm font-semibold text-telegram-text">{t('auth.localKeys')}</p>
                    </div>
                    <div className="rounded-lg border border-telegram-border bg-telegram-hover p-4">
                        <Wifi className="w-5 h-5 text-telegram-secondary mb-3" />
                        <p className="text-xs text-telegram-subtext">{t('auth.streaming')}</p>
                        <p className="text-sm font-semibold text-telegram-text">{t('auth.rangeReady')}</p>
                    </div>
                </div>
            </section>

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="auth-glass rounded-lg shadow-2xl w-full max-w-[480px] self-center justify-self-center overflow-hidden"
            >
                <div className="px-8 pt-8 pb-6 border-b border-telegram-border">
                    <div className="w-14 h-14 mb-5 flex items-center justify-center rounded-lg bg-telegram-primary/15 border border-telegram-primary/25">
                        <img src="/logo.svg" alt="Logo" className="w-9 h-9" />
                    </div>
                    <h1 className="text-2xl font-bold text-telegram-text mb-1 tracking-tight">{t('auth.connectAccount')}</h1>
                    <p className="text-sm text-telegram-subtext font-medium">{t('auth.subtitle')}</p>
                </div>

                <div className="p-8">
                <AnimatePresence mode="wait">
                    {floodWait ? (
                        <motion.div
                            key="flood"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-center space-y-6"
                        >
                            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto animate-pulse">
                                <span className="text-2xl">⏳</span>
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-telegram-text mb-2">{t('auth.tooManyRequests')}</h2>
                                <p className="text-sm text-gray-400">{t('auth.tooManyRequestsBody')}</p>
                            </div>

                            <div className="text-5xl font-mono items-center justify-center flex text-telegram-primary font-bold">
                                {Math.floor(floodWait / 60)}:{(floodWait % 60).toString().padStart(2, '0')}
                            </div>

                            <p className="text-xs text-red-400/60 mt-4">
                                {t('auth.noRestart')}
                            </p>
                        </motion.div>
                    ) : (
                        <>


                            {step === "setup" && (
                                <motion.form
                                    key="setup"
                                    initial={{ x: 20, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -20, opacity: 0 }}
                                    onSubmit={handleSetupSubmit}
                                    className="space-y-5"
                                >
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">API ID</label>
                                            <div className="relative">
                                                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 auth-form-icon" />
                                                <input
                                                    type="text"
                                                    value={apiId}
                                                    onChange={(e) => setApiId(e.target.value)}
                                                    placeholder="12345678"
                                                    className="w-full glass-input rounded-lg pl-12 pr-4 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-telegram-primary/60 transition-all font-mono text-sm"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">API Hash</label>
                                            <div className="relative">
                                                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 auth-form-icon" />
                                                <input
                                                    type="text"
                                                    value={apiHash}
                                                    onChange={(e) => setApiHash(e.target.value)}
                                                    placeholder="abcdef123456..."
                                                    className="w-full glass-input rounded-lg pl-12 pr-4 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-telegram-primary/60 transition-all font-mono text-sm"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        className="w-full bg-telegram-primary hover:bg-telegram-primary/90 text-[#06201c] font-bold py-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-telegram-primary/15 active:scale-[0.98]"
                                    >
                                        {t('common.configure')} <Settings className="w-4 h-4" />
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setShowHelp(true)}
                                        className="w-full text-xs text-telegram-primary hover:text-telegram-text transition-colors flex items-center justify-center gap-1.5 py-1"
                                    >
                                        <HelpCircle className="w-3 h-3" />
                                        {t('auth.apiCredentialsHelp')}
                                    </button>

                                    {import.meta.env.DEV && (
                                        <button
                                            type="button"
                                            onClick={() => onLogin()}
                                            className="w-full text-xs text-red-400/70 hover:text-red-300 transition-colors py-1"
                                        >
                                            {t('auth.devMode')}
                                        </button>
                                    )}
                                </motion.form>
                            )}


                            {step === "phone" && (
                                <motion.form
                                    key="phone"
                                    initial={{ x: 20, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -20, opacity: 0 }}
                                    onSubmit={handlePhoneSubmit}
                                    className="space-y-6"
                                >
                                    <div className="space-y-2">
                                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('auth.phoneNumber')}</label>
                                        <div className="relative">
                                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 auth-form-icon" />
                                            <input
                                                type="tel"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                placeholder="+1 234 567 8900"
                                                className="w-full glass-input rounded-lg pl-12 pr-4 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-telegram-primary/60 transition-all text-lg tracking-wide"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="w-full bg-telegram-primary text-[#06201c] hover:bg-telegram-primary/90 font-bold py-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {loading ? t('auth.connecting') : <>{t('common.continue')} <ArrowRight className="w-5 h-5" /></>}
                                        </button>
                                        <button type="button" onClick={() => setStep("setup")} className="text-xs text-gray-500 hover:text-white transition-colors py-2">
                                            {t('auth.backToConfig')}
                                        </button>
                                    </div>
                                </motion.form>
                            )}


                            {step === "code" && (
                                <motion.form
                                    key="code"
                                    initial={{ x: 20, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -20, opacity: 0 }}
                                    onSubmit={handleCodeSubmit}
                                    className="space-y-6"
                                >
                                    <div className="space-y-2">
                                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('auth.telegramCode')}</label>
                                        <div className="relative">
                                            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 auth-form-icon" />
                                            <input
                                                type="text"
                                                value={code}
                                                onChange={(e) => setCode(e.target.value)}
                                                placeholder="1 2 3 4 5"
                                                className="w-full glass-input rounded-lg pl-12 pr-4 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-telegram-primary/60 transition-all text-2xl tracking-[0.5em] font-mono text-center"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="w-full bg-telegram-primary text-[#06201c] hover:bg-telegram-primary/90 font-bold py-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {loading ? t('auth.verifying') : t('auth.signIn')}
                                        </button>
                                        <button type="button" onClick={() => setStep("phone")} className="text-xs text-gray-500 hover:text-white transition-colors py-2">
                                            {t('auth.changePhone')}
                                        </button>
                                    </div>
                                </motion.form>
                            )}


                            {step === "password" && (
                                <motion.form
                                    key="password"
                                    initial={{ x: 20, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -20, opacity: 0 }}
                                    onSubmit={handlePasswordSubmit}
                                    className="space-y-6"
                                >
                                    <div className="space-y-2">
                                        <div className="p-3 bg-telegram-primary/10 border border-telegram-primary/20 rounded-lg mb-4">
                                            <p className="text-xs text-telegram-primary text-center">
                                                {t('auth.password2fa')}
                                            </p>
                                        </div>
                                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('auth.cloudPassword')}</label>
                                        <div className="relative">
                                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 auth-form-icon" />
                                            <input
                                                type="password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder={t('auth.enterPassword')}
                                                className="w-full glass-input rounded-lg pl-12 pr-4 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-telegram-primary/60 transition-all text-lg"
                                                autoFocus
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        <button
                                            type="submit"
                                            disabled={loading || !password}
                                            className="w-full bg-telegram-primary text-[#06201c] hover:bg-telegram-primary/90 font-bold py-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {loading ? t('auth.verifying') : t('auth.unlock')}
                                        </button>
                                        <button type="button" onClick={() => { setStep("code"); setPassword(""); setError(null); }} className="text-xs text-gray-500 hover:text-white transition-colors py-2">
                                            {t('auth.backToCode')}
                                        </button>
                                    </div>
                                </motion.form>
                            )}
                        </>
                    )}
                </AnimatePresence>

                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3"
                    >
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2 shrink-0" />
                        <p className="text-red-400 text-sm leading-snug">{error}</p>
                    </motion.div>
                )}
                </div>
            </motion.div>


            <AnimatePresence>
                {showHelp && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => setShowHelp(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="glass bg-telegram-surface border border-telegram-border rounded-lg p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-telegram-text">{t('auth.gettingStarted')}</h2>
                                <button onClick={() => setShowHelp(false)} className="p-2 hover:bg-telegram-hover rounded-lg transition-colors">
                                    <X className="w-5 h-5 text-telegram-subtext" />
                                </button>
                            </div>

                            <div className="space-y-6 text-telegram-text">
                                <div className="p-4 bg-telegram-primary/10 border border-telegram-primary/20 rounded-lg">
                                    <p className="text-sm text-telegram-subtext">
                                        <strong className="text-telegram-primary">Telegram Drive</strong> {t('auth.subtitle')}
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="font-semibold flex items-center gap-2">
                                        <span className="w-6 h-6 bg-telegram-primary text-white text-xs font-bold rounded-full flex items-center justify-center">1</span>
                                        {t('auth.goDeveloperPortal')}
                                    </h3>
                                    <p className="text-sm text-telegram-subtext ml-8">
                                        {t('auth.helpPortal')}
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="font-semibold flex items-center gap-2">
                                        <span className="w-6 h-6 bg-telegram-primary text-white text-xs font-bold rounded-full flex items-center justify-center">2</span>
                                        {t('auth.createApplication')}
                                    </h3>
                                    <p className="text-sm text-telegram-subtext ml-8">
                                        {t('auth.helpCreateApp')}
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="font-semibold flex items-center gap-2">
                                        <span className="w-6 h-6 bg-telegram-primary text-white text-xs font-bold rounded-full flex items-center justify-center">3</span>
                                        {t('auth.copyCredentials')}
                                    </h3>
                                    <p className="text-sm text-telegram-subtext ml-8">
                                        {t('auth.helpCredentials')}
                                    </p>
                                </div>

                                <div className="p-4 bg-telegram-hover rounded-lg border border-telegram-border">
                                    <p className="text-xs text-telegram-subtext">
                                        <strong>{t('auth.privacy')}:</strong> {t('auth.privacyNote')}
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={(e) => { e.preventDefault(); open('https://my.telegram.org'); }}
                                    className="w-full bg-telegram-primary text-[#06201c] font-semibold py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-telegram-primary/90 transition-colors"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    {t('auth.openTelegram')}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
