/* --- Configuration & Data --- */
const exercises = {
    A: [
        { name: "Bench Press", type: "compound", baseRM: 100, percent: 0.8 },
        { name: "Pullups (Weighted)", type: "compound", baseRM: 30, percent: 0.8 },
        { name: "Incline Dumbbell Press", type: "hypertrophy", sets: 3, reps: "8-10" },
        { name: "Dumbbell Row / Machine Row", type: "variation", options: [
            { name: "Dumbbell Row", sets: 3, reps: "10-12" },
            { name: "Machine Row", sets: 3, reps: "10-12" }
        ]},
        { name: "Cable Fly / Machine Fly", type: "variation", options: [
            { name: "Cable Fly", sets: 3, reps: "12-15" },
            { name: "Machine Fly", sets: 3, reps: "12-15" }
        ]},
        { name: "Face Pulls", type: "hypertrophy", sets: 3, reps: "15-20" }
    ],
    B: [
        { name: "Squat", type: "compound", baseRM: 120, percent: 0.8 },
        { name: "Deadlift / RDL", type: "variation", options: [
            { name: "Deadlift", type: "compound", baseRM: 140, percent: 0.8 },
            { name: "RDL", type: "hypertrophy", sets: 3, reps: "8-10" }
        ]},
        { name: "Leg Press / Hack Squat", type: "variation", options: [
            { name: "Leg Press", sets: 3, reps: "10-12" },
            { name: "Hack Squat", sets: 3, reps: "10-12" }
        ]},
        { name: "Leg Curls", type: "hypertrophy", sets: 3, reps: "12-15" },
        { name: "Calf Raises", type: "hypertrophy", sets: 4, reps: "15-20" }
    ],
    C: [
        { name: "Overhead Press", type: "compound", baseRM: 60, percent: 0.8 },
        { name: "Lateral Raises (DB/Cable)", type: "variation", options: [
            { name: "DB Lateral Raises", sets: 4, reps: "12-15" },
            { name: "Cable Lateral Raises", sets: 4, reps: "12-15" }
        ]},
        { name: "Rear Delt Fly", type: "hypertrophy", sets: 3, reps: "15-20" },
        { name: "Shrugs", type: "hypertrophy", sets: 3, reps: "12-15" }
    ],
    // Arms - Divided into sub-groups for flexible flow
    Arms_Biceps: [
        { name: "Barbell Curl", type: "hypertrophy", sets: 3, reps: "8-10" },
        { name: "Hammer Curl", type: "hypertrophy", sets: 3, reps: "10-12" },
        { name: "Preacher/Concentration Curl", type: "variation", options: [
             { name: "Preacher Curl", sets: 3, reps: "12-15" },
             { name: "Concentration Curl", sets: 3, reps: "12-15" }
        ]}
    ],
    Arms_Triceps: [
        { name: "Close Grip Bench / Dips", type: "variation", options: [
            { name: "Close Grip Bench", sets: 3, reps: "8-10" },
            { name: "Weighted Dips", sets: 3, reps: "8-10" }
        ]},
        { name: "Skullcrushers", type: "hypertrophy", sets: 3, reps: "10-12" },
        { name: "Tricep Pushdown", type: "hypertrophy", sets: 3, reps: "12-15" }
    ]
};

/* --- State Management --- */
let state = {
    week: 1,
    workoutType: null, // A, B, C, Arms
    queue: [], // Array of exercise objects to perform
    currentExerciseIndex: 0,
    currentSet: 1,
    currentWeight: 0, // Current picker value
    log: [], // Completed sets log
    startTime: null,
    completedExInSession: [], // To filter choices
    interruptionStack: [], // To return after interruption
    tempHistoryID: null // For modal view
};

/* --- Local Storage & Smart Memory --- */
const Storage = {
    KEY_HISTORY: 'gympro_history',
    KEY_PREFS: 'gympro_prefs',

    getHistory: function() {
        const data = localStorage.getItem(this.KEY_HISTORY);
        return data ? JSON.parse(data) : [];
    },

    saveToHistory: function(workoutObj) {
        const history = this.getHistory();
        history.unshift(workoutObj); // Add to top
        localStorage.setItem(this.KEY_HISTORY, JSON.stringify(history));
    },

    deleteFromHistory: function(timestampId) {
        let history = this.getHistory();
        history = history.filter(item => item.id !== timestampId);
        localStorage.setItem(this.KEY_HISTORY, JSON.stringify(history));
    },

    getPrefs: function() {
        const data = localStorage.getItem(this.KEY_PREFS);
        return data ? JSON.parse(data) : { lastRM: {}, lastWeights: {} };
    },

    // Save specific 1RM used for an exercise
    saveLastRM: function(exerciseName, weight) {
        const prefs = this.getPrefs();
        prefs.lastRM[exerciseName] = weight;
        localStorage.setItem(this.KEY_PREFS, JSON.stringify(prefs));
    },

    // Save working weight for an exercise
    saveLastWeight: function(exerciseName, weight) {
        const prefs = this.getPrefs();
        prefs.lastWeights[exerciseName] = weight;
        localStorage.setItem(this.KEY_PREFS, JSON.stringify(prefs));
    },

    // Get last working weight
    getLastWeight: function(exerciseName) {
        const prefs = this.getPrefs();
        return prefs.lastWeights[exerciseName] || 0;
    },
    
    // Get last RM
    getLastRM: function(exerciseName) {
        const prefs = this.getPrefs();
        return prefs.lastRM[exerciseName] || null;
    }
};

/* --- Navigation & Init --- */
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function selectWeek(n) {
    state.week = n;
    document.getElementById('week-title').innerText = `שבוע ${n}`;
    showScreen('ui-workout');
}

function goBack() {
    // Logic to determine where 'Back' goes based on current screen
    const current = document.querySelector('.screen.active').id;
    if (current === 'ui-workout') showScreen('ui-week');
    else if (current === 'ui-variation') showScreen('ui-workout');
    else if (current === 'ui-1rm') showScreen('ui-workout');
    else if (current === 'ui-arms-select') showScreen('ui-workout');
    else if (current === 'ui-active') {
        if (confirm("יציאה תבטל את האימון הנוכחי. להמשיך?")) {
            resetState();
            showScreen('ui-workout');
        }
    }
}

function handleActiveBack() {
    if (state.interruptionStack.length > 0) {
        // Return from interruption
        closeInterruption();
    } else {
        goBack();
    }
}

function goBackToHome() {
    showScreen('ui-week');
}

/* --- Workout Setup --- */
function selectWorkout(type) {
    state.workoutType = type;
    state.startTime = new Date();
    state.log = [];
    state.completedExInSession = [];
    state.queue = [];
    
    if (type === 'arms') {
        showScreen('ui-arms-select'); // Go to flexible flow choice
    } else {
        // Standard flow
        buildQueue(exercises[type]);
        startNextExercise();
    }
}

function startArms(firstMuscle) {
    // Flexible Arms Logic
    let queue = [];
    if (firstMuscle === 'biceps') {
        queue = [...exercises.Arms_Biceps, ...exercises.Arms_Triceps];
    } else {
        queue = [...exercises.Arms_Triceps, ...exercises.Arms_Biceps];
    }
    buildQueue(queue);
    startNextExercise();
}

function buildQueue(sourceList) {
    // Deep copy to avoid mutating config
    state.queue = JSON.parse(JSON.stringify(sourceList));
    state.currentExerciseIndex = -1;
}

function startNextExercise() {
    state.currentExerciseIndex++;
    
    if (state.currentExerciseIndex >= state.queue.length) {
        finishWorkout();
        return;
    }

    const ex = state.queue[state.currentExerciseIndex];

    // Filter Logic: Skip if already done (Smart Filter)
    if (state.completedExInSession.includes(ex.name)) {
        startNextExercise();
        return;
    }

    if (ex.type === 'variation') {
        showVariationSelect(ex);
    } else if (ex.type === 'compound') {
        setup1RM(ex);
    } else {
        setupHypertrophy(ex);
    }
}

/* --- Variation Selection --- */
function showVariationSelect(ex) {
    const list = document.getElementById('variation-list');
    list.innerHTML = '';
    ex.options.forEach(opt => {
        // Skip if option already done
        if (state.completedExInSession.includes(opt.name)) return;
        
        const btn = document.createElement('button');
        btn.className = 'btn btn-workout';
        btn.innerText = opt.name;
        btn.onclick = () => {
            // Replace current variation wrapper with specific choice in queue
            state.queue[state.currentExerciseIndex] = opt;
            if (opt.type === 'compound') setup1RM(opt);
            else setupHypertrophy(opt);
        };
        list.appendChild(btn);
    });
    showScreen('ui-variation');
}

/* --- 1RM Logic (Smart Memory) --- */
let currentCompoundEx = null;

function setup1RM(ex) {
    currentCompoundEx = ex;
    document.getElementById('rm-exercise-name').innerText = ex.name;
    document.getElementById('rm-target').innerText = (ex.percent * 100).toFixed(0) + '%';
    
    // Check Smart Memory for last used RM
    const lastRM = Storage.getLastRM(ex.name);
    let defaultRM = lastRM ? lastRM : ex.baseRM;
    
    updateRMDisplay(defaultRM);
    showScreen('ui-1rm');
}

function adjustRM(delta) {
    let val = parseFloat(document.getElementById('rm-value-display').innerText);
    updateRMDisplay(val + delta);
}

function setSpecificRM(val) {
    updateRMDisplay(val);
}

function updateRMDisplay(val) {
    if (val < 0) val = 0;
    document.getElementById('rm-value-display').innerText = val;
}

function confirmRM() {
    const rm = parseFloat(document.getElementById('rm-value-display').innerText);
    const weight = Math.round((rm * currentCompoundEx.percent) / 1.25) * 1.25;
    
    // Save to Smart Memory
    Storage.saveLastRM(currentCompoundEx.name, rm);

    // Calculate sets based on week
    let sets = 3;
    let reps = 5;
    if (state.week === 2) { sets = 3; reps = 6; }
    if (state.week === 3) { sets = 4; reps = 5; } // Vol
    if (state.week === 4) { sets = 3; reps = 3; } // Heavy

    // Transform current exercise in queue to executable format
    state.queue[state.currentExerciseIndex] = {
        name: currentCompoundEx.name,
        sets: sets,
        reps: reps,
        weight: weight,
        fixedWeight: true
    };

    renderExercise();
}

/* --- Active Workout Logic --- */
function setupHypertrophy(ex) {
    state.queue[state.currentExerciseIndex] = {
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        weight: 0, 
        fixedWeight: false
    };
    renderExercise();
}

function renderExercise() {
    const ex = state.queue[state.currentExerciseIndex];
    state.currentSet = 1;

    document.getElementById('ex-name').innerText = ex.name;
    document.getElementById('total-sets').innerText = ex.sets;
    document.getElementById('rep-target').innerText = `חזרות: ${ex.reps}`;
    
    updateSetDisplay();

    // Weight Logic (Smart Memory)
    if (ex.fixedWeight) {
        state.currentWeight = ex.weight;
    } else {
        // Try to find last weight from storage if it's the first set
        const lastWeight = Storage.getLastWeight(ex.name);
        state.currentWeight = lastWeight > 0 ? lastWeight : 10;
    }
    
    updateWeightDisplay();
    updateProgress();
    showScreen('ui-active');
}

function updateSetDisplay() {
    document.getElementById('set-num').innerText = state.currentSet;
}

function adjustWeight(delta) {
    state.currentWeight += delta;
    if (state.currentWeight < 0) state.currentWeight = 0;
    updateWeightDisplay();
}

function updateWeightDisplay() {
    // Round to reasonable decimal if needed
    document.getElementById('weight-display').innerText = parseFloat(state.currentWeight.toFixed(2));
}

function nextSet() {
    const ex = state.queue[state.currentExerciseIndex];
    
    // Log data
    state.log.push({
        exercise: ex.name,
        set: state.currentSet,
        reps: ex.reps, // Target reps
        weight: state.currentWeight
    });

    // Save weight to Smart Memory (Update preference)
    Storage.saveLastWeight(ex.name, state.currentWeight);

    if (state.currentSet < ex.sets) {
        state.currentSet++;
        updateSetDisplay();
        // Weight stays same for next set by default, which is good UX
    } else {
        // Exercise Complete
        state.completedExInSession.push(ex.name);
        
        // If we are in an interruption, return to saved state
        if (state.interruptionStack.length > 0) {
             const returnState = state.interruptionStack.pop();
             state.queue = returnState.queue;
             state.currentExerciseIndex = returnState.index;
             // We don't restore set/weight, we proceed to next exercise in original queue
             startNextExercise();
        } else {
            startNextExercise();
        }
    }
}

function updateProgress() {
    const total = state.queue.length;
    const current = state.currentExerciseIndex;
    const pct = ((current) / total) * 100;
    document.getElementById('progress-fill').style.width = pct + '%';
}

/* --- Interruption Logic --- */
function triggerInterruption() {
    const list = document.getElementById('interrupt-list');
    list.innerHTML = '';
    
    // Flatten all exercises to find options
    const allEx = [];
    Object.values(exercises).forEach(group => {
        group.forEach(ex => {
            if(ex.options) {
                ex.options.forEach(opt => allEx.push(opt));
            } else {
                allEx.push(ex);
            }
        });
    });

    // Unique names only
    const unique = [...new Map(allEx.map(item => [item.name, item])).values()];

    unique.forEach(ex => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-workout';
        btn.innerText = ex.name;
        btn.onclick = () => startInterruptionExercise(ex);
        list.appendChild(btn);
    });

    showScreen('ui-interrupt');
}

function closeInterruption() {
    showScreen('ui-active');
}

function startInterruptionExercise(ex) {
    // Save current state
    state.interruptionStack.push({
        queue: [...state.queue],
        index: state.currentExerciseIndex
    });

    // Create a mini-queue for the interruption
    state.queue = [ex]; // Just this one
    state.currentExerciseIndex = -1; // Will be incremented to 0 by startNextExercise
    
    startNextExercise();
}

/* --- Finish & History Logic --- */
function finishWorkout() {
    const end = new Date();
    const duration = Math.round((end - state.startTime) / 60000); // minutes
    
    let summary = `סיכום אימון (${state.workoutType}) - שבוע ${state.week}\n`;
    summary += `תאריך: ${end.toLocaleDateString()} | זמן: ${duration} דק'\n`;
    summary += `----------------\n`;
    
    state.log.forEach(entry => {
        summary += `${entry.exercise}: סט ${entry.set} | ${entry.weight} ק"ג\n`;
    });

    document.getElementById('summary-text').innerText = summary;
    
    // Prepare Data Object for History
    state.finalWorkoutObj = {
        id: Date.now(),
        date: end.toLocaleDateString(),
        timestamp: end.getTime(),
        type: state.workoutType === 'arms' ? 'ידיים' : `אימון ${state.workoutType}`,
        duration: duration,
        logText: summary
    };

    showScreen('ui-finish');
}

async function finishProcess() {
    // 1. Copy to Clipboard
    try {
        await navigator.clipboard.writeText(state.finalWorkoutObj.logText);
        
        // 2. Ask to Save to Archive
        if (confirm("הסיכום הועתק! האם לשמור את האימון בארכיון?")) {
            Storage.saveToHistory(state.finalWorkoutObj);
            alert("נשמר בארכיון בהצלחה.");
        }
    } catch (err) {
        alert("שגיאה בהעתקה, אך הנתונים נשמרו בארכיון אם בחרת בכך.");
    }

    // 3. Reset
    resetState();
    showScreen('ui-week');
}

function resetState() {
    state.log = [];
    state.queue = [];
    state.interruptionStack = [];
    state.completedExInSession = [];
}

/* --- Archive UI Functions --- */
function openHistory() {
    renderHistoryList();
    showScreen('ui-history');
}

function renderHistoryList() {
    const list = document.getElementById('history-list');
    const history = Storage.getHistory();
    list.innerHTML = '';

    if (history.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:#888;">אין אימונים בארכיון</p>';
        return;
    }

    history.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.onclick = () => showHistoryDetail(item);
        
        div.innerHTML = `
            <div class="history-info">
                <span class="history-date">${item.date} - ${item.type}</span>
                <span class="history-meta">משך: ${item.duration} דקות</span>
            </div>
            <span style="font-size:20px;">➜</span>
        `;
        list.appendChild(div);
    });
}

function showHistoryDetail(item) {
    state.tempHistoryID = item.id; // Save ID for delete action
    state.tempHistoryText = item.logText;

    document.getElementById('modal-date').innerText = `${item.date} - ${item.type}`;
    document.getElementById('modal-body').innerText = item.logText;
    
    document.getElementById('history-detail-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('history-detail-modal').classList.add('hidden');
    state.tempHistoryID = null;
}

function copyHistoryItem() {
    navigator.clipboard.writeText(state.tempHistoryText).then(() => {
        alert('הסיכום הועתק ללוח');
    });
}

function deleteHistoryItem() {
    if (confirm("למחוק את האימון הזה לצמיתות?")) {
        Storage.deleteFromHistory(state.tempHistoryID);
        closeModal();
        renderHistoryList(); // Refresh list
    }
}
