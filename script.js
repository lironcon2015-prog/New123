/**
 * GYMSTART V1.9.0
 * - Feature: Non-linear Workout (Change Order).
 * - Logic: Added 'completed' flag to session exercises and 'returnIdx' to state.
 * - UI: New "Change Order" flow for flexible exercise selection.
 */

const CONFIG = {
    KEYS: {
        ROUTINES: 'gymstart_v1_7_routines',
        HISTORY: 'gymstart_beta_02_history',
        EXERCISES: 'gymstart_v1_7_exercises_bank',
        SESSION: 'gymstart_v1_9_session' 
    },
    VERSION: '1.9.0'
};

const FEEL_MAP_TEXT = { 'easy': 'קל', 'good': 'בינוני', 'hard': 'קשה' };

// BASE EXERCISES FOR MIGRATION ONLY
const BASE_BANK_INIT = [
    { id: 'goblet', name: 'גובלט סקוואט', cat: 'legs', settings: {unit:'kg', step:2.5, min:2.5, max:60} },
    { id: 'leg_press', name: 'לחיצת רגליים', cat: 'legs', settings: {unit:'kg', step:5, min:20, max:200} },
    { id: 'rdl', name: 'דדליפט רומני', cat: 'legs', settings: {unit:'kg', step:2.5, min:10, max:100} },
    { id: 'lunge', name: 'מכרעים (Lunges)', cat: 'legs', settings: {unit:'kg', step:1, min:1, max:30} },
    { id: 'hip_thrust', name: 'גשר עכוז', cat: 'legs', settings: {unit:'kg', step:2.5, min:10, max:120} },
    { id: 'leg_ext', name: 'פשיטת ברכיים', cat: 'legs', settings: {unit:'plates', step:1, min:1, max:20} },
    { id: 'leg_curl', name: 'כפיפת ברכיים', cat: 'legs', settings: {unit:'plates', step:1, min:1, max:20} },
    { id: 'calf_raise', name: 'הרמת עקבים', cat: 'legs', settings: {unit:'kg', step:2.5, min:10, max:80} },
    { id: 'chest_press', name: 'לחיצת חזה משקולות', cat: 'chest', settings: {unit:'kg', step:1, min:2, max:40} },
    { id: 'fly', name: 'פרפר (Fly)', cat: 'chest', settings: {unit:'kg', step:1, min:2, max:20} },
    { id: 'pushup', name: 'שכיבות סמיכה', cat: 'chest', settings: {unit:'bodyweight', step:0, min:0, max:0} },
    { id: 'incline_bench', name: 'לחיצת חזה שיפוע עליון', cat: 'chest', settings: {unit:'kg', step:1, min:2, max:40} },
    { id: 'lat_pull', name: 'פולי עליון', cat: 'back', settings: {unit:'plates', step:1, min:1, max:20} },
    { id: 'cable_row', name: 'חתירה בכבל', cat: 'back', settings: {unit:'plates', step:1, min:1, max:20} },
    { id: 'db_row', name: 'חתירה במשקולת', cat: 'back', settings: {unit:'kg', step:1, min:4, max:40} },
    { id: 'hyperext', name: 'פשיטת גו (Hyper)', cat: 'back', settings: {unit:'bodyweight', step:0, min:0, max:0} },
    { id: 'shoulder_press', name: 'לחיצת כתפיים', cat: 'shoulders', settings: {unit:'kg', step:1, min:2, max:30} },
    { id: 'lat_raise', name: 'הרחקה לצדדים', cat: 'shoulders', settings: {unit:'kg', step:1, min:1, max:15} },
    { id: 'face_pull', name: 'פייס-פולס', cat: 'shoulders', settings: {unit:'plates', step:1, min:1, max:20} },
    { id: 'bicep_curl', name: 'כפיפת מרפקים', cat: 'arms', settings: {unit:'kg', step:1, min:2, max:25} },
    { id: 'tricep_pull', name: 'פשיטת מרפקים', cat: 'arms', settings: {unit:'plates', step:1, min:1, max:20} },
    { id: 'tricep_rope', name: 'פשיטת מרפקים חבל', cat: 'arms', settings: {unit:'plates', step:1, min:1, max:20} },
    { id: 'hammer_curl', name: 'כפיפת פטישים', cat: 'arms', settings: {unit:'kg', step:1, min:2, max:25} },
    { id: 'plank', name: 'פלאנק (סטטי)', cat: 'core', settings: {unit:'bodyweight', step:0, min:0, max:0} },
    { id: 'side_plank', name: 'פלאנק צידי', cat: 'core', settings: {unit:'bodyweight', step:0, min:0, max:0} },
    { id: 'bicycle', name: 'בטן אופניים', cat: 'core', settings: {unit:'bodyweight', step:0, min:0, max:0} },
    { id: 'knee_raise', name: 'הרמת ברכיים', cat: 'core', settings: {unit:'bodyweight', step:0, min:0, max:0} },
    { id: 'crunches', name: 'כפיפות בטן', cat: 'core', settings: {unit:'bodyweight', step:0, min:0, max:0} }
];

const DEFAULT_ROUTINES_V17 = {
    'A': { title: 'רגליים וגב (A)', exercises: [ {id:'goblet', sets:3, rest:90}, {id:'leg_press', sets:3}, {id:'lat_pull', sets:3} ] },
    'B': { title: 'חזה וכתפיים (B)', exercises: [ {id:'chest_press', sets:3}, {id:'shoulder_press', sets:3}, {id:'plank', sets:3} ] }
};

const app = {
    state: {
        routines: {},
        history: [],
        exercises: [], 
        currentProgId: null,
        active: {
            on: false,
            sessionExercises: [], 
            exIdx: 0, setIdx: 1, totalSets: 3,
            returnIdx: null, // For Non-linear jumps
            log: [], 
            startTime: 0, accumulatedTime: 0, 
            timerInterval: null, restInterval: null, 
            feel: 'good', isStopwatch: false, stopwatchVal: 0,
            inputW: 10, inputR: 12
        },
        admin: { 
            viewProgId: null, 
            editTipEx: null, 
            selectorFilter: 'all',
            exManagerFilter: 'all',
            tempExercises: [],
            editingExId: null 
        },
        userSelector: { mode: null },
        historySelection: [],
        viewHistoryIdx: null
    },

    init: function() {
        try {
            this.loadData();
            this.renderHome();
            this.renderProgramSelect(); 
            this.nav('screen-home'); 

            const savedSession = localStorage.getItem(CONFIG.KEYS.SESSION);
            if (savedSession) {
                const sess = JSON.parse(savedSession);
                if (sess.ver === CONFIG.VERSION && sess.active && sess.active.on) {
                    document.getElementById('resume-modal').style.display = 'flex';
                }
            }
        } catch (e) {
            console.error(e);
            alert("שגיאה בטעינת נתונים.");
        }
    },

    resumeSession: function() {
        try {
            const savedSession = localStorage.getItem(CONFIG.KEYS.SESSION);
            if (!savedSession) return;
            const sess = JSON.parse(savedSession);
            
            this.state.active = sess.active;
            this.state.currentProgId = sess.progId;
            
            const segmentDuration = (sess.lastSaveTime || Date.now()) - this.state.active.startTime;
            this.state.active.accumulatedTime = (this.state.active.accumulatedTime || 0) + segmentDuration;
            this.state.active.startTime = Date.now(); 

            this.state.active.timerInterval = null;
            this.state.active.restInterval = null;
            
            document.getElementById('resume-modal').style.display = 'none';

            if (sess.screen === 'screen-active' || sess.screen === 'screen-order-selector') {
                this.loadActiveExercise();
                this.nav('screen-active');
            } else if (sess.screen === 'screen-summary') {
                this.finishWorkout(true); 
            } else {
                this.nav('screen-home');
            }
            this.saveSession();
        } catch (e) {
            console.error("Resume failed", e);
            this.discardSession();
        }
    },

    discardSession: function() {
        this.clearSession();
        document.getElementById('resume-modal').style.display = 'none';
    },

    saveSession: function() {
        if (!this.state.active.on) return;
        const activeScreen = document.querySelector('.screen.active').id;
        const data = {
            ver: CONFIG.VERSION,
            screen: activeScreen,
            progId: this.state.currentProgId,
            active: this.state.active,
            lastSaveTime: Date.now()
        };
        localStorage.setItem(CONFIG.KEYS.SESSION, JSON.stringify(data));
    },

    clearSession: function() {
        localStorage.removeItem(CONFIG.KEYS.SESSION);
    },

    loadData: function() {
        const h = localStorage.getItem(CONFIG.KEYS.HISTORY);
        this.state.history = h ? JSON.parse(h) : [];
        const r = localStorage.getItem(CONFIG.KEYS.ROUTINES);
        let loadedRoutines = r ? JSON.parse(r) : null;
        if (!loadedRoutines) {
            this.state.routines = JSON.parse(JSON.stringify(DEFAULT_ROUTINES_V17));
            for(const pid in this.state.routines) {
                this.state.routines[pid].exercises.forEach(ex => {
                    const bankEx = BASE_BANK_INIT.find(b => b.id === ex.id);
                    if(bankEx) {
                        ex.name = bankEx.name;
                        ex.unit = bankEx.settings.unit;
                        ex.cat = bankEx.cat;
                    }
                });
            }
        } else {
            this.state.routines = loadedRoutines;
        }
        const e = localStorage.getItem(CONFIG.KEYS.EXERCISES);
        if(e) {
            this.state.exercises = JSON.parse(e);
        } else {
            this.state.exercises = JSON.parse(JSON.stringify(BASE_BANK_INIT));
            this.saveData();
        }
    },

    saveData: function() {
        localStorage.setItem(CONFIG.KEYS.ROUTINES, JSON.stringify(this.state.routines));
        localStorage.setItem(CONFIG.KEYS.HISTORY, JSON.stringify(this.state.history));
        localStorage.setItem(CONFIG.KEYS.EXERCISES, JSON.stringify(this.state.exercises));
    },

    nav: function(screenId) {
        document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
        if (this.state.active.on) this.saveSession();

        const backBtn = document.getElementById('nav-back');
        const adminBtn = document.getElementById('btn-admin-home');

        if (screenId === 'screen-home') {
            backBtn.style.visibility = 'hidden';
            if(adminBtn) adminBtn.style.display = 'flex';
            this.stopAllTimers();
            this.state.active.on = false;
        } else {
            backBtn.style.visibility = 'visible';
            if(adminBtn) adminBtn.style.display = 'none';
        }
    },

    goBack: function() {
        const activeScreen = document.querySelector('.screen.active').id;
        if (activeScreen === 'screen-active') {
            if (confirm("לצאת מהאימון?")) {
                this.stopAllTimers();
                this.state.active.on = false;
                this.clearSession();
                this.nav('screen-overview');
            }
        } else if (activeScreen === 'screen-overview') {
             this.nav('screen-program-select');
        } else if (activeScreen === 'screen-order-selector') {
             this.nav('screen-active');
        } else {
            this.nav('screen-home');
        }
    },

    getExerciseDef: function(exId) {
        return this.state.exercises.find(e => e.id === exId) || 
               { name: 'תרגיל לא ידוע', settings: {unit:'kg', step:2.5, min:0, max:50} };
    },

    renderProgramSelect: function() {
        const container = document.getElementById('prog-list-container');
        container.innerHTML = '';
        const ids = Object.keys(this.state.routines);
        if(ids.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#666;">אין תוכניות זמינות.</div>';
            return;
        }
        ids.forEach(pid => {
            const prog = this.state.routines[pid];
            const badge = pid.charAt(0).toUpperCase();
            const count = prog.exercises.length;
            let desc = `${count} תרגילים`;
            if (count > 0) desc += ` • מתחיל ב: ${prog.exercises[0].name}`;
            container.innerHTML += `
                <div class="oled-card prog-card" onclick="app.selectProgram('${pid}')">
                    <div class="prog-icon">${badge}</div>
                    <div class="prog-content">
                        <div class="prog-title">${prog.title}</div>
                        <div class="prog-desc">${desc}</div>
                    </div>
                </div>
            `;
        });
    },

    selectProgram: function(progId) {
        this.state.currentProgId = progId;
        this.renderOverview();
        this.nav('screen-overview');
    },

    renderOverview: function() {
        const prog = this.state.routines[this.state.currentProgId];
        const list = document.getElementById('overview-list');
        document.getElementById('overview-title').innerText = `סקירה: ${prog.title}`;
        list.innerHTML = '';
        prog.exercises.forEach((ex, i) => {
            list.innerHTML += `<div class="list-item">
                <span>${i+1}. ${ex.name}</span>
                <span style="color:var(--primary); font-size:0.9rem">${ex.sets} סטים</span>
            </div>`;
        });
    },

    renderHome: function() {
        const lastEl = document.getElementById('last-workout-display');
        if (this.state.history.length > 0) {
            const last = this.state.history[this.state.history.length - 1];
            const displayName = last.programTitle || last.program; 
            lastEl.innerText = `${last.date} (${displayName})`;
        } else {
            lastEl.innerText = "טרם בוצע";
        }
    },

    startWorkout: function() {
        const prog = this.state.routines[this.state.currentProgId];
        if (!prog || prog.exercises.length === 0) { alert("התוכנית ריקה"); return; }

        // Inject 'completed' flag
        const sessionExercises = JSON.parse(JSON.stringify(prog.exercises)).map(ex => ({
            ...ex,
            completed: false
        }));

        this.state.active = {
            on: true,
            sessionExercises: sessionExercises,
            exIdx: 0, setIdx: 1, totalSets: 3,
            returnIdx: null,
            log: [], 
            startTime: Date.now(), 
            accumulatedTime: 0,
            timerInterval: null, restInterval: null, 
            feel: 'good', isStopwatch: false, stopwatchVal: 0,
            inputW: 10, inputR: 12
        };
        this.saveSession();
        this.loadActiveExercise();
        this.nav('screen-active');
    },

    loadActiveExercise: function() {
        const exInst = this.state.active.sessionExercises[this.state.active.exIdx];
        const exDef = this.getExerciseDef(exInst.id);
        
        this.state.active.totalSets = exInst.sets || 3;
        document.getElementById('ex-name').innerText = exInst.name;
        document.getElementById('set-badge').innerText = `סט ${this.state.active.setIdx} / ${this.state.active.totalSets}`;
        
        const vidBtn = document.getElementById('ex-video-link');
        if (exDef.videoUrl && exDef.videoUrl.length > 5) {
            vidBtn.style.display = 'flex';
            vidBtn.href = exDef.videoUrl;
        } else vidBtn.style.display = 'none';

        // Swap Exercise Button (Category core only)
        const swapBtn = document.getElementById('btn-swap-ex');
        swapBtn.style.display = (exDef.cat === 'core' && this.state.active.setIdx === 1) ? 'block' : 'none';

        // Change Order Button (Any exercise, Set 1 only)
        const orderBtn = document.getElementById('btn-change-order');
        orderBtn.style.display = (this.state.active.setIdx === 1) ? 'block' : 'none';

        const noteEl = document.getElementById('coach-note');
        if (exInst.note) {
            noteEl.innerText = "💡 " + exInst.note;
            noteEl.style.display = 'block';
        } else noteEl.style.display = 'none';

        this.renderStatsStrip(exInst.id, exDef.settings.unit);

        const isTime = (exDef.settings.unit === 'bodyweight' && (exInst.id.includes('plank') || exInst.id.includes('static')));
        this.state.active.isStopwatch = isTime;

        if (isTime) {
            document.getElementById('cards-container').style.display = 'none';
            document.getElementById('stopwatch-container').style.display = 'flex';
            this.state.active.stopwatchVal = 0; 
            this.stopStopwatch();
            document.getElementById('sw-display').innerText = "00:00";
            document.getElementById('btn-sw-toggle').classList.remove('running');
            document.getElementById('btn-sw-toggle').innerText = "▶";
            document.getElementById('rest-timer-area').style.display = 'none';
        } else {
            document.getElementById('cards-container').style.display = 'flex';
            document.getElementById('stopwatch-container').style.display = 'none';
            document.getElementById('unit-label-card').innerText = exDef.settings.unit === 'plates' ? 'פלטות' : 'ק״ג';
            
            let smartWeight = exInst.target?.w || 10;
            for(let i=this.state.history.length-1; i>=0; i--) {
                const sess = this.state.history[i];
                const found = sess.data.find(e => e.id === exInst.id);
                if(found && found.sets.length > 0) {
                    smartWeight = found.sets[found.sets.length-1].w;
                    break;
                }
            }
            this.state.active.inputW = smartWeight;
            this.state.active.inputR = exInst.target?.r || 12;
            this.populateSelects(exDef);
        }

        this.state.active.feel = 'good';
        this.updateFeelUI();
        document.getElementById('decision-buttons').style.display = 'none';
        document.getElementById('next-ex-preview').style.display = 'none';
        document.getElementById('btn-finish').style.display = 'flex';
        document.getElementById('rest-timer-area').style.display = 'none';
    },

    renderStatsStrip: function(exId, unit) {
        const strip = document.getElementById('last-stat-strip');
        let lastLog = null;
        for(let i=this.state.history.length-1; i>=0; i--) {
            const sess = this.state.history[i];
            const found = sess.data.find(e => e.id === exId);
            if(found && found.sets.length > 0) { lastLog = found.sets[found.sets.length-1]; break; }
        }
        if (!lastLog) { strip.innerText = "אין הישג קודם"; return; }
        const isTime = this.state.active.isStopwatch;
        const isBody = (unit === 'bodyweight' && !isTime);
        let wStr = isBody ? 'משקל גוף' : `${lastLog.w} ק״ג`;
        if (unit === 'plates') wStr = `${lastLog.w} פלטות`;
        let rStr = isTime ? `${lastLog.r} שניות` : `${lastLog.r} חזרות`;
        strip.innerText = (isTime && unit === 'bodyweight') ? `${rStr} (אימון קודם)` : `${wStr} | ${rStr}`;
    },

    populateSelects: function(exDef) {
        const selW = document.getElementById('select-weight');
        const selR = document.getElementById('select-reps');
        const s = exDef.settings || {unit:'kg', step:2.5, min:0, max:50};
        let wOpts = [];
        if (s.unit === 'bodyweight') wOpts = [0];
        else {
            const min = parseFloat(s.min), max = parseFloat(s.max), step = parseFloat(s.step) || 2.5;
            for(let v = min; v <= max; v += step) {
                let cleanV = parseFloat(v.toFixed(1));
                if(cleanV % 1 === 0) cleanV = parseInt(cleanV); 
                wOpts.push(cleanV);
            }
        }
        selW.innerHTML = '';
        wOpts.forEach(val => {
            const opt = document.createElement('option');
            opt.value = val; opt.text = val; selW.appendChild(opt);
        });
        if(wOpts.includes(this.state.active.inputW)) selW.value = this.state.active.inputW;
        else {
            const closest = wOpts.reduce((prev, curr) => (Math.abs(curr - this.state.active.inputW) < Math.abs(prev - this.state.active.inputW) ? curr : prev));
            selW.value = closest; this.state.active.inputW = closest;
        }
        selW.onchange = (e) => this.state.active.inputW = Number(e.target.value);
        let rOpts = [];
        const maxReps = exDef.cat === 'core' ? 50 : 30;
        for(let i=1; i<=maxReps; i++) rOpts.push(i);
        selR.innerHTML = '';
        rOpts.forEach(val => {
            const opt = document.createElement('option');
            opt.value = val; opt.text = val; selR.appendChild(opt);
        });
        selR.value = this.state.active.inputR;
        selR.onchange = (e) => this.state.active.inputR = Number(e.target.value);
    },

    toggleStopwatch: function() {
        const btn = document.getElementById('btn-sw-toggle');
        if (this.state.active.timerInterval) {
            clearInterval(this.state.active.timerInterval);
            this.state.active.timerInterval = null;
            btn.classList.remove('running'); btn.innerText = "▶";
        } else {
            this.stopRestTimer();
            const start = Date.now() - (this.state.active.stopwatchVal * 1000);
            btn.classList.add('running'); btn.innerText = "⏹";
            this.state.active.timerInterval = setInterval(() => {
                const diff = Math.floor((Date.now() - start) / 1000);
                this.state.active.stopwatchVal = diff;
                let m = Math.floor(diff / 60), s = diff % 60;
                document.getElementById('sw-display').innerText = `${m<10?'0'+m:m}:${s<10?'0'+s:s}`;
            }, 100);
        }
    },

    stopStopwatch: function() {
        if(this.state.active.timerInterval) clearInterval(this.state.active.timerInterval);
        this.state.active.timerInterval = null;
    },

    selectFeel: function(f) {
        this.state.active.feel = f;
        this.updateFeelUI();
    },

    updateFeelUI: function() {
        const map = { 'easy': 'קל', 'good': 'בינוני (טוב)', 'hard': 'קשה' };
        document.querySelectorAll('.feel-btn').forEach(b => b.classList.remove('selected'));
        document.querySelector(`.feel-btn.${this.state.active.feel}`).classList.add('selected');
        document.getElementById('feel-text').innerText = map[this.state.active.feel];
    },

    finishSet: function() {
        let w, r;
        if (this.state.active.isStopwatch) {
            if(this.state.active.timerInterval) this.toggleStopwatch(); 
            w = 0; r = this.state.active.stopwatchVal; 
            if (r === 0) { alert("לא נמדד זמן"); return; }
        } else {
            w = this.state.active.inputW; r = this.state.active.inputR;
        }

        const exInst = this.state.active.sessionExercises[this.state.active.exIdx];
        let exLog = this.state.active.log.find(l => l.id === exInst.id);
        if(!exLog) {
            exLog = { id: exInst.id, name: exInst.name, sets: [] };
            this.state.active.log.push(exLog);
        }
        exLog.sets.push({ w, r, feel: this.state.active.feel });

        const restTime = exInst.rest || 60;
        this.startRestTimer(restTime);

        if (this.state.active.setIdx < this.state.active.totalSets) {
            this.state.active.setIdx++;
            document.getElementById('set-badge').innerText = `סט ${this.state.active.setIdx} / ${this.state.active.totalSets}`;
            document.getElementById('btn-swap-ex').style.display = 'none';
            document.getElementById('btn-change-order').style.display = 'none';
            this.state.active.feel = 'good';
            this.updateFeelUI();
            if(this.state.active.isStopwatch) {
                this.state.active.stopwatchVal = 0;
                document.getElementById('sw-display').innerText = "00:00";
            }
        } else {
            document.getElementById('btn-swap-ex').style.display = 'none';
            document.getElementById('btn-change-order').style.display = 'none';
            document.getElementById('btn-finish').style.display = 'none';
            document.getElementById('decision-buttons').style.display = 'flex';
            document.getElementById('rest-timer-area').style.display = 'none';

            // Next Preview Logic (Linear vs Jump Back)
            let nextName = "סיום אימון";
            if (this.state.active.returnIdx !== null) {
                const retEx = this.state.active.sessionExercises[this.state.active.returnIdx];
                nextName = `חזרה ל: ${retEx.name}`;
            } else {
                const nextIncomplete = this.state.active.sessionExercises.find((ex, idx) => !ex.completed && idx !== this.state.active.exIdx);
                if (nextIncomplete) nextName = nextIncomplete.name;
            }
            
            const nextEl = document.getElementById('next-ex-preview');
            nextEl.innerText = "הבא בתור: " + nextName;
            nextEl.style.display = 'block';

            const exDef = this.getExerciseDef(exInst.id);
            document.getElementById('btn-add-core').style.display = (exDef.cat === 'core') ? 'block' : 'none';
        }
        this.saveSession();
    },

    startRestTimer: function(durationSec) {
        this.stopRestTimer();
        const area = document.getElementById('rest-timer-area'), disp = document.getElementById('rest-timer-val'), ring = document.getElementById('rest-ring-prog');
        area.style.display = 'flex';
        area.scrollIntoView({ behavior: 'smooth', block: 'center' });
        let sec = 0; disp.innerText = "00:00";
        const MAX_OFFSET = 408; ring.style.strokeDashoffset = MAX_OFFSET; 
        this.state.active.restInterval = setInterval(() => {
            sec++;
            let m = Math.floor(sec / 60), s = sec % 60;
            disp.innerText = `${m<10?'0'+m:m}:${s<10?'0'+s:s}`;
            if (sec <= durationSec) {
                const ratio = sec / durationSec;
                ring.style.strokeDashoffset = MAX_OFFSET - (MAX_OFFSET * ratio);
            } else ring.style.strokeDashoffset = 0; 
            if (sec === durationSec && navigator.vibrate) navigator.vibrate([200,100,200]);
        }, 1000);
    },

    stopRestTimer: function() {
        if(this.state.active.restInterval) clearInterval(this.state.active.restInterval);
        this.state.active.restInterval = null;
        document.getElementById('rest-timer-area').style.display = 'none';
    },

    stopAllTimers: function() { this.stopStopwatch(); this.stopRestTimer(); },

    addSet: function() {
        this.state.active.totalSets++;
        this.state.active.setIdx++;
        document.getElementById('set-badge').innerText = `סט ${this.state.active.setIdx} / ${this.state.active.totalSets}`;
        document.getElementById('btn-swap-ex').style.display = 'none';
        document.getElementById('btn-change-order').style.display = 'none';
        document.getElementById('decision-buttons').style.display = 'none';
        document.getElementById('next-ex-preview').style.display = 'none';
        document.getElementById('btn-finish').style.display = 'flex';
        document.getElementById('rest-timer-area').style.display = 'flex';
        document.getElementById('rest-timer-area').scrollIntoView({ behavior: 'smooth', block: 'center' });
        if(this.state.active.isStopwatch) {
            this.state.active.stopwatchVal = 0;
            document.getElementById('sw-display').innerText = "00:00";
        }
        this.saveSession();
    },

    deleteLastSet: function() {
        const exInst = this.state.active.sessionExercises[this.state.active.exIdx];
        let exLog = this.state.active.log.find(l => l.id === exInst.id);
        if(exLog && exLog.sets.length > 0) {
            exLog.sets.pop(); this.stopRestTimer();
            if (this.state.active.setIdx > 1) {
                this.state.active.setIdx--;
                document.getElementById('set-badge').innerText = `סט ${this.state.active.setIdx} / ${this.state.active.totalSets}`;
                const exDef = this.getExerciseDef(exInst.id);
                if (this.state.active.setIdx === 1) {
                     if (exDef.cat === 'core') document.getElementById('btn-swap-ex').style.display = 'block';
                     document.getElementById('btn-change-order').style.display = 'block';
                }
                document.getElementById('decision-buttons').style.display = 'none';
                document.getElementById('next-ex-preview').style.display = 'none';
                document.getElementById('btn-finish').style.display = 'flex';
            }
            this.saveSession();
        }
    },

    skipExercise: function() {
        this.nextExercise();
    },

    nextExercise: function() {
        this.stopAllTimers();
        
        // 1. Mark current as completed
        this.state.active.sessionExercises[this.state.active.exIdx].completed = true;

        // 2. Determine target index
        let targetIdx = null;

        if (this.state.active.returnIdx !== null) {
            // Priority: Return to jump point
            targetIdx = this.state.active.returnIdx;
            this.state.active.returnIdx = null;
        } else {
            // Find next incomplete
            const nextIdx = this.state.active.sessionExercises.findIndex((ex, idx) => !ex.completed);
            if (nextIdx !== -1) targetIdx = nextIdx;
        }

        // 3. Navigate or Finish
        if (targetIdx !== null) {
            this.state.active.exIdx = targetIdx;
            this.state.active.setIdx = 1;
            this.saveSession();
            this.loadActiveExercise();
        } else {
            this.finishWorkout();
        }
    },

    /* --- NON-LINEAR ORDER LOGIC --- */

    openOrderSelector: function() {
        const list = document.getElementById('order-sel-list');
        list.innerHTML = '';
        
        // Only show incomplete exercises
        this.state.active.sessionExercises.forEach((ex, idx) => {
            if (ex.completed) return;
            
            const isCurrent = (idx === this.state.active.exIdx);
            const style = isCurrent ? 'border-color:var(--primary); opacity:0.6;' : '';
            const label = isCurrent ? '(נוכחי)' : '';

            list.innerHTML += `
                <div class="list-item" style="${style}" onclick="${isCurrent ? '' : `app.jumpToExercise(${idx})`}">
                    <span>${idx + 1}. ${ex.name} ${label}</span>
                    ${!isCurrent ? '<span style="color:var(--primary)">עברי לתרגיל זה</span>' : ''}
                </div>
            `;
        });
        this.nav('screen-order-selector');
    },

    jumpToExercise: function(targetIdx) {
        // Save where we are jumping FROM if we don't already have a return point
        if (this.state.active.returnIdx === null) {
            this.state.active.returnIdx = this.state.active.exIdx;
        }
        
        this.state.active.exIdx = targetIdx;
        this.state.active.setIdx = 1;
        
        this.loadActiveExercise();
        this.nav('screen-active');
        this.saveSession();
    },

    finishWorkout: function(isRestore = false) {
        const currentSegment = Date.now() - this.state.active.startTime;
        const totalDurationMs = (this.state.active.accumulatedTime || 0) + currentSegment;
        const durationMin = Math.round(totalDurationMs / 60000);
        const dateStr = new Date().toLocaleDateString('he-IL');
        const progTitle = this.state.routines[this.state.currentProgId].title;

        const tempItem = {
            program: this.state.currentProgId,
            programTitle: progTitle, 
            date: dateStr,
            duration: durationMin,
            data: this.state.active.log
        };

        const meta = document.getElementById('summary-meta');
        meta.innerText = `${dateStr} | ${durationMin} דקות`;
        const textBox = document.getElementById('summary-text');
        textBox.innerText = this.generateLogText(tempItem);
        
        this.nav('screen-summary');
        this.saveSession(); 
    },

    generateLogText: function(historyItem) {
        const pName = historyItem.programTitle || historyItem.program;
        let txt = `סיכום אימון: ${pName}\nתאריך: ${historyItem.date} | משך: ${historyItem.duration} דק'\n\n`;
        historyItem.data.forEach(ex => {
            if(ex.sets.length > 0) {
                txt += `✅ ${ex.name}\n`;
                const exDef = this.getExerciseDef(ex.id);
                const isTime = (ex.id.includes('plank') || (exDef.settings.unit === 'bodyweight' && ex.sets[0].w === 0));
                ex.sets.forEach((s, i) => {
                    let valStr = (isTime && s.w === 0) ? `${s.r} שנ׳` : `${s.w} ק״ג | ${s.r} חזרות`;
                    if(exDef.settings.unit === 'plates' && s.w !== 0) valStr = `${s.w} פלטות | ${s.r} חזרות`;
                    if(s.w === 0 && !isTime) valStr = `משקל גוף | ${s.r} חזרות`;
                    txt += `   סט ${i+1}: ${valStr} (${FEEL_MAP_TEXT[s.feel] || 'טוב'})\n`;
                });
                txt += "\n";
            }
        });
        return txt;
    },

    finishAndSave: async function() {
        if (this.state.active.log.length === 0) { alert("אין נתונים לשמירה"); this.clearSession(); window.location.reload(); return; }
        const currentSegment = Date.now() - this.state.active.startTime;
        const totalDurationMs = (this.state.active.accumulatedTime || 0) + currentSegment;
        const duration = Math.round(totalDurationMs / 60000);
        const progTitle = this.state.routines[this.state.currentProgId].title;
        const historyItem = {
            date: new Date().toLocaleDateString('he-IL'), timestamp: Date.now(),
            program: this.state.currentProgId, programTitle: progTitle, 
            data: this.state.active.log, duration: duration
        };
        const txt = document.getElementById('summary-text').innerText;
        try { await navigator.clipboard.writeText(txt); alert("הסיכום הועתק ללוח ונשמר בהצלחה!"); } 
        catch (err) { alert("האימון נשמר בהיסטוריה!"); }
        this.state.history.push(historyItem); this.saveData(); this.clearSession(); window.location.reload();
    },

    /* --- OTHER UTILS (SWAP/ADMIN/ETC) --- */
    openSwapExercise: function() {
        this.state.userSelector.mode = 'swap';
        this.renderUserSelector('core');
        document.getElementById('user-sel-title').innerText = "החליפי תרגיל";
        document.getElementById('user-selector-modal').style.display = 'flex';
    },
    openAddCoreExercise: function() {
        this.state.userSelector.mode = 'add';
        this.renderUserSelector('core');
        document.getElementById('user-sel-title').innerText = "הוסיפי תרגיל";
        document.getElementById('user-selector-modal').style.display = 'flex';
    },
    closeUserSelector: function() { document.getElementById('user-selector-modal').style.display = 'none'; },
    renderUserSelector: function(cat) {
        const list = document.getElementById('user-sel-list'); list.innerHTML = '';
        let candidates = this.state.exercises.filter(e => e.cat === cat);
        if (this.state.userSelector.mode === 'add') {
             const currentIds = this.state.active.sessionExercises.map(e => e.id);
             candidates = candidates.filter(e => !currentIds.includes(e.id));
        }
        candidates.forEach(e => {
            list.innerHTML += `<div class="list-item" onclick="app.userSelectExercise('${e.id}')">
                <span style="font-weight:700">${e.name}</span><span style="color:var(--primary)">+</span>
            </div>`;
        });
    },
    userSelectExercise: function(exId) {
        const newExDef = this.getExerciseDef(exId);
        if (this.state.userSelector.mode === 'swap') {
            this.state.active.sessionExercises[this.state.active.exIdx] = { id: exId, name: newExDef.name, sets: 3, rest: 60, completed: false };
            this.loadActiveExercise();
        } else if (this.state.userSelector.mode === 'add') {
            const newExInst = { id: exId, name: newExDef.name, sets: 3, rest: 60, completed: false };
            this.state.active.sessionExercises.splice(this.state.active.exIdx + 1, 0, newExInst);
            this.nextExercise();
        }
        this.saveSession(); this.closeUserSelector();
    },

    /* Admin & History Logic (Same as V1.8.1 but persistent with the new version) */
    openAdminHome: function() { 
        if (this.state.active.on) { alert("לא ניתן להיכנס לניהול בזמן אימון פעיל."); return; }
        document.getElementById('admin-modal').style.display = 'flex';
        document.getElementById('admin-view-home').style.display = 'flex';
        ['admin-view-edit','admin-view-selector','admin-view-ex-manager','admin-view-ex-edit'].forEach(v => document.getElementById(v).style.display='none');
        this.renderAdminList();
    },
    closeAdmin: function() { this.saveData(); this.renderProgramSelect(); document.getElementById('admin-modal').style.display = 'none'; },
    renderAdminList: function() {
        const list = document.getElementById('admin-prog-list'); list.innerHTML = '';
        const ids = Object.keys(this.state.routines);
        if(ids.length === 0) list.innerHTML = '<div style="text-align:center; color:#666; padding:20px;">אין תוכניות</div>';
        ids.forEach(pid => {
            const prog = this.state.routines[pid];
            list.innerHTML += `<div class="manager-item" onclick="app.openAdminEdit('${pid}')">
                <div class="manager-info"><h3>${prog.title}</h3><p>${prog.exercises.length} תרגילים</p></div>
                <div class="manager-actions">
                    <button class="btn-text-action" onclick="event.stopPropagation(); app.duplicateProgram('${pid}')">שכפל</button>
                    <button class="btn-text-action delete" onclick="event.stopPropagation(); app.deleteProgram('${pid}')">מחק</button>
                </div>
            </div>`;
        });
    },
    createNewProgram: function() {
        const id = 'prog_' + Date.now(); this.state.routines[id] = { title: 'תוכנית חדשה', exercises: [] }; this.openAdminEdit(id);
    },
    duplicateProgram: function(pid) {
        const newId = 'prog_' + Date.now(); const copy = JSON.parse(JSON.stringify(this.state.routines[pid]));
        copy.title += " (עותק)"; this.state.routines[newId] = copy; this.renderAdminList();
    },
    deleteProgram: function(pid) { if(confirm("למחוק את התוכנית?")) { delete this.state.routines[pid]; this.renderAdminList(); } },
    openAdminEdit: function(pid) {
        this.state.admin.viewProgId = pid; this.state.admin.tempExercises = JSON.parse(JSON.stringify(this.state.routines[pid].exercises));
        document.getElementById('admin-view-home').style.display = 'none'; document.getElementById('admin-view-edit').style.display = 'flex';
        document.getElementById('edit-prog-title').value = this.state.routines[pid].title; this.renderEditorList();
    },
    saveAndCloseEditor: function() {
        const pid = this.state.admin.viewProgId; this.state.routines[pid].exercises = this.state.admin.tempExercises;
        this.state.routines[pid].title = document.getElementById('edit-prog-title').value; this.saveData(); this.openAdminHome();
    },
    renderEditorList: function() {
        const list = document.getElementById('admin-ex-list'); list.innerHTML = '';
        this.state.admin.tempExercises.forEach((ex, i) => {
            const hasTip = ex.note ? 'has-tip' : '';
            list.innerHTML += `<div class="editor-row">
                <div class="row-top"><div class="row-title">${i+1}. ${ex.name}</div>
                    <div class="row-ctrls"><button class="ctrl-btn" onclick="app.moveEx(${i}, -1)">▲</button><button class="ctrl-btn" onclick="app.moveEx(${i}, 1)">▼</button><button class="ctrl-btn del" onclick="app.removeEx(${i})">×</button></div>
                </div>
                <div class="row-btm">
                    <button class="tip-btn ${hasTip}" onclick="app.openTipModal(${i})">💡 טיפ</button>
                    <div class="stepper"><div class="step-label">סטים</div><button class="step-btn" onclick="app.updateTempEx(${i}, 'sets', -1)">-</button><div class="step-val">${ex.sets}</div><button class="step-btn" onclick="app.updateTempEx(${i}, 'sets', 1)">+</button></div>
                    <div class="stepper"><div class="step-label">מנוחה</div><button class="step-btn" onclick="app.updateTempEx(${i}, 'rest', -15)">-</button><div class="step-val">${ex.rest||60}</div><button class="step-btn" onclick="app.updateTempEx(${i}, 'rest', 15)">+</button></div>
                </div>
            </div>`;
        });
    },
    updateTempEx: function(i, field, delta) {
        let val = (this.state.admin.tempExercises[i][field] || 0) + delta;
        if(field === 'sets' && val < 1) val = 1; if(field === 'rest' && val < 0) val = 0;
        this.state.admin.tempExercises[i][field] = val; this.renderEditorList();
    },
    moveEx: function(i, dir) {
        const arr = this.state.admin.tempExercises; if ((i === 0 && dir === -1) || (i === arr.length - 1 && dir === 1)) return;
        [arr[i], arr[i+dir]] = [arr[i+dir], arr[i]]; this.renderEditorList();
    },
    removeEx: function(i) { this.state.admin.tempExercises.splice(i, 1); this.renderEditorList(); },
    openExerciseManager: function() {
        document.getElementById('admin-view-home').style.display = 'none'; document.getElementById('admin-view-ex-manager').style.display = 'flex';
        document.getElementById('ex-mgr-search').value = ''; this.state.admin.exManagerFilter = 'all'; this.updateExManagerChips(); this.renderExerciseManagerList();
    },
    setExManagerFilter: function(cat) { this.state.admin.exManagerFilter = cat; this.updateExManagerChips(); this.renderExerciseManagerList(); },
    updateExManagerChips: function() {
        const map = { 'all':0, 'legs':1, 'chest':2, 'back':3, 'shoulders':4, 'arms':5, 'core':6 };
        const idx = map[this.state.admin.exManagerFilter];
        const chips = document.querySelector('#admin-view-ex-manager .chip-container').querySelectorAll('.chip');
        chips.forEach((c, i) => i === idx ? c.classList.add('active') : c.classList.remove('active'));
    },
    renderExerciseManagerList: function() {
        const list = document.getElementById('ex-mgr-list'); list.innerHTML = '';
        const term = document.getElementById('ex-mgr-search').value.toLowerCase();
        this.state.exercises.filter(e => (cat === 'all' || e.cat === this.state.admin.exManagerFilter) && e.name.toLowerCase().includes(term)).forEach(e => {
             list.innerHTML += `<div class="list-item" onclick="app.editExerciseInBank('${e.id}')"><div style="font-weight:700">${e.name}</div><div style="font-size:0.8rem; color:#888;">${this.getCatLabel(e.cat)}</div></div>`;
        });
    },
    editExerciseInBank: function(exId) {
        this.state.admin.editingExId = exId; const ex = this.state.exercises.find(e => e.id === exId);
        document.getElementById('admin-view-ex-manager').style.display = 'none'; document.getElementById('admin-view-ex-edit').style.display = 'flex';
        document.getElementById('edit-ex-name').value = ex.name; document.getElementById('edit-ex-cat').value = ex.cat;
        document.getElementById('edit-ex-video').value = ex.videoUrl || ''; document.getElementById('edit-ex-unit').value = ex.settings.unit;
        document.getElementById('edit-ex-step').value = ex.settings.step; document.getElementById('edit-ex-min').value = ex.settings.min;
        document.getElementById('edit-ex-max').value = ex.settings.max; document.getElementById('edit-ex-unilateral').checked = ex.settings.isUnilateral || false;
    },
    saveExerciseToBank: function() {
        const exId = this.state.admin.editingExId;
        const newEx = { id: exId, name: document.getElementById('edit-ex-name').value, cat: document.getElementById('edit-ex-cat').value, videoUrl: document.getElementById('edit-ex-video').value,
            settings: { unit: document.getElementById('edit-ex-unit').value, step: Number(document.getElementById('edit-ex-step').value), min: Number(document.getElementById('edit-ex-min').value), max: Number(document.getElementById('edit-ex-max').value), isUnilateral: document.getElementById('edit-ex-unilateral').checked }
        };
        const idx = this.state.exercises.findIndex(e => e.id === exId);
        if (idx > -1) this.state.exercises[idx] = newEx; else this.state.exercises.push(newEx);
        this.saveData(); document.getElementById('admin-view-ex-edit').style.display = 'none'; document.getElementById('admin-view-ex-manager').style.display = 'flex'; this.renderExerciseManagerList();
    },
    openAdminSelector: function() {
        document.getElementById('admin-view-edit').style.display = 'none'; document.getElementById('admin-view-selector').style.display = 'flex';
        document.getElementById('selector-search').value = ''; this.state.admin.selectorFilter = 'all'; this.updateFilterChips(); this.renderSelectorList();
    },
    closeSelector: function() { document.getElementById('admin-view-selector').style.display = 'none'; document.getElementById('admin-view-edit').style.display = 'flex'; },
    setSelectorFilter: function(cat) { this.state.admin.selectorFilter = cat; this.updateFilterChips(); this.renderSelectorList(); },
    updateFilterChips: function() {
        const map = { 'all':0, 'legs':1, 'chest':2, 'back':3, 'shoulders':4, 'arms':5, 'core':6 };
        const idx = map[this.state.admin.selectorFilter];
        const chips = document.querySelector('#admin-view-selector .chip-container').querySelectorAll('.chip');
        chips.forEach((c, i) => i === idx ? c.classList.add('active') : c.classList.remove('active'));
    },
    renderSelectorList: function() {
        const list = document.getElementById('selector-list'); list.innerHTML = '';
        const search = document.getElementById('selector-search').value.toLowerCase();
        this.state.exercises.filter(e => (this.state.admin.selectorFilter === 'all' || e.cat === this.state.admin.selectorFilter) && e.name.toLowerCase().includes(search)).forEach(e => {
            list.innerHTML += `<div class="list-item" onclick="app.addExerciseFromSelector('${e.id}')"><span style="font-weight:700">${e.name}</span><span style="color:var(--primary)">+</span></div>`;
        });
    },
    addExerciseFromSelector: function(exId) {
        const bankEx = this.getExerciseDef(exId);
        this.state.admin.tempExercises.push({ id: bankEx.id, name: bankEx.name, sets: 3, rest: 60, note: '', target: {w:10, r:12} });
        this.closeSelector(); this.renderEditorList();
    },
    getCatLabel: function(c) {
        const map = {legs:'רגליים', chest:'חזה', back:'גב', shoulders:'כתפיים', arms:'ידיים', core:'בטן', other:'אחר'};
        return map[c] || c;
    },
    openTipModal: function(idx) {
        this.state.admin.editTipEx = idx; document.getElementById('tip-input').value = this.state.admin.tempExercises[idx].note || ''; document.getElementById('tip-modal').style.display = 'flex';
    },
    closeTipModal: function() { document.getElementById('tip-modal').style.display = 'none'; },
    saveTip: function() {
        if(this.state.admin.editTipEx !== null) { this.state.admin.tempExercises[this.state.admin.editTipEx].note = document.getElementById('tip-input').value; this.renderEditorList(); }
        this.closeTipModal();
    },
    exportConfig: function() {
        this.downloadJSON({ type: 'config', ver: CONFIG.VERSION, date: new Date().toLocaleDateString(), routines: this.state.routines, exercises: this.state.exercises }, `gymstart_config_${Date.now()}.json`);
    },
    importConfig: function(input) {
        const file = input.files[0]; if (!file) return;
        const reader = new FileReader(); reader.onload = (e) => {
            try { const json = JSON.parse(e.target.result); if (json.type !== 'config') return; if(confirm("לעדכן תוכניות ומאגר?")) { this.state.routines = json.routines; if(json.exercises) this.state.exercises = json.exercises; this.saveData(); location.reload(); } } catch(err) { alert("שגיאה"); }
        }; reader.readAsText(file);
    },
    exportHistory: function() { this.downloadJSON({ type: 'history', ver: CONFIG.VERSION, history: this.state.history }, `gymstart_history_${Date.now()}.json`); },
    importHistory: function(input) {
        const file = input.files[0]; if (!file) return;
        const reader = new FileReader(); reader.onload = (e) => {
            try { const json = JSON.parse(e.target.result); let newHist = json.history || json; if(confirm(`למזג ${newHist.length} אימונים?`)) { this.state.history = [...this.state.history, ...newHist]; this.state.history.sort((a,b) => a.timestamp - b.timestamp); this.saveData(); this.showHistory(); } } catch(err) { alert("שגיאה"); }
        }; reader.readAsText(file);
    },
    downloadJSON: function(data, filename) {
        const a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data)); a.download = filename; a.click();
    },
    factoryReset: function() { if(confirm("איפוס מלא?")) { localStorage.clear(); location.reload(); } },
    showHistory: function() {
        this.state.historySelection = []; this.updateHistoryActions(); const list = document.getElementById('history-list'); list.innerHTML = '';
        [...this.state.history].reverse().forEach((h, i) => {
            const realIdx = this.state.history.length - 1 - i;
            list.innerHTML += `<div class="hist-item-row">
                <input type="checkbox" class="custom-chk" onchange="app.toggleHistorySelection(${realIdx}, this)">
                <div style="flex:1" onclick="app.showHistoryDetail(${realIdx})">
                    <div style="display:flex; justify-content:space-between"><span style="font-weight:700">${h.date}</span><span class="badge" style="background:#333; color:white; font-size:0.75rem">${h.programTitle || h.program}</span></div>
                    <div style="font-size:0.85rem; color:var(--text-sec); margin-top:5px">${h.data.length} תרגילים • ${h.duration||'?'} דק'</div>
                </div>
            </div>`;
        });
        this.nav('screen-history');
    },
    toggleHistorySelection: function(idx, el) {
        if(el.checked) this.state.historySelection.push(idx); else this.state.historySelection = this.state.historySelection.filter(i => i !== idx);
        this.updateHistoryActions();
    },
    updateHistoryActions: function() {
        const btn = document.getElementById('btn-del-selected'); btn.disabled = this.state.historySelection.length === 0;
        btn.innerText = this.state.historySelection.length > 0 ? `מחק (${this.state.historySelection.length})` : "מחק";
    },
    selectAllHistory: function() {
        const inputs = document.querySelectorAll('.custom-chk');
        if (this.state.historySelection.length === this.state.history.length) { this.state.historySelection = []; inputs.forEach(i => i.checked = false); }
        else { this.state.historySelection = this.state.history.map((_, i) => i); inputs.forEach(i => i.checked = true); }
        this.updateHistoryActions();
    },
    deleteSelectedHistory: function() {
        if (confirm(`למחוק ${this.state.historySelection.length} אימונים?`)) { this.state.history = this.state.history.filter((_, idx) => !this.state.historySelection.includes(idx)); this.saveData(); this.showHistory(); }
    },
    copySelectedHistory: function() {
        let txt = ""; [...this.state.historySelection].sort().forEach(idx => txt += this.generateLogText(this.state.history[idx]) + "----\n"); this.copyText(txt);
    },
    showHistoryDetail: function(idx) {
        this.state.viewHistoryIdx = idx; const item = this.state.history[idx];
        document.getElementById('hist-meta-header').innerHTML = `<h3>${item.programTitle || item.program}</h3><p>${item.date} | ${item.duration} דק'</p>`;
        let html = ''; item.data.forEach(ex => {
            html += `<div style="background:var(--bg-card); padding:15px; border-radius:12px; margin-bottom:10px; border:1px solid #222;"><div style="font-weight:700; color:var(--primary)">${ex.name}</div>`;
            const exDef = this.getExerciseDef(ex.id);
            const isTime = (ex.id.includes('plank') || (exDef.settings.unit === 'bodyweight' && ex.sets[0].w === 0));
            ex.sets.forEach((s, si) => {
                let valStr = (isTime && s.w === 0) ? `${s.r} שנ׳` : `${s.w} ק״ג | ${s.r} חזרות`;
                html += `<div style="display:flex; justify-content:space-between; font-size:0.9rem; margin-top:5px; border-bottom:1px dashed #333; padding-bottom:5px"><span>סט ${si+1} (${FEEL_MAP_TEXT[s.feel] || 'טוב'})</span><span>${valStr}</span></div>`;
            });
            html += `</div>`;
        });
        document.getElementById('hist-detail-content').innerHTML = html; document.getElementById('history-modal').style.display = 'flex';
    },
    closeHistoryModal: function() { document.getElementById('history-modal').style.display = 'none'; },
    deleteCurrentLog: function() { if(confirm("למחוק?")) { this.state.history.splice(this.state.viewHistoryIdx, 1); this.saveData(); this.closeHistoryModal(); this.showHistory(); } },
    copyText: function(txt) { navigator.clipboard.writeText(txt).then(() => alert("הועתק!")); }
};

window.addEventListener('DOMContentLoaded', () => app.init());
