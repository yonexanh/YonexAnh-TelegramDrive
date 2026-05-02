use tauri::State;
use tauri::Manager;
use grammers_client::types::Media;
use grammers_client::types::photo_sizes::PhotoSize;
use crate::TelegramState;
use crate::bandwidth::BandwidthManager;
use crate::commands::utils::resolve_peer;

const PREVIEW_CACHE_MAX_FILES: usize = 30;
const PREVIEW_CACHE_MAX_TOTAL_BYTES: u64 = 80 * 1024 * 1024;
const THUMBNAIL_CACHE_MAX_FILES: usize = 500;
const THUMBNAIL_CACHE_MAX_TOTAL_BYTES: u64 = 160 * 1024 * 1024;
const TARGET_THUMBNAIL_MAX_BYTES: usize = 512 * 1024;

fn prune_cache(cache_dir: &std::path::Path, max_files: usize, max_total_bytes: u64) {
    let read_dir = match std::fs::read_dir(cache_dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    let mut files: Vec<(std::path::PathBuf, std::time::SystemTime, u64)> = Vec::new();
    for entry in read_dir.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if let Ok(meta) = entry.metadata() {
            let modified = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
            files.push((path, modified, meta.len()));
        }
    }
    files.sort_by_key(|(_, modified, _)| *modified);
    let mut total_bytes: u64 = files.iter().map(|(_, _, len)| *len).sum();
    while files.len() > max_files || total_bytes > max_total_bytes {
        if let Some((path, _, len)) = files.first().cloned() {
            let _ = std::fs::remove_file(&path);
            total_bytes = total_bytes.saturating_sub(len);
            files.remove(0);
        } else {
            break;
        }
    }
}

fn prune_preview_cache(cache_dir: &std::path::Path) {
    prune_cache(cache_dir, PREVIEW_CACHE_MAX_FILES, PREVIEW_CACHE_MAX_TOTAL_BYTES);
}

fn prune_thumbnail_cache(cache_dir: &std::path::Path) {
    prune_cache(cache_dir, THUMBNAIL_CACHE_MAX_FILES, THUMBNAIL_CACHE_MAX_TOTAL_BYTES);
}

fn folder_cache_key(folder_id: Option<i64>) -> String {
    folder_id
        .map(|id| id.to_string())
        .unwrap_or_else(|| "home".to_string())
}

fn thumbnail_extension(thumb: &PhotoSize) -> &'static str {
    match thumb {
        PhotoSize::Path(_) => "svg",
        _ => "jpg",
    }
}

fn select_thumbnail(thumbs: Vec<PhotoSize>) -> Option<PhotoSize> {
    let mut candidates: Vec<PhotoSize> = thumbs
        .into_iter()
        .filter(|thumb| {
            thumb.size() > 0
                && !matches!(thumb, PhotoSize::Empty(_) | PhotoSize::Path(_))
        })
        .collect();

    candidates.sort_by_key(|thumb| thumb.size());

    candidates
        .iter()
        .rev()
        .find(|thumb| thumb.size() <= TARGET_THUMBNAIL_MAX_BYTES)
        .cloned()
        .or_else(|| candidates.first().cloned())
}

#[tauri::command]
pub async fn cmd_get_preview(
    message_id: i32,
    folder_id: Option<i64>,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    bw_state: State<'_, BandwidthManager>,
) -> Result<String, String> {
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("previews");
    if !cache_dir.exists() {
        let _ = std::fs::create_dir_all(&cache_dir);
    }
    prune_preview_cache(&cache_dir);
    log::info!("Using preview cache dir: {:?}", cache_dir);
    log::info!("Preview Request: msg_id={}", message_id);
    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() {
        return Ok("".to_string());
    }
    let client = client_opt.unwrap();

    let peer = resolve_peer(&client, folder_id).await?;
    let messages = client.get_messages_by_id(&peer, &[message_id])
        .await.map_err(|e| e.to_string())?;
    let target_message = messages.into_iter().flatten().next();

    if let Some(msg) = target_message {
        if let Some(media) = msg.media() {
            let ext = match &media {
                Media::Document(d) => {
                    let mut e = std::path::Path::new(d.name())
                        .extension()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_default();
                    if e.is_empty() {
                        if let Some(mime) = d.mime_type() {
                            e = match mime {
                                "image/jpeg" => "jpg".to_string(),
                                "image/png" => "png".to_string(),
                                "video/mp4" => "mp4".to_string(),
                                _ => "bin".to_string(),
                            };
                        } else {
                            e = "bin".to_string();
                        }
                    }
                    e
                },
                Media::Photo(_) => "jpg".to_string(),
                _ => "bin".to_string(),
            };
            let folder_key = folder_cache_key(folder_id);
            let save_path = cache_dir.join(format!("{}_{}.{}", folder_key, message_id, ext));
            let save_path_str = save_path.to_string_lossy().to_string();

            let file_ready = if save_path.exists() {
                log::info!("File ({}) exists in cache.", message_id);
                true
            } else {
                let size = match &media {
                    Media::Document(d) => d.size() as u64,
                    Media::Photo(_) => 1024 * 1024,
                    _ => 0,
                };
                log::info!("Downloading preview... Size: {}", size);
                if let Err(e) = bw_state.can_transfer(size) {
                    log::warn!("Bandwidth limit hit for preview: {}", e);
                    false
                } else {
                    match client.download_media(&media, &save_path_str).await {
                        Ok(_) => {
                            log::info!("Preview download complete.");
                            bw_state.add_down(size);
                            prune_preview_cache(&cache_dir);
                            true
                        },
                        Err(e) => {
                            log::error!("Preview Download Error: {}", e);
                            false
                        }
                    }
                }
            };
            if file_ready {
                log::info!("Returning path preview: {}", save_path_str);
                return Ok(save_path_str);
            }
        }
    }
    Err("File not found or failed to download".to_string())
}

#[tauri::command]
pub async fn cmd_clean_cache(
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("previews");
    if cache_dir.exists() {
        let _ = std::fs::remove_dir_all(cache_dir);
    }
    Ok(())
}

/// Get a small thumbnail for inline display in file cards.
/// Returns a cached local file path, or empty string for files without Telegram thumbnails.
#[tauri::command]
pub async fn cmd_get_thumbnail(
    message_id: i32,
    folder_id: Option<i64>,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    bw_state: State<'_, BandwidthManager>,
) -> Result<String, String> {
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("thumbnails");
    if !cache_dir.exists() {
        let _ = std::fs::create_dir_all(&cache_dir);
    }
    prune_thumbnail_cache(&cache_dir);

    let folder_key = folder_cache_key(folder_id);
    let cache_prefix = format!("{}_{}.", folder_key, message_id);
    if let Ok(entries) = std::fs::read_dir(&cache_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(&cache_prefix) {
                return Ok(entry.path().to_string_lossy().to_string());
            }
        }
    }

    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() {
        return Ok("".to_string());
    }
    let client = client_opt.unwrap();

    let peer = resolve_peer(&client, folder_id).await?;
    let messages = client.get_messages_by_id(&peer, &[message_id])
        .await.map_err(|e| e.to_string())?;
    if let Some(m) = messages.into_iter().flatten().next() {
        if let Some(media) = m.media() {
            let thumbs = match &media {
                Media::Photo(photo) => photo.thumbs(),
                Media::Document(document) => document.thumbs(),
                _ => Vec::new(),
            };

            if let Some(thumb) = select_thumbnail(thumbs) {
                let size = thumb.size() as u64;
                if bw_state.can_transfer(size).is_err() {
                    return Ok("".to_string());
                }
                let save_path = cache_dir.join(format!(
                    "{}_{}.{}",
                    folder_key,
                    message_id,
                    thumbnail_extension(&thumb)
                ));
                let save_path_str = save_path.to_string_lossy().to_string();

                if client.download_media(&thumb, &save_path_str).await.is_ok() {
                    bw_state.add_down(size);
                    prune_thumbnail_cache(&cache_dir);
                    return Ok(save_path_str);
                }
            }
        }
    }

    Ok("".to_string())
}
