/**
 * ParkinPal - Voice Analysis Logic
 * Uses Web Audio API to analyze voice characteristics
 */

const VoiceLogic = {
    // Configuration
    config: {
        testDuration: 10000, // 10 seconds
        sampleRate: 44100,
        fftSize: 2048,
        silenceThreshold: 0.02, // Amplitude threshold for silence detection
        minPauseDuration: 0.3, // Minimum pause duration in seconds
        phraseWordCount: 9 // "The quick brown fox jumps over the lazy dog"
    },
    
    // State
    state: {
        isRecording: false,
        permissionGranted: false,
        audioContext: null,
        mediaStream: null,
        analyser: null,
        scriptProcessor: null,
        audioBuffer: [],
        amplitudeData: [],
        startTime: null
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
     * Start recording audio
     * @param {Function} onAmplitude - Callback for amplitude data (for visualization)
     * @returns {Promise<boolean>}
     */
    async startRecording(onAmplitude) {
        try {
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
            
            // Create script processor for raw audio capture
            // Note: ScriptProcessorNode is deprecated but still widely supported
            // AudioWorklet would be the modern alternative
            const bufferSize = 4096;
            this.state.scriptProcessor = this.state.audioContext.createScriptProcessor(
                bufferSize, 1, 1
            );
            
            // Reset state
            this.state.audioBuffer = [];
            this.state.amplitudeData = [];
            this.state.isRecording = true;
            this.state.startTime = Date.now();
            
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
            source.connect(this.state.analyser);
            source.connect(this.state.scriptProcessor);
            this.state.scriptProcessor.connect(this.state.audioContext.destination);
            
            return true;
        } catch (error) {
            console.error('Error starting recording:', error);
            this.cleanup();
            return false;
        }
    },
    
    /**
     * Stop recording and return analysis
     * @returns {Object} Analysis results
     */
    stopRecording() {
        this.state.isRecording = false;
        
        // Get audio data for playback
        const audioData = this.combineAudioBuffers();
        
        // Analyze recorded data
        const analysis = this.analyzeAudio();
        
        // Store audio for playback
        analysis.audioData = audioData;
        
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
     * @returns {Object} Analysis results
     */
    analyzeAudio() {
        if (this.state.amplitudeData.length < 10) {
            return {
                score: 0,
                duration: 0,
                pauses: 0,
                variance: 0,
                speakingRate: 0,
                details: { error: 'Insufficient data' }
            };
        }
        
        // Extract amplitude values
        const amplitudes = this.state.amplitudeData.map(d => d.amplitude);
        
        // Detect speaking segments and pauses
        const { speakingDuration, pauseCount, segments } = this.detectSpeechSegments(amplitudes);
        
        // Calculate volume variance (standard deviation)
        const speakingAmplitudes = amplitudes.filter(a => a > this.config.silenceThreshold);
        const variance = speakingAmplitudes.length > 0 
            ? Utils.standardDeviation(speakingAmplitudes)
            : 0;
        
        // Calculate speaking rate (words per minute)
        const speakingRate = speakingDuration > 0
            ? (this.config.phraseWordCount / speakingDuration) * 60
            : 0;
        
        // Calculate score
        const score = this.calculateScore({
            speakingDuration,
            pauseCount,
            variance,
            speakingRate
        });
        
        return {
            score,
            duration: Math.round(speakingDuration * 10) / 10,
            pauses: pauseCount,
            variance: Math.round(variance * 1000) / 1000,
            speakingRate: Math.round(speakingRate),
            details: {
                totalDuration: this.state.amplitudeData.length > 0
                    ? this.state.amplitudeData[this.state.amplitudeData.length - 1].time / 1000
                    : 0,
                segmentCount: segments.length
            }
        };
    },
    
    /**
     * Detect speech segments and pauses
     * @param {number[]} amplitudes - Array of amplitude values
     * @returns {Object} Speaking duration, pause count, and segments
     */
    detectSpeechSegments(amplitudes) {
        const threshold = this.config.silenceThreshold;
        const minPauseSamples = Math.ceil(
            this.config.minPauseDuration * (this.config.sampleRate / 4096)
        );
        
        const segments = [];
        let currentSegment = null;
        let silenceCount = 0;
        let pauseCount = 0;
        let speakingDuration = 0;
        
        // Samples per amplitude reading (based on script processor buffer size)
        const samplesPerReading = 4096;
        const secondsPerReading = samplesPerReading / this.config.sampleRate;
        
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
                        pauseCount++;
                    }
                }
            }
        }
        
        // Don't forget last segment
        if (currentSegment !== null) {
            segments.push(currentSegment);
        }
        
        // Calculate total speaking duration
        for (const segment of segments) {
            speakingDuration += (segment.end - segment.start + 1) * secondsPerReading;
        }
        
        return { speakingDuration, pauseCount, segments };
    },
    
    /**
     * Calculate voice score (0-10)
     * Lower score = better voice control
     * @param {Object} metrics - Voice metrics
     * @returns {number} Score 0-10
     */
    calculateScore(metrics) {
        const { speakingDuration, pauseCount, variance, speakingRate } = metrics;
        
        // Ideal values for comparison
        const idealDuration = 4; // seconds for the phrase
        const idealRate = 135; // words per minute
        const idealVariance = 0.05; // Some variation is good
        
        let score = 0;
        
        // Duration factor (0-3 points)
        // Too fast or too slow is problematic
        const durationRatio = speakingDuration / idealDuration;
        if (durationRatio < 0.5 || durationRatio > 2) {
            score += 3;
        } else if (durationRatio < 0.7 || durationRatio > 1.5) {
            score += 2;
        } else if (durationRatio < 0.8 || durationRatio > 1.2) {
            score += 1;
        }
        
        // Pause factor (0-3 points)
        // More pauses = higher score (worse)
        if (pauseCount >= 4) {
            score += 3;
        } else if (pauseCount >= 2) {
            score += 2;
        } else if (pauseCount >= 1) {
            score += 1;
        }
        
        // Variance factor (0-2 points)
        // Very low variance (monotone) is problematic
        // Very high variance might indicate tremor in voice
        if (variance < 0.01) {
            score += 2; // Monotone
        } else if (variance > 0.15) {
            score += 2; // Highly variable
        } else if (variance < 0.02 || variance > 0.1) {
            score += 1;
        }
        
        // Speaking rate factor (0-2 points)
        if (speakingRate < 80 || speakingRate > 200) {
            score += 2;
        } else if (speakingRate < 100 || speakingRate > 170) {
            score += 1;
        }
        
        // Clamp to 0-10
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
     * Reset state
     */
    reset() {
        this.cleanupRecording();
        this.state.audioBuffer = [];
        this.state.amplitudeData = [];
        this.state.startTime = null;
    }
};

// Make VoiceLogic available globally
window.VoiceLogic = VoiceLogic;
