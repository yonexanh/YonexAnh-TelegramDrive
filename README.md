# CloneYA Telegram Drive

CloneYA Telegram Drive is a personal desktop app that turns your Telegram account into a practical cloud-drive workspace. It uses Telegram Saved Messages and private Telegram channels as storage locations, then adds a native file-manager experience on top with folders, previews, streaming, transfers, search, sync, and account-aware UI.

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)
![Version](https://img.shields.io/badge/version-1.1.8-2dd4bf)
![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8DB)
![React](https://img.shields.io/badge/React-19-61DAFB)

> This is an independent project and is not affiliated with Telegram FZ-LLC.

## Overview

Telegram already stores your files in the cloud, but the native Telegram clients are not designed like a file manager. CloneYA Telegram Drive provides a desktop interface for browsing, uploading, downloading, previewing, organizing, and streaming those files.

The app connects directly to Telegram through your own API credentials. Credentials, session files, local metadata, sync settings, and transfer queues stay on your machine.

## What Is New In This Build

- **English / Vietnamese UI**: switch between EN and VN from the login screen or dashboard.
- **Logged-in account display**: the sidebar can show the Telegram name, username, and phone number returned by Telegram for the current session.
- **New app logo and icon set**: refreshed Telegram-like paper-plane drive identity across the UI and generated app icons.
- **Automatic session restore**: the app checks existing local Telegram sessions on launch and opens the dashboard when possible.
- **Real drag and drop upload**: file drops from the desktop are queued into the active Telegram folder.
- **Unified Transfer Center**: uploads and downloads now share one stacked queue UI with pause, resume, retry, cancel, open, and reveal actions.
- **HTTP byte-range media streaming**: video and audio seeking works better because the stream endpoint supports `Range` and `Content-Range`.
- **Local Sync**: choose a local folder, enable or disable scheduled sync, and upload changed files to a selected Telegram folder.
- **Duplicate detection**: uploads can skip files that already exist in the current folder by name and size.
- **Trash / restore flow**: move files to Trash first, restore them, or delete permanently.
- **Tags and Collections**: tag files locally and browse collection views by tag.
- **Tag Search**: filter files by tag from Advanced Search or type `#tag` / `tag:name` in the main search box.
- **Tag Manager**: rename, delete, and open tag collections from a dedicated management screen.
- **Telegram Metadata Backup**: export local metadata as a JSON backup and upload it to a selected Telegram folder; restore later by opening that folder and restoring the backup file.
- **Google Drive Backup Preview**: connect a Google OAuth Desktop Client and back up selected Telegram files into a Google Drive folder.
- **Activity Log**: review local actions such as tagging, renaming, backup, restore, upload, download, trash, and sync runs.
- **Storage Analytics**: inspect known local storage by file type, folder, largest files, and top tags.
- **Media Library**: collect audio and video items into a media-focused view.
- **Diagnostics**: check app data, session, streaming server, Telegram reachability, and thumbnail cache status.

## Core Features

- **Saved Messages as Home**: use your own Telegram Saved Messages as the root drive.
- **Folders via Telegram Channels**: create private Telegram channels and manage them like folders.
- **Grid and List Views**: switch between visual cards and dense list view.
- **Virtualized Large Folders**: handle large folders without rendering every row at once.
- **Image Thumbnails**: preview supported images inline.
- **File Preview**: open image previews, PDFs, audio, and video without manually downloading first.
- **PDF Viewer**: built-in PDF viewing with page navigation.
- **Advanced Search and Filters**: filter by type, tag, size, date, and favorites.
- **Favorites and Recent**: pin important files and quickly revisit recent activity.
- **Tag Management**: maintain local tags across all known files without editing Telegram file content.
- **Metadata Backup and Restore**: keep a portable backup of local organization data inside Telegram itself.
- **One-Way Google Drive Backup**: copy selected Telegram files to Google Drive as an early backup workflow.
- **Activity and Analytics**: see what changed recently and where your known Telegram Drive storage is concentrated.
- **Move and Rename**: move files between Telegram folders and rename display names locally.
- **Bandwidth Widget**: track current app upload/download usage.
- **Auto Update Ready**: Tauri updater configuration is included for release builds.
- **Privacy Focused**: no third-party storage server is used by this app.

## Screenshots

| Dashboard | File Preview |
| --- | --- |
| ![Dashboard](screenshots/DashboardWithFiles.png) | ![Preview](screenshots/ImagePreview.png) |

| Grid View | Authentication |
| --- | --- |
| ![Grid View](screenshots/DarkModeGrid.png) | ![Login](screenshots/LoginScreen.png) |

| Audio Playback | Video Playback |
| --- | --- |
| ![Audio Playback](screenshots/AudioPlayback.png) | ![Video Playback](screenshots/VideoPlayback.png) |

| Folder Creation | Upload Example |
| --- | --- |
| ![Folder Creation](screenshots/FolderCreation.png) | ![Upload Example](screenshots/UploadExample.png) |

## Tech Stack

- **Desktop shell**: Tauri 2
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Framer Motion
- **Backend**: Rust, Grammers Telegram client
- **State and data**: Tauri Store, React Query
- **Documents and media**: PDF.js, local Actix streaming server

## Requirements

- Node.js 18 or newer
- Rust stable with Cargo
- A Telegram account
- Telegram API ID and API Hash from [my.telegram.org](https://my.telegram.org)
- Platform-specific native build tools for macOS or Windows

## Telegram API Credentials

1. Open [my.telegram.org](https://my.telegram.org).
2. Log in with your Telegram phone number.
3. Open **API development tools**.
4. Create an app and copy the **API ID** and **API Hash**.
5. Paste them into CloneYA Telegram Drive on first launch.

Your API credentials are stored locally by the desktop app.

## Google Drive Backup Preview

The Google Drive integration is a first one-way backup workflow. It uploads selected Telegram files into a Google Drive folder; it does not yet perform full two-way sync.

Setup:

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Configure the OAuth consent screen for your Google account.
4. Create an OAuth Client ID with application type **Desktop app**.
5. Copy the Client ID.
6. In CloneYA Telegram Drive, open **Google Drive** from the Tools section, paste the Client ID, and connect.

The app uses a local loopback OAuth callback and requests the `drive.file` scope so it can create or access files it manages in your Google Drive. Tokens are stored locally on your device.

## Quick Start

```bash
git clone https://github.com/yonexanh/CloneYA-TelegramDrive.git
cd CloneYA-TelegramDrive/app
npm install
npm run tauri dev
```

The Vite dev URL is `http://localhost:1420`, but the app must be opened through Tauri for Telegram and filesystem features to work.

## Build From Source

### English

#### macOS

Requirements:

- macOS
- Xcode Command Line Tools:

```bash
xcode-select --install
```

- Node.js 18+
- Rust stable

Build commands:

```bash
git clone https://github.com/yonexanh/CloneYA-TelegramDrive.git
cd CloneYA-TelegramDrive/app
npm install
npm run tauri build
```

macOS artifacts are generated under:

- `app/src-tauri/target/release/bundle/macos/Telegram Drive.app`
- `app/src-tauri/target/release/bundle/macos/Telegram Drive.app.zip`
- `app/src-tauri/target/release/bundle/dmg/Telegram Drive_<version>_<arch>.dmg`

For a fast local `.app` build only:

```bash
cd app
npm run tauri build -- --bundles app
```

Local macOS builds use ad-hoc signing by default. Notarization requires Apple Developer credentials.

#### Windows

Requirements:

- Windows 10 or Windows 11
- Node.js 18+
- Rust stable with the MSVC toolchain
- Microsoft C++ Build Tools with **Desktop development with C++**
- Microsoft Edge WebView2 Runtime

Build commands:

```powershell
git clone https://github.com/yonexanh/CloneYA-TelegramDrive.git
cd CloneYA-TelegramDrive\app
npm install
npm run tauri build
```

Windows installers are generated under:

```text
app\src-tauri\target\release\bundle\
```

Depending on your Tauri bundler setup, output may appear in `msi\`, `nsis\`, or both.

### Tiếng Việt

#### Build trên macOS

Yêu cầu:

- macOS
- Xcode Command Line Tools:

```bash
xcode-select --install
```

- Node.js 18+
- Rust stable

Lệnh build:

```bash
git clone https://github.com/yonexanh/CloneYA-TelegramDrive.git
cd CloneYA-TelegramDrive/app
npm install
npm run tauri build
```

File build macOS nằm ở:

- `app/src-tauri/target/release/bundle/macos/Telegram Drive.app`
- `app/src-tauri/target/release/bundle/macos/Telegram Drive.app.zip`
- `app/src-tauri/target/release/bundle/dmg/Telegram Drive_<version>_<arch>.dmg`

Nếu chỉ muốn build nhanh file `.app` để chạy thử:

```bash
cd app
npm run tauri build -- --bundles app
```

Build local trên macOS mặc định dùng ad-hoc signing. Nếu muốn notarize để phát hành công khai, bạn cần Apple Developer credentials.

#### Build trên Windows

Yêu cầu:

- Windows 10 hoặc Windows 11
- Node.js 18+
- Rust stable với MSVC toolchain
- Microsoft C++ Build Tools, chọn workload **Desktop development with C++**
- Microsoft Edge WebView2 Runtime

Lệnh build:

```powershell
git clone https://github.com/yonexanh/CloneYA-TelegramDrive.git
cd CloneYA-TelegramDrive\app
npm install
npm run tauri build
```

File cài đặt Windows nằm trong:

```text
app\src-tauri\target\release\bundle\
```

Tùy cấu hình bundler Tauri trên máy build, output có thể nằm trong `msi\`, `nsis\`, hoặc cả hai.

## Useful Commands

```bash
cd app
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri dev
npm run tauri build
npm run tauri build -- --bundles app
```

Regenerate app icons from the SVG logo:

```bash
cd app
npx --no-install tauri icon public/logo.svg
```

## Release Notes

- The Tauri updater endpoint points to GitHub releases for this repository.
- macOS notarization is skipped unless Apple credentials are configured in the build environment.
- Tauri updater signing requires `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` for production release channels.

## Privacy And Limits

- Files are uploaded to Telegram using your logged-in Telegram account.
- API credentials and session data are stored locally.
- Local metadata such as favorites, tags, trash state, rename labels, sync settings, and recent history is stored on your machine.
- This app does not provide extra Telegram storage beyond Telegram's own account and file-size limits.
- Use the app responsibly and follow Telegram's Terms of Service.

## Project Ownership

This repository is maintained as a personal project by **YonexAnh** under the repository name **CloneYA-TelegramDrive**. The README, branding, and app features are written for this project and do not include donation sections or attribution blocks from another repository template.
