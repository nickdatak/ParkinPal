/**
 * ParkinPal - Voice Analysis Logic
 * Uses Web Audio API (AudioWorklet) and Web Speech API to analyze voice characteristics
 */

const VoiceLogic = {
    // Configuration
    config: {
        testDuration: 7000, // 7 seconds
        sampleRate: 44100,
        fftSize: 2048,
        silenceThreshold: 0.02, // Amplitude threshold for silence detection
        minPauseDuration: 0.3, // Minimum pause duration in seconds
        targetPhrase: "The quick brown fox jumps over the lazy dog",
        bufferSize: 4096
    },
    
    // State
    state: {
        isRecording: false,
        permissionGranted: false,
        audioContext: null,
        mediaStream: null,
        analyser: null,
        audioWorkletNode: null,
        scriptProcessor: null, // Fallback for browsers without AudioWorklet
        useAudioWorklet: false,
        audioBuffer: [],
        amplitudeData: [],
        startTime: null,
        // Speech recognition state
        speechRecognition: null,
        recognizedText: '',
        wordCount: 0,
        speechRecognitionSupported: false,
        onTranscriptUpdate: null // Callback for transcript updates
    },
    
    /**
     * Check if Web Audio API is supported
     * @returns {boolean}
     */
    isSupported() {
        return !!(window.AudioContext || window.webkitAudioContext) &&
               !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    },
    
    /**
     * Check if AudioWorklet is supported
     * @returns {boolean}
     */
    isAudioWorkletSupported() {
        try {
            // Safer check that doesn't cause "Illegal invocation"
            return typeof window.AudioContext !== 'undefined' && 
                   typeof AudioWorkletNode !== 'undefined';
        } catch (e) {
            return false;
        }
    },
    
    /**
     * Check if Web Speech API is supported
     * @returns {boolean}
     */
    isSpeechRecognitionSupported() {
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    },
    
    /**
     * Request microphone permission
     * @returns {Promise<boolean>}
     */
    async requestPermission() {
        if (!this.isSupported()) {
            console.warn('Web Audio or getUserMedia not supported');
            return false;
        }
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });
            
            // Stop the stream immediately (just testing permission)
            stream.getTracks().forEach(track => track.stop());
            
            this.state.permissionGranted = true;
            return true;
        } catch (error) {
            console.error('Error requesting microphone permission:', error);
            this.state.permissionGranted = false;
            return false;
        }
    },
    
    /**
     * Initialize speech recognition
     * @returns {boolean}
     */
    initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
            console.warn('Web Speech API not supported in this browser');
            this.state.speechRecognitionSupported = false;
            return false;
        }
        
        this.state.speechRecognitionSupported = true;
        this.state.speechRecognition = new SpeechRecognition();
        this.state.speechRecognition.continuous = true;
        this.state.speechRecognition.interimResults = true;
        this.state.speechRecognition.lang = 'en-US';
        
        this.state.speechRecognition.onresult = (event) => {
            let transcript = '';
            let finalTranscript = '';
            
            for (let i = 0; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalTranscript += result[0].transcript;
                } else {
                    transcript += result[0].transcript;
                }
            }
            
            // Combine final and interim results
            this.state.recognizedText = (finalTranscript + transcript).trim();
            
            // Count words
            this.state.wordCount = this.state.recognizedText
                .split(/\s+/)
                .filter(word => word.length > 0).length;
            
            // Callback for UI update
            if (this.state.onTranscriptUpdate) {
                this.state.onTranscriptUpdate(this.state.recognizedText, this.state.wordCount);
            }
        };
        
        this.state.speechRecognition.onerror = (event) => {
            console.warn('Speech recognition error:', event.error);
            // Don't stop recording on speech errors - audio recording should continue
        };
        
        this.state.speechRecognition.onend = () => {
            // Restart if still recording (speech recognition can stop unexpectedly)
            if (this.state.isRecording && this.state.speechRecognition) {
                try {
                    this.state.speechRecognition.start();
                } catch (e) {
                    // Already started or other error
                }
            }
        };
        
        return true;
    },
    
    /**
     * Start recording audio
     * @param {Function} onAmplitude - Callback for amplitude data (for visualization)
     * @param {Function} onTranscriptUpdate - Callback for transcript updates
     * @returns {Promise<boolean>}
     */
    async startRecording(onAmplitude, onTranscriptUpdate) {
        try {
            // Store transcript callback
            this.state.onTranscriptUpdate = onTranscriptUpdate;
            
            // Reset speech state
            this.state.recognizedText = '';
            this.state.wordCount = 0;
            
            // Get microphone stream
            this.state.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: this.config.sampleRate
                }
            });
            
            // Create audio context
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.state.audioContext = new AudioContextClass({
                sampleRate: this.config.sampleRate
            });
            
            // Resume context if suspended (required for some browsers)
            if (this.state.audioContext.state === 'suspended') {
                await this.state.audioContext.resume();
            }
            
            // Create source from stream
            const source = this.state.audioContext.createMediaStreamSource(this.state.mediaStream);
            
            // Create analyser for visualization
            this.state.analyser = this.state.audioContext.createAnalyser();
            this.state.analyser.fftSize = this.config.fftSize;
            
            // Reset state
            this.state.audioBuffer = [];
            this.state.amplitudeData = [];
            this.state.isRecording = true;
            this.state.startTime = Date.now();
            
            // Try to use AudioWorklet, fall back to ScriptProcessor
            if (this.isAudioWorkletSupported()) {
                try {
                    await this.setupAudioWorklet(source, onAmplitude);
                    this.state.useAudioWorklet = true;
                    console.log('Using AudioWorklet for audio processing');
                } catch (workletError) {
                    console.warn('AudioWorklet failed, falling back to ScriptProcessor:', workletError);
                    this.setupScriptProcessor(source, onAmplitude);
                    this.state.useAudioWorklet = false;
                }
            } else {
                this.setupScriptProcessor(source, onAmplitude);
                this.state.useAudioWorklet = false;
                console.log('Using ScriptProcessor (AudioWorklet not supported)');
            }
            
            // Connect analyser
            source.connect(this.state.analyser);
            
            // Initialize and start speech recognition
            if (this.initSpeechRecognition()) {
                try {
                    this.state.speechRecognition.start();
                    console.log('Speech recognition started');
                } catch (e) {
                    console.warn('Could not start speech recognition:', e);
                }
            }
            
            return true;
        } catch (error) {
            console.error('Error starting recording:', error);
            this.cleanup();
            return false;
        }
    },
    
    /**
     * Setup AudioWorklet for modern audio processing
     * @param {MediaStreamAudioSourceNode} source
     * @param {Function} onAmplitude
     */
    async setupAudioWorklet(source, onAmplitude) {
        // Load the worklet module
        await this.state.audioContext.audioWorklet.addModule('js/audio-processor.worklet.js');
        
        // Create worklet node
        this.state.audioWorkletNode = new AudioWorkletNode(
            this.state.audioContext,
            'audio-processor'
        );
        
        // Handle messages from worklet
        this.state.audioWorkletNode.port.onmessage = (event) => {
            if (!this.state.isRecording) return;
            
            const { type, amplitude, audioData, timestamp } = event.data;
            
            if (type === 'amplitude') {
                this.state.amplitudeData.push({
                    time: Date.now() - this.state.startTime,
                    amplitude: amplitude
                });
                
                if (onAmplitude) {
                    onAmplitude(amplitude, Date.now() - this.state.startTime);
                }
            } else if (type === 'audioData') {
                this.state.audioBuffer.push(new Float32Array(audioData));
            }
        };
        
        // Connect nodes
        source.connect(this.state.audioWorkletNode);
        this.state.audioWorkletNode.connect(this.state.audioContext.destination);
    },
    
    /**
     * Setup ScriptProcessor as fallback for older browsers
     * @param {MediaStreamAudioSourceNode} source
     * @param {Function} onAmplitude
     */
    setupScriptProcessor(source, onAmplitude) {
        // Create script processor for raw audio capture
        // Note: ScriptProcessorNode is deprecated but kept as fallback
        this.state.scriptProcessor = this.state.audioContext.createScriptProcessor(
            this.config.bufferSize, 1, 1
        );
        
        // Process audio data
        this.state.scriptProcessor.onaudioprocess = (e) => {
            if (!this.state.isRecording) return;
            
            const inputData = e.inputBuffer.getChannelData(0);
            
            // Store raw audio data
            this.state.audioBuffer.push(new Float32Array(inputData));
            
            // Calculate amplitude (RMS)
            let sum = 0;
            for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
            }
            const rms = Math.sqrt(sum / inputData.length);
            
            this.state.amplitudeData.push({
                time: Date.now() - this.state.startTime,
                amplitude: rms
            });
            
            // Callback for visualization
            if (onAmplitude) {
                onAmplitude(rms, Date.now() - this.state.startTime);
            }
        };
        
        // Connect nodes
        source.connect(this.state.scriptProcessor);
        this.state.scriptProcessor.connect(this.state.audioContext.destination);
    },
    
    /**
     * Stop recording and return analysis
     * @returns {Object} Analysis results
     */
    stopRecording() {
        this.state.isRecording = false;
        
        // Stop speech recognition
        if (this.state.speechRecognition) {
            try {
                this.state.speechRecognition.stop();
            } catch (e) {
                // Already stopped
            }
        }
        
        // Get audio data for playback
        const audioData = this.combineAudioBuffers();
        
        // Analyze recorded data
        const analysis = this.analyzeAudio(audioData);
        
        // Store audio for playback
        analysis.audioData = audioData;
        
        // Add speech recognition data to analysis
        analysis.recognizedText = this.state.recognizedText;
        analysis.wordCount = this.state.wordCount;
        analysis.speechRecognitionSupported = this.state.speechRecognitionSupported;
        
        // Cleanup audio nodes (but keep context for playback)
        this.cleanupRecording();
        
        return analysis;
    },
    
    /**
     * Combine audio buffers into single buffer
     * @returns {Float32Array}
     */
    combineAudioBuffers() {
        const totalLength = this.state.audioBuffer.reduce(
            (acc, buf) => acc + buf.length, 0
        );
        
        const combined = new Float32Array(totalLength);
        let offset = 0;
        
        for (const buffer of this.state.audioBuffer) {
            combined.set(buffer, offset);
            offset += buffer.length;
        }
        
        return combined;
    },
    
    /**
     * Analyze recorded audio
     * @param {Float32Array} audioData - Combined audio buffer from combineAudioBuffers()
     * @returns {Object} Analysis results
     */
    analyzeAudio(audioData) {
        if (this.state.amplitudeData.length < 10) {
            return {
                score: 0,
                duration: 0,
                pauses: 0,
                variance: 0,
                speakingRate: 0,
                pitch: { f0Contour: [], meanF0: 0, f0StdDev: 0, f0Range: 0, jitter: 0, voicedFrameRatio: 0 },
                hnr: { meanHNR: 0, hnrValues: [] },
                prosodicDecay: { amplitudeDecay: 0, rateDecay: 0, firstThirdAmplitude: 0, lastThirdAmplitude: 0 },
                spectral: { meanSpectralCentroid: 0, spectralCentroidStdDev: 0, meanSpectralTilt: 0 },
                shimmer: { shimmer: 0, shimmerDb: 0 },
                details: { error: 'Insufficient data' }
            };
        }
        
        // Extract amplitude values
        const amplitudes = this.state.amplitudeData.map(d => d.amplitude);
        const sorted = [...amplitudes].sort((a, b) => a - b);
        const medianAmp = sorted.length % 2 === 1
            ? sorted[(sorted.length - 1) / 2]
            : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
        const adaptiveThreshold = Math.max(0.005, medianAmp * 0.5);
        // Detect speaking segments and pauses
        const { speakingDuration, pauseCount, segments } = this.detectSpeechSegments(amplitudes, adaptiveThreshold);
        
        // Calculate volume variance (standard deviation)
        const speakingAmplitudes = amplitudes.filter(a => a > adaptiveThreshold);
        const variance = speakingAmplitudes.length > 0 
            ? Utils.standardDeviation(speakingAmplitudes)
            : 0;
        
        // Calculate speaking rate using actual word count from speech recognition
        const actualWordCount = this.state.wordCount || 0;
        const speakingRate = (speakingDuration > 0 && actualWordCount > 0)
            ? (actualWordCount / speakingDuration) * 60
            : 0;
        
        // Pitch analysis from raw audio
        const sampleRate = this.state.audioContext?.sampleRate ?? this.config.sampleRate;
        const pitch = audioData.length >= Math.round(0.03 * sampleRate)
            ? this.analyzePitch(audioData, sampleRate)
            : { f0Contour: [], meanF0: 0, f0StdDev: 0, f0Range: 0, jitter: 0, voicedFrameRatio: 0 };
        const hnr = pitch.f0Contour.length > 0
            ? this.analyzeHNR(audioData, sampleRate, pitch.f0Contour)
            : { meanHNR: 0, hnrValues: [] };
        const shimmer = pitch.f0Contour.length > 0
            ? this.analyzeShimmer(audioData, sampleRate, pitch.f0Contour, adaptiveThreshold)
            : { shimmer: 0, shimmerDb: 0 };
        const prosodicDecay = this.analyzeProsodicDecay(this.state.amplitudeData, adaptiveThreshold);
        const spectral = audioData.length >= Math.round(0.03 * sampleRate)
            ? this.analyzeSpectralFeatures(audioData, sampleRate)
            : { meanSpectralCentroid: 0, spectralCentroidStdDev: 0, meanSpectralTilt: 0 };
        
        // Calculate score
        const score = this.calculateScore({
            speakingDuration,
            pauseCount,
            speechRecognitionAvailable: this.state.speechRecognitionSupported,
            f0StdDev: pitch.f0StdDev,
            jitter: pitch.jitter,
            shimmer: shimmer.shimmer,
            meanHNR: hnr.meanHNR,
            amplitudeDecay: prosodicDecay.amplitudeDecay
        });
        
        return {
            score,
            adaptiveThreshold,
            duration: Math.round(speakingDuration * 10) / 10,
            pauses: pauseCount,
            variance: Math.round(variance * 1000) / 1000,
            speakingRate: Math.round(speakingRate),
            pitch,
            hnr,
            prosodicDecay,
            spectral,
            shimmer,
            details: {
                totalDuration: this.state.amplitudeData.length > 0
                    ? this.state.amplitudeData[this.state.amplitudeData.length - 1].time / 1000
                    : 0,
                segmentCount: segments.length,
                wordCount: actualWordCount,
                pitch,
                hnr,
                prosodicDecay,
                spectral,
                shimmer
            }
        };
    },
    
    /**
     * Measure prosodic decay (loudness and rate decline across utterance).
     * Splits speaking frames into thirds; amplitudeDecay = (meanFirst - meanLast) / meanFirst.
     * rateDecay = drop in above-threshold frame density from first to last third of recording.
     * @param {Array<{time: number, amplitude: number}>} amplitudeData - Amplitude data from state
     * @param {number} threshold - Adaptive silence threshold (from analyzeAudio)
     * @returns {{ amplitudeDecay: number, rateDecay: number, firstThirdAmplitude: number, lastThirdAmplitude: number }}
     */
    analyzeProsodicDecay(amplitudeData, threshold) {
        if (threshold == null) threshold = this.config.silenceThreshold;
        const speakingAmps = amplitudeData
            .map((d) => d.amplitude)
            .filter((a) => a > threshold);
        const n = amplitudeData.length;
        if (speakingAmps.length < 3 || n < 3) {
            return { amplitudeDecay: 0, rateDecay: 0, firstThirdAmplitude: 0, lastThirdAmplitude: 0 };
        }
        const third = Math.floor(speakingAmps.length / 3);
        const firstThird = speakingAmps.slice(0, third);
        const lastThird = speakingAmps.slice(-third);
        const meanFirst = firstThird.reduce((a, b) => a + b, 0) / firstThird.length;
        const meanLast = lastThird.reduce((a, b) => a + b, 0) / lastThird.length;
        const amplitudeDecay = meanFirst > 0
            ? Math.max(0, Math.min(1, (meanFirst - meanLast) / meanFirst))
            : 0;

        const firstSegmentSize = Math.max(1, Math.floor(n / 3));
        const lastSegmentSize = Math.max(1, Math.floor(n / 3));
        let countFirst = 0;
        for (let i = 0; i < firstSegmentSize && i < n; i++) {
            if (amplitudeData[i].amplitude > threshold) countFirst++;
        }
        let countLast = 0;
        const lastStart = Math.max(0, n - lastSegmentSize);
        for (let i = lastStart; i < n; i++) {
            if (amplitudeData[i].amplitude > threshold) countLast++;
        }
        const densityFirst = countFirst / firstSegmentSize;
        const densityLast = countLast / lastSegmentSize;
        const rateDecay = densityFirst > 0
            ? Math.max(0, Math.min(1, (densityFirst - densityLast) / densityFirst))
            : 0;

        return {
            amplitudeDecay: Math.round(amplitudeDecay * 1000) / 1000,
            rateDecay: Math.round(rateDecay * 1000) / 1000,
            firstThirdAmplitude: Math.round(meanFirst * 1000) / 1000,
            lastThirdAmplitude: Math.round(meanLast * 1000) / 1000
        };
    },

    /**
     * Compute shimmer from per-pitch-cycle peak amplitudes (voiced frames only).
     * For each voiced frame: extract 30ms window, find peak |amplitude| per pitch period,
     * shimmer = mean(|peak[i+1]-peak[i]|) / mean(peaks) * 100.
     * @param {Float32Array|number[]} audioData - Raw mono audio
     * @param {number} sampleRate - Samples per second
     * @param {Array<{time: number, f0: number}>} f0Contour - Voiced frames from analyzePitch
     * @param {number} [adaptiveThreshold] - Adaptive silence threshold (from analyzeAudio), for consistency
     * @returns {{ shimmer: number, shimmerDb: number }}
     */
    analyzeShimmer(audioData, sampleRate, f0Contour, adaptiveThreshold) {
        if (f0Contour.length === 0) {
            return { shimmer: 0, shimmerDb: 0 };
        }
        const windowMs = 30;
        const windowSamples = Math.round((windowMs / 1000) * sampleRate);
        const frameShimmers = [];

        for (const { time, f0 } of f0Contour) {
            const start = Math.round(time * sampleRate);
            if (start + windowSamples > audioData.length || start < 0) continue;
            const period = Math.round(sampleRate / f0);
            if (period < 1 || period >= windowSamples) continue;

            const peaks = [];
            for (let segStart = 0; segStart + period <= windowSamples; segStart += period) {
                let peak = 0;
                for (let i = 0; i < period; i++) {
                    const val = Math.abs(audioData[start + segStart + i]);
                    if (val > peak) peak = val;
                }
                peaks.push(peak);
            }
            if (peaks.length < 2) continue;
            let sumAbsDiff = 0;
            for (let i = 1; i < peaks.length; i++) {
                sumAbsDiff += Math.abs(peaks[i] - peaks[i - 1]);
            }
            const meanPeaks = peaks.reduce((a, b) => a + b, 0) / peaks.length;
            const frameShimmer = meanPeaks > 0 ? (sumAbsDiff / (peaks.length - 1) / meanPeaks) * 100 : 0;
            frameShimmers.push(frameShimmer);
        }

        const shimmer = frameShimmers.length > 0
            ? frameShimmers.reduce((a, b) => a + b, 0) / frameShimmers.length
            : 0;
        const shimmerRatio = shimmer / 100;
        const shimmerDb = 20 * Math.log10(1 + shimmerRatio);
        return {
            shimmer: Math.round(shimmer * 100) / 100,
            shimmerDb: Math.round(shimmerDb * 100) / 100
        };
    },

    /**
     * Detect speech segments and pauses
     * @param {number[]} amplitudes - Array of amplitude values
     * @param {number} threshold - Adaptive silence threshold (from analyzeAudio)
     * @returns {Object} Speaking duration, pause count, and segments
     */
    detectSpeechSegments(amplitudes, threshold) {
        if (threshold == null) threshold = this.config.silenceThreshold;
        
        // Calculate actual time between readings using stored timestamps
        // This works correctly for both AudioWorklet (128 samples) and ScriptProcessor (4096 samples)
        let avgTimePerReading = 0;
        if (this.state.amplitudeData.length > 1) {
            const totalTime = this.state.amplitudeData[this.state.amplitudeData.length - 1].time - 
                              this.state.amplitudeData[0].time;
            avgTimePerReading = totalTime / (this.state.amplitudeData.length - 1); // in milliseconds
        } else {
            // Fallback to config-based calculation
            avgTimePerReading = (this.config.bufferSize / this.config.sampleRate) * 1000;
        }
        
        const secondsPerReading = avgTimePerReading / 1000;
        
        // Minimum pause duration in readings
        const minPauseSamples = Math.ceil(this.config.minPauseDuration / secondsPerReading);
        
        const segments = [];
        let currentSegment = null;
        let silenceCount = 0;
        let speakingDuration = 0;
        
        for (let i = 0; i < amplitudes.length; i++) {
            const isSpeaking = amplitudes[i] > threshold;
            
            if (isSpeaking) {
                if (currentSegment === null) {
                    // Start new segment
                    currentSegment = { start: i, end: i };
                } else {
                    // Extend current segment
                    currentSegment.end = i;
                }
                silenceCount = 0;
            } else {
                silenceCount++;
                
                if (currentSegment !== null) {
                    if (silenceCount >= minPauseSamples) {
                        // End current segment
                        segments.push(currentSegment);
                        currentSegment = null;
                    }
                }
            }
        }
        
        // Don't forget last segment
        if (currentSegment !== null) {
            segments.push(currentSegment);
        }
        
        // Pause count = gaps between speech segments only (excludes leading/trailing silence)
        const pauseCount = Math.max(0, segments.length - 1);
        
        // Calculate total speaking duration
        for (const segment of segments) {
            speakingDuration += (segment.end - segment.start + 1) * secondsPerReading;
        }

        return { speakingDuration, pauseCount, segments };
    },
    
    /**
     * Extract fundamental frequency (F0) contour using autocorrelation.
     * 30ms windows, 10ms hop; Hann window; normalized autocorrelation for 80-400 Hz (speech range).
     * Adaptive RMS gate, voicing threshold 0.5, parabolic interpolation for sub-sample F0.
     * @param {Float32Array|number[]} audioData - Raw mono audio samples
     * @param {number} sampleRate - Samples per second
     * @returns {Object} { f0Contour, meanF0, f0StdDev, f0Range, jitter, voicedFrameRatio }
     */
    analyzePitch(audioData, sampleRate) {
        const windowMs = 30;
        const hopMs = 10;
        const windowSamples = Math.round((windowMs / 1000) * sampleRate);
        const hopSamples = Math.round((hopMs / 1000) * sampleRate);
        const minLag = Math.ceil(sampleRate / 400);
        const maxLag = Math.floor(sampleRate / 80);
        const voicingThreshold = 0.5;

        // Pre-pass: compute RMS for every frame to get adaptive threshold (75th percentile)
        const rmsValues = [];
        for (let start = 0; start + windowSamples <= audioData.length; start += hopSamples) {
            const window = new Float32Array(windowSamples);
            for (let i = 0; i < windowSamples; i++) {
                const w = windowSamples > 1 ? 0.5 * (1 - Math.cos(2 * Math.PI * i / (windowSamples - 1))) : 1;
                window[i] = audioData[start + i] * w;
            }
            let rmsSum = 0;
            for (let i = 0; i < windowSamples; i++) rmsSum += window[i] * window[i];
            rmsValues.push(Math.sqrt(rmsSum / windowSamples));
        }
        rmsValues.sort((a, b) => a - b);
        const idx75 = rmsValues.length > 0 ? Math.min(rmsValues.length - 1, Math.floor(0.75 * rmsValues.length)) : 0;
        const percentile75 = rmsValues.length > 0 ? rmsValues[idx75] : 0;
        const rmsThreshold = Math.max(0.005, percentile75 * 0.3);

        const f0Contour = [];
        const f0Values = [];

        const autocorrAt = (window, lag) => {
            const len = windowSamples - lag;
            let sum = 0, sum0 = 0, sumL = 0;
            for (let i = 0; i < len; i++) {
                sum += window[i] * window[i + lag];
                sum0 += window[i] * window[i];
                sumL += window[i + lag] * window[i + lag];
            }
            const denom = Math.sqrt(sum0 * sumL);
            return denom > 0 ? sum / denom : 0;
        };

        for (let start = 0; start + windowSamples <= audioData.length; start += hopSamples) {
            const timeSec = start / sampleRate;
            const window = new Float32Array(windowSamples);
            for (let i = 0; i < windowSamples; i++) {
                const w = windowSamples > 1 ? 0.5 * (1 - Math.cos(2 * Math.PI * i / (windowSamples - 1))) : 1;
                window[i] = audioData[start + i] * w;
            }
            let rmsSum = 0;
            for (let i = 0; i < windowSamples; i++) rmsSum += window[i] * window[i];
            const rms = Math.sqrt(rmsSum / windowSamples);
            if (rms < rmsThreshold) continue;

            let bestLag = -1;
            let bestCorr = voicingThreshold;

            for (let lag = minLag; lag <= maxLag && lag < windowSamples; lag++) {
                const corr = autocorrAt(window, lag);
                if (corr > bestCorr) {
                    bestCorr = corr;
                    bestLag = lag;
                }
            }

            if (bestLag > 0) {
                let lagForF0 = bestLag;
                const corrLeft = bestLag > 1 ? autocorrAt(window, bestLag - 1) : bestCorr;
                const corrCenter = bestCorr;
                const corrRight = bestLag + 1 < windowSamples ? autocorrAt(window, bestLag + 1) : bestCorr;
                const denom = corrLeft - 2 * corrCenter + corrRight;
                if (denom < -1e-10) {
                    const delta = 0.5 * (corrLeft - corrRight) / denom;
                    const clamped = Math.max(-1, Math.min(1, delta));
                    lagForF0 = bestLag + clamped;
                }
                const f0 = sampleRate / lagForF0;
                f0Contour.push({ time: timeSec, f0, correlation: bestCorr });
                f0Values.push(f0);
            }
        }

        // F0 continuity median filter: replace outliers deviating >30% from local median
        const winHalf = 2;
        const deviationLimit = 0.3;
        for (let i = 0; i < f0Values.length; i++) {
            const lo = Math.max(0, i - winHalf);
            const hi = Math.min(f0Values.length - 1, i + winHalf);
            const slice = f0Values.slice(lo, hi + 1).sort((a, b) => a - b);
            const med = slice.length % 2 === 1
                ? slice[(slice.length - 1) / 2]
                : (slice[slice.length / 2 - 1] + slice[slice.length / 2]) / 2;
            const v = f0Values[i];
            if (med > 0 && Math.abs(v - med) / med > deviationLimit) {
                f0Values[i] = med;
                f0Contour[i].f0 = med;
            }
        }

        // Two-pass outlier removal: remove frames >2 std dev from mean (catches clusters median filter misses)
        if (f0Values.length >= 2) {
            const mean = f0Values.reduce((a, b) => a + b, 0) / f0Values.length;
            const variance = f0Values.reduce((s, v) => s + (v - mean) ** 2, 0) / f0Values.length;
            const stdDev = Math.sqrt(variance);
            for (let i = f0Values.length - 1; i >= 0; i--) {
                if (Math.abs(f0Values[i] - mean) > 2 * stdDev) {
                    f0Values.splice(i, 1);
                    f0Contour.splice(i, 1);
                }
            }
        }

        const voicedCount = f0Values.length;
        const totalFrames = Math.max(1, Math.floor((audioData.length - windowSamples) / hopSamples) + 1);
        const voicedFrameRatio = voicedCount / totalFrames;

        let meanF0 = 0;
        let f0StdDev = 0;
        let f0Range = 0;
        let jitter = 0;

        if (f0Values.length >= 1) {
            meanF0 = f0Values.reduce((a, b) => a + b, 0) / f0Values.length;
            const variance = f0Values.reduce((s, v) => s + (v - meanF0) ** 2, 0) / f0Values.length;
            f0StdDev = Math.sqrt(variance);
            f0Range = Math.max(...f0Values) - Math.min(...f0Values);
            if (f0Values.length >= 2) {
                let sumAbsDiff = 0;
                for (let i = 1; i < f0Values.length; i++) {
                    sumAbsDiff += Math.abs(f0Values[i] - f0Values[i - 1]);
                }
                jitter = meanF0 > 0 ? (sumAbsDiff / (f0Values.length - 1) / meanF0) * 100 : 0;
            }
        }

        return {
            f0Contour,
            meanF0: Math.round(meanF0 * 10) / 10,
            f0StdDev: Math.round(f0StdDev * 10) / 10,
            f0Range: Math.round(f0Range * 10) / 10,
            jitter: Math.round(jitter * 100) / 100,
            voicedFrameRatio: Math.round(voicedFrameRatio * 1000) / 1000
        };
    },

    /**
     * In-place radix-2 FFT (Cooley-Tukey). Modifies real and imag arrays.
     * @param {number[]} real - Real part (length must be power of 2)
     * @param {number[]} imag - Imaginary part
     */
    _fft(real, imag) {
        const N = real.length;
        if (N <= 1) return;
        let j = 0;
        for (let i = 0; i < N; i++) {
            if (i < j) {
                [real[i], real[j]] = [real[j], real[i]];
                [imag[i], imag[j]] = [imag[j], imag[i]];
            }
            let m = N >> 1;
            while (m >= 1 && j >= m) {
                j -= m;
                m >>= 1;
            }
            j += m;
        }
        for (let len = 2; len <= N; len *= 2) {
            const angle = -2 * Math.PI / len;
            const wlenReal = Math.cos(angle);
            const wlenImag = Math.sin(angle);
            for (let i = 0; i < N; i += len) {
                let wReal = 1, wImag = 0;
                for (let j = 0; j < len / 2; j++) {
                    const u = i + j, v = u + len / 2;
                    const tReal = real[v] * wReal - imag[v] * wImag;
                    const tImag = real[v] * wImag + imag[v] * wReal;
                    real[v] = real[u] - tReal; imag[v] = imag[u] - tImag;
                    real[u] += tReal; imag[u] += tImag;
                    const nwR = wReal * wlenReal - wImag * wlenImag;
                    const nwI = wReal * wlenImag + wImag * wlenReal;
                    wReal = nwR; wImag = nwI;
                }
            }
        }
    },

    /**
     * Compute spectral features from raw audio (30ms windows, 10ms hop).
     * spectralCentroid = center of mass of spectrum in Hz; spectralTilt = low/high energy ratio.
     * Informational only (not used in scoring).
     * @param {Float32Array|number[]} audioData - Raw mono audio
     * @param {number} sampleRate - Samples per second
     * @returns {{ meanSpectralCentroid: number, spectralCentroidStdDev: number, meanSpectralTilt: number }}
     */
    analyzeSpectralFeatures(audioData, sampleRate) {
        const windowMs = 30;
        const hopMs = 10;
        const windowSamples = Math.round((windowMs / 1000) * sampleRate);
        const hopSamples = Math.round((hopMs / 1000) * sampleRate);
        let fftSize = 2;
        while (fftSize < windowSamples) fftSize *= 2;
        const df = sampleRate / fftSize;
        const nyquistBin = fftSize / 2;
        const cutoffBin = Math.min(nyquistBin, Math.ceil(1000 / df));

        const centroidValues = [];
        const tiltValues = [];
        const real = new Array(fftSize);
        const imag = new Array(fftSize);

        for (let start = 0; start + windowSamples <= audioData.length; start += hopSamples) {
            for (let i = 0; i < fftSize; i++) {
                if (i < windowSamples) {
                    const w = windowSamples > 1 ? 0.5 * (1 - Math.cos(2 * Math.PI * i / (windowSamples - 1))) : 1;
                    real[i] = audioData[start + i] * w;
                } else {
                    real[i] = 0;
                }
                imag[i] = 0;
            }
            this._fft(real, imag);

            const mag = new Array(nyquistBin);
            let sumFreqMag = 0, sumMag = 0;
            let energyBelow = 0, energyAbove = 0;
            for (let k = 0; k < nyquistBin; k++) {
                const m = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
                mag[k] = m;
                const freq = k * df;
                sumFreqMag += freq * m;
                sumMag += m;
                const e = m * m;
                if (freq < 1000) energyBelow += e;
                else energyAbove += e;
            }
            const centroid = sumMag > 0 ? sumFreqMag / sumMag : 0;
            const tilt = energyAbove > 0 ? energyBelow / energyAbove : 0;
            const clampedTilt = Math.min(tilt, 1000);
            centroidValues.push(centroid);
            tiltValues.push(clampedTilt);
        }

        const meanCentroid = centroidValues.length > 0
            ? centroidValues.reduce((a, b) => a + b, 0) / centroidValues.length
            : 0;
        const variance = centroidValues.length > 1
            ? centroidValues.reduce((s, v) => s + (v - meanCentroid) ** 2, 0) / centroidValues.length
            : 0;
        const centroidStdDev = Math.sqrt(variance);
        const meanTilt = tiltValues.length > 0
            ? tiltValues.reduce((a, b) => a + b, 0) / tiltValues.length
            : 0;

        return {
            meanSpectralCentroid: Math.round(meanCentroid * 10) / 10,
            spectralCentroidStdDev: Math.round(centroidStdDev * 10) / 10,
            meanSpectralTilt: Math.round(meanTilt * 100) / 100
        };
    },

    /**
     * Estimate harmonics-to-noise ratio from voiced frames using correlation stored in f0Contour.
     * Uses the same autocorrelation peaks as pitch detection for consistency.
     * @param {Float32Array|number[]} audioData - Raw mono audio (unused; kept for API compatibility)
     * @param {number} sampleRate - Samples per second (unused; kept for API compatibility)
     * @param {Array<{time: number, f0: number, correlation: number}>} f0Contour - Voiced frames from analyzePitch
     * @returns {{ meanHNR: number, hnrValues: number[] }}
     */
    analyzeHNR(audioData, sampleRate, f0Contour) {
        if (f0Contour.length === 0) {
            return { meanHNR: 0, hnrValues: [] };
        }
        const hnrValues = [];
        for (const entry of f0Contour) {
            const rPeak = Math.max(0.01, Math.min(0.99, entry.correlation));
            const hnr = 10 * Math.log10(rPeak / (1 - rPeak));
            hnrValues.push(hnr);
        }
        const meanHNR = hnrValues.length > 0
            ? hnrValues.reduce((a, b) => a + b, 0) / hnrValues.length
            : 0;
        return {
            meanHNR: Math.round(meanHNR * 10) / 10,
            hnrValues
        };
    },

    /**
     * Calculate voice score (0-10).
     * Lower score = better voice control. Total max = 10.
     * Breakdown: duration 0-1.5, pause 0-1.5, F0 stdDev (monotonicity) 0-1.5,
     * jitter 0-1.5, shimmer 0-1, prosodic amplitude decay 0-1.5, HNR 0-1.5.
     * @param {Object} metrics - Voice metrics
     * @returns {number} Score 0-10
     */
    calculateScore(metrics) {
        const {
            speakingDuration,
            pauseCount,
            speechRecognitionAvailable,
            f0StdDev = 0,
            jitter = 0,
            shimmer = 0,
            meanHNR = 0,
            amplitudeDecay = 0
        } = metrics;
        
        const idealDuration = 4;
        
        let score = 0;
        
        // Duration factor (0-1.5 points, rebalanced for shimmer)
        const durationRatio = speakingDuration / idealDuration;
        if (durationRatio < 0.5 || durationRatio > 2) {
            score += 1.5;
        } else if (durationRatio < 0.7 || durationRatio > 1.5) {
            score += 1;
        } else if (durationRatio < 0.8 || durationRatio > 1.2) {
            score += 0.5;
        }
        
        // Pause factor (0-1.5 points, rebalanced for shimmer)
        if (pauseCount >= 4) {
            score += 1.5;
        } else if (pauseCount >= 2) {
            score += 1;
        } else if (pauseCount >= 1) {
            score += 0.5;
        }
        
        // Speaking rate factor removed (less specific to PD than prosodic decay)
        
        // F0 stdDev: monotonicity (stdDev < 15 Hz = 1.5 pts, < 20 Hz = linear scale) (0-1.5 points)
        if (f0StdDev > 0 && f0StdDev < 15) {
            score += 1.5;
        } else if (f0StdDev < 20) {
            score += 1.5 * (20 - f0StdDev) / 5;
        }
        
        // Jitter: elevated (> 1.5%) linear to 4% (0-1.5 points)
        if (jitter > 1.5) {
            score += Math.min(1.5, 1.5 * (jitter - 1.5) / 2.5);
        }
        
        // Shimmer: elevated = vocal instability (0-1 point)
        if (shimmer > 12) {
            score += 1;
        } else if (shimmer > 8) {
            score += 0.5;
        }
        
        // Prosodic decay: amplitude decline within utterance (0-1.5 points)
        if (amplitudeDecay > 0.40) {
            score += 1.5;
        } else if (amplitudeDecay > 0.25) {
            score += 1;
        }
        
        // HNR: low = breathiness (0-1.5 points)
        if (meanHNR > 0 && meanHNR < 10) {
            score += 1.5;
        } else if (meanHNR > 0 && meanHNR < 15) {
            score += 1;
        }
        
        return Utils.clamp(Math.round(score * 10) / 10, 0, 10);
    },
    
    /**
     * Play back recorded audio
     * @param {Float32Array} audioData - Audio data to play
     */
    async playback(audioData) {
        if (!audioData || audioData.length === 0) {
            console.warn('No audio data to play');
            return;
        }
        
        try {
            // Create audio context if needed
            if (!this.state.audioContext || this.state.audioContext.state === 'closed') {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                this.state.audioContext = new AudioContextClass();
            }
            
            // Resume if suspended
            if (this.state.audioContext.state === 'suspended') {
                await this.state.audioContext.resume();
            }
            
            // Create buffer
            const buffer = this.state.audioContext.createBuffer(
                1, // mono
                audioData.length,
                this.state.audioContext.sampleRate
            );
            
            buffer.getChannelData(0).set(audioData);
            
            // Create source and play
            const source = this.state.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.state.audioContext.destination);
            source.start();
            
            return new Promise(resolve => {
                source.onended = resolve;
            });
        } catch (error) {
            console.error('Error playing audio:', error);
        }
    },
    
    /**
     * Cleanup recording resources
     */
    cleanupRecording() {
        if (this.state.audioWorkletNode) {
            this.state.audioWorkletNode.disconnect();
            this.state.audioWorkletNode = null;
        }
        
        if (this.state.scriptProcessor) {
            this.state.scriptProcessor.disconnect();
            this.state.scriptProcessor = null;
        }
        
        if (this.state.analyser) {
            this.state.analyser.disconnect();
            this.state.analyser = null;
        }
        
        if (this.state.mediaStream) {
            this.state.mediaStream.getTracks().forEach(track => track.stop());
            this.state.mediaStream = null;
        }
        
        if (this.state.speechRecognition) {
            try {
                this.state.speechRecognition.stop();
            } catch (e) {}
            this.state.speechRecognition = null;
        }
    },
    
    /**
     * Full cleanup including audio context
     */
    cleanup() {
        this.cleanupRecording();
        
        if (this.state.audioContext && this.state.audioContext.state !== 'closed') {
            this.state.audioContext.close();
            this.state.audioContext = null;
        }
        
        this.state.audioBuffer = [];
        this.state.amplitudeData = [];
        this.state.recognizedText = '';
        this.state.wordCount = 0;
    },
    
    /**
     * Get current waveform data for visualization
     * @returns {Uint8Array}
     */
    getWaveformData() {
        if (!this.state.analyser) return new Uint8Array(0);
        
        const bufferLength = this.state.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.state.analyser.getByteTimeDomainData(dataArray);
        
        return dataArray;
    },
    
    /**
     * Get the target phrase for the test
     * @returns {string}
     */
    getTargetPhrase() {
        return this.config.targetPhrase;
    },

    /**
     * Count how many target phrase words appear in the recognized text
     * @param {string} recognizedText - Text from speech recognition
     * @returns {number} Number of target words matched (0-9)
     */
    countMatchingTargetWords(recognizedText) {
        if (!recognizedText || typeof recognizedText !== 'string') return 0;
        const normalize = (w) => w.toLowerCase().replace(/[^\w]/g, '');
        const targetWords = this.config.targetPhrase.split(/\s+/).map(normalize).filter(w => w.length > 0);
        const recognizedWords = recognizedText.split(/\s+/).map(normalize).filter(w => w.length > 0);
        let matchedCount = 0;
        const recognizedCopy = [...recognizedWords];
        for (const targetWord of targetWords) {
            const idx = recognizedCopy.findIndex(w => w === targetWord);
            if (idx >= 0) {
                matchedCount++;
                recognizedCopy.splice(idx, 1);
            }
        }
        return matchedCount;
    },
    
    /**
     * Reset state
     */
    reset() {
        this.cleanupRecording();
        this.state.audioBuffer = [];
        this.state.amplitudeData = [];
        this.state.startTime = null;
        this.state.recognizedText = '';
        this.state.wordCount = 0;
    }
};

// Make VoiceLogic available globally
window.VoiceLogic = VoiceLogic;
