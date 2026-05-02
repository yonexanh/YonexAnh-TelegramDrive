use tauri::State;
use tauri::Manager;
use grammers_client::Client;
use grammers_client::types::User;
use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::path::PathBuf;
use grammers_mtsender::SenderPool;
use grammers_session::storages::SqliteSession;
use tokio::sync::oneshot;
use tokio::time::Duration;
use sha2::{Digest, Sha256};

use crate::TelegramState;
use crate::models::{AccountListResult, AccountProfile, AuthResult, SavedTelegramAccount};
use crate::commands::utils::map_error;
use grammers_client::SignInError;

const LEGACY_ACCOUNT_ID: &str = "legacy";
const ACCOUNTS_FILE: &str = "telegram-accounts.json";

fn app_data_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    if !app_data_dir.exists() {
        std::fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;
    }

    Ok(app_data_dir)
}

fn account_id_from_phone(phone: &str) -> String {
    let normalized: String = phone.chars().filter(|ch| ch.is_ascii_digit()).collect();
    let source = if normalized.is_empty() {
        phone.trim().to_lowercase()
    } else {
        normalized
    };

    let mut hasher = Sha256::new();
    hasher.update(source.as_bytes());
    let digest = hasher.finalize();
    let suffix = digest
        .iter()
        .take(12)
        .map(|byte| format!("{:02x}", byte))
        .collect::<String>();

    format!("acct_{}", suffix)
}

fn is_safe_account_id(account_id: &str) -> bool {
    account_id == LEGACY_ACCOUNT_ID
        || account_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
}

fn session_path_for_account(app_handle: &tauri::AppHandle, account_id: &str) -> Result<PathBuf, String> {
    if !is_safe_account_id(account_id) {
        return Err("Invalid account id".to_string());
    }

    let app_data_dir = app_data_dir(app_handle)?;
    if account_id == LEGACY_ACCOUNT_ID {
        return Ok(app_data_dir.join("telegram.session"));
    }

    let accounts_dir = app_data_dir.join("accounts");
    if !accounts_dir.exists() {
        std::fs::create_dir_all(&accounts_dir)
            .map_err(|e| format!("Failed to create accounts dir: {}", e))?;
    }

    Ok(accounts_dir.join(format!("{}.session", account_id)))
}

fn remove_session_files(path: &PathBuf) {
    let path_str = path.to_string_lossy().to_string();
    let _ = std::fs::remove_file(path);
    let _ = std::fs::remove_file(format!("{}-wal", path_str));
    let _ = std::fs::remove_file(format!("{}-shm", path_str));
}

fn load_account_registry(app_handle: &tauri::AppHandle) -> Result<AccountListResult, String> {
    let path = app_data_dir(app_handle)?.join(ACCOUNTS_FILE);
    if !path.exists() {
        return Ok(AccountListResult::default());
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read account registry: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse account registry: {}", e))
}

fn save_account_registry(app_handle: &tauri::AppHandle, registry: &AccountListResult) -> Result<(), String> {
    let path = app_data_dir(app_handle)?.join(ACCOUNTS_FILE);
    let content = serde_json::to_string_pretty(registry)
        .map_err(|e| format!("Failed to serialize account registry: {}", e))?;
    std::fs::write(path, content).map_err(|e| format!("Failed to save account registry: {}", e))
}

fn upsert_account(registry: &mut AccountListResult, account: SavedTelegramAccount) {
    if let Some(existing) = registry.accounts.iter_mut().find(|item| item.account_id == account.account_id) {
        *existing = account;
    } else {
        registry.accounts.push(account);
    }

    registry.accounts.sort_by(|a, b| b.last_active_at.cmp(&a.last_active_at));
}

async fn shutdown_runner(state: &TelegramState) -> bool {
    let did_shutdown_old_runner = {
        let mut guard = state.runner_shutdown.lock().unwrap();
        if let Some(shutdown_tx) = guard.take() {
            log::info!("Signaling old runner to shutdown...");
            let _ = shutdown_tx.send(());
            true
        } else {
            false
        }
    };

    if did_shutdown_old_runner {
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    did_shutdown_old_runner
}

async fn reset_runtime_state(state: &TelegramState, clear_active_account: bool) {
    shutdown_runner(state).await;
    *state.client.lock().await = None;
    *state.login_token.lock().await = None;
    *state.password_token.lock().await = None;
    if clear_active_account {
        *state.active_account_id.lock().await = None;
    }
}

async fn active_session_account_id(
    app_handle: &tauri::AppHandle,
    state: &TelegramState,
) -> Result<String, String> {
    if let Some(account_id) = state.active_account_id.lock().await.clone() {
        return Ok(account_id);
    }

    let registry = load_account_registry(app_handle)?;
    let account_id = registry
        .active_account_id
        .unwrap_or_else(|| LEGACY_ACCOUNT_ID.to_string());
    *state.active_account_id.lock().await = Some(account_id.clone());
    Ok(account_id)
}

async fn set_active_session_account(
    app_handle: &tauri::AppHandle,
    state: &TelegramState,
    account_id: String,
    persist: bool,
) -> Result<(), String> {
    if !is_safe_account_id(&account_id) {
        return Err("Invalid account id".to_string());
    }

    reset_runtime_state(state, false).await;
    *state.active_account_id.lock().await = Some(account_id.clone());

    if persist {
        let mut registry = load_account_registry(app_handle)?;
        registry.active_account_id = Some(account_id);
        save_account_registry(app_handle, &registry)?;
    }

    Ok(())
}

fn saved_account_from_user(account_id: String, user: User) -> SavedTelegramAccount {
    SavedTelegramAccount {
        account_id,
        telegram_id: user.bare_id(),
        full_name: user.full_name(),
        username: user.username().map(|value| value.to_string()),
        phone: user.phone().map(|value| value.to_string()),
        last_active_at: chrono::Utc::now().to_rfc3339(),
    }
}

async fn register_current_account(
    app_handle: &tauri::AppHandle,
    state: &TelegramState,
    client: &Client,
) -> Result<SavedTelegramAccount, String> {
    let account_id = active_session_account_id(app_handle, state).await?;
    let me = client.get_me().await.map_err(map_error)?;
    let account = saved_account_from_user(account_id.clone(), me);

    let mut registry = load_account_registry(app_handle)?;
    registry.active_account_id = Some(account_id);
    upsert_account(&mut registry, account.clone());
    save_account_registry(app_handle, &registry)?;

    Ok(account)
}

async fn remove_account_inner(
    app_handle: &tauri::AppHandle,
    state: &TelegramState,
    account_id: String,
    sign_out_active: bool,
) -> Result<AccountListResult, String> {
    if !is_safe_account_id(&account_id) {
        return Err("Invalid account id".to_string());
    }

    let mut registry = load_account_registry(app_handle)?;
    let active_account_id = active_session_account_id(app_handle, state).await?;
    let was_active = active_account_id == account_id;

    if was_active {
        if sign_out_active {
            let client_opt = { state.client.lock().await.clone() };
            if let Some(client) = client_opt {
                let _ = client.sign_out().await;
            }
        }
        reset_runtime_state(state, true).await;
    }

    let session_path = session_path_for_account(app_handle, &account_id)?;
    remove_session_files(&session_path);

    registry.accounts.retain(|item| item.account_id != account_id);
    if registry.active_account_id.as_deref() == Some(&account_id) {
        registry.active_account_id = registry.accounts.first().map(|item| item.account_id.clone());
    }

    if was_active {
        *state.active_account_id.lock().await = registry.active_account_id.clone();
    }

    save_account_registry(app_handle, &registry)?;
    Ok(registry)
}

/// Ensures the Telegram client is initialized.
///
/// IMPORTANT: This function properly manages runner lifecycle to prevent stack overflow.
/// Before spawning a new runner, it signals the old runner to shutdown.
pub async fn ensure_client_initialized(
    app_handle: &tauri::AppHandle,
    state: &State<'_, TelegramState>,
    api_id: i32,
) -> Result<Client, String> {
    let mut client_guard = state.client.lock().await;

    if let Some(client) = client_guard.as_ref() {
        return Ok(client.clone());
    }

    // CRITICAL: Shutdown existing runner before creating a new one
    // This prevents runner task accumulation which causes stack overflow
    let did_shutdown_old_runner = {
        let mut guard = state.runner_shutdown.lock().unwrap();
        if let Some(shutdown_tx) = guard.take() {
            log::info!("Signaling old runner to shutdown...");
            let _ = shutdown_tx.send(());
            true
        } else {
            false
        }
    }; // MutexGuard dropped here — before the await
    if did_shutdown_old_runner {
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    let runner_num = state.runner_count.fetch_add(1, Ordering::SeqCst) + 1;
    let account_id = active_session_account_id(app_handle, state.inner()).await?;
    log::info!(
        "Initializing Telegram Client #{} with API ID: {} for account {}",
        runner_num,
        api_id,
        account_id
    );

    let session_path = session_path_for_account(app_handle, &account_id)?;
    let session_path_str = session_path.to_string_lossy().to_string();
    log::info!("Opening session at: {}", session_path_str);

    // Grammers initialization with corruption recovery
    let session = match SqliteSession::open(&session_path_str).map_err(|e| e.to_string()) {
        Ok(s) => s,
        Err(_) => {
            log::warn!("Session file corrupted or invalid. Recreating...");
            let _ = std::fs::remove_file(&session_path);
            let _ = std::fs::remove_file(format!("{}-wal", session_path_str));
            let _ = std::fs::remove_file(format!("{}-shm", session_path_str));

            SqliteSession::open(&session_path_str)
                .map_err(|e| format!("Failed to open session after recreation: {}", e))?
        }
    };

    let session = Arc::new(session);
    let pool = SenderPool::new(session, api_id);
    let client = Client::new(&pool);

    // Create shutdown channel for this runner
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    *state.runner_shutdown.lock().unwrap() = Some(shutdown_tx);

    // Spawn the network runner with shutdown support
    let SenderPool { runner, .. } = pool;
    tauri::async_runtime::spawn(async move {
        tokio::select! {
            // Normal runner operation
            _ = runner.run() => {
                log::info!("Runner #{} exited normally", runner_num);
            }
            // Shutdown requested
            _ = shutdown_rx => {
                log::info!("Runner #{} shutdown requested, exiting", runner_num);
            }
        }
    });

    *client_guard = Some(client.clone());
    Ok(client)
}

#[tauri::command]
pub async fn cmd_connect(
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    api_id: i32,
) -> Result<bool, String> {
    // Store API ID for auto-reconnect
    *state.api_id.lock().await = Some(api_id);
    active_session_account_id(&app_handle, state.inner()).await?;
    ensure_client_initialized(&app_handle, &state, api_id).await?;
    Ok(true)
}

#[tauri::command]
pub async fn cmd_check_connection(
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    // 1. Check if client exists and is responsive
    let client_msg_opt = {
        let guard = state.client.lock().await;
        guard.as_ref().cloned()
    };

    if let Some(client) = client_msg_opt {
        // Ping (e.g., get_me)
        if client.get_me().await.is_ok() {
            let _ = register_current_account(&app_handle, state.inner(), &client).await;
            return Ok(true);
        }
        log::warn!("Connection check failed (get_me). Attempting reconnect...");
    } else {
         log::warn!("Connection check: No client found. Checking for saved API ID...");
    }

    // 2. Reconnect Logic
    let api_id_opt = *state.api_id.lock().await;
    if let Some(api_id) = api_id_opt {
        // Force re-init: Clear old client first to ensure fresh pool
        *state.client.lock().await = None;

        match ensure_client_initialized(&app_handle, &state, api_id).await {
            Ok(c) => {
                // Double check
                if c.get_me().await.is_ok() {
                    log::info!("Auto-reconnect successful.");
                    let _ = register_current_account(&app_handle, state.inner(), &c).await;
                    return Ok(true);
                } else {
                    return Err("Reconnect succeeded but ping failed.".to_string());
                }
            },
            Err(e) => return Err(format!("Auto-reconnect failed: {}", e))
        }
    }

    Ok(false) // Not connected and no credentials to reconnect
}

#[tauri::command]
pub async fn cmd_get_current_user(
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
) -> Result<Option<AccountProfile>, String> {
    let client_opt = { state.client.lock().await.clone() };
    let Some(client) = client_opt else {
        return Ok(None);
    };

    let me = client.get_me().await.map_err(map_error)?;
    let account_id = active_session_account_id(&app_handle, state.inner()).await.ok();
    Ok(Some(AccountProfile {
        account_id,
        id: me.bare_id(),
        full_name: me.full_name(),
        username: me.username().map(|value| value.to_string()),
        phone: me.phone().map(|value| value.to_string()),
    }))
}

#[tauri::command]
pub async fn cmd_logout(
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    log::info!("Logging out...");
    let account_id = active_session_account_id(&app_handle, state.inner()).await?;
    remove_account_inner(&app_handle, state.inner(), account_id, true).await?;

    log::info!("Logout complete. Runner count: {}", state.runner_count.load(Ordering::SeqCst));
    Ok(true)
}

#[tauri::command]
pub async fn cmd_auth_request_code(
    app_handle: tauri::AppHandle,
    phone: String,
    api_id: i32,
    api_hash: String,
    state: State<'_, TelegramState>,
) -> Result<String, String> {

    if api_hash.trim().is_empty() {
        return Err("API Hash cannot be empty.".to_string());
    }

    let account_id = account_id_from_phone(&phone);
    set_active_session_account(&app_handle, state.inner(), account_id, false).await?;

    // Store API ID
    *state.api_id.lock().await = Some(api_id);

    let client_handle = ensure_client_initialized(&app_handle, &state, api_id).await?;

    log::info!("Requesting code for {}", phone);

    let mut last_error = String::new();

    // Retry up to 2 times for AUTH_RESTART or 500
    for i in 1..=2 {
        match client_handle.request_login_code(&phone, &api_hash).await {
            Ok(token) => {
                let mut token_guard = state.login_token.lock().await;
                *token_guard = Some(token);
                return Ok("code_sent".to_string());
            },
            Err(e) => {
                let err_msg = e.to_string();
                log::warn!("Error requesting code (Attempt {}): {}", i, err_msg);

                if err_msg.contains("AUTH_RESTART") || err_msg.contains("500") {
                    log::info!("AUTH_RESTART error detected. Retrying...");
                    last_error = err_msg;
                    // Prepare for retry
                    continue;
                }

                // Other errors, fail immediately
                return Err(map_error(e));
            }
        }
    }

    Err(format!("Telegram Error after retry: {}", last_error))
}

#[tauri::command]
pub async fn cmd_auth_sign_in(
    app_handle: tauri::AppHandle,
    code: String,
    state: State<'_, TelegramState>,
) -> Result<AuthResult, String> {
    log::info!("Signing in with code...");

    let client = {
        let guard = state.client.lock().await;
        guard.as_ref().ok_or("Client not initialized")?.clone()
    };

    let token_guard = state.login_token.lock().await;
    let login_token = token_guard.as_ref().ok_or("No login session found (restart flow)")?;

    match client.sign_in(login_token, &code).await {
        Ok(_user) => {
             log::info!("Successfully logged in.");
             register_current_account(&app_handle, state.inner(), &client).await?;
             Ok(AuthResult {
                success: true,
                next_step: Some("dashboard".to_string()),
                error: None,
            })
        }
        Err(SignInError::PasswordRequired(token)) => {
            let mut pw_guard = state.password_token.lock().await;
            *pw_guard = Some(token);

            Ok(AuthResult {
                success: false,
                next_step: Some("password".to_string()),
                error: None,
            })
        }
        Err(e) => {
           log::error!("Sign in error: {}", e);
           Err(format!("Sign in failed: {}", e))
        }
    }
}

#[tauri::command]
pub async fn cmd_auth_check_password(
    app_handle: tauri::AppHandle,
    password: String,
    state: State<'_, TelegramState>,
) -> Result<AuthResult, String> {
    let client = {
        let guard = state.client.lock().await;
        guard.as_ref().ok_or("Client not initialized")?.clone()
    };

    let mut pw_guard = state.password_token.lock().await;
    let pw_token = pw_guard.take().ok_or("No password session found")?;

    match client.check_password(pw_token, password.as_str()).await {
        Ok(_user) => {
             log::info!("2FA Success.");
             register_current_account(&app_handle, state.inner(), &client).await?;
             Ok(AuthResult {
                success: true,
                next_step: Some("dashboard".to_string()),
                error: None,
            })
        }
        Err(e) => Err(format!("2FA Failed: {}", e))
    }
}

#[tauri::command]
pub async fn cmd_get_accounts(
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
) -> Result<AccountListResult, String> {
    let mut registry = load_account_registry(&app_handle)?;

    let client_opt = { state.client.lock().await.clone() };
    if let Some(client) = client_opt {
        if let Ok(account) = register_current_account(&app_handle, state.inner(), &client).await {
            registry = load_account_registry(&app_handle)?;
            if registry.active_account_id.is_none() {
                registry.active_account_id = Some(account.account_id);
                save_account_registry(&app_handle, &registry)?;
            }
        }
    }

    if registry.active_account_id.is_none() && !registry.accounts.is_empty() {
        registry.active_account_id = registry.accounts.first().map(|item| item.account_id.clone());
        save_account_registry(&app_handle, &registry)?;
    }

    Ok(registry)
}

#[tauri::command]
pub async fn cmd_switch_account(
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    account_id: String,
    api_id: i32,
) -> Result<AccountProfile, String> {
    if !is_safe_account_id(&account_id) {
        return Err("Invalid account id".to_string());
    }

    let registry = load_account_registry(&app_handle)?;
    if !registry.accounts.iter().any(|item| item.account_id == account_id) {
        return Err("Account is not saved on this device".to_string());
    }

    *state.api_id.lock().await = Some(api_id);
    set_active_session_account(&app_handle, state.inner(), account_id.clone(), true).await?;
    let client = ensure_client_initialized(&app_handle, &state, api_id).await?;
    let account = register_current_account(&app_handle, state.inner(), &client).await?;

    Ok(AccountProfile {
        account_id: Some(account.account_id),
        id: account.telegram_id,
        full_name: account.full_name,
        username: account.username,
        phone: account.phone,
    })
}

#[tauri::command]
pub async fn cmd_remove_account(
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    account_id: String,
) -> Result<AccountListResult, String> {
    remove_account_inner(&app_handle, state.inner(), account_id, true).await
}
