/**
 * GYMPRO ELITE V10.8 - FULL PATCHED
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
    lastLoggedSet: null 
};

let audioContext;
let wakeLock = null;

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

    // Case 1: Back from ui-extra (End of Exercise)
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

    // Case 2: Back within ui-main (Previous Set)
    if (currentScreen === 'ui-main' && state.setIdx > 0) {
        state.log.pop();
        state.setIdx--;
        state.lastLoggedSet = state.log.length > 0 ? state.log[state.log.length - 1] : null;
        initPickers();
        return;
    }

    // Default Back Behavior
    state.historyStack.pop();
    const prevScreen = state.historyStack[state.historyStack.length - 1];

    // FIX: אם חוזרים למסך אישור תרגיל מקודם
    if (prevScreen === 'ui-confirm' && !state.isFreestyle && !state.isExtraPhase && !state.isInterruption) {
        if (state.exIdx > 0) state.exIdx--;
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

function showConfirmScreen() {
    const exName = workouts[state.type][state.exIdx];
    const exData = exerciseDatabase.find(e => e.name === exName);
    document.getElementById('confirm-ex-name').innerText = exData.name;
    navigate('ui-confirm');
}

function confirmExercise(doEx) {
    const exName = workouts[state.type][state.exIdx];
    const exData = exerciseDatabase.find(e => e.name === exName);
    if (!doEx) { 
        state.log.push({ skip: true, exName: exData.name }); 
        state.exIdx++; 
        checkFlow(); 
        return; 
    }
    state.currentEx = JSON.parse(JSON.stringify(exData));
    state.currentExName = exData.name;
    if (state.currentEx.isCalc) setupCalculatedEx();
    else startRecording();
}

function setupCalculatedEx() {
    document.getElementById('rm-title').innerText = `${state.currentExName} 1RM`;
    const p = document.getElementById('rm-picker'); p.innerHTML = "";
    for(let i = state.currentEx.rmRange[0]; i <= state.currentEx.rmRange[1]; i += 2.5) {
        let o = new Option(i + " kg", i); if(i === state.currentEx.baseRM) o.selected = true; p.add(o);
    }
    navigate('ui-1rm');
}

function save1RM() {
    state.rm = parseFloat(document.getElementById('rm-picker').value);
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
    const currentW = target ? target.w : (state.lastLoggedSet ? state.lastLoggedSet.w : 0);
    const minW = state.currentEx.minW !== undefined ? state.currentEx.minW : Math.max(0, currentW - 40);
    const maxW = state.currentEx.maxW !== undefined ? state.currentEx.maxW : currentW + 50;
    
    for(let i = minW; i <= maxW; i = parseFloat((i + step).toFixed(2))) {
        let o = new Option(i + " kg", i); if(i === currentW) o.selected = true; wPick.add(o);
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
    const entry = { exName: state.currentExName, w: parseFloat(document.getElementById('weight-picker').value), r: parseInt(document.getElementById('reps-picker').value), rir: document.getElementById('rir-picker').value };
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
            document.getElementById('btn-resume-flow').style.display = 'flex';
            document.getElementById('btn-finish-extra').style.display = 'none';
            navigate('ui-muscle-select');
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

// --- INTERRUPTION LOGIC ---
function interruptWorkout() {
    // FIX: Increment main index because current exercise is done
    if (!state.isFreestyle && !state.isExtraPhase && state.type !== 'Freestyle') {
        state.exIdx++;
    }
    state.isInterruption = true;
    document.getElementById('btn-resume-flow').style.display = 'flex';
    document.getElementById('btn-finish-extra').style.display = 'none';
    navigate('ui-muscle-select');
}

function resumeWorkout() {
    state.isInterruption = false;
    if (!state.isArmPhase && !state.isExtraPhase && state.exIdx < workouts[state.type].length) {
         showConfirmScreen();
    } else navigate('ui-ask-extra');
}

// --- EXTRA PHASE LOGIC ---
function startExtraPhase() {
    state.isExtraPhase = true;
    document.getElementById('btn-resume-flow').style.display = 'none';
    document.getElementById('btn-finish-extra').style.display = 'block';
    navigate('ui-muscle-select');
}

function finishExtraPhase() { navigate('ui-ask-arms'); }

// --- ARMS & FINISH ---
function startArmWorkout() { state.isArmPhase = true; state.armGroup = 'biceps'; showArmSelection(); }

function showArmSelection() {
    const list = armExercises[state.armGroup];
    const remaining = list.filter(ex => !state.completedExInSession.includes(ex.name));
    if (remaining.length === 0) {
        if (state.armGroup === 'biceps') { state.armGroup = 'triceps'; showArmSelection(); }
        else finish(); return;
    }
    document.getElementById('arm-selection-title').innerText = state.armGroup === 'biceps' ? "בחר בייספס" : "בחר טרייספס";
    const opts = document.getElementById('arm-options'); opts.innerHTML = "";
    remaining.forEach(ex => {
        const btn = document.createElement('button'); btn.className = "menu-card"; btn.innerText = ex.name;
        btn.onclick = () => { 
            state.currentEx = JSON.parse(JSON.stringify(ex)); state.currentExName = ex.name;
            state.currentEx.sets = [ex.sets[0], ex.sets[0], ex.sets[0]]; startRecording();
        };
        opts.appendChild(btn);
    });
    const skipBtn = document.getElementById('btn-skip-arm-group');
    skipBtn.innerText = state.armGroup === 'biceps' ? "דלג לטרייספס" : "סיים אימון";
    skipBtn.onclick = () => { if (state.armGroup === 'biceps') { state.armGroup = 'triceps'; showArmSelection(); } else finish(); };
    navigate('ui-arm-selection');
}

function finish() {
    haptic('success');
    state.workoutDurationMins = Math.floor((Date.now() - state.workoutStartTime) / 60000);
    navigate('ui-summary');
    const workoutDisplayName = workoutNames[state.type] || state.type;
    let summaryText = `GYMPRO ELITE SUMMARY\n${workoutDisplayName} | Week: ${state.week} | Duration: ${state.workoutDurationMins}m\n\n`;
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
}

function copyResult() {
    const text = document.getElementById('summary-area').innerText;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => { haptic('light'); alert("הסיכום הועתק!"); location.reload(); });
    } else {
        const el = document.createElement("textarea"); el.value = text; document.body.appendChild(el); el.select();
        document.execCommand('copy'); document.body.removeChild(el); alert("הסיכום הועתק!"); location.reload();
    }
}
