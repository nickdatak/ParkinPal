/**
 * ParkinPal - Voice Test UI
 */

const VoiceUI = {
    // UI State
    state: {
        countdownInterval: null,
        waveformInterval: null,
        soundwaveInterval: null,
        timeRemaining: 10,
        testResults: null,
        audioData: null,
        amplitudeHistory: [], // Store amplitude readings for soundwave
        recordingStartTime: null
    },
    
    // DOM Elements
    elements: {},
    
    // Waveform canvas context
    waveformCtx: null,
    
    // Soundwave canvas context
    soundwaveCtx: null,
    
    /**
     * Initialize voice UI
     */
    init() {
        // Cache DOM elements
        this.elements = {
            timer: document.getElementById('voice-timer'),
            countdown: document.getElementById('voice-countdown'),
            waveformContainer: document.getElementById('voice-waveform-container'),
            waveform: document.getElementById('voice-waveform'),
            startBtn: document.getElementById('voice-start'),
            stopBtn: document.getElementById('voice-stop'),
            results: document.getElementById('voice-results'),
            score: document.getElementById('voice-score'),
            duration: document.getElementById('voice-duration'),
            pauses: document.getElementById('voice-pauses'),
            speakingRate: document.getElementById('voice-speaking-rate'),
            wordCount: document.getElementById('voice-word-count'),
            playbackBtn: document.getElementById('voice-playback'),
            saveBtn: document.getElementById('voice-save'),
            retakeBtn: document.getElementById('voice-retake'),
            insight: document.getElementById('voice-insight'),
            insightText: document.getElementById('voice-insight-text'),
            // New transcript elements
            transcriptContainer: document.getElementById('voice-transcript-container'),
            transcriptText: document.getElementById('voice-transcript-text'),
            transcriptWordCount: document.getElementById('voice-transcript-word-count'),
            speechNotSupported: document.getElementById('voice-speech-not-supported'),
            targetPhrase: document.getElementById('voice-target-phrase'),
            // Soundwave elements
            soundwaveContainer: document.getElementById('voice-soundwave-container'),
            soundwave: document.getElementById('voice-soundwave'),
            // Detailed metrics
            detailedMetrics: document.getElementById('voice-detailed-metrics'),
            votEl: document.getElementById('voice-vot'),
            transitionsEl: document.getElementById('voice-transitions'),
            fatigueEl: document.getElementById('voice-fatigue'),
            vowelsEl: document.getElementById('voice-vowels'),
            steadinessEl: document.getElementById('voice-steadiness')
        };
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Setup canvas
        this.setupWaveformCanvas();
        
        // Setup soundwave canvas
        this.setupSoundwaveCanvas();
        
        // Set target phrase
        if (this.elements.targetPhrase) {
            this.elements.targetPhrase.textContent = `"${VoiceLogic.getTargetPhrase()}"`;
        }
    },
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        this.elements.startBtn.addEventListener('click', () => this.startTest());
        this.elements.stopBtn.addEventListener('click', () => this.stopTest());
        this.elements.playbackBtn.addEventListener('click', () => this.playRecording());
        this.elements.saveBtn.addEventListener('click', () => this.saveResults());
        if (this.elements.retakeBtn) this.elements.retakeBtn.addEventListener('click', () => this.retakeTest());
    },
    
    /**
     * Setup waveform canvas
     */
    setupWaveformCanvas() {
        const canvas = this.elements.waveform;
        if (!canvas) return;
        
        this.waveformCtx = canvas.getContext('2d');
        
        // Set canvas size
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        this.waveformCtx.scale(dpr, dpr);
    },
    
    /**
     * Setup soundwave canvas
     */
    setupSoundwaveCanvas() {
        const canvas = this.elements.soundwave;
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-ui.js:setupSoundwaveCanvas',message:'Canvas setup called',data:{canvasExists:!!canvas,canvasId:canvas?.id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        if (!canvas) return;
        
        this.soundwaveCtx = canvas.getContext('2d');
        
        // Set canvas size with device pixel ratio for sharp rendering
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        this.soundwaveCtx.scale(dpr, dpr);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-ui.js:setupSoundwaveCanvas:end',message:'Canvas setup complete',data:{ctxExists:!!this.soundwaveCtx,width:rect.width,height:rect.height,dpr},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
    },
    
    /**
     * Draw live soundwave during recording
     */
    drawLiveSoundwave() {
        const canvas = this.elements.soundwave;
        const ctx = this.soundwaveCtx;
        if (!canvas || !ctx) return;
        
        const width = canvas.getBoundingClientRect().width;
        const height = canvas.getBoundingClientRect().height;
        const history = this.state.amplitudeHistory;
        // #region agent log
        if (history.length % 60 === 0 && history.length > 0) { fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-ui.js:drawLiveSoundwave',message:'Drawing',data:{width,height,historyLen:history.length,lastAmp:history[history.length-1]},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C,E'})}).catch(()=>{}); }
        // #endregion
        
        // Clear canvas with gradient background
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#E8F6FC');
        gradient.addColorStop(1, '#D4EFFA');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        
        if (history.length < 2) return;
        
        // Draw waveform - show last N samples that fit the width
        const maxSamples = Math.floor(width / 2); // 2 pixels per sample
        const startIdx = Math.max(0, history.length - maxSamples);
        const samples = history.slice(startIdx);
        
        // Draw filled waveform
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        
        for (let i = 0; i < samples.length; i++) {
            const x = (i / samples.length) * width;
            const amplitude = Math.min(samples[i] * 8, 1); // Scale amplitude
            const y = (height / 2) - (amplitude * height / 2 * 0.8);
            ctx.lineTo(x, y);
        }
        
        // Mirror for bottom half
        for (let i = samples.length - 1; i >= 0; i--) {
            const x = (i / samples.length) * width;
            const amplitude = Math.min(samples[i] * 8, 1);
            const y = (height / 2) + (amplitude * height / 2 * 0.8);
            ctx.lineTo(x, y);
        }
        
        ctx.closePath();
        
        // Fill with blue gradient
        const waveGradient = ctx.createLinearGradient(0, 0, 0, height);
        waveGradient.addColorStop(0, '#6CBEED');
        waveGradient.addColorStop(0.5, '#4BA8D9');
        waveGradient.addColorStop(1, '#6CBEED');
        ctx.fillStyle = waveGradient;
        ctx.fill();
        
        // Draw center line
        ctx.strokeStyle = 'rgba(108, 190, 237, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        
    },
    
    /**
     * Draw full recording waveform (compressed view after recording ends)
     */
    drawFullRecordingWaveform() {
        const canvas = this.elements.soundwave;
        const ctx = this.soundwaveCtx;
        if (!canvas || !ctx) return;
        
        const width = canvas.getBoundingClientRect().width;
        const height = canvas.getBoundingClientRect().height;
        const history = this.state.amplitudeHistory;
        
        // Clear canvas with gradient background
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#E8F6FC');
        gradient.addColorStop(1, '#D4EFFA');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        
        if (history.length < 2) return;
        
        // Compress all samples to fit the canvas width
        const samplesPerPixel = Math.ceil(history.length / width);
        const compressedSamples = [];
        
        for (let i = 0; i < width; i++) {
            const startIdx = Math.floor(i * history.length / width);
            const endIdx = Math.floor((i + 1) * history.length / width);
            let max = 0;
            for (let j = startIdx; j < endIdx && j < history.length; j++) {
                max = Math.max(max, history[j]);
            }
            compressedSamples.push(max);
        }
        
        // Draw filled waveform
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        
        for (let i = 0; i < compressedSamples.length; i++) {
            const x = i;
            const amplitude = Math.min(compressedSamples[i] * 8, 1);
            const y = (height / 2) - (amplitude * height / 2 * 0.8);
            ctx.lineTo(x, y);
        }
        
        // Mirror for bottom half
        for (let i = compressedSamples.length - 1; i >= 0; i--) {
            const x = i;
            const amplitude = Math.min(compressedSamples[i] * 8, 1);
            const y = (height / 2) + (amplitude * height / 2 * 0.8);
            ctx.lineTo(x, y);
        }
        
        ctx.closePath();
        
        // Fill with blue gradient
        const waveGradient = ctx.createLinearGradient(0, 0, 0, height);
        waveGradient.addColorStop(0, '#6CBEED');
        waveGradient.addColorStop(0.5, '#4BA8D9');
        waveGradient.addColorStop(1, '#6CBEED');
        ctx.fillStyle = waveGradient;
        ctx.fill();
        
        // Draw center line
        ctx.strokeStyle = 'rgba(108, 190, 237, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
    },
    
    /**
     * Start soundwave visualization loop
     */
    startSoundwaveVisualization() {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-ui.js:startSoundwaveVisualization',message:'Starting soundwave viz',data:{isRecording:VoiceLogic.state.isRecording},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        let drawCount = 0;
        const draw = () => {
            if (!VoiceLogic.state.isRecording) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-ui.js:draw:exit',message:'Draw loop exited',data:{reason:'notRecording',drawCount},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
                return;
            }
            
            drawCount++;
            this.drawLiveSoundwave();
            this.state.soundwaveInterval = requestAnimationFrame(draw);
        };
        
        draw();
    },
    
    /**
     * Start the voice test
     */
    async startTest() {
        // Check support
        if (!VoiceLogic.isSupported()) {
            Utils.showToast('Microphone not available on this device.', 'error');
            return;
        }
        
        // Reset UI
        this.resetUI();
        
        // Show recording UI
        this.elements.timer.classList.remove('hidden');
        this.elements.waveformContainer.classList.remove('hidden');
        this.elements.startBtn.classList.add('hidden');
        this.elements.stopBtn.classList.remove('hidden');
        this.elements.results.classList.add('hidden');
        
        // Show transcript container
        if (this.elements.transcriptContainer) {
            this.elements.transcriptContainer.classList.remove('hidden');
            
            // Check speech recognition support
            if (!VoiceLogic.isSpeechRecognitionSupported()) {
                if (this.elements.speechNotSupported) {
                    this.elements.speechNotSupported.classList.remove('hidden');
                }
                if (this.elements.transcriptText) {
                    this.elements.transcriptText.classList.add('hidden');
                }
                if (this.elements.transcriptWordCount) {
                    this.elements.transcriptWordCount.classList.add('hidden');
                }
            } else {
                if (this.elements.speechNotSupported) {
                    this.elements.speechNotSupported.classList.add('hidden');
                }
                if (this.elements.transcriptText) {
                    this.elements.transcriptText.classList.remove('hidden');
                    this.elements.transcriptText.textContent = 'Listening...';
                }
                if (this.elements.transcriptWordCount) {
                    this.elements.transcriptWordCount.classList.remove('hidden');
                    this.elements.transcriptWordCount.textContent = '0 words';
                }
            }
        }
        
        // Show soundwave container and reset state
        if (this.elements.soundwaveContainer) {
            this.elements.soundwaveContainer.classList.remove('hidden');
            // Re-setup canvas in case size changed
            this.setupSoundwaveCanvas();
        }
        this.state.amplitudeHistory = [];
        this.state.recordingStartTime = Date.now();
        
        // Set test running state
        App.setTestRunning(true);
        
        // Show "Get Ready" countdown first (2 seconds for speech recognition to warm up)
        this.elements.countdown.textContent = 'Get Ready...';
        this.elements.timer.classList.remove('hidden');
        
        // Start recording FIRST (so speech recognition can warm up during "Get Ready")
        const started = await VoiceLogic.startRecording(
            (amplitude, time) => {
                // Amplitude callback - store for soundwave visualization
                this.state.amplitudeHistory.push(amplitude);
                // #region agent log
                if (this.state.amplitudeHistory.length % 50 === 1) { fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-ui.js:amplitudeCallback',message:'Amplitude received',data:{amplitude,historyLen:this.state.amplitudeHistory.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{}); }
                // #endregion
            },
            (transcript, wordCount) => {
                // Transcript callback
                this.updateTranscript(transcript, wordCount);
            }
        );
        
        if (!started) {
            this.stopTest();
            Utils.showToast('Failed to access microphone. Please allow microphone access.', 'error');
            return;
        }
        
        // Start waveform visualization
        this.startWaveformVisualization();
        
        // Start soundwave visualization
        this.startSoundwaveVisualization();
        
        // Wait 0.4 seconds for "Get Ready" (speech recognition warms up during this time)
        await new Promise(resolve => setTimeout(resolve, 400));
        
        // Now start the actual countdown
        this.state.timeRemaining = 7;
        this.updateCountdown();
        
        this.state.countdownInterval = setInterval(() => {
            this.state.timeRemaining--;
            this.updateCountdown();
            
            if (this.state.timeRemaining <= 0) {
                this.stopTest();
            }
        }, 1000);
        
    },
    
    /**
     * Update transcript display
     * @param {string} transcript - Recognized text
     * @param {number} wordCount - Number of words
     */
    updateTranscript(transcript, wordCount) {
        if (this.elements.transcriptText) {
            this.elements.transcriptText.textContent = transcript || 'Listening...';
        }
        if (this.elements.transcriptWordCount) {
            this.elements.transcriptWordCount.textContent = `${wordCount} word${wordCount !== 1 ? 's' : ''}`;
        }
    },
    
    /**
     * Start waveform visualization loop
     */
    startWaveformVisualization() {
        const draw = () => {
            if (!VoiceLogic.state.isRecording) return;
            
            this.drawWaveform();
            this.state.waveformInterval = requestAnimationFrame(draw);
        };
        
        draw();
    },
    
    /**
     * Draw waveform visualization
     */
    drawWaveform() {
        const canvas = this.elements.waveform;
        const ctx = this.waveformCtx;
        if (!canvas || !ctx) return;
        
        const width = canvas.getBoundingClientRect().width;
        const height = canvas.getBoundingClientRect().height;
        
        // Clear canvas
        ctx.fillStyle = 'rgba(240, 253, 244, 1)';
        ctx.fillRect(0, 0, width, height);
        
        // Get waveform data
        const dataArray = VoiceLogic.getWaveformData();
        
        if (dataArray.length === 0) return;
        
        // Draw waveform
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#10B981';
        ctx.beginPath();
        
        const sliceWidth = width / dataArray.length;
        let x = 0;
        
        for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * height) / 2;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        
        // Draw center line
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
    },
    
    /**
     * Update countdown display
     */
    updateCountdown() {
        const countdown = this.elements.countdown;
        if (!countdown) return;
        
        countdown.textContent = this.state.timeRemaining;
        countdown.classList.add('tick');
        setTimeout(() => countdown.classList.remove('tick'), 100);
    },
    
    /**
     * Stop the voice test
     */
    stopTest() {
        // Clear intervals
        if (this.state.countdownInterval) {
            clearInterval(this.state.countdownInterval);
            this.state.countdownInterval = null;
        }
        
        if (this.state.waveformInterval) {
            cancelAnimationFrame(this.state.waveformInterval);
            this.state.waveformInterval = null;
        }
        
        // Cancel soundwave animation
        if (this.state.soundwaveInterval) {
            cancelAnimationFrame(this.state.soundwaveInterval);
            this.state.soundwaveInterval = null;
        }
        
        // Stop recording and get results
        const results = VoiceLogic.stopRecording();
        this.state.testResults = results;
        this.state.audioData = results.audioData;
        
        // Check if enough words were detected and content matches expected phrase
        const expectedPhrase = "The quick brown fox jumps over the lazy dog";
        const expectedWordCount = 9;
        const minWordsRequired = 7;
        const minExpectedWordsMatch = 5; // Need at least 5 of 8 unique expected words
        const wordCount = results.wordCount || 0;
        const recognizedText = (results.recognizedText || '').trim();

        let shouldRetake = false;
        let retakeMessage = '';

        if (results.speechRecognitionSupported) {
            if (wordCount < minWordsRequired) {
                shouldRetake = true;
                retakeMessage = `Fewer than ${minWordsRequired} of the ${expectedWordCount} expected words were detected (you said ${wordCount}). Speech may not have been recorded clearly (e.g. quiet environment, unclear speech, or background noise). Would you like to retake the test?`;
            } else {
                // Content validation: check if transcript matches expected phrase
                const expectedWords = [...new Set(expectedPhrase.toLowerCase().split(/\s+/))];
                const transcriptWords = recognizedText.toLowerCase().split(/\s+/).filter(Boolean);
                const matchedCount = expectedWords.filter(ew => transcriptWords.includes(ew)).length;
                if (matchedCount < minExpectedWordsMatch) {
                    shouldRetake = true;
                    retakeMessage = `Your words didn't match the expected phrase. Please read: "${expectedPhrase}". Would you like to retake the test?`;
                }
            }
        }

        // Check if 2+ voice metrics couldn't be calculated
        if (!shouldRetake) {
            if (!results.metrics) {
                shouldRetake = true;
                retakeMessage = 'Insufficient recording data. Would you like to retake the test?';
            } else {
                const metricKeys = ['vot', 'transitions', 'fatigue', 'vowels', 'steadiness'];
                const uncalculableCount = metricKeys.filter(m => results.metrics[m]?.severity == null).length;
                if (uncalculableCount >= 2) {
                    shouldRetake = true;
                    retakeMessage = `${uncalculableCount} of 5 voice metrics couldn't be calculated (e.g. too little speech, unclear audio). Would you like to retake the test?`;
                }
            }
        }

        if (shouldRetake) {
            App.setTestRunning(false);
            const retake = confirm(retakeMessage);
            if (retake) {
                this.resetUI();
                this.elements.startBtn.classList.remove('hidden');
                this.elements.stopBtn.classList.add('hidden');
                this.elements.results.classList.add('hidden');
                setTimeout(() => this.startTest(), 300);
                return;
            }
        }
        
        // Set test running state
        App.setTestRunning(false);
        
        // Update UI
        this.elements.timer.classList.add('hidden');
        this.elements.stopBtn.classList.add('hidden');
        this.elements.results.classList.remove('hidden');
        
        // Hide transcript and waveform containers during results (waveform becomes empty after recording stops)
        if (this.elements.transcriptContainer) {
            this.elements.transcriptContainer.classList.add('hidden');
        }
        if (this.elements.waveformContainer) {
            this.elements.waveformContainer.classList.add('hidden');
        }
        
        // Draw the full recording waveform (compressed view)
        this.drawFullRecordingWaveform();
        
        // #region agent log
        this.state.runCount = (this.state.runCount || 0) + 1;
        const runNum = this.state.runCount;
        const runPhase = runNum <= 10 ? 'normal' : 'old_man';
        fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4c1b23'},body:JSON.stringify({sessionId:'4c1b23',location:'voice-ui.js:stopTest:scoreBreakdown',message:'Voice test run logged',data:{run:runNum,phase:runPhase,score:results.score,vot:results.metrics?.vot?.severity,votMs:results.metrics?.vot?.avgVotMs,transitions:results.metrics?.transitions?.severity,fatigue:results.metrics?.fatigue?.severity,fatigueRatio:results.metrics?.fatigue?.fatigueRatio,vowels:results.metrics?.vowels?.severity,vowelsHnr:results.metrics?.vowels?.hnrDb,steadiness:results.metrics?.steadiness?.severity,wordCount:results.wordCount,duration:results.details?.totalDuration??results.duration,pauses:results.pauses,speakingRate:results.speakingRate},timestamp:Date.now(),hypothesisId:'runLog'})}).catch(()=>{});
        // #endregion
        
        // Display results
        if (this.elements.score) {
        this.elements.score.textContent = results.score.toFixed(1);
        }
        if (this.elements.duration) {
            const totalDuration = results.details?.totalDuration ?? (Date.now() - this.state.recordingStartTime) / 1000;
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4c1b23'},body:JSON.stringify({sessionId:'4c1b23',location:'voice-ui.js:stopTest:duration',message:'Duration display',data:{totalDuration,detailsTotal:results.details?.totalDuration,recordingFallback:(Date.now()-this.state.recordingStartTime)/1000},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
            // #endregion
            this.elements.duration.textContent = `${Math.round(totalDuration * 10) / 10}s`;
        }
        if (this.elements.pauses) {
        this.elements.pauses.textContent = results.pauses;
        }
        
        // Display speaking rate and word count if available
        if (this.elements.speakingRate) {
            if (results.speechRecognitionSupported && results.speakingRate > 0) {
                this.elements.speakingRate.textContent = `${results.speakingRate} WPM`;
                this.elements.speakingRate.parentElement.classList.remove('hidden');
            } else {
                this.elements.speakingRate.parentElement.classList.add('hidden');
            }
        }
        
        if (this.elements.wordCount) {
            if (results.speechRecognitionSupported) {
                this.elements.wordCount.textContent = results.wordCount || 0;
                this.elements.wordCount.parentElement.classList.remove('hidden');
            } else {
                this.elements.wordCount.parentElement.classList.add('hidden');
            }
        }
        
        // Set score color
        if (this.elements.score) {
        this.elements.score.className = `text-3xl font-bold ${this.getScoreColorClass(results.score)}`;
        }
        
        // Display detailed metrics
        this.displayDetailedMetrics(results.metrics || {});
        
        Utils.showToast('Test complete!', 'success');
    },
    
    /**
     * Display the five speech metrics in the detailed metrics section
     * @param {Object} metrics - Metrics from voice analysis
     */
    displayDetailedMetrics(metrics) {
        const fmt = (el, text) => { if (el) el.textContent = text; };
        const m = metrics;
        
        const sev = (s) => (s != null && !isNaN(s)) ? s.toFixed(1) : '-';
        if (m.vot) {
            const vot = m.vot;
            const txt = vot.severity != null ? `Voice onset: ${sev(vot.severity)}${vot.avgVotMs != null ? ` (${vot.avgVotMs}ms)` : ''}` : 'Voice onset: -';
            fmt(this.elements.votEl, txt);
        } else { fmt(this.elements.votEl, 'Voice onset: -'); }
        
        if (m.transitions) {
            const t = m.transitions;
            fmt(this.elements.transitionsEl, t.severity != null ? `Transitions: ${sev(t.severity)}` : 'Transitions: -');
        } else { fmt(this.elements.transitionsEl, 'Transitions: -'); }
        
        if (m.fatigue) {
            const f = m.fatigue;
            const txt = f.severity != null ? `Fatigue: ${sev(f.severity)}${f.fatigueRatio != null ? ` (${(f.fatigueRatio * 100).toFixed(1)}% energy kept)` : ''}` : 'Fatigue: -';
            fmt(this.elements.fatigueEl, txt);
        } else { fmt(this.elements.fatigueEl, 'Fatigue: -'); }
        
        if (m.vowels) {
            const v = m.vowels;
            const txt = v.severity != null ? `Vowel clarity: ${sev(v.severity)}${v.hnrDb != null ? ` (${v.hnrDb} dB HNR)` : ''}` : 'Vowel clarity: -';
            fmt(this.elements.vowelsEl, txt);
        } else { fmt(this.elements.vowelsEl, 'Vowel clarity: -'); }
        
        if (m.steadiness) {
            fmt(this.elements.steadinessEl, m.steadiness.severity != null ? `Volume steadiness: ${sev(m.steadiness.severity)}` : 'Volume steadiness: -');
        } else { fmt(this.elements.steadinessEl, 'Volume steadiness: -'); }
        
        if (this.elements.detailedMetrics) this.elements.detailedMetrics.classList.remove('hidden');
    },
    
    /**
     * Get score color class
     * @param {number} score - Score 0-10
     * @returns {string}
     */
    getScoreColorClass(score) {
        if (score <= 3) return 'text-green-600';
        if (score <= 6) return 'text-yellow-600';
        return 'text-red-600';
    },
    
    /**
     * Play back recorded audio
     */
    async playRecording() {
        if (!this.state.audioData || this.state.audioData.length === 0) {
            Utils.showToast('No recording available', 'warning');
            return;
        }
        
        // Update button state
        this.elements.playbackBtn.textContent = 'Playing...';
        this.elements.playbackBtn.disabled = true;
        
        try {
            await VoiceLogic.playback(this.state.audioData);
        } catch (error) {
            Utils.showToast('Error playing recording', 'error');
        }
        
        // Reset button
        this.elements.playbackBtn.textContent = 'Play Recording';
        this.elements.playbackBtn.disabled = false;
    },
    
    /**
     * Save test results
     */
    async saveResults() {
        if (!this.state.testResults) {
            Utils.showToast('No results to save', 'warning');
            return;
        }
        
        const totalDuration = this.state.testResults.details?.totalDuration ?? this.state.testResults.duration;
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4c1b23'},body:JSON.stringify({sessionId:'4c1b23',location:'voice-ui.js:saveResults:duration',message:'Save voice_duration',data:{totalDuration,detailsTotal:this.state.testResults.details?.totalDuration,fallbackDuration:this.state.testResults.duration},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        const entry = Storage.saveEntry({
            voice_score: this.state.testResults.score,
            voice_duration: totalDuration,
            voice_pauses: this.state.testResults.pauses,
            voice_speaking_rate: this.state.testResults.speakingRate,
            voice_word_count: this.state.testResults.wordCount,
            voice_metrics: this.state.testResults.metrics || null
        });
        
        if (entry) {
            Utils.showToast('Results saved!', 'success');
            this.elements.saveBtn.disabled = true;
            this.elements.saveBtn.textContent = 'Saved';
            
            // Generate daily insight
            this.generateInsight(entry);
        } else {
            Utils.showToast('Failed to save results', 'error');
        }
    },
    
    /**
     * Generate and display daily insight
     * @param {Object} entry - Saved entry
     */
    async generateInsight(entry) {
        this.elements.insight.classList.remove('hidden');
        this.elements.insightText.textContent = 'Generating insight...';
        
        try {
            const insight = await API.getDailyInsight(
                'voice',
                entry.tremor_score,
                entry.voice_score,
                entry.voice_metrics
            );
            
            this.elements.insightText.textContent = insight;
        } catch (error) {
            // Fallback insight
            const score = entry.voice_score;
            let insight = '';
            
            if (score <= 3) {
                insight = "Excellent voice control today! Your speech patterns look strong. Keep practicing speaking clearly and maintaining good posture while talking.";
            } else if (score <= 6) {
                insight = "Good effort on today's test. Try some vocal warm-up exercises like humming or reading aloud slowly. Stay hydrated for better voice quality.";
            } else {
                insight = "Your voice shows some variation today. This is useful data for your doctor. Consider speech therapy exercises and remember to speak slowly and deliberately.";
            }
            
            this.elements.insightText.textContent = insight;
        }
    },
    
    /**
     * Retake the voice test (reset and start again)
     */
    retakeTest() {
        this.resetUI();
        this.elements.startBtn.classList.remove('hidden');
        this.elements.stopBtn.classList.add('hidden');
        this.elements.results.classList.add('hidden');
        setTimeout(() => this.startTest(), 300);
    },
    
    /**
     * Reset UI to initial state
     */
    resetUI() {
        this.state.testResults = null;
        this.state.audioData = null;
        this.state.amplitudeHistory = [];
        this.state.recordingStartTime = null;
        
        this.elements.timer.classList.add('hidden');
        this.elements.waveformContainer.classList.add('hidden');
        this.elements.startBtn.classList.remove('hidden');
        this.elements.stopBtn.classList.add('hidden');
        this.elements.results.classList.add('hidden');
        this.elements.insight.classList.add('hidden');
        
        // Hide transcript
        if (this.elements.transcriptContainer) {
            this.elements.transcriptContainer.classList.add('hidden');
        }
        
        // Hide soundwave
        if (this.elements.soundwaveContainer) {
            this.elements.soundwaveContainer.classList.add('hidden');
        }
        
        this.elements.saveBtn.disabled = false;
        this.elements.saveBtn.textContent = 'Save Results';
        this.elements.playbackBtn.disabled = false;
        this.elements.playbackBtn.textContent = 'Play Recording';
        
        // Clear waveform
        if (this.waveformCtx) {
            const canvas = this.elements.waveform;
            const width = canvas.getBoundingClientRect().width;
            const height = canvas.getBoundingClientRect().height;
            this.waveformCtx.fillStyle = 'rgba(240, 253, 244, 1)';
            this.waveformCtx.fillRect(0, 0, width, height);
        }
        
        // Clear soundwave
        if (this.soundwaveCtx && this.elements.soundwave) {
            const canvas = this.elements.soundwave;
            const width = canvas.getBoundingClientRect().width;
            const height = canvas.getBoundingClientRect().height;
            const gradient = this.soundwaveCtx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, '#F5F3FF');
            gradient.addColorStop(1, '#EDE9FE');
            this.soundwaveCtx.fillStyle = gradient;
            this.soundwaveCtx.fillRect(0, 0, width, height);
        }
        
        // Reset voice logic
        VoiceLogic.reset();
    }
};

// Make VoiceUI available globally
window.VoiceUI = VoiceUI;
