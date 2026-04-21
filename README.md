# Technical Specification: File Management and Segmentation Module

This document defines how the local storage and the user interface for clip management should be handled.

## 1. Logika segmentovaného nahrávání a zachycení videa (Kamera)
Aby aplikace zvládla hodiny záznamu bez rizika ztráty dat, je implementován sekvenční zápis z připojených kamerových zdrojů:
- **Zdroje obrazu (Kamery):** Aplikace využívá `navigator.mediaDevices`. Na zařízeních Apple (iPad/Mac) plně podporuje **Kameru v Kontinuitě (Continuity Camera)**. To znamená, že iPhone připojený na stejné Wi-Fi a Apple ID může bezdrátově fungovat jako kamera a přenášet obraz přímo do iPadu. Samozřejmostí je možnost využít integrovanou kameru iPadu nebo externí USB kameru.
- **Segmentace:** `MediaRecorder` běží kontinuálně nad vybraným video streamem. Je nastaven časovač (uživatelsky volitelný, např. 5 minut). Po uplynutí intervalu se aktuální segment uzavře a automaticky uloží (v iPadu se stáhne do aplikace Soubory, odkud jej lze rovnou směrovat na připojený externí SSD). Okamžitě se spustí zápis do dalšího souboru.
- **Bezešvost:** Zápis využívá double-buffering (ukončení aktuálního `MediaRecorderu` automaticky spustí export a novou instanci pro minimalizaci ztráty snímků).

## 2. Sidebar: Inteligentní průzkumník (File Explorer)
- **File System Access API:** On startup, the user selects a "Workspace Folder". The application obtains a `DirectoryHandle`.
- **Sidebar Component:** A reactive list (e.g., built in React/Vanilla) that scans the selected folder in real-time. It will display thumbnails, video duration, and filenames.
- **External File Support:** The application must be able to "read" and ingest video files that the user manually drops into the workspace folder via Finder (e.g., importing older MP4 files directly from an SD card).
- **Metadata Integration:** For each video file, the app automatically locates a corresponding `.json` file (with the matching filename). This file will contain tags, keybinds, and notes for that specific segment.

## 3. Drag & Drop: Analysis Box (Active Analysis)
This is the heart of the workflow. The user does not want to browse through everything—only the selected clips.
- **Analysis Container:** A central component (the Box) where files from the sidebar are "dropped".
- **Implementation:** Utilizing the HTML5 Drag and Drop API.
- **Playlist Management:** When a file is dropped into the Box, it is not physically moved on the disk. Instead, its `FileHandle` is added to the active queue (Playlist) in the application's memory.
- **Multi-View:** The architecture of the Box allows for future side-by-side video playback (e.g., comparing two different attempts simultaneously).

## 4. JSON State Management (Backups and Synchronization)
The JSON file serves as the core state manager for the entire "analysis session".
- **Master JSON:** A configuration file that maps out:
  1. Relative paths to the active videos loaded in the Box.
  2. Event timestamps (e.g., "Goal at 04:20").
  3. The current keybinding configuration.
- **Auto-save:** Every user action (adding a video to the box, changing a hotkey) immediately updates the local state (using IndexedDB) and periodically exports these changes to the Master JSON.

## Summary of Developer Requirements
1. **UI Layout:** Left Sidebar (File Explorer), Right Sidebar (Keybinds/JSON Settings), Center (Analysis Box containing the Video Player).
2. **Core Storage Technology:** Use `showDirectoryPicker()` to establish persistent, read/write access to the local video folder on the Mac.
3. **Video Player Component:** Must support dynamic Source changes. Clicking a new file in the Analysis Box should seamlessly switch the video feed without reloading the page.
4. **Offline Capability:** The Service Worker must be configured so that, once the PWA is installed and the JSON/video files are local, the app requires zero internet connection to function.
