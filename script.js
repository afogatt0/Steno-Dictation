const synth = window.speechSynthesis;
const voiceSelect = document.getElementById('voiceSelect');
let words = [];
let voices = [];
let currentIndex = 0;
let isPlaying = false;
let stream = null;
let timer = null; // To manage the recursion loop
let wakeLock = null; // Prevent screen sleep on mobile

// --- THEME & SETUP ---
function toggleTheme() {
    document.body.classList.toggle('night-theme');
    localStorage.setItem('stenoTheme', document.body.classList.contains('night-theme') ? 'night' : 'light');
}

function loadVoices() {
    voices = synth.getVoices();
    voiceSelect.innerHTML = voices
        .filter(v => v.lang.includes('en'))
        .map(v => `<option value="${v.name}">${v.name}</option>`).join('');
}
// Voice loading requires a little delay/event listener on some browsers
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
}
loadVoices();

// --- PERSISTENCE ---
function saveText() {
    localStorage.setItem('stenoText', document.getElementById('textInput').value);
}
function loadSavedText() {
    const saved = localStorage.getItem('stenoText');
    if (saved) {
        document.getElementById('textInput').value = saved;
    }
}

// --- CORE STENO ENGINE ---
function initDisplay() {
    const text = document.getElementById('textInput').value.trim();
    // Split by spaces but preserve structure roughly
    words = text ? text.split(/\s+/) : [];
    document.getElementById('wordCount').innerText = words.length;
    const display = document.getElementById('displayArea');
    
    // Create span elements with onClick for "Click-to-Jump"
    display.innerHTML = words.map((w, i) => 
        `<span id="w-${i}" class="word" onclick="setIndex(${i})">${w}</span>`
    ).join(' ');
    
    // Don't reset index if we are just editing text, unless index is out of bounds
    if(currentIndex >= words.length) currentIndex = 0;
}

// Click-to-Jump Logic
function setIndex(i) {
    if(isPlaying) return; // Prevent glitches during playback
    
    // Clear old visual cues
    document.querySelectorAll('.word').forEach(el => el.classList.remove('current-word'));
    
    currentIndex = i;
    
    // Visual feedback
    const el = document.getElementById(`w-${i}`);
    if(el) {
        el.classList.add('current-word');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

async function handlePlay() {
    if (isPlaying) {
        // PAUSE/STOP
        isPlaying = false;
        synth.cancel();
        clearTimeout(timer);
        document.getElementById('mainBtn').innerText = "RESUME";
        if (wakeLock !== null) {
            wakeLock.release().then(() => wakeLock = null);
        }
    } else {
        // PLAY
        isPlaying = true;
        document.getElementById('mainBtn').innerText = "PAUSE";
        
        // Request Wake Lock (Keep screen on)
        if ('wakeLock' in navigator) {
            try { wakeLock = await navigator.wakeLock.request('screen'); } 
            catch (err) { console.log(err); }
        }
        
        speakNextWord();
    }
}

function speakNextWord() {
    if (!isPlaying) return;

    if (currentIndex >= words.length) {
        reset();
        return;
    }

    // 1. Calculate Timing
    const wpm = document.getElementById('wpmSlider').value;
    const msPerWord = (60 / wpm) * 1000;

    // 2. HARD SYNC: Cancel any pending speech to force rhythm
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(words[currentIndex]);
    utterance.voice = voices.find(v => v.name === voiceSelect.value);
    
    // 3. Dynamic Speed Adjustment for smoother flow at high speeds
    if (wpm > 130) utterance.rate = 1.5;
    else if (wpm > 90) utterance.rate = 1.2;
    else utterance.rate = 1.0;

    // 4. UI Updates
    document.querySelectorAll('.word').forEach(el => el.classList.remove('current-word'));
    const el = document.getElementById(`w-${currentIndex}`);
    if (el) {
        el.classList.add('current-word', 'past-word');
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }

    // 5. Speak and Schedule Next
    synth.speak(utterance);
    currentIndex++;
    
    // Use recursive setTimeout for precise interval control
    timer = setTimeout(speakNextWord, msPerWord);
}

function reset() {
    isPlaying = false;
    synth.cancel();
    clearTimeout(timer);
    currentIndex = 0;
    document.getElementById('mainBtn').innerText = "PLAY";
    
    // Release Wake Lock
    if (wakeLock !== null) {
        wakeLock.release().then(() => wakeLock = null);
    }
    
    initDisplay();
}

// --- SCANNER LOGIC ---
async function startScanner() {
    document.getElementById('cameraModal').style.display = 'flex';
    document.getElementById('ocrStatus').innerText = "Position text in view";
    document.getElementById('loadingSpinner').style.display = "none";
    
    try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
        });
        document.getElementById('video').srcObject = stream;
    } catch (err) { 
        alert("Camera access denied or unavailable."); 
        closeScanner(); 
    }
}

function closeScanner() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    document.getElementById('cameraModal').style.display = 'none';
}

async function captureImage() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const status = document.getElementById('ocrStatus');
    const spinner = document.getElementById('loadingSpinner');
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw raw image
    ctx.drawImage(video, 0, 0);

    // --- IMAGE PRE-PROCESSING (Binarization) ---
    // This improves Tesseract accuracy significantly
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
        // Grayscale
        let gray = 0.2126 * d[i] + 0.7152 * d[i+1] + 0.0722 * d[i+2];
        // Thresholding (Contrast)
        let val = (gray > 100) ? 255 : 0; 
        d[i] = d[i+1] = d[i+2] = val;
    }
    ctx.putImageData(imgData, 0, 0);
    // -------------------------------------------

    // UI Feedback
    status.innerText = "Processing text... please wait.";
    spinner.style.display = "block";
    
    try {
        const result = await Tesseract.recognize(canvas.toDataURL(), 'eng');
        // Clean text: replace newlines with spaces, remove excess whitespace
        const cleanText = result.data.text.replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ");
        
        document.getElementById('textInput').value = cleanText;
        initDisplay();
        saveText();
    } catch (e) {
        alert("OCR Failed: " + e.message);
    }
    
    closeScanner();
}

// Slider Display
document.getElementById('wpmSlider').oninput = function() {
    document.getElementById('wpmVal').innerText = this.value;
};

// Initialization
if (localStorage.getItem('stenoTheme') === 'night') toggleTheme();
loadSavedText();
initDisplay();