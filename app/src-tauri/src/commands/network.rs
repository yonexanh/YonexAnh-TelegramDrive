use std::net::TcpStream;
use std::time::Duration;
use tauri::Manager;
use crate::models::AccountListResult;

#[derive(serde::Serialize)]
pub struct HealthCheckItem {
    key: String,
    label: String,
    status: String,
    detail: String,
}

#[derive(serde::Serialize)]
pub struct HealthReport {
    generated_at: String,
    checks: Vec<HealthCheckItem>,
}

/// Ultra-lightweight network check
///
/// Simply tries to connect to Telegram's servers without using grammers.
/// This avoids the stack overflow bug from grammers reconnection logic.
#[tauri::command]
pub async fn cmd_is_network_available() -> Result<bool, String> {
    // Try to connect to Telegram's production DC
    // Using a very short timeout to keep it lightweight
    tokio::task::spawn_blocking(|| {
        // Try connecting to Telegram DC2 (149.154.167.50:443)
        match TcpStream::connect_timeout(
            &"149.154.167.50:443".parse().unwrap(),
            Duration::from_secs(2),
        ) {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cmd_health_check(app_handle: tauri::AppHandle) -> Result<HealthReport, String> {
    let mut checks = Vec::new();

    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;

    checks.push(HealthCheckItem {
        key: "app_data".to_string(),
        label: "App data directory".to_string(),
        status: if app_data.exists() { "ok" } else { "warning" }.to_string(),
        detail: app_data.to_string_lossy().to_string(),
    });

    let active_account_id = std::fs::read_to_string(app_data.join("telegram-accounts.json"))
        .ok()
        .and_then(|content| serde_json::from_str::<AccountListResult>(&content).ok())
        .and_then(|registry| registry.active_account_id)
        .unwrap_or_else(|| "legacy".to_string());
    let session_path = if active_account_id == "legacy" {
        app_data.join("telegram.session")
    } else {
        app_data.join("accounts").join(format!("{}.session", active_account_id))
    };
    checks.push(HealthCheckItem {
        key: "session".to_string(),
        label: "Telegram session".to_string(),
        status: if session_path.exists() { "ok" } else { "warning" }.to_string(),
        detail: if session_path.exists() {
            "Session file is present".to_string()
        } else {
            "No local Telegram session file found".to_string()
        },
    });

    let streaming_ready = TcpStream::connect_timeout(
        &"127.0.0.1:14200".parse().unwrap(),
        Duration::from_millis(500),
    ).is_ok();

    checks.push(HealthCheckItem {
        key: "streaming_server".to_string(),
        label: "Media streaming server".to_string(),
        status: if streaming_ready { "ok" } else { "warning" }.to_string(),
        detail: if streaming_ready {
            "Local stream endpoint is reachable on 127.0.0.1:14200".to_string()
        } else {
            "Local stream endpoint is not reachable yet".to_string()
        },
    });

    let telegram_reachable = tokio::task::spawn_blocking(|| {
        TcpStream::connect_timeout(
            &"149.154.167.50:443".parse().unwrap(),
            Duration::from_secs(2),
        ).is_ok()
    })
    .await
    .map_err(|e| e.to_string())?;

    checks.push(HealthCheckItem {
        key: "telegram_network".to_string(),
        label: "Telegram network".to_string(),
        status: if telegram_reachable { "ok" } else { "error" }.to_string(),
        detail: if telegram_reachable {
            "Telegram data center is reachable".to_string()
        } else {
            "Could not reach Telegram data center".to_string()
        },
    });

    let thumbnails = app_data.join("thumbnails");
    checks.push(HealthCheckItem {
        key: "thumbnail_cache".to_string(),
        label: "Thumbnail cache".to_string(),
        status: if thumbnails.exists() { "ok" } else { "warning" }.to_string(),
        detail: if thumbnails.exists() {
            thumbnails.to_string_lossy().to_string()
        } else {
            "Thumbnail cache has not been created yet".to_string()
        },
    });

    Ok(HealthReport {
        generated_at: chrono::Utc::now().to_rfc3339(),
        checks,
    })
}
