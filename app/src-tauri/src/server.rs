use actix_web::{get, web, App, HttpServer, HttpResponse, HttpRequest, Responder};
use actix_cors::Cors;
use crate::commands::TelegramState;
use crate::commands::utils::resolve_peer;
use grammers_client::types::Media;
use grammers_client::client::files::{MAX_CHUNK_SIZE, MIN_CHUNK_SIZE};

use std::sync::Arc;

/// Holds the per-session streaming token for Actix validation
pub struct StreamTokenData {
    pub token: String,
}

#[derive(serde::Deserialize)]
struct StreamQuery {
    token: Option<String>,
}

#[get("/stream/{folder_id}/{message_id}")]
async fn stream_media(
    path: web::Path<(String, i32)>,
    query: web::Query<StreamQuery>,
    request: HttpRequest,
    data: web::Data<Arc<TelegramState>>,
    token_data: web::Data<StreamTokenData>,
) -> impl Responder {
    // Validate session token
    match &query.token {
        Some(t) if t == &token_data.token => {},
        _ => return HttpResponse::Forbidden().body("Invalid or missing stream token"),
    }

    let (folder_id_str, message_id) = path.into_inner();

    // Parse folder ID
    let folder_id = if folder_id_str == "me" || folder_id_str == "home" || folder_id_str == "null" {
        None
    } else {
        match folder_id_str.parse::<i64>() {
            Ok(id) => Some(id),
            Err(_) => return HttpResponse::BadRequest().body("Invalid folder ID"),
        }
    };

    let client_opt = {
        data.client.lock().await.clone()
    };

    if let Some(client) = client_opt {
        match resolve_peer(&client, folder_id).await {
            Ok(peer) => {
                // Try to fetch message efficiently
                 match client.get_messages_by_id(peer, &[message_id]).await {
                    Ok(messages) => {
                        if let Some(Some(msg)) = messages.first() {
                            if let Some(media) = msg.media() {
                                let size = media_size(&media);

                                let mime = mime_type_from_media(&media);

                                let requested_range = request
                                    .headers()
                                    .get("range")
                                    .and_then(|value| value.to_str().ok());

                                let range = if let (Some(header), Some(total_size)) = (requested_range, size) {
                                    match parse_byte_range(header, total_size) {
                                        Ok(range) => range,
                                        Err(_) => {
                                            return HttpResponse::RangeNotSatisfiable()
                                                .insert_header(("Content-Range", format!("bytes */{}", total_size)))
                                                .finish();
                                        }
                                    }
                                } else {
                                    None
                                };

                                if let (Some((start, end)), Some(total_size)) = (range, size) {
                                    let content_length = end - start + 1;
                                    let stream = ranged_media_stream(client, media, start, end);

                                    return HttpResponse::PartialContent()
                                        .insert_header(("Content-Type", mime))
                                        .insert_header(("Accept-Ranges", "bytes"))
                                        .insert_header(("Content-Range", format!("bytes {}-{}/{}", start, end, total_size)))
                                        .insert_header(("Content-Length", content_length.to_string()))
                                        .insert_header(("Cache-Control", "private, max-age=120"))
                                        .streaming(stream);
                                }

                                let stream = full_media_stream(client, media);
                                let mut response = HttpResponse::Ok();
                                response
                                    .insert_header(("Content-Type", mime))
                                    .insert_header(("Accept-Ranges", "bytes"))
                                    .insert_header(("Cache-Control", "private, max-age=120"));

                                if let Some(total_size) = size {
                                    response.insert_header(("Content-Length", total_size.to_string()));
                                }

                                return response.streaming(stream);
                            }
                        }
                        HttpResponse::NotFound().body("Message or media not found")
                    },
                    Err(e) => HttpResponse::InternalServerError().body(format!("Failed to fetch message: {}", e)),
                 }
            },
            Err(e) => HttpResponse::BadRequest().body(format!("Peer resolution failed: {}", e)),
        }
    } else {
        HttpResponse::ServiceUnavailable().body("Telegram client not connected")
    }
}

fn mime_type_from_media(media: &Media) -> String {
    match media {
        Media::Document(d) => d.mime_type().unwrap_or("application/octet-stream").to_string(),
        _ => "application/octet-stream".to_string(),
    }
}

fn media_size(media: &Media) -> Option<u64> {
    match media {
        Media::Document(d) => Some(d.size() as u64),
        _ => None,
    }
}

fn parse_byte_range(header: &str, size: u64) -> Result<Option<(u64, u64)>, ()> {
    if size == 0 {
        return Ok(None);
    }

    let Some(range) = header.strip_prefix("bytes=") else {
        return Ok(None);
    };

    if range.contains(',') {
        return Err(());
    }

    let Some((start_raw, end_raw)) = range.split_once('-') else {
        return Err(());
    };

    if start_raw.is_empty() {
        let suffix_len = end_raw.parse::<u64>().map_err(|_| ())?;
        if suffix_len == 0 {
            return Err(());
        }
        let start = size.saturating_sub(suffix_len);
        return Ok(Some((start, size - 1)));
    }

    let start = start_raw.parse::<u64>().map_err(|_| ())?;
    if start >= size {
        return Err(());
    }

    let end = if end_raw.is_empty() {
        size - 1
    } else {
        end_raw.parse::<u64>().map_err(|_| ())?.min(size - 1)
    };

    if start > end {
        return Err(());
    }

    Ok(Some((start, end)))
}

fn full_media_stream(
    client: grammers_client::Client,
    media: Media,
) -> impl futures::Stream<Item = Result<web::Bytes, actix_web::Error>> {
    async_stream::stream! {
        let mut download_iter = client.iter_download(&media);
        while let Some(chunk) = download_iter.next().await.transpose() {
            match chunk {
                Ok(bytes) => yield Ok::<_, actix_web::Error>(web::Bytes::from(bytes)),
                Err(e) => {
                    log::error!("Stream error: {}", e);
                    break;
                }
            }
        }
    }
}

fn ranged_media_stream(
    client: grammers_client::Client,
    media: Media,
    start: u64,
    end: u64,
) -> impl futures::Stream<Item = Result<web::Bytes, actix_web::Error>> {
    async_stream::stream! {
        let min_chunk_size = MIN_CHUNK_SIZE as u64;
        let aligned_start = start - (start % min_chunk_size);
        let chunks_to_skip = (aligned_start / min_chunk_size) as i32;
        let mut bytes_to_skip = (start - aligned_start) as usize;
        let mut remaining = end - start + 1;
        let mut download_iter = client
            .iter_download(&media)
            .chunk_size(MIN_CHUNK_SIZE)
            .skip_chunks(chunks_to_skip)
            .chunk_size(MAX_CHUNK_SIZE);

        while remaining > 0 {
            match download_iter.next().await {
                Ok(Some(mut bytes)) => {
                    if bytes_to_skip > 0 {
                        if bytes_to_skip >= bytes.len() {
                            bytes_to_skip -= bytes.len();
                            continue;
                        }
                        bytes = bytes.split_off(bytes_to_skip);
                        bytes_to_skip = 0;
                    }

                    let take = bytes.len().min(remaining as usize);
                    bytes.truncate(take);
                    remaining -= take as u64;

                    if take > 0 {
                        yield Ok::<_, actix_web::Error>(web::Bytes::from(bytes));
                    }
                }
                Ok(None) => break,
                Err(e) => {
                    log::error!("Range stream error: {}", e);
                    break;
                }
            }
        }
    }
}

pub async fn start_server(state: Arc<TelegramState>, port: u16, token: String) -> std::io::Result<actix_web::dev::Server> {
    let state_data = web::Data::new(state);
    let token_data = web::Data::new(StreamTokenData { token });

    log::info!("Starting Streaming Server on port {}", port);

    let server = HttpServer::new(move || {
        let cors = Cors::default()
            .allowed_origin("tauri://localhost")
            .allowed_origin("http://localhost:1420")
            .allowed_origin("https://tauri.localhost")
            .allow_any_method()
            .allow_any_header();

        App::new()
            .wrap(cors)
            .app_data(state_data.clone())
            .app_data(token_data.clone())
            .service(stream_media)
    })
    .bind(("127.0.0.1", port))?
    .run();

    Ok(server)
}
