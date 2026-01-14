const synth = window.speechSynthesis;
const voiceSelect = document.getElementById('voiceSelect');
let words = [];
let voices = [];
let currentIndex = 0;
let isPlaying = false;
let stream = null;

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
synth.onvoiceschanged = loadVoices;
loadVoices();

// --- CORE STENO ENGINE ---
function initDisplay() {
    const text = document.getElementById('textInput').value.trim();
    words = text ? text.split(/\s+/) : [];
    document.getElementById('wordCount').innerText = words.length;
    const display = document.getElementById('displayArea');
    display.innerHTML = words.map((w, i) => `<span id="w-${i}" class="word">${w}</span>`).join(' ');
    currentIndex = 0;
}

function handlePlay() {
    if (isPlaying) {
        isPlaying = false;
        synth.cancel();
        document.getElementById('mainBtn').innerText = "RESUME";
    } else {
        isPlaying = true;
        document.getElementById('mainBtn').innerText = "PAUSE";
        speakNextWord();
    }
}

function speakNextWord() {
    if (!isPlaying || currentIndex >= words.length) {
        if (currentIndex >= words.length) reset();
        return;
    }

    const wpm = document.getElementById('wpmSlider').value;
    const msPerWord = (60 / wpm) * 1000;
    const utterance = new SpeechSynthesisUtterance(words[currentIndex]);
    
    utterance.voice = voices.find(v => v.name === voiceSelect.value);
    utterance.rate = 1.1; // Slightly faster internal rate to prevent overlap

    document.querySelectorAll('.word').forEach(el => el.classList.remove('current-word'));
    const el = document.getElementById(`w-${currentIndex}`);
    if (el) {
        el.classList.add('current-word', 'past-word');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    synth.speak(utterance);
    currentIndex++;
    setTimeout(speakNextWord, msPerWord);
}

function reset() {
    isPlaying = false;
    synth.cancel();
    currentIndex = 0;
    document.getElementById('mainBtn').innerText = "PLAY";
    initDisplay();
}

// --- SCANNER LOGIC ---
async function startScanner() {
    document.getElementById('cameraModal').style.display = 'flex';
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        document.getElementById('video').srcObject = stream;
    } catch (err) { alert("Camera Error"); closeScanner(); }
}

function closeScanner() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    document.getElementById('cameraModal').style.display = 'none';
}

async function captureImage() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const status = document.getElementById('ocrStatus');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    status.innerText = "Processing text... please wait.";
    const result = await Tesseract.recognize(canvas.toDataURL(), 'eng');
    document.getElementById('textInput').value = result.data.text.replace(/\n/g, ' ');
    initDisplay();
    closeScanner();
}

// Slider Display
document.getElementById('wpmSlider').oninput = function() {
    document.getElementById('wpmVal').innerText = this.value;
};

// Start
if (localStorage.getItem('stenoTheme') === 'night') toggleTheme();
initDisplay();