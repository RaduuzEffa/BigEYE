(() => {
// State Management
const state = {
    workspaceHandle: null,
    files: new Map(), // name -> File object
    activeQueue: [], // Array of files added to the analysis box
    currentVideo: null
};

// ==========================================
// 1. DOM Elements Reference
// ==========================================
const folderInput = document.getElementById('folder-input');
const fileInput = document.getElementById('file-input');
const btnBrowseFolder = document.getElementById('btn-browse-folder');
const btnBrowseFiles = document.getElementById('btn-browse-files');
const fileTree = document.getElementById('file-tree');

const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

const dropZone = document.getElementById('drop-zone');
const playerContainer = document.getElementById('player-container');
const mainPlayer = document.getElementById('main-player');
const playlistItems = document.getElementById('playlist-items');

// Drawing & UI
const btnToggleDraw = document.getElementById('btn-toggle-draw');
const btnClearCanvas = document.getElementById('btn-clear-canvas');
const colorBtns = document.querySelectorAll('.color-btn');
const toolBtns = document.querySelectorAll('.tool-btn');
const drawingCanvas = document.getElementById('drawing-canvas');
const ctx = drawingCanvas.getContext('2d');
const speedBtns = document.querySelectorAll('.speed-btn');

// ==========================================
// 2. Initialization & Listeners
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    setupSidebar();
    setupDropZone();
    setupKeyboard();
    setupSpeedControls();
    setupDrawing();
    
    // Resize canvas to match video
    window.addEventListener('resize', resizeCanvas);
    mainPlayer.addEventListener('loadedmetadata', resizeCanvas);
    
    // Sync drawing tools for fullscreen
    document.addEventListener('fullscreenchange', syncToolsUI);
    document.addEventListener('webkitfullscreenchange', syncToolsUI);
    
    // Setup Mute Toggle
    setupMuteToggle();
});

function setupMuteToggle() {
    const btnToggleMute = document.getElementById('btn-toggle-mute');
    const muteIcon = document.getElementById('mute-icon');
    let isGloballyMuted = true; // Default state because camera preview starts muted
    
    if (btnToggleMute) {
        btnToggleMute.addEventListener('click', () => {
            isGloballyMuted = !isGloballyMuted;
            
            if (isGloballyMuted) {
                muteIcon.className = 'ph ph-speaker-slash';
                btnToggleMute.style.color = 'white';
            } else {
                muteIcon.className = 'ph ph-speaker-high';
                btnToggleMute.style.color = '#10b981'; // Zelená pro aktivní zvuk
            }
            
            const cameraPreview = document.getElementById('camera-preview');
            const mainPlayer = document.getElementById('main-player');
            if (cameraPreview) cameraPreview.muted = isGloballyMuted;
            if (mainPlayer) mainPlayer.muted = isGloballyMuted;
        });
    }
}

function syncToolsUI() {
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
    const fullscreenTools = document.getElementById('fullscreen-drawing-tools');
    const rightSidebarTools = document.getElementById('right-sidebar-tools-container');
    const toolsWrapper = document.getElementById('drawing-tools-wrapper');
    
    if (isFullscreen && drawingMode) {
        fullscreenTools.appendChild(toolsWrapper);
        fullscreenTools.classList.remove('hidden');
    } else {
        rightSidebarTools.appendChild(toolsWrapper);
        fullscreenTools.classList.add('hidden');
    }
}

// Prevent default browser behavior for drag & drop everywhere!
window.addEventListener('dragover', (e) => { e.preventDefault(); });
window.addEventListener('drop', (e) => { e.preventDefault(); });

// ==========================================
// 3. Sidebar & File Handling
// ==========================================
function setupSidebar() {
    const emptyTreeState = document.getElementById('empty-tree-state');
    if (emptyTreeState) {
        emptyTreeState.addEventListener('click', openFolderPicker);
    }

    folderInput.addEventListener('change', (e) => processFiles(e.target.files));
    fileInput.addEventListener('change', (e) => processFiles(e.target.files));
    
    const btnOpenFolder = document.getElementById('btn-open-folder');
    if (btnOpenFolder) {
        btnOpenFolder.addEventListener('click', openFolderPicker);
    }
    
    const btnRefreshFolder = document.getElementById('btn-refresh-folder');
    if (btnRefreshFolder) {
        btnRefreshFolder.addEventListener('click', async () => {
            if (state.dirHandle) {
                btnRefreshFolder.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';
                const files = [];
                await scanDirectory(state.dirHandle, files, state.dirHandle.name + '/');
                processFiles(files);
                btnRefreshFolder.innerHTML = '<i class="ph ph-arrows-clockwise"></i>';
            }
        });
    }
    
    // Drag and drop to remove from playlist
    fileTree.addEventListener('dragover', (e) => e.preventDefault());
    fileTree.addEventListener('drop', (e) => {
        e.preventDefault();
        const removeName = e.dataTransfer.getData('text/remove-playlist');
        if (removeName) {
            state.activeQueue = state.activeQueue.filter(f => f.name !== removeName);
            if (state.currentVideo && state.currentVideo.name === removeName) {
                state.currentVideo = null;
                mainPlayer.pause();
                playerContainer.classList.add('hidden');
                dropZone.style.display = 'flex';
            }
            renderQueue();
        }
    });
}

async function openFolderPicker() {
    if ('showDirectoryPicker' in window) {
        try {
            // Safari nesnese mode: 'readwrite' hned při prvním dotazu, vyvolalo by to chybu!
            const dirHandle = await window.showDirectoryPicker();
            state.dirHandle = dirHandle;
            document.getElementById('btn-refresh-folder').style.display = 'flex';
            
            const btnOpenFolder = document.getElementById('btn-open-folder');
            if (btnOpenFolder) {
                btnOpenFolder.innerHTML = `<i class="ph ph-folder-open"></i> ${dirHandle.name}`;
                btnOpenFolder.style.color = 'var(--success)';
                btnOpenFolder.style.borderColor = 'var(--success)';
            }
            
            const btn = document.getElementById('btn-refresh-folder');
            if (btn) btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';
            
            const files = [];
            await scanDirectory(dirHandle, files, dirHandle.name + '/');
            processFiles(files);
            
            if (btn) btn.innerHTML = '<i class="ph ph-arrows-clockwise"></i>';
        } catch (e) {
            console.log('Folder picker canceled or failed:', e);
            alert('Výběr složky byl zrušen nebo prohlížeč neumožnil přístup.');
        }
    } else {
        alert('Váš prohlížeč nepodporuje výběr složek.');
    }
}

async function scanDirectory(dirHandle, filesArray, path = '') {
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
            if (entry.name.endsWith('.webm') || entry.name.endsWith('.mp4') || entry.name.endsWith('.mov')) {
                const file = await entry.getFile();
                // Assign webkitRelativePath for the tree renderer
                Object.defineProperty(file, 'webkitRelativePath', {
                    value: path + file.name,
                    writable: false
                });
                filesArray.push(file);
            }
        } else if (entry.kind === 'directory') {
            await scanDirectory(entry, filesArray, path + entry.name + '/');
        }
    }
}

let fileTreeData = {};

function processFiles(fileListItems) {
    fileTreeData = {}; 
    fileTree.innerHTML = '';
    
    const emptyState = document.getElementById('empty-tree-state');
    if (emptyState) emptyState.style.display = 'none';
    
    // Vždy zobrazíme hlavní kořenovou složku, aby uživatel věděl, že se něco děje, i když je prázdná!
    const treeContainer = document.createElement('div');
    if (state.dirHandle) {
        const rootFolder = document.createElement('div');
        rootFolder.className = 'tree-item folder-item';
        rootFolder.innerHTML = `<i class="ph ph-folder-open"></i> <span style="font-weight:bold; color:var(--success);">${state.dirHandle.name}</span>`;
        fileTree.appendChild(rootFolder);
    }
    
    if (!fileListItems || fileListItems.length === 0) {
        const msg = document.createElement('div');
        msg.style.padding = '10px 15px';
        msg.style.color = 'var(--text-secondary)';
        msg.style.fontSize = '0.85rem';
        msg.textContent = 'Složka zatím neobsahuje videa.';
        fileTree.appendChild(msg);
        return;
    }
    
    Array.from(fileListItems).forEach(file => {
        if (!file.type.startsWith('video/') && !file.name.endsWith('.webm') && !file.name.endsWith('.mp4')) return;
        state.files.set(file.name, file);
        
        // If it has no webkitRelativePath, it's a standalone file
        const pathParts = file.webkitRelativePath ? file.webkitRelativePath.split('/') : ['Samostatné soubory', file.name];
        let current = fileTreeData;
        for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (!current[part]) current[part] = {};
            current = current[part];
        }
        current[pathParts[pathParts.length - 1]] = file.name;
    });

    fileTree.innerHTML = '';
    renderTree(fileTreeData, fileTree);
}

function renderTree(node, container) {
    for (const key in node) {
        if (typeof node[key] === 'string') {
            // File
            const el = document.createElement('div');
            el.className = 'tree-item video-item';
            el.draggable = true;
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'space-between';
            
            const labelSpan = document.createElement('span');
            labelSpan.innerHTML = `<i class="ph ph-file-video"></i> <span class="editable-name">${key}</span>`;
            labelSpan.style.flex = '1';
            labelSpan.style.overflow = 'hidden';
            labelSpan.style.textOverflow = 'ellipsis';
            labelSpan.style.cursor = 'pointer';
            
            // Kliknutí pro přehrání
            labelSpan.addEventListener('click', () => addToQueue(state.files.get(node[key])));
            
            // Dvojklik pro přejmenování
            const nameText = labelSpan.querySelector('.editable-name');
            nameText.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                makeEditable(nameText, key);
            });
            
            el.appendChild(labelSpan);
            el.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', node[key]));
            container.appendChild(el);
        } else {
            // Folder
            const folderWrapper = document.createElement('div');
            const el = document.createElement('div');
            el.className = 'tree-item folder-item';
            el.innerHTML = `<i class="ph ph-folder-open"></i> <span>${key}</span>`;
            
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'tree-children';
            
            el.addEventListener('click', () => {
                childrenContainer.classList.toggle('hidden');
                const i = el.querySelector('i');
                if (childrenContainer.classList.contains('hidden')) {
                    i.className = 'ph ph-folder';
                } else {
                    i.className = 'ph ph-folder-open';
                }
            });
            
            folderWrapper.appendChild(el);
            folderWrapper.appendChild(childrenContainer);
            container.appendChild(folderWrapper);
            renderTree(node[key], childrenContainer);
        }
    }
}

// ==========================================
// 4. Drag & Drop & Playlist
// ==========================================
function setupDropZone() {
    const mainContent = document.querySelector('.main-content');
    
    mainContent.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    mainContent.addEventListener('dragleave', (e) => {
        // Only remove dragover if leaving the main content area
        if (!mainContent.contains(e.relatedTarget)) {
            dropZone.classList.remove('dragover');
        }
    });
    
    mainContent.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        
        // Zpracování ze stromečku (Levý sidebar)
        const fileName = e.dataTransfer.getData('text/plain');
        if (fileName && state.files.has(fileName)) {
            const file = state.files.get(fileName);
            loadVideo(file);
            addToQueue(file);
        } 
        
        // Zpracování z fronty (aby se pustilo a nezmizelo)
        const removeName = e.dataTransfer.getData('text/remove-playlist');
        if (removeName) {
            const fileToPlay = state.activeQueue.find(f => f.name === removeName);
            if (fileToPlay) {
                loadVideo(fileToPlay);
            }
        }
        
        // Zpracování souborů přímo z počítače (Mac Finder)
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            for (let i = 0; i < e.dataTransfer.files.length; i++) {
                const file = e.dataTransfer.files[i];
                if (file.type.startsWith('video/') || file.name.endsWith('.webm') || file.name.endsWith('.mp4') || file.name.endsWith('.mov')) {
                    addToQueue(file);
                }
            }
            if (e.dataTransfer.files.length === 1) {
                loadVideo(e.dataTransfer.files[0]);
            }
        }
    });
}

function addToQueue(file) {
    if (state.activeQueue.some(f => f.name === file.name)) return; // No duplicates
    
    state.activeQueue.push(file);
    renderQueue();
    
    if (state.activeQueue.length === 1) {
        loadVideo(file);
    }
}

function renderQueue() {
    playlistItems.innerHTML = '';
    state.activeQueue.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        item.draggable = true;
        if (state.currentVideo && state.currentVideo.name === file.name) {
            item.classList.add('active');
        }
        
        // Vytvoření názvu (s možností editace na dvojklik)
        const nameSpan = document.createElement('span');
        nameSpan.className = 'playlist-item-name';
        nameSpan.textContent = file.name;
        nameSpan.style.flex = '1';
        nameSpan.style.cursor = 'pointer';
        
        nameSpan.addEventListener('click', () => loadVideo(file));
        nameSpan.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            makeEditable(nameSpan, file.name);
        });
        
        // Tlačítko pro smazání (X)
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn outline-btn';
        removeBtn.innerHTML = '<i class="ph ph-x"></i>';
        removeBtn.style.padding = '4px 6px';
        removeBtn.style.fontSize = '0.7rem';
        removeBtn.style.border = 'none';
        removeBtn.style.marginLeft = '4px';
        removeBtn.title = 'Odebrat ze seznamu';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // ZDE JE OPRAVA INDEXU! (Použijeme filter místo splice přes index)
            state.activeQueue = state.activeQueue.filter(f => f.name !== file.name);
            
            if (state.currentVideo && state.currentVideo.name === file.name) {
                state.currentVideo = null;
                mainPlayer.src = '';
                if (state.activeQueue.length > 0) {
                    loadVideo(state.activeQueue[0]);
                } else {
                    mainPlayer.style.display = 'none';
                    dropZone.style.display = 'flex';
                }
            }
            renderQueue();
        });
        
        item.appendChild(nameSpan);
        item.appendChild(removeBtn);
        
        // Allow dragging back to tree to remove
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/remove-playlist', file.name);
        });
        
        playlistItems.appendChild(item);
    });
}

function loadVideo(file) {
    state.currentVideo = file;
    dropZone.style.display = 'none';
    playerContainer.classList.remove('hidden');
    
    // Hide camera preview if we are loading a video, but show Back to Live button if recording
    const cameraPreview = document.getElementById('camera-preview');
    const btnBackToLive = document.getElementById('btn-back-to-live');
    if (cameraPreview && !cameraPreview.classList.contains('hidden') && cameraPreview.srcObject) {
        cameraPreview.style.display = 'none';
        if (btnBackToLive) btnBackToLive.style.display = 'flex';
    }
    
    const url = URL.createObjectURL(file);
    mainPlayer.src = url;
    mainPlayer.style.display = 'block';
    
    // Fix resize canvas when video metadata is loaded
    mainPlayer.onloadedmetadata = () => {
        resizeCanvas();
    };
    
    mainPlayer.play().catch(err => console.log(err));
    renderQueue();
}

// ==========================================
// 5. Controls & Scrubbing (Keyboard + Touch)
// ==========================================
const arrowState = {
    timer: null,
    interval: null,
    direction: null,
    isHolding: false
};
const FRAME_TIME = 0.0333;

function startArrowAction(dir, e) {
    if (e && e.preventDefault) e.preventDefault();
    if (arrowState.direction === dir) return;
    if (arrowState.direction) stopArrowAction(arrowState.direction);
    
    // Zkontrolovat, zda chceme spustit DVR mód (prohlížení probíhajícího nahrávání)
    if (window.triggerDVR && window.triggerDVR(dir)) {
        // DVR mód se aktivoval (video je nastaveno v mainPlayer), teď ho můžeme posunout dál
    }
    
    arrowState.direction = dir;
    arrowState.isHolding = false;
    
    arrowState.timer = setTimeout(() => {
        arrowState.isHolding = true;
        executeHoldAction(dir);
    }, 200);
}

function stopArrowAction(dir) {
    if (arrowState.direction !== dir) return;
    
    clearTimeout(arrowState.timer);
    clearInterval(arrowState.interval);
    mainPlayer.pause();
    
    if (!arrowState.isHolding) {
        executeTapAction(dir);
    }
    
    arrowState.direction = null;
    arrowState.isHolding = false;
}

function executeTapAction(dir) {
    mainPlayer.pause();
    if (dir === 'right') mainPlayer.currentTime += FRAME_TIME;
    else if (dir === 'left') mainPlayer.currentTime -= FRAME_TIME;
    else if (dir === 'up') mainPlayer.currentTime += FRAME_TIME * 5;
    else if (dir === 'down') mainPlayer.currentTime -= FRAME_TIME * 5;
}

function executeHoldAction(dir) {
    if (dir === 'right') {
        mainPlayer.playbackRate = 0.25;
        mainPlayer.play().catch(e=>{});
    } else if (dir === 'up') {
        mainPlayer.playbackRate = 2.0;
        mainPlayer.play().catch(e=>{});
    } else if (dir === 'left') {
        mainPlayer.pause();
        arrowState.interval = setInterval(() => {
            mainPlayer.currentTime = Math.max(0, mainPlayer.currentTime - (0.25 * 0.05));
        }, 50);
    } else if (dir === 'down') {
        mainPlayer.pause();
        arrowState.interval = setInterval(() => {
            mainPlayer.currentTime = Math.max(0, mainPlayer.currentTime - (2.0 * 0.05));
        }, 50);
    }
}

function updateSpeedUI(speed) {
    speedBtns.forEach(b => b.classList.remove('active'));
    const btn = Array.from(speedBtns).find(b => parseFloat(b.getAttribute('data-speed')) === speed);
    if (btn) btn.classList.add('active');
}

function toggleFullscreen() {
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
    if (!isFullscreen) {
        if (playerContainer.requestFullscreen) {
            playerContainer.requestFullscreen().catch(err => console.log(err));
        } else if (playerContainer.webkitRequestFullscreen) {
            playerContainer.webkitRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }
}

function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        switch(e.key) {
            case 'ArrowRight': startArrowAction('right', e); break;
            case 'ArrowLeft': startArrowAction('left', e); break;
            case 'ArrowUp': startArrowAction('up', e); break;
            case 'ArrowDown': startArrowAction('down', e); break;
            case ' ':
                e.preventDefault();
                if (mainPlayer.paused) {
                    mainPlayer.playbackRate = 1.0;
                    updateSpeedUI(1.0);
                    mainPlayer.play().catch(e=>{});
                } else {
                    mainPlayer.pause();
                }
                break;
            case 'y':
            case 'Y':
                toggleFullscreen();
                break;
        }
    });

    document.addEventListener('keyup', (e) => {
        switch(e.key) {
            case 'ArrowRight': stopArrowAction('right'); break;
            case 'ArrowLeft': stopArrowAction('left'); break;
            case 'ArrowUp': stopArrowAction('up'); break;
            case 'ArrowDown': stopArrowAction('down'); break;
        }
    });

    // Visual On-Screen Arrows Setup
    const visualArrows = document.querySelectorAll('.arrow-btn');
    visualArrows.forEach(btn => {
        const dir = btn.getAttribute('data-dir');
        if (!dir) return; // Skip fullscreen btn
        
        btn.addEventListener('mousedown', (e) => startArrowAction(dir, e));
        btn.addEventListener('mouseup', () => stopArrowAction(dir));
        btn.addEventListener('mouseleave', () => stopArrowAction(dir));
        
        btn.addEventListener('touchstart', (e) => startArrowAction(dir, e), {passive: false});
        btn.addEventListener('touchend', (e) => {
            if(e.cancelable) e.preventDefault();
            stopArrowAction(dir);
        });
        btn.addEventListener('touchcancel', () => stopArrowAction(dir));
    });
    
    // Custom Fullscreen Button
    const btnFullscreenToggle = document.getElementById('btn-fullscreen-toggle');
    if (btnFullscreenToggle) {
        btnFullscreenToggle.addEventListener('click', toggleFullscreen);
    }
}

function setupSpeedControls() {
    speedBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            speedBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            mainPlayer.playbackRate = parseFloat(btn.getAttribute('data-speed'));
        });
    });
}

// ==========================================
// 6. Drawing Logic
// ==========================================
let drawingMode = false;
let isDrawingNow = false;
let drawColor = '#ef4444';
let lastX = 0, lastY = 0;

let currentTool = 'free'; // 'free', 'rect', 'square', 'ellipse', 'circle'
let savedImageData = null;
let startX = 0, startY = 0;

function setupDrawing() {
    // Toggle Drawing Mode
    btnToggleDraw.addEventListener('click', () => {
        drawingMode = !drawingMode;
        if (drawingMode) {
            btnToggleDraw.innerHTML = '<i class="ph ph-pencil"></i> Režim kreslení (Zapnuto)';
            btnToggleDraw.style.background = 'var(--accent-primary)';
            btnToggleDraw.style.color = '#000';
            drawingCanvas.style.pointerEvents = 'auto'; // Block video controls, enable drawing
            mainPlayer.pause(); // Auto pause when drawing starts
        } else {
            btnToggleDraw.innerHTML = '<i class="ph ph-pencil"></i> Režim kreslení (Vypnuto)';
            btnToggleDraw.style.background = 'transparent';
            btnToggleDraw.style.color = 'var(--accent-primary)';
            drawingCanvas.style.pointerEvents = 'none'; // Re-enable video controls
        }
        syncToolsUI();
    });

    // Clear Canvas
    btnClearCanvas.addEventListener('click', () => {
        ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    });

    // Color Picker
    colorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            colorBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            drawColor = btn.getAttribute('data-color');
        });
    });

    // Tool Picker
    toolBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            toolBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTool = btn.getAttribute('data-tool');
        });
    });

    // Mouse / Touch Events
    const startDrawing = (e) => {
        if (!drawingMode) return;
        e.preventDefault();
        isDrawingNow = true;
        const pos = getMousePos(e);
        startX = pos.x; 
        startY = pos.y;
        lastX = pos.x; 
        lastY = pos.y;
        
        // Save canvas state for shapes
        if (currentTool !== 'free') {
            savedImageData = ctx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height);
        }
    };

    const stopDrawing = () => {
        isDrawingNow = false;
        ctx.beginPath();
        savedImageData = null;
    };

    const draw = (e) => {
        if (!isDrawingNow || !drawingMode) return;
        e.preventDefault();
        const pos = getMousePos(e);
        
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.strokeStyle = drawColor;
        
        // Hex to RGBA for 33% opacity fill
        let fillRgba = drawColor;
        if (drawColor.startsWith('#')) {
            const r = parseInt(drawColor.slice(1, 3), 16);
            const g = parseInt(drawColor.slice(3, 5), 16);
            const b = parseInt(drawColor.slice(5, 7), 16);
            fillRgba = `rgba(${r}, ${g}, ${b}, 0.33)`;
        }
        ctx.fillStyle = fillRgba;
        
        // Read selected draw mode (stroke or fill)
        const drawModeRadio = document.querySelector('input[name="draw-mode"]:checked');
        const drawStyle = drawModeRadio ? drawModeRadio.value : 'stroke';
        
        if (currentTool !== 'free') {
            ctx.putImageData(savedImageData, 0, 0); // Restore to clear preview
        }
        
        ctx.beginPath();
        
        if (currentTool === 'free') {
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
            lastX = pos.x; lastY = pos.y;
        } else if (currentTool === 'rect') {
            ctx.rect(startX, startY, pos.x - startX, pos.y - startY);
            if (drawStyle === 'fill') ctx.fill(); else ctx.stroke();
        } else if (currentTool === 'square') {
            const side = Math.max(Math.abs(pos.x - startX), Math.abs(pos.y - startY));
            const signX = pos.x > startX ? 1 : -1;
            const signY = pos.y > startY ? 1 : -1;
            ctx.rect(startX, startY, side * signX, side * signY);
            if (drawStyle === 'fill') ctx.fill(); else ctx.stroke();
        } else if (currentTool === 'ellipse') {
            const radiusX = Math.abs(pos.x - startX) / 2;
            const radiusY = Math.abs(pos.y - startY) / 2;
            const centerX = startX + (pos.x - startX) / 2;
            const centerY = startY + (pos.y - startY) / 2;
            ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
            if (drawStyle === 'fill') ctx.fill(); else ctx.stroke();
        } else if (currentTool === 'circle') {
            const radius = Math.sqrt(Math.pow(pos.x - startX, 2) + Math.pow(pos.y - startY, 2));
            ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
            if (drawStyle === 'fill') ctx.fill(); else ctx.stroke();
        }
    };

    drawingCanvas.addEventListener('mousedown', startDrawing);
    drawingCanvas.addEventListener('mousemove', draw);
    drawingCanvas.addEventListener('mouseup', stopDrawing);
    drawingCanvas.addEventListener('mouseout', stopDrawing);

    drawingCanvas.addEventListener('touchstart', startDrawing, { passive: false });
    drawingCanvas.addEventListener('touchmove', draw, { passive: false });
    drawingCanvas.addEventListener('touchend', stopDrawing);
}

function getMousePos(e) {
    const rect = drawingCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    // Calculate scale because canvas native resolution might differ from CSS
    const scaleX = drawingCanvas.width / rect.width;
    const scaleY = drawingCanvas.height / rect.height;
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

function resizeCanvas() {
    // Match native video resolution or player container size based on which video is active
    const cameraPreview = document.getElementById('camera-preview');
    const isCameraActive = cameraPreview && cameraPreview.style.display !== 'none' && !cameraPreview.classList.contains('hidden');
    const activeVideo = isCameraActive ? cameraPreview : mainPlayer;
    
    if (activeVideo && activeVideo.clientWidth > 0) {
        drawingCanvas.width = activeVideo.clientWidth;
        drawingCanvas.height = activeVideo.clientHeight;
    } else if (playerContainer && playerContainer.clientWidth > 0) {
        drawingCanvas.width = playerContainer.clientWidth;
        drawingCanvas.height = playerContainer.clientHeight;
    }
}

// Zajištění inline editace textu
function makeEditable(span, oldName) {
    span.contentEditable = true;
    span.style.backgroundColor = 'rgba(59, 130, 246, 0.5)'; // Modré podbarvení
    span.style.padding = '2px 4px';
    span.style.borderRadius = '4px';
    span.style.outline = 'none';
    span.focus();
    
    // Vybere text (ideálně bez koncovky, ale Safari může zlobit, tak rovnou celý text)
    const range = document.createRange();
    range.selectNodeContents(span);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    
    const stopEdit = () => {
        span.contentEditable = false;
        span.style.backgroundColor = 'transparent';
        span.style.padding = '0';
        span.removeEventListener('blur', stopEdit);
        span.removeEventListener('keydown', keyHandler);
        
        const newText = span.textContent.trim();
        if (newText && newText !== oldName) {
            window.executeRename(oldName, newText);
        } else {
            span.textContent = oldName; // Vrátíme původní název
        }
    };
    
    const keyHandler = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            span.blur(); // Vyvolá stopEdit
        } else if (e.key === 'Escape') {
            e.preventDefault();
            span.textContent = oldName;
            span.blur();
        }
    };
    
    span.addEventListener('blur', stopEdit);
    span.addEventListener('keydown', keyHandler);
}

// Rename logic
window.executeRename = async function(oldName, newName) {
    if (!newName || newName === oldName) return;
    
    // Zajistíme příponu
    const oldExt = oldName.substring(oldName.lastIndexOf('.'));
    if (!newName.endsWith(oldExt)) {
        newName += oldExt;
    }

    if (state.files.has(newName)) {
        alert('Soubor s tímto názvem již existuje!');
        // Znovu vykreslíme frontu pro smazání změn v UI
        renderQueue();
        return;
    }

    const oldFile = state.files.get(oldName);

    // Pokusíme se přejmenovat na disku, pokud máme dirHandle
    if (state.dirHandle) {
        try {
            const oldFileHandle = await state.dirHandle.getFileHandle(oldName);
            
            const opts = { mode: 'readwrite' };
            if ((await state.dirHandle.queryPermission(opts)) !== 'granted') {
                await state.dirHandle.requestPermission(opts);
            }

            if (typeof oldFileHandle.move === 'function') {
                await oldFileHandle.move(newName);
            } else {
                const newFileHandle = await state.dirHandle.getFileHandle(newName, { create: true });
                const writable = await newFileHandle.createWritable();
                await writable.write(await oldFileHandle.getFile());
                await writable.close();
                await state.dirHandle.removeEntry(oldName);
            }
        } catch (e) {
            console.error('Chyba při přejmenování na disku:', e);
        }
    }

    // Aktualizace v paměti aplikace
    const newFile = new File([oldFile], newName, { type: oldFile.type });
    if (oldFile.webkitRelativePath) {
        Object.defineProperty(newFile, 'webkitRelativePath', {
            value: oldFile.webkitRelativePath.replace(oldName, newName),
            writable: false
        });
    }

    state.files.delete(oldName);
    state.files.set(newName, newFile);

    const queueIndex = state.activeQueue.findIndex(f => f.name === oldName);
    if (queueIndex !== -1) {
        state.activeQueue[queueIndex] = newFile;
    }

    if (state.currentVideo && state.currentVideo.name === oldName) {
        state.currentVideo = newFile;
    }

    // Znovu načíst strom okamžitě z paměti
    processFiles(Array.from(state.files.values()));
    renderQueue();
};

window.state = state;
window.addToQueue = addToQueue;

})();