let wavesurfer;
let isPlaying = false;
let audioBuffer = null;
let audioContext = null;
let isLoading = false;

// Initialize WaveSurfer
function initWaveSurfer() {
    wavesurfer = WaveSurfer.create({
        container: '#waveform',
        waveColor: '#4a90e2',
        progressColor: '#ff0000',
        cursorColor: '#ff0000',
        cursorWidth: 2,
        height: 128,
        barWidth: 2,
        barGap: 1,
        responsive: true,
        interact: true,
    });

    // Add event listeners for wavesurfer
    wavesurfer.on('finish', function() {
        wavesurfer.play(); // Loop playback
    });

    wavesurfer.on('loading', (percent) => {
        if (percent < 100) {
            loadingIndicator.classList.remove('hidden');
            loadingIndicator.textContent = `Loading: ${percent}%`;
        } else {
            loadingIndicator.classList.add('hidden');
        }
    });

    wavesurfer.on('ready', () => {
        loadingIndicator.classList.add('hidden');
        updateTimeDisplay(wavesurfer.getCurrentTime());
    });

    wavesurfer.on('error', () => {
        loadingIndicator.textContent = 'Error loading audio';
        loadingIndicator.classList.remove('hidden');
    });

    // Add audioprocess event for continuous updates
    wavesurfer.on('audioprocess', (time) => {
        updateTimeDisplay(time);
    });

    // Add seek event for manual position changes
    wavesurfer.on('seek', (progress) => {
        updateTimeDisplay(wavesurfer.getCurrentTime());
    });
}

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    initWaveSurfer();
    setupEventListeners();
});

function setupEventListeners() {
    const dropZone = document.getElementById('dropZone');
    const playBtn = document.getElementById('playBtn');
    const exportBtn = document.getElementById('exportBtn');
    const waveformContainer = document.getElementById('waveform');
    const loadingIndicator = document.getElementById('loading');
    const filenameDisplay = document.getElementById('filename');

    // Add keyboard shortcut for play/pause
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && audioBuffer) {
            e.preventDefault(); // Prevent page scroll
            playBtn.click();
        }
    });

    // Drag and drop events
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('audio/')) {
            isLoading = true;
            loadingIndicator.classList.remove('hidden');
            loadingIndicator.textContent = 'Processing audio...';
            
            const dropText = document.querySelector('.drop-text');
            dropText.style.display = 'none';
            waveformContainer.classList.add('active');
            
            // Display filename
            filenameDisplay.textContent = file.name;
            filenameDisplay.classList.remove('hidden');
            
            wavesurfer.loadBlob(file);
            
            // Initialize audio context and buffer for export functionality
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            const arrayBuffer = await file.arrayBuffer();
            audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            isLoading = false;
            loadingIndicator.classList.add('hidden');
        }
    });

    // Playback controls
    playBtn.addEventListener('click', () => {
        if (wavesurfer.isPlaying()) {
            wavesurfer.pause();
            playBtn.textContent = 'Play';
        } else {
            wavesurfer.play();
            playBtn.textContent = 'Pause';
        }
    });

    // Export functionality
    exportBtn.addEventListener('click', async () => {
        if (!audioBuffer) return;

        const currentTime = wavesurfer.getCurrentTime();
        const duration = wavesurfer.getDuration();
        
        // Create a new AudioBuffer for the loop
        const sampleRate = audioBuffer.sampleRate;
        const startSample = Math.floor(currentTime * sampleRate);
        const endSample = Math.floor(duration * sampleRate);
        const loopLength = endSample - startSample;
        
        const newBuffer = audioContext.createBuffer(
            audioBuffer.numberOfChannels,
            loopLength,
            sampleRate
        );

        // Copy the audio data from the selected point
        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const channelData = audioBuffer.getChannelData(channel);
            const newChannelData = newBuffer.getChannelData(channel);
            
            for (let i = 0; i < loopLength; i++) {
                newChannelData[i] = channelData[startSample + i];
            }
        }

        // Convert to WAV and download
        const wavBlob = await audioBufferToWav(newBuffer);
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'audio-loop.wav';
        a.click();
        URL.revokeObjectURL(url);
    });
}

// Convert AudioBuffer to WAV format
function audioBufferToWav(buffer) {
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    let data = [];
    
    // Interleave channels
    for (let i = 0; i < buffer.length; i++) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const sample = buffer.getChannelData(channel)[i];
            const sample16 = Math.max(-1, Math.min(1, sample)) * 0x7FFF;
            data.push(sample16);
        }
    }
    
    const dataSize = data.length * 2; // 16-bit samples
    const buffer16 = new Int16Array(data);
    const buffer8 = new Uint8Array(buffer16.buffer);
    
    const wavHeader = new ArrayBuffer(44);
    const view = new DataView(wavHeader);
    
    // Write WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    const wav = new Blob([wavHeader, buffer8], { type: 'audio/wav' });
    return wav;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// Helper function to format time as MM:SS
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Update the time display
function updateTimeDisplay(time) {
    const timeDisplay = document.getElementById('currentTime');
    timeDisplay.textContent = formatTime(time);
}
