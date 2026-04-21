(() => {
// Recorder State
const recState = {
    stream: null,
    mediaRecorder: null,
    isRecording: false,
    recordingStartTime: null,
    timerInterval: null,
    writableStream: null,
    chunksFallback: []
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
    
    // Add Screen Share as the primary option
    const screenOption = document.createElement('option');
    screenOption.value = 'screen';
    screenOption.text = '💻 Sdílet obrazovku (vč. interního zvuku)';
    cameraSelect.appendChild(screenOption);

    // Add physical cameras
    videoDevices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text = `📷 ${device.label || `Kamera ${cameraSelect.length}`}`;
        cameraSelect.appendChild(option);
    });

    if (currentValue) {
        cameraSelect.value = currentValue;
    }
}

function setupRecorderListeners() {
    // Automatická aktualizace seznamu kamer
    navigator.mediaDevices.addEventListener('devicechange', async () => {
        console.log('Změna zařízení detekována...');
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        populateCameraSelect(videoDevices);
    });

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
}

async function startCameraPreview(deviceId) {
    if (recState.stream) {
        recState.stream.getTracks().forEach(track => track.stop());
    }

    try {
        if (deviceId === 'screen') {
            // Request Screen with System Audio
            recState.stream = await navigator.mediaDevices.getDisplayMedia({
                video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: true // Captures system/tab audio
            });
            
            // Handle user clicking "Stop sharing" in the browser UI
            recState.stream.getVideoTracks()[0].onended = () => {
                if (recState.isRecording) stopRecordingSequence();
            };
        } else {
            // Request Physical Camera
            const constraints = {
                video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: true
            };
            recState.stream = await navigator.mediaDevices.getUserMedia(constraints);
        }
        
        // Show preview
        if (cameraPreview) {
            cameraPreview.srcObject = recState.stream;
            cameraPreview.classList.remove('hidden');
            if (mainPlayer) mainPlayer.style.display = 'none';
            if (dropZone) dropZone.style.display = 'none';
        }
    } catch (err) {
        console.error('Chyba při spouštění náhledu:', err);
        alert('Nepodařilo se spustit zdroj. Možná jste zrušili sdílení nebo nepovolili přístup.');
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

    let mimeType = 'video/webm';
    let extension = '.webm';
    
    if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
        extension = '.mp4';
    } else if (MediaRecorder.isTypeSupported('video/webm; codecs=h264')) {
        mimeType = 'video/webm; codecs=h264';
    }

    // DIRECT TO DISK STREAMING (File System Access API)
    if ('showSaveFilePicker' in window) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const fileHandle = await window.showSaveFilePicker({
                suggestedName: `BigEYE_Zaznam_${timestamp}${extension}`,
                types: [{
                    description: 'Video File',
                    accept: { [mimeType.split(';')[0]]: [extension] },
                }],
            });
            recState.writableStream = await fileHandle.createWritable();
        } catch (err) {
            console.warn('Výběr souboru byl zrušen:', err);
            return; // Cancel recording if user doesn't pick a file
        }
    } else {
        alert('Váš prohlížeč nepodporuje přímý stream na disk. Doporučujeme použít Chrome/Edge pro velké soubory.');
    }

    btnStartRecord.style.display = 'none';
    btnStopRecord.style.display = 'flex';
    recordingStatus.classList.remove('hidden');

    recState.isRecording = true;
    recState.recordingStartTime = Date.now();
    recState.timerInterval = setInterval(updateTimerDisplay, 1000);

    const recorder = new MediaRecorder(recState.stream, { mimeType: mimeType });

    recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
            if (recState.writableStream) {
                // Stream directly to hard drive (zero RAM cost!)
                try {
                    await recState.writableStream.write(e.data);
                } catch (err) {
                    console.error('Chyba při zápisu na disk:', err);
                }
            } else {
                // Fallback for Safari/Firefox
                recState.chunksFallback.push(e.data);
            }
        }
    };

    recorder.onstop = async () => {
        if (recState.writableStream) {
            try {
                await recState.writableStream.close();
                recState.writableStream = null;
                alert('Nahrávání úspěšně uloženo přímo na disk!');
            } catch (err) {
                console.error('Chyba při uzavírání souboru:', err);
            }
        } else if (recState.chunksFallback.length > 0) {
            // Fallback download
            const blob = new Blob(recState.chunksFallback, { type: 'video/webm' });
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `BigEYE_Zaznam_${timestamp}.webm`;
            a.click();
            URL.revokeObjectURL(a.href);
        }
    };

    // Request data every 2 seconds to write chunks progressively
    recorder.start(2000); 
    recState.mediaRecorder = recorder;
}

function stopRecordingSequence() {
    recState.isRecording = false;
    clearInterval(recState.timerInterval);

    if (recState.mediaRecorder && recState.mediaRecorder.state !== 'inactive') {
        recState.mediaRecorder.stop();
    }

    btnStartRecord.style.display = 'flex';
    btnStopRecord.style.display = 'none';
    recordingStatus.classList.add('hidden');
    recTimeDisplay.textContent = '00:00';
    
    // Stop tracks
    if (recState.stream) {
        recState.stream.getTracks().forEach(t => t.stop());
        recState.stream = null;
        cameraSelect.value = '';
        if (cameraPreview) {
            cameraPreview.classList.add('hidden');
            cameraPreview.srcObject = null;
        }
        if (dropZone && !mainPlayer.src) dropZone.style.display = 'flex';
        if (mainPlayer && mainPlayer.src) mainPlayer.style.display = 'block';
    }
}

function updateTimerDisplay() {
    const diff = Math.floor((Date.now() - recState.recordingStartTime) / 1000);
    const m = Math.floor(diff / 60).toString().padStart(2, '0');
    const s = (diff % 60).toString().padStart(2, '0');
    recTimeDisplay.textContent = `${m}:${s}`;
}

})();