use tauri::{Emitter, Manager, State};
use grammers_client::types::{Attribute, Media, Peer};
use grammers_client::InputMessage;
use grammers_tl_types as tl;
use std::time::Duration;
use crate::TelegramState;
use crate::models::{FolderMetadata, FileMetadata};
use crate::bandwidth::BandwidthManager;
use crate::commands::utils::{resolve_peer, map_error};

const METADATA_BACKUP_MAX_BYTES: u64 = 25 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum UploadMediaKind {
    File,
    Video,
    Audio,
}

fn file_extension_lower(path: &str) -> Option<String> {
    std::path::Path::new(path)
        .extension()
        .map(|ext| ext.to_string_lossy().to_ascii_lowercase())
}

fn classify_upload_media(path: &str) -> UploadMediaKind {
    match file_extension_lower(path).as_deref() {
        Some("mp4" | "m4v" | "mov" | "webm" | "mkv" | "avi" | "ogg") => UploadMediaKind::Video,
        Some("mp3" | "wav" | "aac" | "flac" | "m4a" | "opus") => UploadMediaKind::Audio,
        _ => UploadMediaKind::File,
    }
}

fn upload_mime_type(path: &str, kind: UploadMediaKind) -> Option<&'static str> {
    match (kind, file_extension_lower(path).as_deref()) {
        (UploadMediaKind::Video, Some("mp4")) => Some("video/mp4"),
        (UploadMediaKind::Video, Some("m4v")) => Some("video/x-m4v"),
        (UploadMediaKind::Video, Some("mov")) => Some("video/quicktime"),
        (UploadMediaKind::Video, Some("webm")) => Some("video/webm"),
        (UploadMediaKind::Video, Some("mkv")) => Some("video/x-matroska"),
        (UploadMediaKind::Video, Some("avi")) => Some("video/x-msvideo"),
        (UploadMediaKind::Video, Some("ogg")) => Some("video/ogg"),
        (UploadMediaKind::Audio, Some("mp3")) => Some("audio/mpeg"),
        (UploadMediaKind::Audio, Some("wav")) => Some("audio/wav"),
        (UploadMediaKind::Audio, Some("aac")) => Some("audio/aac"),
        (UploadMediaKind::Audio, Some("flac")) => Some("audio/flac"),
        (UploadMediaKind::Audio, Some("m4a")) => Some("audio/mp4"),
        (UploadMediaKind::Audio, Some("opus")) => Some("audio/ogg"),
        _ => None,
    }
}

fn audio_title_from_path(path: &str) -> Option<String> {
    std::path::Path::new(path)
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_string())
        .filter(|title| !title.trim().is_empty())
}

#[derive(Clone, serde::Serialize)]
pub struct LocalFileInfo {
    path: String,
    name: String,
    size: u64,
    modified: u64,
}

fn read_local_file_info(path: &std::path::Path) -> Result<LocalFileInfo, String> {
    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
    if !metadata.is_file() {
        return Err("Path is not a file".to_string());
    }

    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0);

    Ok(LocalFileInfo {
        path: path.to_string_lossy().to_string(),
        name: path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "Unknown".to_string()),
        size: metadata.len(),
        modified,
    })
}

fn scan_local_folder_inner(root: &std::path::Path, out: &mut Vec<LocalFileInfo>) -> Result<(), String> {
    for entry in std::fs::read_dir(root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if file_type.is_symlink() {
            continue;
        }
        let path = entry.path();
        let metadata = entry.metadata().map_err(|e| e.to_string())?;

        if metadata.is_dir() {
            scan_local_folder_inner(&path, out)?;
        } else if metadata.is_file() {
            out.push(read_local_file_info(&path)?);
        }
    }

    Ok(())
}

#[tauri::command]
pub fn cmd_get_local_file_info(paths: Vec<String>) -> Result<Vec<LocalFileInfo>, String> {
    let mut files = Vec::new();
    for path in paths {
        let path = std::path::PathBuf::from(path);
        if path.is_file() {
            files.push(read_local_file_info(&path)?);
        }
    }
    Ok(files)
}

#[tauri::command]
pub fn cmd_scan_local_folder(path: String) -> Result<Vec<LocalFileInfo>, String> {
    let root = std::path::PathBuf::from(path);
    if !root.is_dir() {
        return Err("Path is not a folder".to_string());
    }

    let mut files = Vec::new();
    scan_local_folder_inner(&root, &mut files)?;
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}

#[tauri::command]
pub async fn cmd_create_folder(
    name: String,
    state: State<'_, TelegramState>,
) -> Result<FolderMetadata, String> {
    let client_opt = {
        state.client.lock().await.clone()
    };

    // --- MOCK ---
    if client_opt.is_none() {
        let mock_id = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;
        log::info!("[MOCK] Created folder '{}' with ID {}", name, mock_id);
        return Ok(FolderMetadata {
            id: mock_id,
            name,
            parent_id: None,
        });
    }
    // -----------
    let client = client_opt.unwrap();
    log::info!("Creating Telegram Channel: {}", name);

    let result = client.invoke(&tl::functions::channels::CreateChannel {
        broadcast: true,
        megagroup: false,
        title: format!("{} [TD]", name),
        about: "Telegram Drive Storage Folder\n[telegram-drive-folder]".to_string(),
        geo_point: None,
        address: None,
        for_import: false,
        forum: false,
        ttl_period: None, // Initial creation TTL
    }).await.map_err(map_error)?;

    let (chat_id, access_hash) = match result {
        tl::enums::Updates::Updates(u) => {
             let chat = u.chats.first().ok_or("No chat in updates")?;
             match chat {
                 tl::enums::Chat::Channel(c) => (c.id, c.access_hash.unwrap_or(0)),
                 _ => return Err("Created chat is not a channel".to_string()),
             }
        },
        _ => return Err("Unexpected response (not Updates::Updates)".to_string()),
    };

    // Explicitly Disable TTL
    let _input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
         channel_id: chat_id,
         access_hash,
    });

    let _ = client.invoke(&tl::functions::messages::SetHistoryTtl {
        peer: tl::enums::InputPeer::Channel(tl::types::InputPeerChannel { channel_id: chat_id, access_hash }),
        period: 0,
    }).await;

    Ok(FolderMetadata {
        id: chat_id,
        name,
        parent_id: None,
    })
}

#[tauri::command]
pub async fn cmd_delete_folder(
    folder_id: i64,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = {
        state.client.lock().await.clone()
    };

    if client_opt.is_none() {
        log::info!("[MOCK] Deleted folder ID {}", folder_id);
        return Ok(true);
    }
    let client = client_opt.unwrap();
    log::info!("Deleting folder/channel: {}", folder_id);

    let peer = resolve_peer(&client, Some(folder_id)).await?;

    let input_channel = match peer {
        Peer::Channel(c) => {
             let chan = &c.raw;
             tl::enums::InputChannel::Channel(tl::types::InputChannel {
                 channel_id: chan.id,
                 access_hash: chan.access_hash.ok_or("No access hash for channel")?,
             })
        },
        _ => return Err("Only channels (folders) can be deleted.".to_string()),
    };

    client.invoke(&tl::functions::channels::DeleteChannel {
        channel: input_channel,
    }).await.map_err(|e| format!("Failed to delete channel: {}", e))?;

    Ok(true)
}

#[tauri::command]
pub async fn cmd_rename_folder(
    folder_id: i64,
    name: String,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = {
        state.client.lock().await.clone()
    };

    if client_opt.is_none() {
        log::info!("[MOCK] Renamed folder ID {} to {}", folder_id, name);
        return Ok(true);
    }

    let client = client_opt.unwrap();
    let peer = resolve_peer(&client, Some(folder_id)).await?;

    let input_channel = match peer {
        Peer::Channel(c) => {
            let chan = &c.raw;
            tl::enums::InputChannel::Channel(tl::types::InputChannel {
                channel_id: chan.id,
                access_hash: chan.access_hash.ok_or("No access hash for channel")?,
            })
        },
        _ => return Err("Only channels (folders) can be renamed.".to_string()),
    };

    client.invoke(&tl::functions::channels::EditTitle {
        channel: input_channel,
        title: format!("{} [TD]", name),
    }).await.map_err(map_error)?;

    Ok(true)
}

#[tauri::command]
pub fn cmd_open_path(path: String) -> Result<bool, String> {
    tauri_plugin_opener::open_path(path, None::<&str>).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn cmd_reveal_path(path: String) -> Result<bool, String> {
    tauri_plugin_opener::reveal_item_in_dir(path).map_err(|e| e.to_string())?;
    Ok(true)
}


#[derive(Clone, serde::Serialize)]
struct ProgressPayload {
    id: String,
    percent: u8,
}

#[derive(Clone, serde::Serialize)]
pub struct MetadataBackupUploadResult {
    filename: String,
    folder_id: Option<i64>,
}

#[tauri::command]
pub async fn cmd_upload_file(
    path: String,
    folder_id: Option<i64>,
    transfer_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    bw_state: State<'_, BandwidthManager>,
) -> Result<String, String> {
    let size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
    bw_state.can_transfer(size)?;

    let tid = transfer_id.unwrap_or_default();

    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() {
        log::info!("[MOCK] Uploaded file {} to {:?}", path, folder_id);
        bw_state.add_up(size);
        return Ok("Mock upload successful".to_string());
    }
    let client = client_opt.unwrap();

    // Emit start progress
    if !tid.is_empty() {
        let _ = app_handle.emit("upload-progress", ProgressPayload { id: tid.clone(), percent: 0 });
    }

    let path_clone = path.clone();
    let client_clone = client.clone();

    let uploaded_file = tauri::async_runtime::spawn(async move {
        client_clone.upload_file(&path_clone).await
    }).await.map_err(|e| format!("Task join error: {}", e))?
      .map_err(map_error)?;

    let media_kind = classify_upload_media(&path);
    let mut message_builder = InputMessage::new().text("");
    if let Some(mime_type) = upload_mime_type(&path, media_kind) {
        message_builder = message_builder.mime_type(mime_type);
    }

    let message = match media_kind {
        UploadMediaKind::Video => message_builder
            .document(uploaded_file)
            .attribute(Attribute::Video {
                round_message: false,
                supports_streaming: true,
                duration: Duration::from_secs(0),
                w: 0,
                h: 0,
            }),
        UploadMediaKind::Audio => message_builder
            .document(uploaded_file)
            .attribute(Attribute::Audio {
                duration: Duration::from_secs(0),
                title: audio_title_from_path(&path),
                performer: None,
            }),
        UploadMediaKind::File => message_builder.file(uploaded_file),
    };

    let peer = resolve_peer(&client, folder_id).await?;

    client.send_message(&peer, message).await.map_err(map_error)?;

    bw_state.add_up(size);

    // Emit completion
    if !tid.is_empty() {
        let _ = app_handle.emit("upload-progress", ProgressPayload { id: tid, percent: 100 });
    }

    Ok("File uploaded successfully".to_string())
}

#[tauri::command]
pub async fn cmd_upload_metadata_backup(
    content: String,
    folder_id: Option<i64>,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    bw_state: State<'_, BandwidthManager>,
) -> Result<MetadataBackupUploadResult, String> {
    let bytes = content.as_bytes();
    let size = bytes.len() as u64;
    if size == 0 {
        return Err("Backup content is empty".to_string());
    }
    bw_state.can_transfer(size)?;

    let backup_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("metadata-backups");
    std::fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    let filename = format!(
        "telegram-drive-metadata-{}.tdrive-backup.json",
        chrono::Utc::now().format("%Y%m%d-%H%M%S")
    );
    let path = backup_dir.join(&filename);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;

    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() {
        log::info!("[MOCK] Uploaded metadata backup {} to {:?}", filename, folder_id);
        bw_state.add_up(size);
        return Ok(MetadataBackupUploadResult { filename, folder_id });
    }
    let client = client_opt.unwrap();
    let path_str = path.to_string_lossy().to_string();
    let uploaded_file = tauri::async_runtime::spawn({
        let client = client.clone();
        async move { client.upload_file(&path_str).await }
    }).await.map_err(|e| format!("Task join error: {}", e))?
      .map_err(map_error)?;

    let message = InputMessage::new()
        .text("Telegram Drive metadata backup")
        .file(uploaded_file);
    let peer = resolve_peer(&client, folder_id).await?;
    client.send_message(&peer, message).await.map_err(map_error)?;

    bw_state.add_up(size);
    Ok(MetadataBackupUploadResult { filename, folder_id })
}

#[tauri::command]
pub async fn cmd_read_metadata_backup(
    message_id: i32,
    folder_id: Option<i64>,
    state: State<'_, TelegramState>,
    bw_state: State<'_, BandwidthManager>,
) -> Result<String, String> {
    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() {
        return Err("Telegram client not connected".to_string());
    }
    let client = client_opt.unwrap();
    let peer = resolve_peer(&client, folder_id).await?;
    let messages = client
        .get_messages_by_id(&peer, &[message_id])
        .await
        .map_err(map_error)?;

    let msg = messages
        .into_iter()
        .flatten()
        .next()
        .ok_or_else(|| "Backup message not found".to_string())?;

    let media = msg.media().ok_or_else(|| "Backup message has no file".to_string())?;
    let size = match &media {
        Media::Document(d) => d.size() as u64,
        Media::Photo(_) => 1024 * 1024,
        _ => 0,
    };

    if size > METADATA_BACKUP_MAX_BYTES {
        return Err("Backup file is too large to restore as metadata".to_string());
    }
    bw_state.can_transfer(size)?;

    let mut out = Vec::with_capacity(size.min(METADATA_BACKUP_MAX_BYTES) as usize);
    let mut download_iter = client.iter_download(&media);
    while let Some(chunk) = download_iter.next().await.transpose() {
        let bytes = chunk.map_err(|e| format!("Download chunk error: {}", e))?;
        out.extend_from_slice(&bytes);
        if out.len() as u64 > METADATA_BACKUP_MAX_BYTES {
            return Err("Backup file is too large to restore as metadata".to_string());
        }
    }

    bw_state.add_down(size);
    String::from_utf8(out).map_err(|_| "Backup file is not valid UTF-8 JSON".to_string())
}

#[tauri::command]
pub async fn cmd_delete_file(
    message_id: i32,
    folder_id: Option<i64>,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() {
         log::info!("[MOCK] Deleted message {} from folder {:?}", message_id, folder_id);
        return Ok(true);
    }
    let client = client_opt.unwrap();

    let peer = resolve_peer(&client, folder_id).await?;
    client.delete_messages(&peer, &[message_id]).await.map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn cmd_download_file(
    message_id: i32,
    save_path: String,
    folder_id: Option<i64>,
    transfer_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    bw_state: State<'_, BandwidthManager>,
) -> Result<String, String> {
    let tid = transfer_id.unwrap_or_default();

    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() {
        log::info!("[MOCK] Downloaded message {} from {:?} to {}", message_id, folder_id, save_path);
        if let Err(e) = std::fs::write(&save_path, b"Mock Content") { return Err(e.to_string()); }
        return Ok("Download successful".to_string());
    }
    let client = client_opt.unwrap();

    let peer = resolve_peer(&client, folder_id).await?;

    // Use get_messages_by_id for efficient message lookup (same as server.rs)
    let messages = client.get_messages_by_id(&peer, &[message_id]).await.map_err(|e| e.to_string())?;

    let msg = messages.into_iter()
        .flatten()
        .next()
        .ok_or_else(|| "Message not found".to_string())?;

    let media = msg.media()
        .ok_or_else(|| "No media in message".to_string())?;

    let total_size = match &media {
        Media::Document(d) => d.size() as u64,
        Media::Photo(_) => 1024 * 1024,
        _ => 0,
    };

    bw_state.can_transfer(total_size)?;

    // Emit start
    if !tid.is_empty() {
        let _ = app_handle.emit("download-progress", ProgressPayload { id: tid.clone(), percent: 0 });
    }

    // Stream download with per-chunk progress
    let mut download_iter = client.iter_download(&media);
    let mut file = std::fs::File::create(&save_path).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut last_percent: u8 = 0;

    while let Some(chunk) = download_iter.next().await.transpose() {
        let bytes = chunk.map_err(|e| format!("Download chunk error: {}", e))?;
        std::io::Write::write_all(&mut file, &bytes).map_err(|e| e.to_string())?;
        downloaded += bytes.len() as u64;

        if !tid.is_empty() && total_size > 0 {
            let percent = ((downloaded as f64 / total_size as f64) * 100.0).min(100.0) as u8;
            // Only emit when percent actually changes to avoid event spam
            if percent != last_percent {
                last_percent = percent;
                let _ = app_handle.emit("download-progress", ProgressPayload { id: tid.clone(), percent });
            }
        }
    }

    bw_state.add_down(total_size);

    // Emit completion
    if !tid.is_empty() {
        let _ = app_handle.emit("download-progress", ProgressPayload { id: tid, percent: 100 });
    }

    Ok("Download successful".to_string())
}

#[tauri::command]
pub async fn cmd_move_files(
    message_ids: Vec<i32>,
    source_folder_id: Option<i64>,
    target_folder_id: Option<i64>,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    if source_folder_id == target_folder_id { return Ok(true); }
    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() {
        log::info!("[MOCK] Moved msgs {:?} from {:?} to {:?}", message_ids, source_folder_id, target_folder_id);
        return Ok(true);
    }
    let client = client_opt.unwrap();

    let source_peer = resolve_peer(&client, source_folder_id).await?;
    let target_peer = resolve_peer(&client, target_folder_id).await?;

    match client.forward_messages(&target_peer, &message_ids, &source_peer).await {
        Ok(_) => {},
        Err(e) => return Err(format!("Forward failed: {}", e)),
    }

    match client.delete_messages(&source_peer, &message_ids).await {
        Ok(_) => {},
        Err(e) => return Err(format!("Delete original failed: {}", e)),
    }

    Ok(true)
}

#[tauri::command]
pub async fn cmd_get_files(
    folder_id: Option<i64>,
    state: State<'_, TelegramState>,
) -> Result<Vec<FileMetadata>, String> {
    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() {
        log::info!("[MOCK] Returning mock files for folder {:?}", folder_id);
        return Ok(Vec::new()); // No mock files for now
    }
    let client = client_opt.unwrap();
    let mut files = Vec::new();

    let peer = resolve_peer(&client, folder_id).await?;

    let mut msgs = client.iter_messages(&peer);
    while let Some(msg) = msgs.next().await.map_err(|e| e.to_string())? {
        if let Some(doc) = msg.media() {
            let (name, size, mime, ext) = match doc {
                Media::Document(d) => {
                    let n = d.name().to_string();
                    let s = d.size();
                    let m = d.mime_type().map(|s| s.to_string());
                    let e = std::path::Path::new(&n).extension().map(|os| os.to_str().unwrap_or("").to_string());
                    (n, s, m, e)
                },
                Media::Photo(_) => ("Photo.jpg".to_string(), 0, Some("image/jpeg".into()), Some("jpg".into())),
                _ => ("Unknown".to_string(), 0, None, None),
            };
            files.push(FileMetadata {
                id: msg.id() as i64, folder_id, name, size: size as u64, mime_type: mime, file_ext: ext, created_at: msg.date().to_string(), icon_type: "file".into()
            });
        }
    }

    Ok(files)
}

#[tauri::command]
pub async fn cmd_search_global(
    query: String,
    state: State<'_, TelegramState>,
) -> Result<Vec<FileMetadata>, String> {
    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() {
        return Ok(Vec::new());
    }
    let client = client_opt.unwrap();
    let mut files = Vec::new();

    log::info!("Searching global for: {}", query);

    let result = client.invoke(&tl::functions::messages::SearchGlobal {
        q: query,
        filter: tl::enums::MessagesFilter::InputMessagesFilterDocument,
        min_date: 0,
        max_date: 0,
        offset_rate: 0,
        offset_peer: tl::enums::InputPeer::Empty,
        offset_id: 0,
        limit: 50,
        folder_id: None,
        broadcasts_only: false,
        groups_only: false,
        users_only: false,
    }).await.map_err(map_error)?;

    if let tl::enums::messages::Messages::Messages(msgs) = result {
        for msg in msgs.messages {
            if let tl::enums::Message::Message(m) = msg {
                if let Some(tl::enums::MessageMedia::Document(d)) = m.media {
                    if let tl::enums::Document::Document(doc) = d.document.unwrap() {
                        let name = doc.attributes.iter().find_map(|a| match a {
                            tl::enums::DocumentAttribute::Filename(f) => Some(f.file_name.clone()),
                            _ => None
                        }).unwrap_or("Unknown".to_string());
                        let size = doc.size as u64;
                        let mime = doc.mime_type.clone();
                        let ext = std::path::Path::new(&name).extension().map(|os| os.to_str().unwrap_or("").to_string());
                        let folder_id = match m.peer_id {
                            tl::enums::Peer::Channel(c) => Some(c.channel_id),
                            tl::enums::Peer::User(u) => Some(u.user_id),
                            tl::enums::Peer::Chat(c) => Some(c.chat_id),
                        };
                        files.push(FileMetadata {
                            id: m.id as i64, folder_id, name, size,
                            mime_type: Some(mime), file_ext: ext,
                            created_at: m.date.to_string(), icon_type: "file".into()
                        });
                    }
                }
            }
        }
    } else if let tl::enums::messages::Messages::Slice(msgs) = result {
        for msg in msgs.messages {
            if let tl::enums::Message::Message(m) = msg {
                if let Some(tl::enums::MessageMedia::Document(d)) = m.media {
                    if let tl::enums::Document::Document(doc) = d.document.unwrap() {
                        let name = doc.attributes.iter().find_map(|a| match a {
                            tl::enums::DocumentAttribute::Filename(f) => Some(f.file_name.clone()),
                            _ => None
                        }).unwrap_or("Unknown".to_string());
                        let size = doc.size as u64;
                        let mime = doc.mime_type.clone();
                        let ext = std::path::Path::new(&name).extension().map(|os| os.to_str().unwrap_or("").to_string());
                        let folder_id = match m.peer_id {
                            tl::enums::Peer::Channel(c) => Some(c.channel_id),
                            tl::enums::Peer::User(u) => Some(u.user_id),
                            tl::enums::Peer::Chat(c) => Some(c.chat_id),
                        };
                        files.push(FileMetadata {
                            id: m.id as i64, folder_id, name, size,
                            mime_type: Some(mime), file_ext: ext,
                            created_at: m.date.to_string(), icon_type: "file".into()
                        });
                    }
                }
            }
        }
    }

    Ok(files)
}

#[tauri::command]
pub async fn cmd_scan_folders(
    state: State<'_, TelegramState>,
) -> Result<Vec<FolderMetadata>, String> {
    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() {
        return Ok(Vec::new());
    }
    let client = client_opt.unwrap();

    let mut folders = Vec::new();
    let mut dialogs = client.iter_dialogs();

    log::info!("Starting Folder Scan...");

    while let Some(dialog) = dialogs.next().await.map_err(|e| e.to_string())? {
        match &dialog.peer {
            Peer::Channel(c) => {
                let id = c.raw.id;
                let name = c.raw.title.clone();
                let access_hash = c.raw.access_hash.unwrap_or(0);

                log::debug!("[SCAN] Processing Channel: '{}' (ID: {})", name, id);

                // Strategy 1: Title
                if name.to_lowercase().contains("[td]") {
                    log::info!(" -> MATCH via Title: {}", name);
                    let display_name = name.replace(" [TD]", "").replace(" [td]", "").replace("[TD]", "").replace("[td]", "").trim().to_string();
                    folders.push(FolderMetadata { id, name: display_name, parent_id: None });
                    continue;
                }

                // Strategy 2: About
                let input_chan = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                    channel_id: c.raw.id,
                    access_hash,
                });

                match client.invoke(&tl::functions::channels::GetFullChannel {
                    channel: input_chan,
                }).await {
                    Ok(tl::enums::messages::ChatFull::Full(f)) => {
                        if let tl::enums::ChatFull::Full(cf) = f.full_chat {
                             if cf.about.contains("[telegram-drive-folder]") {
                                 log::info!(" -> MATCH via About: {}", name);
                                 folders.push(FolderMetadata { id, name: name.clone(), parent_id: None });
                             }
                        }
                    },
                    Err(e) => log::warn!(" -> Failed to get full info: {}", e),
                }
            },
            peer => {
                log::debug!("[SCAN] Skipped Peer: {:?}", peer);
            }
        }
    }

    log::info!("Scan complete. Found {} folders.", folders.len());
    Ok(folders)
}
