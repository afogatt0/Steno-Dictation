const synth = window.speechSynthesis;
const voiceSelect = document.getElementById('voiceSelect');
let words = [];
let voices = [];
let currentIndex = 0;
let isPlaying = false;
let stream = null;
let timer = null;
let wakeLock = null;

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

// --- SPEED CONTROL ---
function adjustSpeed(amount) {
    const slider = document.getElementById('wpmSlider');
    const display = document.getElementById('wpmVal');
    let currentVal = parseInt(slider.value);
    let newVal = currentVal + amount;
    if (newVal > 250) newVal = 250;
    if (newVal < 15) newVal = 15;
    slider.value = newVal;
    display.innerText = newVal;
}

// --- CORE STENO ENGINE ---
function initDisplay() {
    const text = document.getElementById('textInput').value.trim();
    words = text ? text.split(/\s+/) : [];
    document.getElementById('wordCount').innerText = words.length;
    const display = document.getElementById('displayArea');
    
    display.innerHTML = words.map((w, i) => 
        `<span id="w-${i}" class="word" onclick="setIndex(${i})">${w}</span>`
    ).join(' ');
    
    if(currentIndex >= words.length) currentIndex = 0;
}

function setIndex(i) {
    if(isPlaying) return; 
    document.querySelectorAll('.word').forEach(el => el.classList.remove('current-word'));
    currentIndex = i;
    const el = document.getElementById(`w-${i}`);
    if(el) {
        el.classList.add('current-word');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

async function handlePlay() {
    if (isPlaying) {
        isPlaying = false;
        synth.cancel();
        clearTimeout(timer);
        document.getElementById('mainBtn').innerText = "RESUME";
        if (wakeLock !== null) {
            wakeLock.release().then(() => wakeLock = null);
        }
    } else {
        isPlaying = true;
        document.getElementById('mainBtn').innerText = "PAUSE";
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
    const wpm = document.getElementById('wpmSlider').value;
    const msPerWord = (60 / wpm) * 1000;
    
    synth.cancel(); 

    const utterance = new SpeechSynthesisUtterance(words[currentIndex]);
    utterance.voice = voices.find(v => v.name === voiceSelect.value);
    if (wpm > 130) utterance.rate = 1.5;
    else if (wpm > 90) utterance.rate = 1.2;
    else utterance.rate = 1.0;

    document.querySelectorAll('.word').forEach(el => el.classList.remove('current-word'));
    const el = document.getElementById(`w-${currentIndex}`);
    if (el) {
        el.classList.add('current-word', 'past-word');
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
    synth.speak(utterance);
    currentIndex++;
    timer = setTimeout(speakNextWord, msPerWord);
}

function reset() {
    isPlaying = false;
    synth.cancel();
    clearTimeout(timer);
    currentIndex = 0;
    document.getElementById('mainBtn').innerText = "PLAY";
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
    ctx.drawImage(video, 0, 0);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
        let gray = 0.2126 * d[i] + 0.7152 * d[i+1] + 0.0722 * d[i+2];
        let val = (gray > 100) ? 255 : 0; 
        d[i] = d[i+1] = d[i+2] = val;
    }
    ctx.putImageData(imgData, 0, 0);

    status.innerText = "Processing text... please wait.";
    spinner.style.display = "block";
    try {
        const result = await Tesseract.recognize(canvas.toDataURL(), 'eng');
        const cleanText = result.data.text.replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ");
        document.getElementById('textInput').value = cleanText;
        initDisplay();
        saveText();
    } catch (e) {
        alert("OCR Failed: " + e.message);
    }
    closeScanner();
}

document.getElementById('wpmSlider').oninput = function() {
    document.getElementById('wpmVal').innerText = this.value;
};

if (localStorage.getItem('stenoTheme') === 'night') toggleTheme();
loadSavedText();
initDisplay();