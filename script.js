/**
 * GYMSTART V1.8.0
 * - New Feature: Auto-resume active session on app reload/re-entry.
 * - New Feature: Single "Copy and Save" button in the summary screen.
 */

const CONFIG = {
    KEYS: {
        ROUTINES: 'gymstart_v1_7_routines',
        HISTORY: 'gymstart_beta_02_history',
        EXERCISES: 'gymstart_v1_7_exercises_bank',
        ACTIVE_SESSION: 'gymstart_v1_8_active_session' // NEW KEY FOR AUTO-RESUME
    },
    VERSION: '1.8.0'
};

const FEEL_MAP_TEXT = { 'easy': 'קל', 'good': 'בינוני', 'hard': 'קשה' };

const app = {
    state: {
        routines: {},
        history:[],
        exercises:[], 
        currentProgId: null,
        active: {
            on: false,
            sessionExercises:[], 
            exIdx: 0, setIdx: 1, totalSets: 3,
            log:[], startTime: 0,
            timerInterval: null, restInterval: null, 
            feel: 'good', isStopwatch: false, stopwatchVal: 0,
            inputW: 10, inputR: 12
        },
        admin: { 
            viewProgId: null, 
            editTipEx: null, 
            selectorFilter: 'all',
            exManagerFilter: 'all',
            tempExercises:[],
            editingExId: null
        },
        userSelector: {
            mode: null, 
        },
        historySelection:[],
        viewHistoryIdx: null
    },

    init: function() {
        try {
            this.loadData();
            
            // Check if there is an active session running to auto-resume
            if (this.state.active && this.state.active.on) {
                this.loadActiveExercise();
                this.nav('screen-active');
            } else {
                this.renderHome();
                this.renderProgramSelect(); 
                this.nav('screen-home'); 
            }
        } catch (e) {
            console.error(e);
            alert("שגיאה בטעינת נתונים.");
        }
    },

    loadData: function() {
        // Load History
        const h = localStorage.getItem(CONFIG.KEYS.HISTORY);
        this.state.history = h ? JSON.parse(h) :[];
        
        // Load Routines
        const r = localStorage.getItem(CONFIG.KEYS.ROUTINES);
        let loadedRoutines = r ? JSON.parse(r) : null;
        if (!loadedRoutines) {
            this.state.routines = {}; 
        } else {
            this.state.routines = loadedRoutines;
        }

        // Load Exercises 
        const e = localStorage.getItem(CONFIG.KEYS.EXERCISES);
        if(e) {
            this.state.exercises = JSON.parse(e);
        } else {
            this.state.exercises =[];
        }

        // Load Active Session (Auto Resume)
        const a = localStorage.getItem(CONFIG.KEYS.ACTIVE_SESSION);
        if (a) {
            try {
                const sessionData = JSON.parse(a);
                this.state.currentProgId = sessionData.progId;
                this.state.active = sessionData.active;
            } catch (err) {
                console.error("Failed to parse active session", err);
                localStorage.removeItem(CONFIG.KEYS.ACTIVE_SESSION);
            }
        }
    },

    saveData: function() {
        localStorage.setItem(CONFIG.KEYS.ROUTINES, JSON.stringify(this.state.routines));
        localStorage.setItem(CONFIG.KEYS.HISTORY, JSON.stringify(this.state.history));
        localStorage.setItem(CONFIG.KEYS.EXERCISES, JSON.stringify(this.state.exercises));
    },

    saveActiveState: function() {
        if (this.state.active.on) {
            const activeCopy = { ...this.state.active };
            activeCopy.timerInterval = null; // Do not serialize intervals
            activeCopy.restInterval = null;
            
            const sessionData = {
                progId: this.state.currentProgId,
                active: activeCopy
            };
            localStorage.setItem(CONFIG.KEYS.ACTIVE_SESSION, JSON.stringify(sessionData));
        } else {
            localStorage.removeItem(CONFIG.KEYS.ACTIVE_SESSION);
        }
    },

    nav: function(screenId) {
        document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
        
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
                this.saveActiveState(); // Clears from storage
                this.nav('screen-overview');
            }
        } else if (activeScreen === 'screen-overview') {
             this.nav('screen-program-select');
        } else {
            this.nav('screen-home');
        }
    },

    getExerciseDef: function(exId) {
        return this.state.exercises.find(e => e.id === exId) || 
               { name: 'תרגיל לא ידוע', settings: {unit:'kg', step:2.5, min:0, max:50} };
    },

    /* --- RENDERING --- */

    renderProgramSelect: function() {
        const container = document.getElementById('prog-list-container');
        container.innerHTML = '';
        const ids = Object.keys(this.state.routines);
        
        if(ids.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#666;">אין תוכניות זמינות.</div>';
            return;
        }

        ids.forEach(pid => {
            const prog = this.state.routines;
            const badge = pid.charAt(0).toUpperCase();
            const count = prog.exercises.length;
            
            let desc = `${count} תרגילים`;
            if (count > 0) {
                const firstEx = prog.exercises.name;
                desc += ` • מתחיל ב: ${firstEx}`;
            }

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
        const prog = this.state.routines;
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
            const last = this.state.history;
            const displayName = last.programTitle || last.program; 
            lastEl.innerText = `${last.date} (${displayName})`;
        } else {
            lastEl.innerText = "טרם בוצע";
        }
    },

    /* --- WORKOUT LOGIC --- */
    startWorkout: function() {
        if (!this.state.routines || 
            this.state.routines.exercises.length === 0) {
            alert("התוכנית ריקה"); return;
        }

        const prog = this.state.routines;

        this.state.active = {
            on: true,
            sessionExercises: JSON.parse(JSON.stringify(prog.exercises)),
            exIdx: 0, setIdx: 1, totalSets: 3,
            log:[], startTime: Date.now(),
            timerInterval: null, restInterval: null, 
            feel: 'good', isStopwatch: false, stopwatchVal: 0,
            inputW: 10, inputR: 12
        };
        
        this.saveActiveState();
        this.loadActiveExercise();
        this.nav('screen-active');
    },

    loadActiveExercise: function() {
        const exInst = this.state.active.sessionExercises;
        const exDef = this.getExerciseDef(exInst.id);
        
        this.state.active.totalSets = exInst.sets || 3;

        document.getElementById('ex-name').innerText = exInst.name;
        document.getElementById('set-badge').innerText = `סט ${this.state.active.setIdx} / ${this.state.active.totalSets}`;
        
        // Video Link
        const vidBtn = document.getElementById('ex-video-link');
        if (exDef.videoUrl && exDef.videoUrl.length > 5) {
            vidBtn.style.display = 'flex';
            vidBtn.href = exDef.videoUrl;
        } else {
            vidBtn.style.display = 'none';
        }

        // Swap Button Logic: Core exercises ONLY, and ONLY on Set 1
        const swapBtn = document.getElementById('btn-swap-ex');
        if (exDef.cat === 'core' && this.state.active.setIdx === 1) {
            swapBtn.style.display = 'block';
        } else {
            swapBtn.style.display = 'none';
        }

        const noteEl = document.getElementById('coach-note');
        if (exInst.note) {
            noteEl.innerText = "💡 " + exInst.note;
            noteEl.style.display = 'block';
        } else noteEl.style.display = 'none';

        this.renderStatsStrip(exInst.id, exDef.settings.unit);

        // Check type
        const isTime = (exDef.settings.unit === 'bodyweight' && (exInst.id.includes('plank') || exInst.id.includes('static')));
        this.state.active.isStopwatch = isTime;

        if (isTime) {
            document.getElementById('cards-container').style.display = 'none';
            document.getElementById('stopwatch-container').style.display = 'flex';
            if (!this.state.active.stopwatchVal) {
                this.state.active.stopwatchVal = 0;
            }
            this.stopStopwatch();
            let m = Math.floor(this.state.active.stopwatchVal / 60);
            let s = this.state.active.stopwatchVal % 60;
            document.getElementById('sw-display').innerText = `${m<10?'0'+m:m}:${s<10?'0'+s:s}`;
            document.getElementById('btn-sw-toggle').classList.remove('running');
            document.getElementById('btn-sw-toggle').innerText = "▶";
            document.getElementById('rest-timer-area').style.display = 'none';
        } else {
            document.getElementById('cards-container').style.display = 'flex';
            document.getElementById('stopwatch-container').style.display = 'none';
            document.getElementById('unit-label-card').innerText = exDef.settings.unit === 'plates' ? 'פלטות' : 'ק״ג';
            
            // SMART WEIGHT PREDICTION
            let smartWeight = exInst.target?.w || 10;
            // Overwrite with history if exists
            for(let i=this.state.history.length-1; i>=0; i--) {
                const sess = this.state.history;
                const found = sess.data.find(e => e.id === exInst.id);
                if(found && found.sets.length > 0) {
                    smartWeight = found.sets.w;
                    break;
                }
            }
            if (!this.state.active.inputW || this.state.active.setIdx === 1) {
                this.state.active.inputW = smartWeight;
            }
            this.state.active.inputR = this.state.active.inputR || exInst.target?.r || 12;
            this.populateSelects(exDef);
        }

        this.updateFeelUI();

        // RESUME LOGIC: Check if this exercise is already fully finished
        let exLog = this.state.active.log.find(l => l.id === exInst.id);
        if (exLog && exLog.sets.length >= this.state.active.totalSets) {
            document.getElementById('decision-buttons').style.display = 'flex';
            document.getElementById('btn-finish').style.display = 'none';
            document.getElementById('next-ex-preview').style.display = 'block';
            document.getElementById('rest-timer-area').style.display = 'none';
            document.getElementById('btn-swap-ex').style.display = 'none';
            
            const nextEx = this.state.active.sessionExercises;
            const nextEl = document.getElementById('next-ex-preview');
            nextEl.innerText = nextEx ? `הבא בתור: ${nextEx.name}` : "הבא בתור: סיום אימון";
            
            const addBtn = document.getElementById('btn-add-core');
            if (exDef.cat === 'core') addBtn.style.display = 'block';
            else addBtn.style.display = 'none';
        } else {
            document.getElementById('decision-buttons').style.display = 'none';
            document.getElementById('next-ex-preview').style.display = 'none';
            document.getElementById('btn-finish').style.display = 'flex';
            document.getElementById('rest-timer-area').style.display = 'none';
        }
    },

    renderStatsStrip: function(exId, unit) {
        const strip = document.getElementById('last-stat-strip');
        
        let lastLog = null;
        for(let i=this.state.history.length-1; i>=0; i--) {
            const sess = this.state.history;
            const found = sess.data.find(e => e.id === exId);
            if(found && found.sets.length > 0) { 
                lastLog = found.sets; 
                break; 
            }
        }

        if (!lastLog) {
            strip.innerText = "אין הישג קודם";
            return;
        }

        const isTime = this.state.active.isStopwatch;
        const isBody = (unit === 'bodyweight' && !isTime);
        
        let wStr = isBody ? 'משקל גוף' : `${lastLog.w} ק״ג`;
        if (unit === 'plates') wStr = `${lastLog.w} פלטות`;
        
        let rStr = isTime ? `${lastLog.r} שניות` : `${lastLog.r} חזרות`;
        
        if (isTime && unit === 'bodyweight') {
            strip.innerText = `${rStr} (אימון קודם)`;
        } else {
            strip.innerText = `${wStr} | ${rStr}`;
        }
    },

    populateSelects: function(exDef) {
        const selW = document.getElementById('select-weight');
        const selR = document.getElementById('select-reps');
        const s = exDef.settings || {unit:'kg', step:2.5, min:0, max:50};

        let wOpts =[];
        if (s.unit === 'bodyweight') {
            wOpts =;
        } else {
            const min = parseFloat(s.min);
            const max = parseFloat(s.max);
            const step = parseFloat(s.step) || 2.5;
            
            for(let v = min; v <= max; v += step) {
                let cleanV = parseFloat(v.toFixed(1));
                if(cleanV % 1 === 0) cleanV = parseInt(cleanV); 
                wOpts.push(cleanV);
            }
        }

        selW.innerHTML = '';
        wOpts.forEach(val => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.text = val;
            selW.appendChild(opt);
        });

        if(wOpts.includes(this.state.active.inputW)) {
            selW.value = this.state.active.inputW;
        } else {
            const closest = wOpts.reduce((prev, curr) => {
                return (Math.abs(curr - this.state.active.inputW) < Math.abs(prev - this.state.active.inputW) ? curr : prev);
            });
            selW.value = closest;
            this.state.active.inputW = closest;
        }
        
        selW.onchange = (e) => this.state.active.inputW = Number(e.target.value);

        let rOpts =[];
        const maxReps = exDef.cat === 'core' ? 50 : 30;
        for(let i=1; i<=maxReps; i++) rOpts.push(i);

        selR.innerHTML = '';
        rOpts.forEach(val => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.text = val;
            selR.appendChild(opt);
        });
        selR.value = this.state.active.inputR;
        selR.onchange = (e) => this.state.active.inputR = Number(e.target.value);
    },

    toggleStopwatch: function() {
        const btn = document.getElementById('btn-sw-toggle');
        if (this.state.active.timerInterval) {
            clearInterval(this.state.active.timerInterval);
            this.state.active.timerInterval = null;
            btn.classList.remove('running');
            btn.innerText = "▶";
        } else {
            this.stopRestTimer();
            const start = Date.now() - (this.state.active.stopwatchVal * 1000);
            btn.classList.add('running');
            btn.innerText = "⏹";
            this.state.active.timerInterval = setInterval(() => {
                const diff = Math.floor((Date.now() - start) / 1000);
                this.state.active.stopwatchVal = diff;
                let m = Math.floor(diff / 60);
                let s = diff % 60;
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
        document.getElementById('feel-text').innerText = map;
    },

    finishSet: function() {
        let w, r;
        if (this.state.active.isStopwatch) {
            if(this.state.active.timerInterval) this.toggleStopwatch(); 
            w = 0; 
            r = this.state.active.stopwatchVal; 
            if (r === 0) { alert("לא נמדד זמן"); return; }
        } else {
            w = this.state.active.inputW;
            r = this.state.active.inputR;
        }

        const exInst = this.state.active.sessionExercises;
        
        let exLog = this.state.active.log.find(l => l.id === exInst.id);
        if(!exLog) {
            exLog = { id: exInst.id, name: exInst.name, sets:[] };
            this.state.active.log.push(exLog);
        }
        exLog.sets.push({ w, r, feel: this.state.active.feel });

        const restTime = exInst.rest || 60;
        this.startRestTimer(restTime);

        if (this.state.active.setIdx < this.state.active.totalSets) {
            this.state.active.setIdx++;
            document.getElementById('set-badge').innerText = `סט ${this.state.active.setIdx} / ${this.state.active.totalSets}`;
            
            document.getElementById('btn-swap-ex').style.display = 'none';
            
            this.state.active.feel = 'good';
            this.updateFeelUI();
            if(this.state.active.isStopwatch) {
                this.state.active.stopwatchVal = 0;
                document.getElementById('sw-display').innerText = "00:00";
            }
        } else {
            document.getElementById('btn-swap-ex').style.display = 'none';
            document.getElementById('btn-finish').style.display = 'none';
            document.getElementById('decision-buttons').style.display = 'flex';
            document.getElementById('rest-timer-area').style.display = 'none';

            const nextEx = this.state.active.sessionExercises;
            const nextEl = document.getElementById('next-ex-preview');
            nextEl.innerText = nextEx ? `הבא בתור: ${nextEx.name}` : "הבא בתור: סיום אימון";
            nextEl.style.display = 'block';

            const exDef = this.getExerciseDef(exInst.id);
            const addBtn = document.getElementById('btn-add-core');
            if (exDef.cat === 'core') {
                addBtn.style.display = 'block';
            } else {
                addBtn.style.display = 'none';
