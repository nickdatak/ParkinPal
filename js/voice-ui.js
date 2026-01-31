/**
 * ParkinPal - Voice Test UI
 */

const VoiceUI = {
    // UI State
    state: {
        countdownInterval: null,
        waveformInterval: null,
        timeRemaining: 10,
        testResults: null,
        audioData: null
    },
    
    // DOM Elements
    elements: {},
    
    // Waveform canvas context
    waveformCtx: null,
    
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
            variance: document.getElementById('voice-variance'),
            playbackBtn: document.getElementById('voice-playback'),
            saveBtn: document.getElementById('voice-save'),
            insight: document.getElementById('voice-insight'),
            insightText: document.getElementById('voice-insight-text')
        };
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Setup canvas
        this.setupWaveformCanvas();
    },
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        this.elements.startBtn.addEventListener('click', () => this.startTest());
        this.elements.stopBtn.addEventListener('click', () => this.stopTest());
        this.elements.playbackBtn.addEventListener('click', () => this.playRecording());
        this.elements.saveBtn.addEventListener('click', () => this.saveResults());
    },
    
    /**
     * Setup waveform canvas
     */
    setupWaveformCanvas() {
        const canvas = this.elements.waveform;
        this.waveformCtx = canvas.getContext('2d');
        
        // Set canvas size
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        this.waveformCtx.scale(dpr, dpr);
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
        
        // Set test running state
        App.setTestRunning(true);
        
        // Start countdown
        this.state.timeRemaining = 10;
        this.updateCountdown();
        
        this.state.countdownInterval = setInterval(() => {
            this.state.timeRemaining--;
            this.updateCountdown();
            
            if (this.state.timeRemaining <= 0) {
                this.stopTest();
            }
        }, 1000);
        
        // Start recording
        const started = await VoiceLogic.startRecording((amplitude, time) => {
            // Amplitude callback - we'll update waveform separately
        });
        
        if (!started) {
            this.stopTest();
            Utils.showToast('Failed to access microphone. Please allow microphone access.', 'error');
            return;
        }
        
        // Start waveform visualization
        this.startWaveformVisualization();
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
        
        // Stop recording and get results
        const results = VoiceLogic.stopRecording();
        this.state.testResults = results;
        this.state.audioData = results.audioData;
        
        // Set test running state
        App.setTestRunning(false);
        
        // Update UI
        this.elements.timer.classList.add('hidden');
        this.elements.stopBtn.classList.add('hidden');
        this.elements.results.classList.remove('hidden');
        
        // Display results
        this.elements.score.textContent = results.score.toFixed(1);
        this.elements.duration.textContent = `${results.duration}s`;
        this.elements.pauses.textContent = results.pauses;
        this.elements.variance.textContent = results.variance.toFixed(3);
        
        // Set score color
        this.elements.score.className = `text-3xl font-bold ${this.getScoreColorClass(results.score)}`;
        
        Utils.showToast('Test complete!', 'success');
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
        
        const entry = Storage.saveEntry({
            voice_score: this.state.testResults.score,
            voice_duration: this.state.testResults.duration,
            voice_pauses: this.state.testResults.pauses,
            voice_variance: this.state.testResults.variance
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
                entry.tremor_score,
                entry.voice_score
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
     * Reset UI to initial state
     */
    resetUI() {
        this.state.testResults = null;
        this.state.audioData = null;
        
        this.elements.timer.classList.add('hidden');
        this.elements.waveformContainer.classList.add('hidden');
        this.elements.startBtn.classList.remove('hidden');
        this.elements.stopBtn.classList.add('hidden');
        this.elements.results.classList.add('hidden');
        this.elements.insight.classList.add('hidden');
        
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
        
        // Reset voice logic
        VoiceLogic.reset();
    }
};

// Make VoiceUI available globally
window.VoiceUI = VoiceUI;
