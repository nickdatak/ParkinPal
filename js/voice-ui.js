/**
 * ParkinPal - Voice Test UI
 */

const VoiceUI = {
    state: {
        countdownInterval: null,
        waveformInterval: null,
        soundwaveInterval: null,
        timeRemaining: 10,
        testResults: null,
        audioData: null,
        amplitudeHistory: [],
        recordingStartTime: null
    },

    elements: {},
    waveformCtx: null,
    soundwaveCtx: null,

    init() {
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
            playbackBtn: document.getElementById('voice-playback'),
            saveBtn: document.getElementById('voice-save'),
            insight: document.getElementById('voice-insight'),
            insightText: document.getElementById('voice-insight-text'),
            targetPhrase: document.getElementById('voice-target-phrase'),
            soundwaveContainer: document.getElementById('voice-soundwave-container'),
            soundwave: document.getElementById('voice-soundwave'),
            soundwaveDuration: document.getElementById('voice-soundwave-duration'),
            metricsDetails: document.getElementById('voice-metrics-details'),
            analysisError: document.getElementById('voice-analysis-error'),
            retryBtn: document.getElementById('voice-retry')
        };

        this.setupEventListeners();
        this.setupWaveformCanvas();
        this.setupSoundwaveCanvas();

        if (this.elements.targetPhrase) {
            this.elements.targetPhrase.textContent = `"${VoiceLogic.getTargetPhrase()}"`;
        }
    },

    setupEventListeners() {
        this.elements.startBtn.addEventListener('click', () => this.startTest());
        this.elements.stopBtn.addEventListener('click', () => this.stopTest());
        this.elements.playbackBtn.addEventListener('click', () => this.playRecording());
        this.elements.saveBtn.addEventListener('click', () => this.saveResults());
        if (this.elements.retryBtn) {
            this.elements.retryBtn.addEventListener('click', () => this.retryAnalysis());
        }
    },

    setupWaveformCanvas() {
        const canvas = this.elements.waveform;
        if (!canvas) return;
        this.waveformCtx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        this.waveformCtx.scale(dpr, dpr);
    },

    setupSoundwaveCanvas() {
        const canvas = this.elements.soundwave;
        if (!canvas) return;
        this.soundwaveCtx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        this.soundwaveCtx.scale(dpr, dpr);
    },

    drawLiveSoundwave() {
        const canvas = this.elements.soundwave;
        const ctx = this.soundwaveCtx;
        if (!canvas || !ctx) return;

        const width = canvas.getBoundingClientRect().width;
        const height = canvas.getBoundingClientRect().height;
        const history = this.state.amplitudeHistory;

        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#E8F6FC');
        gradient.addColorStop(1, '#D4EFFA');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        if (history.length < 2) return;

        const maxSamples = Math.floor(width / 2);
        const startIdx = Math.max(0, history.length - maxSamples);
        const samples = history.slice(startIdx);

        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        for (let i = 0; i < samples.length; i++) {
            const x = (i / samples.length) * width;
            const amplitude = Math.min(samples[i] * 8, 1);
            const y = (height / 2) - (amplitude * height / 2 * 0.8);
            ctx.lineTo(x, y);
        }
        for (let i = samples.length - 1; i >= 0; i--) {
            const x = (i / samples.length) * width;
            const amplitude = Math.min(samples[i] * 8, 1);
            const y = (height / 2) + (amplitude * height / 2 * 0.8);
            ctx.lineTo(x, y);
        }
        ctx.closePath();

        const waveGradient = ctx.createLinearGradient(0, 0, 0, height);
        waveGradient.addColorStop(0, '#6CBEED');
        waveGradient.addColorStop(0.5, '#4BA8D9');
        waveGradient.addColorStop(1, '#6CBEED');
        ctx.fillStyle = waveGradient;
        ctx.fill();

        ctx.strokeStyle = 'rgba(108, 190, 237, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        if (this.state.recordingStartTime && this.elements.soundwaveDuration) {
            const elapsed = (Date.now() - this.state.recordingStartTime) / 1000;
            this.elements.soundwaveDuration.textContent = `${elapsed.toFixed(1)}s`;
        }
    },

    drawFullRecordingWaveform() {
        const canvas = this.elements.soundwave;
        const ctx = this.soundwaveCtx;
        if (!canvas || !ctx) return;

        const width = canvas.getBoundingClientRect().width;
        const height = canvas.getBoundingClientRect().height;
        const history = this.state.amplitudeHistory;

        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#E8F6FC');
        gradient.addColorStop(1, '#D4EFFA');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        if (history.length < 2) return;

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

        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        for (let i = 0; i < compressedSamples.length; i++) {
            const x = i;
            const amplitude = Math.min(compressedSamples[i] * 8, 1);
            const y = (height / 2) - (amplitude * height / 2 * 0.8);
            ctx.lineTo(x, y);
        }
        for (let i = compressedSamples.length - 1; i >= 0; i--) {
            const x = i;
            const amplitude = Math.min(compressedSamples[i] * 8, 1);
            const y = (height / 2) + (amplitude * height / 2 * 0.8);
            ctx.lineTo(x, y);
        }
        ctx.closePath();

        const waveGradient = ctx.createLinearGradient(0, 0, 0, height);
        waveGradient.addColorStop(0, '#6CBEED');
        waveGradient.addColorStop(0.5, '#4BA8D9');
        waveGradient.addColorStop(1, '#6CBEED');
        ctx.fillStyle = waveGradient;
        ctx.fill();

        ctx.strokeStyle = 'rgba(108, 190, 237, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
    },

    startSoundwaveVisualization() {
        const draw = () => {
            if (!VoiceLogic.state.isRecording) return;
            this.drawLiveSoundwave();
            this.state.soundwaveInterval = requestAnimationFrame(draw);
        };
        draw();
    },

    async startTest() {
        if (!VoiceLogic.isSupported()) {
            Utils.showToast('Microphone not available on this device.', 'error');
            return;
        }

        this.resetUI();

        this.elements.timer.classList.remove('hidden');
        this.elements.waveformContainer.classList.remove('hidden');
        this.elements.startBtn.classList.add('hidden');
        this.elements.stopBtn.classList.remove('hidden');
        this.elements.results.classList.add('hidden');

        if (this.elements.soundwaveContainer) {
            this.elements.soundwaveContainer.classList.remove('hidden');
            this.setupSoundwaveCanvas();
        }
        this.state.amplitudeHistory = [];
        this.state.recordingStartTime = Date.now();
        if (this.elements.soundwaveDuration) {
            this.elements.soundwaveDuration.textContent = '0.0s';
        }

        App.setTestRunning(true);

        this.elements.countdown.textContent = 'Get Ready...';

        const started = await VoiceLogic.startRecording((amplitude) => {
            this.state.amplitudeHistory.push(amplitude);
        });

        if (!started) {
            App.setTestRunning(false);
            Utils.showToast('Failed to access microphone. Please allow microphone access.', 'error');
            this.resetUI();
            this.elements.startBtn.classList.remove('hidden');
            this.elements.stopBtn.classList.add('hidden');
            return;
        }

        this.startWaveformVisualization();
        this.startSoundwaveVisualization();

        await new Promise(resolve => setTimeout(resolve, 400));

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

    startWaveformVisualization() {
        const draw = () => {
            if (!VoiceLogic.state.isRecording) return;
            this.drawWaveform();
            this.state.waveformInterval = requestAnimationFrame(draw);
        };
        draw();
    },

    drawWaveform() {
        const canvas = this.elements.waveform;
        const ctx = this.waveformCtx;
        if (!canvas || !ctx) return;

        const width = canvas.getBoundingClientRect().width;
        const height = canvas.getBoundingClientRect().height;

        ctx.fillStyle = 'rgba(240, 253, 244, 1)';
        ctx.fillRect(0, 0, width, height);

        const dataArray = VoiceLogic.getWaveformData();
        if (dataArray.length === 0) return;

        ctx.lineWidth = 2;
        ctx.strokeStyle = '#10B981';
        ctx.beginPath();

        const sliceWidth = width / dataArray.length;
        let x = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * height) / 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            x += sliceWidth;
        }
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
    },

    updateCountdown() {
        const countdown = this.elements.countdown;
        if (!countdown) return;
        countdown.textContent = this.state.timeRemaining;
        countdown.classList.add('tick');
        setTimeout(() => countdown.classList.remove('tick'), 100);
    },

    async stopTest() {
        if (this.state.countdownInterval) {
            clearInterval(this.state.countdownInterval);
            this.state.countdownInterval = null;
        }
        if (this.state.waveformInterval) {
            cancelAnimationFrame(this.state.waveformInterval);
            this.state.waveformInterval = null;
        }
        if (this.state.soundwaveInterval) {
            cancelAnimationFrame(this.state.soundwaveInterval);
            this.state.soundwaveInterval = null;
        }

        const { audioData, amplitudeData } = VoiceLogic.stopRecording();
        this.state.audioData = audioData;

        App.setTestRunning(false);

        this.elements.timer.classList.add('hidden');
        this.elements.stopBtn.classList.add('hidden');
        this.elements.results.classList.remove('hidden');
        if (this.elements.waveformContainer) {
            this.elements.waveformContainer.classList.add('hidden');
        }

        if (this.elements.soundwaveDuration) {
            const totalDuration = (Date.now() - this.state.recordingStartTime) / 1000;
            this.elements.soundwaveDuration.textContent = `${totalDuration.toFixed(1)}s`;
        }

        this.drawFullRecordingWaveform();

        if (!audioData || audioData.length < 44100) {
            this.showAnalysisError('Recording too short. Please retake the test.');
            return;
        }

        Utils.showLoading('Analyzing your voice...');

        try {
            const sampleRate = VoiceLogic.config.sampleRate;
            const audioBase64 = VoiceLogic.float32ToWavBase64(audioData, sampleRate);
            const analysis = await API.analyzeVoice(audioBase64);

            Utils.hideLoading();
            this.state.testResults = { ...analysis, audioData };
            this.displayResults(analysis);
            Utils.showToast('Test complete!', 'success');
        } catch (error) {
            Utils.hideLoading();
            const msg = error.message || 'Analysis unavailable. Please try again.';
            this.showAnalysisError(msg);
        }
    },

    showAnalysisError(message) {
        if (this.elements.analysisError) {
            this.elements.analysisError.textContent = message;
            this.elements.analysisError.classList.remove('hidden');
        }
        if (this.elements.retryBtn) {
            this.elements.retryBtn.classList.remove('hidden');
        }
        if (this.elements.score) {
            this.elements.score.textContent = '-';
        }
        if (this.elements.duration) {
            this.elements.duration.textContent = '-';
        }
        if (this.elements.metricsDetails) {
            this.elements.metricsDetails.classList.add('hidden');
        }
        this.state.testResults = { audioData: this.state.audioData };
    },

    retryAnalysis() {
        if (!this.state.audioData) return;
        if (this.elements.analysisError) this.elements.analysisError.classList.add('hidden');
        if (this.elements.retryBtn) this.elements.retryBtn.classList.add('hidden');

        Utils.showLoading('Analyzing your voice...');

        const audioBase64 = VoiceLogic.float32ToWavBase64(
            this.state.audioData,
            VoiceLogic.config.sampleRate
        );

        API.analyzeVoice(audioBase64)
            .then((analysis) => {
                Utils.hideLoading();
                this.state.testResults = { ...analysis, audioData: this.state.audioData };
                this.displayResults(analysis);
                Utils.showToast('Analysis complete!', 'success');
            })
            .catch((error) => {
                Utils.hideLoading();
                this.showAnalysisError(error.message || 'Analysis failed. Please try again.');
            });
    },

    displayResults(analysis) {
        if (this.elements.analysisError) this.elements.analysisError.classList.add('hidden');
        if (this.elements.retryBtn) this.elements.retryBtn.classList.add('hidden');

        const score = analysis.score ?? 0;
        const duration = analysis.duration ?? 0;

        if (this.elements.score) {
            this.elements.score.textContent = score.toFixed(1);
            this.elements.score.className = `text-3xl font-bold ${this.getScoreColorClass(score)}`;
        }
        if (this.elements.duration) {
            this.elements.duration.textContent = `${duration}s`;
        }

        if (this.elements.metricsDetails && analysis.metrics) {
            const m = analysis.metrics;
            const lines = [];

            if (m.vot && Object.keys(m.vot).length > 0) {
                const votStr = Object.entries(m.vot)
                    .map(([w, ms]) => `${w}: ${ms}ms`)
                    .join(', ');
                lines.push(`VOT: ${votStr}`);
            }
            if (m.transitionStability != null) {
                lines.push(`Transition stability: ${(m.transitionStability * 100).toFixed(1)}%`);
            }
            if (m.prosodicDecay) {
                const d = m.prosodicDecay;
                if (d.amplitudeDecay > 0 || d.rateDecay > 0) {
                    lines.push(`Prosodic decay: amp ${(d.amplitudeDecay * 100).toFixed(1)}%, rate ${(d.rateDecay * 100).toFixed(1)}%`);
                }
            }
            if (m.amplitudeJitter != null) {
                lines.push(`Amplitude jitter: ${(m.amplitudeJitter * 100).toFixed(2)}%`);
            }
            if (m.vowelSpace && Object.keys(m.vowelSpace).length > 0) {
                const vs = Object.entries(m.vowelSpace)
                    .map(([k, v]) => `${k}: ${v}Hz`)
                    .join(', ');
                lines.push(`Vowel formants: ${vs}`);
            }

            this.elements.metricsDetails.innerHTML = lines
                .map((line) => `<div>${line}</div>`)
                .join('');
            this.elements.metricsDetails.classList.remove('hidden');
        }
    },

    getScoreColorClass(score) {
        if (score <= 3) return 'text-green-600';
        if (score <= 6) return 'text-yellow-600';
        return 'text-red-600';
    },

    async playRecording() {
        if (!this.state.audioData || this.state.audioData.length === 0) {
            Utils.showToast('No recording available', 'warning');
            return;
        }

        this.elements.playbackBtn.textContent = 'Playing...';
        this.elements.playbackBtn.disabled = true;

        try {
            await VoiceLogic.playback(this.state.audioData);
        } catch (error) {
            Utils.showToast('Error playing recording', 'error');
        }

        this.elements.playbackBtn.textContent = 'Play Recording';
        this.elements.playbackBtn.disabled = false;
    },

    async saveResults() {
        if (!this.state.testResults || this.state.testResults.score == null) {
            Utils.showToast('No results to save', 'warning');
            return;
        }

        const entry = Storage.saveEntry({
            voice_score: this.state.testResults.score,
            voice_duration: this.state.testResults.duration,
            voice_vot: this.state.testResults.metrics?.vot,
            voice_transition_stability: this.state.testResults.metrics?.transitionStability,
            voice_prosodic_decay: this.state.testResults.metrics?.prosodicDecay,
            voice_vowel_space: this.state.testResults.metrics?.vowelSpace,
            voice_amplitude_jitter: this.state.testResults.metrics?.amplitudeJitter
        });

        if (entry) {
            Utils.showToast('Results saved!', 'success');
            this.elements.saveBtn.disabled = true;
            this.elements.saveBtn.textContent = 'Saved';
            this.generateInsight(entry);
        } else {
            Utils.showToast('Failed to save results', 'error');
        }
    },

    async generateInsight(entry) {
        this.elements.insight.classList.remove('hidden');
        this.elements.insightText.textContent = 'Generating insight...';

        try {
            const insight = await API.getDailyInsight(
                'voice',
                entry.tremor_score,
                entry.voice_score
            );
            this.elements.insightText.textContent = insight;
        } catch (error) {
            const score = entry.voice_score ?? 5;
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

        if (this.elements.soundwaveContainer) {
            this.elements.soundwaveContainer.classList.add('hidden');
        }
        if (this.elements.analysisError) {
            this.elements.analysisError.classList.add('hidden');
        }
        if (this.elements.retryBtn) {
            this.elements.retryBtn.classList.add('hidden');
        }

        this.elements.saveBtn.disabled = false;
        this.elements.saveBtn.textContent = 'Save Results';
        this.elements.playbackBtn.disabled = false;
        this.elements.playbackBtn.textContent = 'Play Recording';

        if (this.waveformCtx && this.elements.waveform) {
            const canvas = this.elements.waveform;
            const width = canvas.getBoundingClientRect().width;
            const height = canvas.getBoundingClientRect().height;
            this.waveformCtx.fillStyle = 'rgba(240, 253, 244, 1)';
            this.waveformCtx.fillRect(0, 0, width, height);
        }

        if (this.soundwaveCtx && this.elements.soundwave) {
            const canvas = this.elements.soundwave;
            const width = canvas.getBoundingClientRect().width;
            const height = canvas.getBoundingClientRect().height;
            const gradient = this.soundwaveCtx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, '#E8F6FC');
            gradient.addColorStop(1, '#D4EFFA');
            this.soundwaveCtx.fillStyle = gradient;
            this.soundwaveCtx.fillRect(0, 0, width, height);
        }

        VoiceLogic.reset();
    }
};

window.VoiceUI = VoiceUI;
