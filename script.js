/**
 * GYMPRO ELITE V10.9 - SMART MEMORY & FLEXIBLE FLOW
 */

// --- GLOBAL STATE ---
let state = {
    week: 1, type: '', rm: 100, exIdx: 0, setIdx: 0, 
    log: [], currentEx: null, currentExName: '',
    historyStack: ['ui-week'],
    timerInterval: null, seconds: 0, startTime: null,
    isArmPhase: false, isFreestyle: false, isExtraPhase: false, isInterruption: false,
    currentMuscle: '',
    completedExInSession: [],
    workoutStartTime: null, workoutDurationMins: 0,
    lastLoggedSet: null,
    // New State Variables for Flexible Arms
    firstArmGroup: null, 
    secondArmGroup: null
};

let audioContext;
let wakeLock = null;

// --- LOCAL STORAGE MANAGER (New Feature) ---
const StorageManager = {
    KEY_WEIGHTS: 'gympro_weights',
    KEY_RM: 'gympro_rm',
    KEY_ARCHIVE: 'gympro_archive',

    getData(key) {
        try { return JSON.parse(localStorage.getItem(key)) || {}; } 
        catch { return {}; }
    },

    saveData(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    },

    // Smart Weight Logic
    getLastWeight(exName) {
        const data = this.getData(this.KEY_WEIGHTS);
        return data[exName] || null;
    },

    saveWeight(exName, weight) {
        const data = this.getData(this.KEY_WEIGHTS);
        data[exName] = weight;
        this.saveData(this.KEY_WEIGHTS, data);
    },

    // Smart RM Logic
    getLastRM(exName) {
        const data = this.getData(this.KEY_RM);
        return data[exName] || null;
    },

    saveRM(exName, rmVal) {
        const data = this.getData(this.KEY_RM);
        data[exName] = rmVal;
        this.saveData(this.KEY_RM, data);
    },

    // Archive Logic
    saveToArchive(workoutObj) {
        let history = JSON.parse(localStorage.getItem(this.KEY_ARCHIVE)) || [];
        history.unshift(workoutObj);
        localStorage.setItem(this.KEY_ARCHIVE, JSON.stringify(history));
    },

    getArchive() {
        return JSON.parse(localStorage.getItem(this.KEY_ARCHIVE)) || [];
    },
    
    deleteFromArchive(timestamp) {
        let history = this.getArchive();
        history = history.filter(h => h.timestamp !== timestamp);
        localStorage.setItem(this.KEY_ARCHIVE, JSON.stringify(history));
    }
};

// --- DATABASE ---
const unilateralExercises = ["Dumbbell Peck Fly", "Lateral Raises", "Single Leg Curl", "Dumbbell Bicep Curls", "Cable Fly", "Concentration Curls"];

const exerciseDatabase = [
    { name: "Overhead Press (Main)", muscles: ["כתפיים"], isCalc: true, baseRM: 77.5, rmRange: [65, 90], manualRange: {base: 50, min: 40, max: 80, step: 2.5} },
    { name: "Lateral Raises", muscles: ["כתפיים"], sets: [{w: 12.5, r: 13}, {w: 12.5, r: 13}, {w: 12.5, r: 11}], step: 0.5 },
    { name: "Weighted Pull Ups", muscles: ["גב"], sets: [{w: 0, r: 8}, {w: 0, r: 8}, {w: 0, r: 8}], step: 5, minW: 0, maxW: 40, isBW: true },
    { name: "Face Pulls", muscles: ["כתפיים"], sets: [{w: 40, r: 13}, {w: 40, r: 13}, {w: 40, r: 15}], step: 2.5 },
    { name: "Barbell Shrugs", muscles: ["כתפיים"], sets: [{w: 140, r: 11}, {w: 140, r: 11}, {w: 140, r: 11}], step: 5 },
    { name: "Bench Press (Main)", muscles: ["חזה"], isCalc: true, baseRM: 122.5, rmRange: [110, 160], manualRange: {base: 85, min: 60, max: 140, step: 2.5} },
    { name: "Incline Bench Press", muscles: ["חזה"], sets: [{w: 65, r: 9}, {w: 65, r: 9}, {w: 65, r: 9}], step: 2.5 },
    { name: "Dumbbell Peck Fly", muscles: ["חזה"], sets: [{w: 14, r: 11}, {w: 14, r: 11}, {w: 14, r: 11}], step: 2 },
    { name: "Machine Peck Fly", muscles: ["חזה"], sets: [{w: 45, r: 11}, {w: 45, r: 11}, {w: 45, r: 11}], step: 1 },
    { name: "Cable Fly", muscles: ["חזה"], sets: [{w: 12.5, r: 11}, {w: 12.5, r: 11}, {w: 12.5, r: 11}], step: 2.5 },
    { name: "Leg Press", muscles: ["רגליים"], sets: [{w: 280, r: 8}, {w: 300, r: 8}, {w: 300, r: 7}], step: 5 },
    { name: "Squat", muscles: ["רגליים"], sets: [{w: 100, r: 8}, {w: 100, r: 8}, {w: 100, r: 8}], step: 2.5, minW: 60, maxW: 180 },
    { name: "Deadlift", muscles: ["רגליים"], sets: [{w: 100, r: 5}, {w: 100, r: 5}, {w: 100, r: 5}], step: 2.5, minW: 60, maxW: 180 },
    { name: "Romanian Deadlift", muscles: ["רגליים"], sets: [{w: 100, r: 8}, {w: 100, r: 8}, {w: 100, r: 8}], step: 2.5, minW: 60, maxW: 180 },
    { name: "Single Leg Curl", muscles: ["רגליים"], sets: [{w: 25, r: 8}, {w: 30, r: 6}, {w: 25, r: 8}], step: 2.5 },
    { name: "Lying Leg Curl (Double)", muscles: ["רגליים"], sets: [{w: 50, r: 8}, {w: 60, r: 6}, {w: 50, r: 8}], step: 5 },
    { name: "Seated Leg Curl", muscles: ["רגליים"], sets: [{w: 50, r: 10}, {w: 50, r: 10}, {w: 50, r: 10}], step: 5 }, 
    { name: "Seated Calf Raise", muscles: ["רגליים"], sets: [{w: 70, r: 10}, {w: 70, r: 10}, {w: 70, r: 12}], step: 5 },
    { name: "Standing Calf Raise", muscles: ["רגליים"], sets: [{w: 110, r: 10}, {w: 110, r: 10}, {w: 110, r: 12}], step: 10 },
    { name: "Lat Pulldown", muscles: ["גב"], sets: [{w: 75, r: 10}, {w: 75, r: 10}, {w: 75, r: 11}], step: 2.5 },
    { name: "Pull Ups", muscles: ["גב"], isBW: true, sets: [{w: 0, r: 8}, {w: 0, r: 8}, {w: 0, r: 8}] },
    { name: "Cable Row", muscles: ["גב"], sets: [{w: 65, r: 10}, {w: 65, r: 10}, {w: 65, r: 12}], step: 2.5 },
    { name: "Machine Row", muscles: ["גב"], sets: [{w: 50, r: 10}, {w: 50, r: 10}, {w: 50, r: 12}], step: 5 },
    { name: "Straight Arm Pulldown", muscles: ["גב"], sets: [{w: 30, r: 10}, {w: 30, r: 12}, {w: 30, r: 12}], step: 2.5 },
    { name: "Back Extension", muscles: ["גב"], sets: [{w: 0, r: 12}, {w: 0, r: 12}, {w: 0, r: 12}], step: 5, minW: 0, maxW: 50, isBW: true }
];

const armExercises = {
    biceps: [
        { name: "Dumbbell Bicep Curls", sets: [{w: 12, r: 8}], step: 0.5 },
        { name: "Barbell Bicep Curls", sets: [{w: 25, r: 8}], step: 1 },
        { name: "Concentration Curls", sets: [{w: 10, r: 10}], step: 0.5 }
    ],
    triceps: [
        { name: "Triceps Pushdown", sets: [{w: 35, r: 8}], step: 2.5 },
        { name: "Lying Triceps Extension", sets: [{w: 25, r: 8}], step: 2.5 }
    ]
};

const workouts = {
    'A': ["Overhead Press (Main)", "Barbell Shrugs", "Lateral Raises", "Weighted Pull Ups", "Face Pulls", "Incline Bench Press"],
    'B': ["Leg Press", "Single Leg Curl", "Lat Pulldown", "Cable Row", "Seated Calf Raise", "Straight Arm Pulldown"],
    'C': ["Bench Press (Main)", "Incline Bench Press", "Dumbbell Peck Fly", "Lateral Raises", "Face Pulls"]
};

const variationMap = {
    'B': {
        1: ["Single Leg Curl", "Lying Leg Curl (Double)", "Seated Leg Curl"],
        3: ["Cable Row", "Machine Row"],
        4: ["Seated Calf Raise", "Standing Calf Raise"]
    },
    'C': {
        2: ["Dumbbell Peck Fly", "Machine Peck Fly", "Cable Fly"]
    }
};

const workoutNames = {
    'A': "אימון A (כתפיים-חזה-גב)",
    'B': "אימון B (רגליים-גב)",
    'C': "אימון C (חזה-כתפיים)",
    'Freestyle': "Freestyle"
};

// --- CORE SYSTEMS ---

function haptic(type = 'light') {
    if (!("vibrate" in navigator)) return;
    try {
        if (type === 'light') navigator.vibrate(20); 
        else if (type === 'medium') navigator.vibrate(40);
        else if (type === 'success') navigator.vibrate([50, 50, 50]);
        else if (type === 'warning') navigator.vibrate([30, 30]);
    } catch(e) {}
}

function playBeep(times = 1) {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    for (let i = 0; i < times; i++) {
        setTimeout(() => {
            const o = audioContext.createOscillator();
            const g = audioContext.createGain();
            o.type = 'sine'; o.frequency.setValueAtTime(880, audioContext.currentTime);
            g.gain.setValueAtTime(0.3, audioContext.currentTime);
            g.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
            o.connect(g); g.connect(audioContext.destination);
            o.start(); o.stop(audioContext.currentTime + 0.4);
        }, i * 500);
    }
}

async function initAudio() {
    haptic('medium');
    playBeep(1);
    const btn = document.getElementById('audio-init-btn');
    btn.innerHTML = `<div class="card-icon">✅</div><div class="card-text">מצב אימון פעיל</div>`;
    btn.style.background = "var(--success-gradient)";
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
}

function navigate(id) {
    haptic('light');
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    
    if (id !== 'ui-main') stopRestTimer();
    if (state.historyStack[state.historyStack.length - 1] !== id) state.historyStack.push(id);
    
    document.getElementById('global-back').style.visibility = (id === 'ui-week') ? 'hidden' : 'visible';
}

function handleBackClick() {
    haptic('warning');
    if (state.historyStack.length <= 1) return;

    const currentScreen = state.historyStack[state.historyStack.length - 1];

    if (currentScreen === 'ui-extra') {
        state.historyStack.pop(); 
        state.log.pop();
        state.setIdx--;
        state.lastLoggedSet = state.log.length > 0 ? state.log[state.log.length - 1] : null;
        
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('ui-main').classList.add('active');
        
        if (state.historyStack[state.historyStack.length - 1] !== 'ui-main') {
            state.historyStack.push('ui-main');
        }
        
        initPickers();
        return;
    }

    if (currentScreen === 'ui-main' && state.setIdx > 0) {
        state.log.pop();
        state.setIdx--;
        state.lastLoggedSet = state.log.length > 0 ? state.log[state.log.length - 1] : null;
        initPickers();
        return;
    }

    // New: Handle back from archive
    if (currentScreen === 'ui-archive') {
        state.historyStack.pop();
        navigate('ui-week');
        return;
    }

    state.historyStack.pop();
    const prevScreen = state.historyStack[state.historyStack.length - 1];

    if (prevScreen === 'ui-confirm' && !state.isFreestyle && !state.isExtraPhase && !state.isInterruption) {
        if (state.historyStack[state.historyStack.length - 1] === 'ui-extra') {
             if (state.exIdx > 0) state.exIdx--;
        }
    }

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(prevScreen).classList.add('active');
    document.getElementById('global-back').style.visibility = (prevScreen === 'ui-week') ? 'hidden' : 'visible';
}

// --- WORKOUT FLOW ---

function selectWeek(w) { state.week = w; navigate('ui-workout-type'); }

function selectWorkout(t) {
    state.type = t; state.exIdx = 0; state.log = []; 
    state.completedExInSession = []; state.isArmPhase = false; state.isFreestyle = false; state.isExtraPhase = false; state.isInterruption = false;
    state.workoutStartTime = Date.now();
    showConfirmScreen();
}

function startFreestyle() {
    state.type = 'Freestyle'; state.log = []; state.completedExInSession = [];
    state.isArmPhase = false; state.isFreestyle = true; state.isExtraPhase = false; state.isInterruption = false;
    state.workoutStartTime = Date.now();
    
    document.getElementById('btn-resume-flow').style.display = 'none';
    document.getElementById('btn-finish-extra').style.display = 'none';
    
    navigate('ui-muscle-select');
}

function showExerciseList(muscle) {
    state.currentMuscle = muscle;
    const options = document.getElementById('variation-options');
    options.innerHTML = "";
    document.getElementById('variation-title').innerText = `תרגילי ${muscle}`;
    
    const filtered = exerciseDatabase.filter(ex => ex.muscles.includes(muscle) && !state.completedExInSession.includes(ex.name));
    
    filtered.forEach(ex => {
        const btn = document.createElement('button');
        btn.className = "menu-card";
        btn.innerHTML = `<span>${ex.name}</span><div class="arrow">➔</div>`;
        btn.onclick = () => {
            const dbRef = exerciseDatabase.find(d => d.name === ex.name);
            state.currentEx = JSON.parse(JSON.stringify(dbRef));
            state.currentExName = ex.name;
            if (state.currentEx.isCalc) {
                state.currentEx.sets = Array(3).fill({w: state.currentEx.manualRange.base, r: 8});
                state.currentEx.step = state.currentEx.manualRange.step;
            }
            startRecording();
        };
        options.appendChild(btn);
    });
    navigate('ui-variation');
}

function showConfirmScreen(forceExName = null) {
    if (forceExName) {
        const exData = exerciseDatabase.find(e => e.name === forceExName);
        state.currentEx = JSON.parse(JSON.stringify(exData));
        state.currentExName = exData.name;
        document.getElementById('confirm-ex-name').innerText = exData.name;
        
        const intBtn = document.getElementById('btn-interruption');
        if (intBtn) intBtn.style.display = (state.exIdx > 0) ? 'block' : 'none';
        
        navigate('ui-confirm');
        return;
    }

    if (variationMap[state.type] && variationMap[state.type][state.exIdx]) {
        showVariationSelect();
    } else {
        const exName = workouts[state.type][state.exIdx];
        const exData = exerciseDatabase.find(e => e.name === exName);
        state.currentEx = JSON.parse(JSON.stringify(exData));
        state.currentExName = exData.name;
        document.getElementById('confirm-ex-name').innerText = exData.name;
        
        const intBtn = document.getElementById('btn-interruption');
        if (intBtn) intBtn.style.display = (state.exIdx > 0) ? 'block' : 'none';

        navigate('ui-confirm');
    }
}

function showVariationSelect() {
    const options = document.getElementById('variation-options');
    options.innerHTML = "";
    document.getElementById('variation-title').innerText = "בחר וריאציה";
    
    const possibleVariations = variationMap[state.type][state.exIdx];
    const available = possibleVariations.filter(name => !state.completedExInSession.includes(name));

    available.forEach(name => {
        const btn = document.createElement('button');
        btn.className = "menu-card";
        btn.innerHTML = `<span>${name}</span><div class="arrow">➔</div>`;
        btn.onclick = () => {
             showConfirmScreen(name);
        };
        options.appendChild(btn);
    });
    navigate('ui-variation');
}

function confirmExercise(doEx) {
    if (!doEx) { 
        state.log.push({ skip: true, exName: state.currentExName }); 
        state.exIdx++; 
        checkFlow(); 
        return; 
    }
    if (state.currentEx.isCalc) setupCalculatedEx();
    else startRecording();
}

function setupCalculatedEx() {
    document.getElementById('rm-title').innerText = `${state.currentExName} 1RM`;
    
    // SMART MEMORY: Load last RM if exists
    const lastRM = StorageManager.getLastRM(state.currentExName);
    const baseRMToUse = lastRM ? lastRM : state.currentEx.baseRM;

    const p = document.getElementById('rm-picker'); p.innerHTML = "";
    
    // Create range around the base/last RM
    const startRange = Math.max(20, Math.floor(baseRMToUse - 30));
    const endRange = Math.ceil(baseRMToUse + 40);

    for(let i = startRange; i <= endRange; i += 2.5) {
        let o = new Option(i + " kg", i); 
        if(i === baseRMToUse) o.selected = true; 
        p.add(o);
    }
    navigate('ui-1rm');
}

function save1RM() {
    state.rm = parseFloat(document.getElementById('rm-picker').value);
    
    // SMART MEMORY: Save new RM
    StorageManager.saveRM(state.currentExName, state.rm);

    const p = { 1: [0.65, 0.75, 0.85, 0.75, 0.65], 2: [0.70, 0.80, 0.90, 0.80, 0.70, 0.70], 3: [0.75, 0.85, 0.95, 0.85, 0.75, 0.75] };
    const reps = state.week === 1 ? [5, 5, 5, 8, 10] : (state.week === 2 ? [3, 3, 3, 8, 10, 10] : [5, 3, 1, 8, 10, 10]);
    state.currentEx.sets = p[state.week].map((pct, i) => ({ w: Math.round((state.rm * pct) / 2.5) * 2.5, r: reps[i] || 10 }));
    startRecording();
}

function startRecording() { state.setIdx = 0; state.lastLoggedSet = null; navigate('ui-main'); initPickers(); }

function initPickers() {
    const target = state.currentEx.sets[state.setIdx];
    document.getElementById('ex-display-name').innerText = state.currentExName;
    document.getElementById('set-counter').innerText = `SET ${state.setIdx + 1}/${state.currentEx.sets.length}`;
    
    const hist = document.getElementById('last-set-info');
    if (state.lastLoggedSet) {
        hist.innerText = `סט אחרון: ${state.lastLoggedSet.w}kg x ${state.lastLoggedSet.r} (RIR ${state.lastLoggedSet.rir})`;
        hist.style.display = 'block';
    } else hist.style.display = 'none';

    document.getElementById('unilateral-note').style.display = unilateralExercises.some(u => state.currentExName.includes(u)) ? 'block' : 'none';
    
    const timerArea = document.getElementById('timer-area');
    if (state.setIdx > 0) { 
        timerArea.style.visibility = 'visible'; 
        resetAndStartTimer(); 
    } else { 
        timerArea.style.visibility = 'hidden'; 
        stopRestTimer(); 
    }

    const wPick = document.getElementById('weight-picker'); wPick.innerHTML = "";
    const step = state.currentEx.step || 2.5;
    
    // SMART MEMORY: Load last weight logic
    const savedWeight = StorageManager.getLastWeight(state.currentExName);
    
    // Logic: If it's the first set, try to use saved weight. If not, use last set's weight or target.
    let defaultW;
    if (state.setIdx === 0 && savedWeight) {
        defaultW = savedWeight;
    } else if (state.lastLoggedSet) {
        defaultW = state.lastLoggedSet.w;
    } else {
        defaultW = target ? target.w : 0;
    }

    const minW = Math.max(0, defaultW - 40);
    const maxW = defaultW + 50;
    
    for(let i = minW; i <= maxW; i = parseFloat((i + step).toFixed(2))) {
        let o = new Option(i + " kg", i); if(i === defaultW) o.selected = true; wPick.add(o);
    }
    
    const rPick = document.getElementById('reps-picker'); rPick.innerHTML = "";
    const currentR = target ? target.r : (state.lastLoggedSet ? state.lastLoggedSet.r : 8);
    for(let i = 1; i <= 30; i++) { let o = new Option(i, i); if(i === currentR) o.selected = true; rPick.add(o); }
    
    const rirPick = document.getElementById('rir-picker'); rirPick.innerHTML = "";
    [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5].forEach(v => {
        let o = new Option(v === 0 ? "Fail" : v, v); if(v === 2) o.selected = true; rirPick.add(o);
    });
}

function resetAndStartTimer() {
    stopRestTimer();
    state.seconds = 0;
    state.startTime = Date.now();
    const target = (state.exIdx === 0 && !state.isArmPhase && !state.isFreestyle && !state.isExtraPhase && !state.isInterruption) ? 120 : 90;

    const circle = document.getElementById('timer-progress');
    const text = document.getElementById('rest-timer');
    
    text.innerText = "00:00";
    circle.style.strokeDashoffset = 283;

    state.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        state.seconds = elapsed;
        const mins = Math.floor(state.seconds / 60).toString().padStart(2, '0');
        const secs = (state.seconds % 60).toString().padStart(2, '0');
        text.innerText = `${mins}:${secs}`;
        const progress = Math.min(state.seconds / target, 1);
        circle.style.strokeDashoffset = 283 - (progress * 283);
        if (state.seconds === target) playBeep(2);
    }, 100); 
}

function stopRestTimer() { 
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
}

function nextStep() {
    haptic('light');
    const wVal = parseFloat(document.getElementById('weight-picker').value);
    const entry = { exName: state.currentExName, w: wVal, r: parseInt(document.getElementById('reps-picker').value), rir: document.getElementById('rir-picker').value };
    
    // SMART MEMORY: Save weight used
    StorageManager.saveWeight(state.currentExName, wVal);

    state.log.push(entry); state.lastLoggedSet = entry;
    if (state.setIdx < state.currentEx.sets.length - 1) { state.setIdx++; initPickers(); } 
    else { haptic('medium'); navigate('ui-extra'); }
}

function handleExtra(isBonus) {
    if(isBonus) { 
        state.setIdx++; 
        state.currentEx.sets.push({...state.currentEx.sets[state.setIdx-1]}); 
        initPickers(); 
        navigate('ui-main'); 
    } else {
        state.completedExInSession.push(state.currentExName);
        
        if (state.isInterruption) {
            state.isInterruption = false;
            navigate('ui-confirm');
        } else if (state.isExtraPhase) {
            navigate('ui-ask-extra');
        } else if (state.isArmPhase) {
            showArmSelection();
        } else if (state.isFreestyle) {
            showExerciseList(state.currentMuscle);
        } else { 
            state.exIdx++; 
            checkFlow(); 
        }
    }
}

function checkFlow() {
    if (state.exIdx < workouts[state.type].length) showConfirmScreen();
    else navigate('ui-ask-extra');
}

function interruptWorkout() {
    state.isInterruption = true;
    document.getElementById('btn-resume-flow').style.display = 'flex';
    document.getElementById('btn-finish-extra').style.display = 'none';
    navigate('ui-muscle-select');
}

function resumeWorkout() {
    state.isInterruption = false;
    navigate('ui-confirm');
}

function startExtraPhase() {
    state.isExtraPhase = true;
    document.getElementById('btn-resume-flow').style.display = 'none';
    document.getElementById('btn-finish-extra').style.display = 'block';
    navigate('ui-muscle-select');
}

function finishExtraPhase() { navigate('ui-ask-arms'); }

// --- MODIFIED: FLEXIBLE ARMS FLOW ---
function startArmWorkout() { 
    state.isArmPhase = true; 
    
    // Instead of auto-selecting biceps, we ask user
    document.getElementById('arm-selection-title').innerText = "מה להתחיל?";
    const opts = document.getElementById('arm-options');
    opts.innerHTML = "";
    
    // Choice A: Biceps
    const btnBi = document.createElement('button');
    btnBi.className = "menu-card";
    btnBi.innerHTML = `<span>יד קדמית (Biceps)</span><div class="arrow">➔</div>`;
    btnBi.onclick = () => {
        state.armGroup = 'biceps';
        state.firstArmGroup = 'biceps';
        state.secondArmGroup = 'triceps';
        showArmSelection();
    };
    
    // Choice B: Triceps
    const btnTri = document.createElement('button');
    btnTri.className = "menu-card";
    btnTri.innerHTML = `<span>יד אחורית (Triceps)</span><div class="arrow">➔</div>`;
    btnTri.onclick = () => {
        state.armGroup = 'triceps';
        state.firstArmGroup = 'triceps';
        state.secondArmGroup = 'biceps';
        showArmSelection();
    };

    opts.appendChild(btnBi);
    opts.appendChild(btnTri);
    
    // Hide skip button during this selection
    document.getElementById('btn-skip-arm-group').style.display = 'none';
    
    navigate('ui-arm-selection');
}

function showArmSelection() {
    const list = armExercises[state.armGroup];
    const remaining = list.filter(ex => !state.completedExInSession.includes(ex.name));
    
    // If no exercises left in current group, switch to next group or finish
    if (remaining.length === 0) {
        if (state.armGroup === state.firstArmGroup) {
            state.armGroup = state.secondArmGroup;
            showArmSelection();
        } else {
            finish();
        }
        return;
    }

    // Determine titles and labels based on current group
    const isBiceps = state.armGroup === 'biceps';
    document.getElementById('arm-selection-title').innerText = isBiceps ? "בחר בייספס" : "בחר טרייספס";
    
    const opts = document.getElementById('arm-options'); 
    opts.innerHTML = "";
    
    remaining.forEach(ex => {
        const btn = document.createElement('button'); btn.className = "menu-card"; btn.innerText = ex.name;
        btn.onclick = () => { 
            state.currentEx = JSON.parse(JSON.stringify(ex)); state.currentExName = ex.name;
            state.currentEx.sets = [ex.sets[0], ex.sets[0], ex.sets[0]]; startRecording();
        };
        opts.appendChild(btn);
    });

    const skipBtn = document.getElementById('btn-skip-arm-group');
    skipBtn.style.display = 'block';
    
    if (state.armGroup === state.firstArmGroup) {
        skipBtn.innerText = isBiceps ? "דלג לטרייספס" : "דלג לבייספס";
        skipBtn.onclick = () => { 
            state.armGroup = state.secondArmGroup; 
            showArmSelection(); 
        };
    } else {
        skipBtn.innerText = "סיים אימון";
        skipBtn.onclick = () => finish();
    }
    
    navigate('ui-arm-selection');
}

// --- FINISH & ARCHIVE ---
function finish() {
    haptic('success');
    state.workoutDurationMins = Math.floor((Date.now() - state.workoutStartTime) / 60000);
    navigate('ui-summary');
    const workoutDisplayName = workoutNames[state.type] || state.type;
    const dateStr = new Date().toLocaleDateString('he-IL');
    
    let summaryText = `GYMPRO ELITE SUMMARY\n${workoutDisplayName} | ${dateStr} | ${state.workoutDurationMins}m\n\n`;
    let grouped = {};
    state.log.forEach(e => {
        if(!grouped[e.exName]) grouped[e.exName] = { sets: [], vol: 0 };
        if(!e.skip) {
            grouped[e.exName].sets.push(`${e.w}kg x ${e.r} (RIR ${e.rir})`);
            grouped[e.exName].vol += (e.w * e.r);
        }
    });
    for (let ex in grouped) { summaryText += `${ex} (Vol: ${grouped[ex].vol}kg):\n${grouped[ex].sets.join('\n')}\n\n`; }
    document.getElementById('summary-area').innerText = summaryText.trim();
    
    // AUTO SAVE TO ARCHIVE
    const archiveObj = {
        id: Date.now(),
        date: dateStr,
        timestamp: Date.now(),
        type: workoutDisplayName,
        duration: state.workoutDurationMins,
        summary: summaryText.trim()
    };
    StorageManager.saveToArchive(archiveObj);
}

function copyResult() {
    const text = document.getElementById('summary-area').innerText;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => { haptic('light'); alert("הסיכום הועתק ונשמר בארכיון!"); location.reload(); });
    } else {
        const el = document.createElement("textarea"); el.value = text; document.body.appendChild(el); el.select();
        document.execCommand('copy'); document.body.removeChild(el); alert("הסיכום הועתק ונשמר בארכיון!"); location.reload();
    }
}

// --- ARCHIVE UI INJECTION (AUTO RUN) ---
(function injectArchiveUI() {
    // 1. Add Archive Button to Main Screen
    const weekScreen = document.getElementById('ui-week');
    if (weekScreen && !document.getElementById('btn-open-archive')) {
        const btn = document.createElement('button');
        btn.id = 'btn-open-archive';
        btn.className = "action-card secondary"; // Reusing existing classes
        btn.style.marginTop = "20px";
        btn.innerHTML = `<div class="card-icon">📜</div><div class="card-text">ארכיון אימונים</div>`;
        btn.onclick = openArchive;
        weekScreen.appendChild(btn);
    }

    // 2. Inject Archive Screen HTML
    if (!document.getElementById('ui-archive')) {
        const archiveScreen = document.createElement('div');
        archiveScreen.id = 'ui-archive';
        archiveScreen.className = 'screen';
        archiveScreen.innerHTML = `
            <div class="hero-section"><h2>ארכיון אימונים</h2></div>
            <div id="archive-list" class="vertical-stack"></div>
        `;
        document.querySelector('.content-area').appendChild(archiveScreen);
    }
})();

function openArchive() {
    const list = document.getElementById('archive-list');
    list.innerHTML = "";
    const history = StorageManager.getArchive();

    if (history.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:gray; margin-top:20px;">אין אימונים שמורים</div>`;
    } else {
        history.forEach(item => {
            const card = document.createElement('button');
            card.className = "menu-card tall";
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; width:100%;">
                    <h3>${item.date}</h3>
                    <span style="font-size:0.8em; color:#8E8E93">${item.duration} דק'</span>
                </div>
                <p>${item.type}</p>
            `;
            card.onclick = () => {
                if(confirm("להעתיק סיכום זה?\n(לחץ ביטול למחיקה)")) {
                    navigator.clipboard.writeText(item.summary).then(() => alert("הועתק!"));
                } else {
                    if(confirm("למחוק אימון זה מהארכיון?")) {
                        StorageManager.deleteFromArchive(item.timestamp);
                        openArchive(); // Refresh
                    }
                }
            };
            list.appendChild(card);
        });
    }
    navigate('ui-archive');
}
