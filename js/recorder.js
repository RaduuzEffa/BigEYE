(() => {
// Recorder State
const recState = {
    stream: null,
    mediaRecorder: null,
    isRecording: false,
    recordingStartTime: null,
    timerInterval: null,
    writableStream: null,
    chunksFallback: [],
    fileHandle: null,
    wakeLock: null
};

// DOM Elements
const cameraSelect = document.getElementById('camera-select');
const btnStartRecord = document.getElementById('btn-start-record');
const btnStopRecord = document.getElementById('btn-stop-record');
const recordingStatus = document.getElementById('recording-status');
const recTimeDisplay = document.getElementById('rec-time');
const cameraPreview = document.getElementById('camera-preview');
const dropZone = document.getElementById('drop-zone');
const mainPlayer = document.getElementById('main-player');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupRecorderListeners();
    // Enumerate devices and add Screen Share option
    if (navigator.mediaDevices) {
        navigator.mediaDevices.enumerateDevices().then(devices => {
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            populateCameraSelect(videoDevices);
        }).catch(err => console.log(err));
    }
});

function populateCameraSelect(videoDevices) {
    const currentValue = cameraSelect.value;
    cameraSelect.innerHTML = '<option value="">Vyberte zdroj...</option>';
    
    // 1. Sdílení obrazovky
    const screenOption = document.createElement('option');
    screenOption.value = 'screen';
    screenOption.text = '💻 Nahrávání obrazovky (vč. zvuku)';
    cameraSelect.appendChild(screenOption);

    // 2. Fotoaparát zařízení (např. iPhone/iPad na kterém běží aplikace)
    const envOption = document.createElement('option');
    envOption.value = 'environment';
    envOption.text = '📱 Fotoaparát (Zadní/Hlavní)';
    cameraSelect.appendChild(envOption);

    const userOption = document.createElement('option');
    userOption.value = 'user';
    userOption.text = '🤳 Fotoaparát (Přední)';
    cameraSelect.appendChild(userOption);

    // 3. Připojené externí a integrované kamery
    if (videoDevices && videoDevices.length > 0) {
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.text = '--- Připojené kamery ---';
        cameraSelect.appendChild(separator);

        videoDevices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            
            let label = device.label;
            if (!label) {
                label = `Neznámá kamera ${index + 1} (Nutno povolit přístup)`;
            } else {
                if (label.toLowerCase().includes('iphone') || label.toLowerCase().includes('ipad')) {
                    label = `📱 Externí telefon (${label})`;
                } else if (label.toLowerCase().includes('facetime') || label.toLowerCase().includes('built-in') || label.toLowerCase().includes('integrovan')) {
                    label = `💻 Integrovaná kamera (${label})`;
                } else {
                    label = `📷 Externí kamera (${label})`;
                }
            }
            option.text = label;
            cameraSelect.appendChild(option);
        });
    }

    if (currentValue) {
        cameraSelect.value = currentValue;
    }
}

function setupRecorderListeners() {
    // Automatická aktualizace seznamu kamer
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
        navigator.mediaDevices.addEventListener('devicechange', async () => {
            console.log('Změna zařízení detekována...');
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            populateCameraSelect(videoDevices);
        });
    }

    const btnRefreshCameras = document.getElementById('btn-refresh-cameras');
    if (btnRefreshCameras) {
        btnRefreshCameras.addEventListener('click', async () => {
            const originalHTML = btnRefreshCameras.innerHTML;
            try {
                btnRefreshCameras.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';
                btnRefreshCameras.disabled = true;
                
                // Vyžádáme si přístup k videu i audiu k probuzení Continuity systému
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                
                // Počkáme 5 sekund, aby měl macOS dostatek času iPhone "připojit" jako video zařízení
                setTimeout(async () => {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const videoDevices = devices.filter(d => d.kind === 'videoinput');
                    populateCameraSelect(videoDevices);
                    
                    // Zastavíme stream, aby nezůstala svítit kontrolka
                    stream.getTracks().forEach(track => track.stop());
                    
                    btnRefreshCameras.innerHTML = originalHTML;
                    btnRefreshCameras.disabled = false;
                    btnRefreshCameras.style.color = 'var(--success)';
                    setTimeout(() => btnRefreshCameras.style.color = '', 2000);
                    
                    if (videoDevices.length <= 1) {
                        alert('Nalezena pouze jedna kamera. Pokud nevidíte iPhone, zkuste ho připojit kabelem nebo zkontrolovat, zda je zamknutý a v blízkosti Macu.');
                    }
                }, 5000);
                
            } catch (err) {
                console.error('Chyba přístupu ke kamerám:', err);
                btnRefreshCameras.innerHTML = originalHTML;
                btnRefreshCameras.disabled = false;
                alert('Chyba: ' + err.name + '. Povolte prosím kameru v nastavení prohlížeče (ikona zámku v adresním řádku).');
            }
        });
    }

    cameraSelect.addEventListener('change', (e) => {
        if (e.target.value) {
            startCameraPreview(e.target.value);
        }
    });

    btnStartRecord.addEventListener('click', startRecordingSequence);
    btnStopRecord.addEventListener('click', stopRecordingSequence);

    // Automatické obnovení zámku obrazovky po návratu do aplikace během nahrávání
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && recState.isRecording) {
            try {
                if ('wakeLock' in navigator) {
                    recState.wakeLock = await navigator.wakeLock.request('screen');
                    console.log('Zámek obrazovky obnoven.');
                }
            } catch (err) { console.log('Zámek obrazovky nelze obnovit:', err); }
        }
    });
}

async function startCameraPreview(deviceId) {
    if (recState.stream) {
        recState.stream.getTracks().forEach(track => track.stop());
    }

    try {
        if (deviceId === 'screen') {
            recState.stream = await navigator.mediaDevices.getDisplayMedia({
                video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: true
            });
            
            recState.stream.getVideoTracks()[0].onended = () => {
                if (recState.isRecording) stopRecordingSequence();
            };
        } else {
            // Request Physical Camera based on selection
            let constraints = { audio: true };
            if (deviceId === 'environment') {
                constraints.video = { 
                    facingMode: { ideal: "environment" },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                };
            } else if (deviceId === 'user') {
                constraints.video = { 
                    facingMode: { ideal: "user" },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                };
            } else {
                constraints.video = { 
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                };
            }
            recState.stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Auto-refresh the select list so real camera names populate once permissions are given
            navigator.mediaDevices.enumerateDevices().then(devices => {
                const videoDevices = devices.filter(d => d.kind === 'videoinput');
                populateCameraSelect(videoDevices);
            }).catch(e => console.log(e));
        }
        
        // Show preview
        if (cameraPreview) {
            cameraPreview.srcObject = recState.stream;
            cameraPreview.classList.remove('hidden');
            cameraPreview.style.display = 'block';
            cameraPreview.muted = true;
            cameraPreview.play().catch(e => console.log('Autoplay blocked:', e));
            
            if (mainPlayer) mainPlayer.style.display = 'none';
            if (dropZone) dropZone.style.display = 'none';
            if (document.getElementById('player-container')) {
                document.getElementById('player-container').classList.remove('hidden');
            }
        }
    } catch (err) {
        console.error('Chyba při spouštění náhledu:', err);
        alert('Nepodařilo se spustit zdroj. Zkuste to znovu nebo připojte iPhone kabelem.');
        cameraSelect.value = '';
    }
}

async function startRecordingSequence() {
    if (!recState.stream) {
        alert('Nejprve vyberte a zapněte kameru nebo sdílení obrazovky.');
        return;
    }

    recState.chunksFallback = [];
    recState.writableStream = null;
    recState.fileHandle = null;

    let mimeType = 'video/webm';
    let extension = '.webm';
    if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
        extension = '.mp4';
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const suggestedName = `BigEYE_Zaznam_${timestamp}${extension}`;

    // Prefer using the directory handle selected in the sidebar
    if (window.state && window.state.dirHandle) {
        try {
            recState.fileHandle = await window.state.dirHandle.getFileHandle(suggestedName, { create: true });
            recState.writableStream = await recState.fileHandle.createWritable();
        } catch (err) {
            console.error('Automatický zápis do složky selhal:', err);
        }
    }

    // Fallback to picker
    if (!recState.writableStream && 'showSaveFilePicker' in window) {
        try {
            recState.fileHandle = await window.showSaveFilePicker({
                suggestedName: suggestedName,
                types: [{
                    description: 'Video File',
                    accept: { [mimeType.split(';')[0]]: [extension] },
                }],
            });
            recState.writableStream = await recState.fileHandle.createWritable();
        } catch (err) {
            console.warn('Výběr souboru byl zrušen, přecházím na fallback do paměti:', err);
        }
    }

    if (!recState.writableStream) {
        console.log('Zápis na disk není podporován nebo povolen. Bude použito nahrávání do paměti (fallback).');
    }

    btnStartRecord.style.display = 'none';
    btnStopRecord.style.display = 'flex';
    recordingStatus.classList.remove('hidden');

    recState.isRecording = true;
    recState.recordingStartTime = Date.now();
    startTimer();

    // Zámek obrazovky - zabrání zhasnutí displeje během natáčení
    try {
        if ('wakeLock' in navigator) {
            recState.wakeLock = await navigator.wakeLock.request('screen');
            console.log('Zámek obrazovky aktivován. Displej nezhasne.');
        }
    } catch (err) { 
        console.log('Zámek obrazovky selhal:', err); 
    }

    const recorder = new MediaRecorder(recState.stream, { 
        mimeType,
        videoBitsPerSecond: 8000000 // 8 Mbps for premium quality
    });

    recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
            if (recState.writableStream) {
                try {
                    await recState.writableStream.write(e.data);
                } catch (err) {
                    console.error('Chyba při zápisu:', err);
                }
            } else {
                recState.chunksFallback.push(e.data);
            }
        }
    };

    recorder.onstop = async () => {
        if (recState.writableStream) {
            await recState.writableStream.close();
            
            // AUTOMATICALLY ADD TO QUEUE
            if (recState.fileHandle && window.addToQueue) {
                const file = await recState.fileHandle.getFile();
                window.addToQueue(file);
                console.log('Video přidáno do fronty.');
            }
        } else if (recState.chunksFallback.length > 0) {
            const blob = new Blob(recState.chunksFallback, { type: mimeType });
            const file = new File([blob], suggestedName, { type: mimeType });
            
            // AUTOMATICALLY ADD TO QUEUE (Fallback z paměti)
            if (window.addToQueue) {
                window.addToQueue(file);
                console.log('Video z paměti přidáno do fronty.');
            }
            
            // Vyvolání klasického stažení do složky "Stahování" na iOS/iPadOS Safari
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = URL.createObjectURL(blob);
            a.download = suggestedName;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(a.href);
            }, 100);
        }
        recState.isRecording = false;
        stopTimer();
    };

    recorder.start(1000); 
    recState.mediaRecorder = recorder;
}

function stopRecordingSequence() {
    if (recState.mediaRecorder && recState.mediaRecorder.state !== 'inactive') {
        recState.mediaRecorder.stop();
    }

    recState.isRecording = false;
    stopTimer();

    // Uvolnění zámku obrazovky
    if (recState.wakeLock !== null) {
        recState.wakeLock.release().catch(console.error);
        recState.wakeLock = null;
        console.log('Zámek obrazovky uvolněn.');
    }

    btnStartRecord.style.display = 'flex';
    btnStopRecord.style.display = 'none';
    recordingStatus.classList.add('hidden');
    recTimeDisplay.textContent = '00:00';
    
    // Stop tracks and clean up preview
    if (recState.stream) {
        recState.stream.getTracks().forEach(t => t.stop());
        recState.stream = null;
        cameraSelect.value = '';
        if (cameraPreview) {
            cameraPreview.classList.add('hidden');
            cameraPreview.style.display = 'none';
            cameraPreview.srcObject = null;
        }
        if (dropZone) {
            const mainPlayer = document.getElementById('main-player');
            if (mainPlayer && !mainPlayer.src) {
                dropZone.style.display = 'flex';
                dropZone.classList.remove('hidden');
            }
        }
        if (mainPlayer && mainPlayer.src) mainPlayer.style.display = 'block';
    }
}

function startTimer() {
    recState.timerInterval = setInterval(updateTimerDisplay, 1000);
}

function stopTimer() {
    clearInterval(recState.timerInterval);
}

function updateTimerDisplay() {
    const diff = Math.floor((Date.now() - recState.recordingStartTime) / 1000);
    const m = Math.floor(diff / 60).toString().padStart(2, '0');
    const s = (diff % 60).toString().padStart(2, '0');
    recTimeDisplay.textContent = `${m}:${s}`;
}

})();