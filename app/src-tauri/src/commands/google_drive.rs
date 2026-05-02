use std::collections::HashMap;
use std::time::Duration;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use grammers_client::types::Media;
use rand::{distributions::Alphanumeric, Rng};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use tauri::State;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::bandwidth::BandwidthManager;
use crate::commands::utils::{map_error, resolve_peer};
use crate::TelegramState;

const GOOGLE_DRIVE_SCOPE: &str = "openid email profile https://www.googleapis.com/auth/drive.file";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v3/userinfo";
const GOOGLE_DRIVE_FILES_URL: &str = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_DRIVE_UPLOAD_URL: &str = "https://www.googleapis.com/upload/drive/v3/files";

#[derive(Clone, Serialize)]
pub struct GoogleDriveAuthResult {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: i64,
    email: Option<String>,
    name: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct GoogleDriveFolderResult {
    id: String,
    name: String,
}

#[derive(Clone, Serialize)]
pub struct GoogleDriveUploadResult {
    id: String,
    name: String,
    web_view_link: Option<String>,
    web_content_link: Option<String>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
}

#[derive(Deserialize)]
struct UserInfoResponse {
    email: Option<String>,
    name: Option<String>,
}

#[derive(Deserialize)]
struct DriveFile {
    id: String,
    name: String,
    #[serde(rename = "webViewLink")]
    web_view_link: Option<String>,
    #[serde(rename = "webContentLink")]
    web_content_link: Option<String>,
}

#[derive(Deserialize)]
struct DriveListResponse {
    files: Vec<DriveFile>,
}

fn random_token(len: usize) -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(len)
        .map(char::from)
        .collect()
}

fn pkce_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

fn bearer(access_token: &str) -> String {
    format!("Bearer {}", access_token)
}

async fn google_text_error(response: reqwest::Response) -> String {
    let status = response.status();
    let body = response.text().await.unwrap_or_else(|_| "No response body".to_string());
    format!("Google API error {}: {}", status, body)
}

async fn fetch_user_info(access_token: &str) -> Result<UserInfoResponse, String> {
    let response = reqwest::Client::new()
        .get(GOOGLE_USERINFO_URL)
        .header(AUTHORIZATION, bearer(access_token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(google_text_error(response).await);
    }

    response.json::<UserInfoResponse>().await.map_err(|e| e.to_string())
}

async fn exchange_code(
    client_id: &str,
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<TokenResponse, String> {
    let response = reqwest::Client::new()
        .post(GOOGLE_TOKEN_URL)
        .form(&[
            ("client_id", client_id),
            ("code", code),
            ("code_verifier", code_verifier),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_uri),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(google_text_error(response).await);
    }

    response.json::<TokenResponse>().await.map_err(|e| e.to_string())
}

async fn wait_for_oauth_code(
    listener: tokio::net::TcpListener,
    expected_state: &str,
) -> Result<String, String> {
    let accept_result = tokio::time::timeout(Duration::from_secs(180), listener.accept())
        .await
        .map_err(|_| "Google sign-in timed out".to_string())?
        .map_err(|e| e.to_string())?;

    let (mut socket, _) = accept_result;
    let mut buffer = [0u8; 8192];
    let read = socket.read(&mut buffer).await.map_err(|e| e.to_string())?;
    let request = String::from_utf8_lossy(&buffer[..read]);
    let path = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .ok_or_else(|| "Invalid OAuth callback request".to_string())?;
    let query = path
        .split_once('?')
        .map(|(_, query)| query)
        .unwrap_or_default();
    let params: HashMap<String, String> = url::form_urlencoded::parse(query.as_bytes())
        .into_owned()
        .collect();

    let (status, body) = if params.get("state").map(String::as_str) != Some(expected_state) {
        ("400 Bad Request", "Invalid Google Drive sign-in state. You can close this tab.")
    } else if params.contains_key("error") {
        ("400 Bad Request", "Google Drive sign-in was cancelled. You can close this tab.")
    } else {
        ("200 OK", "Google Drive connected. You can close this tab and return to Telegram Drive.")
    };

    let html = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>Telegram Drive</title></head><body style=\"font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:32px;background:#101312;color:#f7faf6\"><h2>{}</h2></body></html>",
        body
    );
    let response = format!(
        "HTTP/1.1 {}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        status,
        html.len(),
        html
    );
    let _ = socket.write_all(response.as_bytes()).await;

    if status != "200 OK" {
        return Err(body.to_string());
    }

    params
        .get("code")
        .cloned()
        .ok_or_else(|| "OAuth callback did not include an authorization code".to_string())
}

fn drive_query_escape(value: &str) -> String {
    value.replace('\\', "\\\\").replace('\'', "\\'")
}

async fn download_telegram_file_to_memory(
    message_id: i32,
    folder_id: Option<i64>,
    state: State<'_, TelegramState>,
    bw_state: State<'_, BandwidthManager>,
) -> Result<(Vec<u8>, u64), String> {
    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or_else(|| "Telegram client not connected".to_string())?;
    let peer = resolve_peer(&client, folder_id).await?;
    let messages = client
        .get_messages_by_id(&peer, &[message_id])
        .await
        .map_err(map_error)?;
    let msg = messages
        .into_iter()
        .flatten()
        .next()
        .ok_or_else(|| "Telegram file message not found".to_string())?;
    let media = msg.media().ok_or_else(|| "Telegram message has no file".to_string())?;
    let size = match &media {
        Media::Document(d) => d.size() as u64,
        Media::Photo(_) => 1024 * 1024,
        _ => 0,
    };

    bw_state.can_transfer(size)?;

    let mut bytes = Vec::new();
    let mut download_iter = client.iter_download(&media);
    while let Some(chunk) = download_iter.next().await.transpose() {
        let chunk = chunk.map_err(|e| format!("Download chunk error: {}", e))?;
        bytes.extend_from_slice(&chunk);
    }

    bw_state.add_down(size);
    Ok((bytes, size))
}

#[tauri::command]
pub async fn cmd_google_drive_begin_auth(client_id: String) -> Result<GoogleDriveAuthResult, String> {
    let client_id = client_id.trim().to_string();
    if client_id.is_empty() {
        return Err("Google OAuth Client ID is required".to_string());
    }

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{}/google-drive/callback", port);
    let verifier = random_token(64);
    let challenge = pkce_challenge(&verifier);
    let state = random_token(32);
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&code_challenge={}&code_challenge_method=S256&state={}",
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(GOOGLE_DRIVE_SCOPE),
        urlencoding::encode(&challenge),
        urlencoding::encode(&state),
    );

    tauri_plugin_opener::open_url(auth_url, None::<&str>).map_err(|e| e.to_string())?;

    let code = wait_for_oauth_code(listener, &state).await?;
    let token = exchange_code(&client_id, &code, &verifier, &redirect_uri).await?;
    let user = fetch_user_info(&token.access_token).await.ok();

    Ok(GoogleDriveAuthResult {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_in: token.expires_in.unwrap_or(3600),
        email: user.as_ref().and_then(|value| value.email.clone()),
        name: user.and_then(|value| value.name),
    })
}

#[tauri::command]
pub async fn cmd_google_drive_refresh_access_token(
    client_id: String,
    refresh_token: String,
) -> Result<GoogleDriveAuthResult, String> {
    let client_id = client_id.trim().to_string();
    let refresh_token = refresh_token.trim().to_string();
    if client_id.is_empty() || refresh_token.is_empty() {
        return Err("Google OAuth Client ID and refresh token are required".to_string());
    }

    let response = reqwest::Client::new()
        .post(GOOGLE_TOKEN_URL)
        .form(&[
            ("client_id", client_id.as_str()),
            ("refresh_token", refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(google_text_error(response).await);
    }

    let token = response.json::<TokenResponse>().await.map_err(|e| e.to_string())?;
    let user = fetch_user_info(&token.access_token).await.ok();
    Ok(GoogleDriveAuthResult {
        access_token: token.access_token,
        refresh_token: None,
        expires_in: token.expires_in.unwrap_or(3600),
        email: user.as_ref().and_then(|value| value.email.clone()),
        name: user.and_then(|value| value.name),
    })
}

#[tauri::command]
pub async fn cmd_google_drive_ensure_folder(
    access_token: String,
    folder_name: String,
) -> Result<GoogleDriveFolderResult, String> {
    let folder_name = folder_name.trim();
    if folder_name.is_empty() {
        return Err("Google Drive folder name is required".to_string());
    }

    let client = reqwest::Client::new();
    let query = format!(
        "name='{}' and mimeType='application/vnd.google-apps.folder' and trashed=false",
        drive_query_escape(folder_name)
    );
    let response = client
        .get(GOOGLE_DRIVE_FILES_URL)
        .header(AUTHORIZATION, bearer(&access_token))
        .query(&[
            ("q", query.as_str()),
            ("pageSize", "1"),
            ("spaces", "drive"),
            ("fields", "files(id,name)"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(google_text_error(response).await);
    }

    let existing = response.json::<DriveListResponse>().await.map_err(|e| e.to_string())?;
    if let Some(folder) = existing.files.into_iter().next() {
        return Ok(GoogleDriveFolderResult { id: folder.id, name: folder.name });
    }

    let response = client
        .post(GOOGLE_DRIVE_FILES_URL)
        .header(AUTHORIZATION, bearer(&access_token))
        .json(&json!({
            "name": folder_name,
            "mimeType": "application/vnd.google-apps.folder"
        }))
        .query(&[("fields", "id,name")])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(google_text_error(response).await);
    }

    let folder = response.json::<DriveFile>().await.map_err(|e| e.to_string())?;
    Ok(GoogleDriveFolderResult { id: folder.id, name: folder.name })
}

#[tauri::command]
pub async fn cmd_google_drive_backup_telegram_file(
    message_id: i32,
    folder_id: Option<i64>,
    access_token: String,
    drive_folder_id: String,
    filename: String,
    mime_type: Option<String>,
    _app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    bw_state: State<'_, BandwidthManager>,
) -> Result<GoogleDriveUploadResult, String> {
    let filename = filename.trim();
    if filename.is_empty() {
        return Err("Filename is required".to_string());
    }
    if drive_folder_id.trim().is_empty() {
        return Err("Google Drive folder ID is required".to_string());
    }

    let (bytes, size) = download_telegram_file_to_memory(message_id, folder_id, state, bw_state.clone()).await?;
    bw_state.can_transfer(size)?;

    let boundary = format!("tdrive-{}", random_token(24));
    let metadata = json!({
        "name": filename,
        "parents": [drive_folder_id]
    })
    .to_string();
    let content_type = mime_type
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "application/octet-stream".to_string());

    let mut body = Vec::new();
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(b"Content-Type: application/json; charset=UTF-8\r\n\r\n");
    body.extend_from_slice(metadata.as_bytes());
    body.extend_from_slice(b"\r\n");
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(format!("Content-Type: {}\r\n\r\n", content_type).as_bytes());
    body.extend_from_slice(&bytes);
    body.extend_from_slice(b"\r\n");
    body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

    let response = reqwest::Client::new()
        .post(GOOGLE_DRIVE_UPLOAD_URL)
        .header(AUTHORIZATION, bearer(&access_token))
        .header(CONTENT_TYPE, format!("multipart/related; boundary={}", boundary))
        .query(&[
            ("uploadType", "multipart"),
            ("fields", "id,name,webViewLink,webContentLink"),
        ])
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(google_text_error(response).await);
    }

    let upload = response.json::<DriveFile>().await.map_err(|e| e.to_string())?;
    bw_state.add_up(size);

    Ok(GoogleDriveUploadResult {
        id: upload.id,
        name: upload.name,
        web_view_link: upload.web_view_link,
        web_content_link: upload.web_content_link,
    })
}
