/**
 * ParkinPal - Voice Analysis Logic
 * Uses Web Audio API (AudioWorklet) and Web Speech API to analyze voice characteristics
 */

// #region agent log
fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:TOP',message:'voice-logic.js file loaded',data:{timestamp:new Date().toISOString()},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'LOAD'})}).catch(()=>{});
// #endregion

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
        onTranscriptUpdate: null, // Callback for transcript updates
        // Frequency data for formant/vowel analysis
        frequencyHistory: [],
        frequencyPollId: null,
        frequencyDataArray: null
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
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:initSpeechRecognition',message:'Checking Speech API support',data:{hasSpeechRecognition:!!SpeechRecognition,hasWindow:!!window.SpeechRecognition,hasWebkit:!!window.webkitSpeechRecognition},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
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
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:onresult',message:'Speech result received',data:{resultsLength:event.results.length,hasCallback:!!this.state.onTranscriptUpdate},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            
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
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:onresult',message:'Transcript extracted',data:{finalTranscript,interimTranscript:transcript,combinedText:this.state.recognizedText,wordCount:this.state.wordCount},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            
            // Callback for UI update
            if (this.state.onTranscriptUpdate) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:onresult',message:'Calling UI callback',data:{text:this.state.recognizedText,wordCount:this.state.wordCount},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
                // #endregion
                this.state.onTranscriptUpdate(this.state.recognizedText, this.state.wordCount);
            }
        };
        
        this.state.speechRecognition.onerror = (event) => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:onerror',message:'Speech recognition error',data:{error:event.error,errorMessage:event.message},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            console.warn('Speech recognition error:', event.error);
            // Don't stop recording on speech errors - audio recording should continue
        };
        
        this.state.speechRecognition.onend = () => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:onend',message:'Speech recognition ended',data:{isRecording:this.state.isRecording,hasSpeechRecognition:!!this.state.speechRecognition},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:startRecording',message:'startRecording() called',data:{hasAmplitudeCallback:!!onAmplitude,hasTranscriptCallback:!!onTranscriptUpdate},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'ENTRY'})}).catch(()=>{});
        // #endregion
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
            
            // #region agent log
            const workletSupported = this.isAudioWorkletSupported();
            fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:startRecording',message:'About to setup audio processing',data:{audioWorkletSupported:workletSupported},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'AUDIO'})}).catch(()=>{});
            // #endregion
            
            // Connect source through analyser (for frequency capture) then to processing
            source.connect(this.state.analyser);
            
            // Try to use AudioWorklet, fall back to ScriptProcessor
            if (this.isAudioWorkletSupported()) {
                try {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:startRecording',message:'Attempting AudioWorklet setup',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'WORKLET'})}).catch(()=>{});
                    // #endregion
                    await this.setupAudioWorklet(this.state.analyser, onAmplitude);
                    this.state.useAudioWorklet = true;
                    console.log('Using AudioWorklet for audio processing');
                } catch (workletError) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:startRecording',message:'AudioWorklet FAILED - falling back',data:{error:workletError.message,errorName:workletError.name},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'WORKLET'})}).catch(()=>{});
                    // #endregion
                    console.warn('AudioWorklet failed, falling back to ScriptProcessor:', workletError);
                    this.setupScriptProcessor(this.state.analyser, onAmplitude);
                    this.state.useAudioWorklet = false;
                }
            } else {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:startRecording',message:'Using ScriptProcessor (no AudioWorklet)',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'SCRIPT'})}).catch(()=>{});
                // #endregion
                this.setupScriptProcessor(this.state.analyser, onAmplitude);
                this.state.useAudioWorklet = false;
                console.log('Using ScriptProcessor (AudioWorklet not supported)');
            }
            
            // Start frequency capture loop for formant/vowel analysis
            this.state.frequencyHistory = [];
            this.state.frequencyDataArray = new Float32Array(this.state.analyser.frequencyBinCount);
            this.state.frequencyPollId = setInterval(() => {
                if (!this.state.isRecording || !this.state.analyser) return;
                this.state.analyser.getFloatFrequencyData(this.state.frequencyDataArray);
                this.state.frequencyHistory.push({
                    time: Date.now() - this.state.startTime,
                    spectrum: Array.from(this.state.frequencyDataArray)
                });
            }, 50);
            
            // Initialize and start speech recognition
            if (this.initSpeechRecognition()) {
                try {
                    this.state.speechRecognition.start();
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:startRecording',message:'Speech recognition start() called successfully',data:{hasCallback:!!this.state.onTranscriptUpdate},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    console.log('Speech recognition started');
                } catch (e) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:startRecording',message:'Speech recognition start() FAILED',data:{error:e.message,errorName:e.name},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    console.warn('Could not start speech recognition:', e);
                }
            }
            
            return true;
        } catch (error) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:startRecording',message:'FATAL ERROR in startRecording',data:{error:error.message,errorName:error.name,stack:error.stack},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'FATAL'})}).catch(()=>{});
            // #endregion
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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:setupAudioWorklet',message:'Loading worklet module',data:{path:'js/audio-processor.worklet.js'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'WORKLET_LOAD'})}).catch(()=>{});
        // #endregion
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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:stopRecording:entry',message:'stopRecording called',data:{wasRecording:this.state.isRecording,amplitudeDataLen:this.state.amplitudeData.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'STOP_A'})}).catch(()=>{});
        // #endregion
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
        const analysis = this.analyzeAudio();
        
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
                details: { error: 'Insufficient data' },
                metrics: null
            };
        }
        
        // Extract amplitude values
        const amplitudes = this.state.amplitudeData.map(d => d.amplitude);
        
        // #region agent log
        const minAmp = Math.min(...amplitudes);
        const maxAmp = Math.max(...amplitudes);
        const avgAmp = amplitudes.reduce((a,b)=>a+b,0)/amplitudes.length;
        fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:analyzeAudio:amps',message:'Amplitude stats',data:{count:amplitudes.length,min:minAmp.toFixed(5),max:maxAmp.toFixed(5),avg:avgAmp.toFixed(5),threshold:this.config.silenceThreshold},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'SPEAK_D'})}).catch(()=>{});
        // #endregion
        // Detect speaking segments and pauses
        const { speakingDuration, pauseCount, segments } = this.detectSpeechSegments(amplitudes);
        
        // Calculate time per amplitude reading
        let avgTimePerReading = 0;
        if (this.state.amplitudeData.length > 1) {
            const totalTime = this.state.amplitudeData[this.state.amplitudeData.length - 1].time - this.state.amplitudeData[0].time;
            avgTimePerReading = totalTime / (this.state.amplitudeData.length - 1);
        } else {
            avgTimePerReading = (this.config.bufferSize / this.config.sampleRate) * 1000;
        }
        const secondsPerReading = avgTimePerReading / 1000;
        
        // Five speech metrics
        const rawAudio = this.combineAudioBuffers();
        let vot, transitions, fatigue, vowels, steadiness;
        try {
            vot = this.analyzeVOT(rawAudio, this.config.sampleRate);
            transitions = this.analyzeTransitions(amplitudes, segments, this.state.frequencyHistory, secondsPerReading);
            fatigue = this.analyzeFatigue(this.state.amplitudeData, segments, secondsPerReading);
            vowels = rawAudio && rawAudio.length > 0 ? this.analyzeVowelHNR(rawAudio, this.config.sampleRate) : { hnrDb: null, severity: null };
            steadiness = this.analyzeSteadiness(amplitudes, this.config.silenceThreshold);
        } catch (e) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4c1b23'},body:JSON.stringify({sessionId:'4c1b23',location:'voice-logic.js:analyzeAudio:metricsError',message:'Metric analyzer threw',data:{error:String(e),name:e?.name},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
            // #endregion
            throw e;
        }
        const metrics = { vot, transitions, fatigue, vowels, steadiness };
        
        // Calculate volume variance (standard deviation)
        const speakingAmplitudes = amplitudes.filter(a => a > this.config.silenceThreshold);
        const variance = speakingAmplitudes.length > 0 
            ? Utils.standardDeviation(speakingAmplitudes)
            : 0;
        
        // Calculate speaking rate using actual word count from speech recognition
        const actualWordCount = this.state.wordCount || 0;
        const speakingRate = (speakingDuration > 0 && actualWordCount > 0)
            ? (actualWordCount / speakingDuration) * 60
            : 0;
        
        // Calculate score (including metric penalties)
        const score = this.calculateScore({
            speakingDuration,
            pauseCount,
            speakingRate,
            wordCount: actualWordCount,
            speechRecognitionAvailable: this.state.speechRecognitionSupported,
            metrics
        });
        
        return {
            score,
            duration: Math.round(speakingDuration * 10) / 10,
            pauses: pauseCount,
            variance: Math.round(variance * 1000) / 1000,
            speakingRate: Math.round(speakingRate),
            metrics,
            details: {
                totalDuration: this.state.amplitudeData.length > 0
                    ? this.state.amplitudeData[this.state.amplitudeData.length - 1].time / 1000
                    : 0,
                segmentCount: segments.length,
                wordCount: actualWordCount
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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:detectSpeechSegments:entry',message:'Starting segment detection',data:{threshold,amplitudesCount:amplitudes.length,amplitudeDataCount:this.state.amplitudeData.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'SPEAK_A'})}).catch(()=>{});
        // #endregion
        
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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:detectSpeechSegments:timing',message:'Timing calculated',data:{avgTimePerReading,secondsPerReading,minPauseSamples,totalAmplitudes:amplitudes.length,expectedTotalTime:amplitudes.length*secondsPerReading},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'SPEAK_B'})}).catch(()=>{});
        // #endregion
        
        const segments = [];
        let currentSegment = null;
        let silenceCount = 0;
        let pauseCount = 0;
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
                        // Only count as pause if there's more speech after this silence (ignore trailing silence)
                        const hasMoreSpeech = amplitudes.slice(i + 1).some(a => a > threshold);
                        if (hasMoreSpeech) {
                            pauseCount++;
                        }
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
        // #region agent log
        const aboveThreshold = amplitudes.filter(a => a > threshold).length;
        fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:detectSpeechSegments:result',message:'Segment detection complete',data:{speakingDuration,pauseCount,segmentCount:segments.length,aboveThreshold,totalAmplitudes:amplitudes.length,percentAboveThreshold:(aboveThreshold/amplitudes.length*100).toFixed(1)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'SPEAK_C'})}).catch(()=>{});
        // #endregion
        
        return { speakingDuration, pauseCount, segments };
    },
    
    /**
     * Check if a window contains voiced (periodic) sound via autocorrelation.
     * Burst/aspiration are aperiodic; voicing has clear periodicity in F0 range.
     * @param {Float32Array} samples - Audio window (~15ms)
     * @param {number} sampleRate - Sample rate in Hz
     * @returns {boolean}
     */
    isVoiced(samples, sampleRate) {
        const SIZE = samples.length;
        const minLag = Math.floor(sampleRate / 400);  // 400 Hz max F0
        const maxLag = Math.floor(sampleRate / 80);   // 80 Hz min F0
        if (minLag >= maxLag || maxLag >= SIZE / 2) return false;
        
        let energy = 0;
        for (let i = 0; i < SIZE; i++) energy += samples[i] * samples[i];
        if (energy < 1e-10) return false;
        
        let maxCorr = 0;
        for (let lag = minLag; lag < maxLag && lag < SIZE / 2; lag++) {
            let sum = 0;
            for (let j = 0; j < SIZE - lag; j++) {
                sum += samples[j] * samples[j + lag];
            }
            const corr = sum / energy;
            if (corr > maxCorr) maxCorr = corr;
        }
        return maxCorr > 0.25;
    },
    
    /**
     * Find plosive burst frame indices from RMS envelope.
     * Burst = sudden RMS spike above baseline (prior 50ms).
     * @param {number[]} envelope - RMS per frame
     * @param {number} hopMs - Hop size in ms
     * @param {number} lookbackMs - Baseline lookback in ms
     * @param {number} minSpacingFrames - Min frames between bursts (avoid duplicates)
     * @returns {number[]} Burst frame indices
     */
    findBurstFrames(envelope, hopMs, lookbackMs, minSpacingFrames) {
        const lookbackFrames = Math.max(1, Math.floor(lookbackMs / hopMs));
        const minThreshold = 0.015;
        const bursts = [];
        let lastBurstFrame = -minSpacingFrames - 1;
        
        for (let i = lookbackFrames; i < envelope.length; i++) {
            if (i - lastBurstFrame < minSpacingFrames) continue;
            const prior = envelope.slice(i - lookbackFrames, i);
            const sorted = [...prior].sort((a, b) => a - b);
            const baseline = sorted[Math.floor(sorted.length / 2)] || 0.01;
            if (envelope[i] > 1.5 * baseline && envelope[i] > minThreshold) {
                bursts.push(i);
                lastBurstFrame = i;
            }
        }
        return bursts;
    },
    
    /**
     * Analyze Voice Onset Time (VOT) - gap between plosive burst and vowel.
     * Uses autocorrelation for voicing onset (burst/aspiration are aperiodic).
     * @param {Float32Array} rawAudio - Raw audio samples
     * @param {number} sampleRate - Sample rate in Hz
     * @returns {Object|null} { avgVotMs, count, status } or null
     */
    analyzeVOT(rawAudio, sampleRate) {
        if (!rawAudio || rawAudio.length < sampleRate * 0.1) return null;
        
        const envWindowSize = Math.floor(sampleRate * 0.005);  // 5ms
        const hopSize = Math.floor(sampleRate * 0.0025);      // 2.5ms
        const hopMs = 2.5;
        const acWindowSamples = Math.floor(sampleRate * 0.015);  // 15ms for autocorrelation
        
        const envelope = [];
        for (let i = 0; i <= rawAudio.length - envWindowSize; i += hopSize) {
            let sum = 0;
            for (let j = 0; j < envWindowSize; j++) {
                sum += rawAudio[i + j] * rawAudio[i + j];
            }
            envelope.push(Math.sqrt(sum / envWindowSize));
        }
        
        if (envelope.length < 25) return null;  // Need ~60ms minimum
        
        const bursts = this.findBurstFrames(envelope, hopMs, 50, 40);  // 40 frames = 100ms min spacing
        const votMeasurements = [];
        const maxVots = 5;
        const rmsThreshold = 0.02;
        const maxScanSteps = 80;  // 200ms forward
        const votMinMs = 5;
        const votMaxMs = 200;
        
        for (const burstFrame of bursts) {
            if (votMeasurements.length >= maxVots) break;
            const burstSampleIndex = burstFrame * hopSize;
            let consecutiveVoiced = 0;
            let voicingStepIndex = -1;
            
            for (let step = 0; step < maxScanSteps; step++) {
                const winStart = burstSampleIndex + step * hopSize;
                if (winStart + acWindowSamples > rawAudio.length) break;
                const window = rawAudio.slice(winStart, winStart + acWindowSamples);
                const isVoicedAC = this.isVoiced(window, sampleRate);
                if (isVoicedAC) {
                    consecutiveVoiced++;
                    if (consecutiveVoiced >= 2) {
                        voicingStepIndex = step - 1;
                        break;
                    }
                } else {
                    consecutiveVoiced = 0;
                }
            }
            
            // Fallback: if autocorrelation found no voicing, use sustained RMS above threshold
            if (voicingStepIndex < 0) {
                let consecutiveHighRms = 0;
                for (let step = 0; step < maxScanSteps; step++) {
                    const frameIdx = burstFrame + step;
                    if (frameIdx >= envelope.length) break;
                    if (envelope[frameIdx] > rmsThreshold) {
                        consecutiveHighRms++;
                        if (consecutiveHighRms >= 3) {
                            voicingStepIndex = Math.max(0, step - 2);
                            break;
                        }
                    } else {
                        consecutiveHighRms = 0;
                    }
                }
            }
            
            if (voicingStepIndex >= 0) {
                const votMs = voicingStepIndex * hopMs;
                if (votMs >= votMinMs && votMs <= votMaxMs) votMeasurements.push(votMs);
            }
        }
        
        if (votMeasurements.length === 0) {
            return { avgVotMs: null, count: 0, severity: null };
        }
        const avgVotMs = votMeasurements.reduce((a, b) => a + b, 0) / votMeasurements.length;
        // severity 0-2: Percentile-based (Parkinson's bands). 20-50=0, 50-80=0.5, 80-120=1, >120=2
        let severity;
        if (avgVotMs <= 50) severity = 0;
        else if (avgVotMs <= 80) severity = 0.5;
        else if (avgVotMs <= 120) severity = 1;
        else severity = 2;
        return { avgVotMs: Math.round(avgVotMs * 10) / 10, count: votMeasurements.length, severity: Math.round(severity * 10) / 10 };
    },
    
    /**
     * Analyze inter-word transition smoothness
     */
    analyzeTransitions(amplitudes, segments, frequencyHistory, secondsPerReading) {
        if (!segments || segments.length < 2 || !secondsPerReading || secondsPerReading <= 0) return { smoothnessScore: null, transitionCount: 0, severity: null };
        
        const transitionScores = [];
        for (let s = 0; s < segments.length - 1; s++) {
            const A = segments[s];
            const B = segments[s + 1];
            const aLen = A.end - A.start + 1;
            const bLen = B.end - B.start + 1;
            const aDuration = aLen * secondsPerReading;
            const bDuration = bLen * secondsPerReading;
            const aWindow = Math.max(1, Math.floor(aLen * 0.2));
            const bWindow = Math.max(1, Math.floor(bLen * 0.2));
            const startIdx = Math.max(A.start, A.end - aWindow);
            const endIdx = Math.min(B.end, B.start + bWindow);
            if (startIdx >= endIdx) continue;
            
            const windowAmps = amplitudes.slice(startIdx, endIdx + 1);
            const bridgeLen = endIdx - startIdx + 1;
            const bridgeDuration = bridgeLen * secondsPerReading;
            const ampVariance = Utils.standardDeviation(windowAmps);
            const meanAmp = windowAmps.reduce((a,b)=>a+b,0) / windowAmps.length;
            const rawSmoothness = meanAmp > 0 ? 1 / (1 + ampVariance / meanAmp) : 0;
            const timeNorm = bridgeDuration / Math.max(0.1, (aDuration + bDuration) / 2);
            const smoothness = Math.min(1, rawSmoothness * (1 + Math.min(1, timeNorm)));
            transitionScores.push(smoothness);
        }
        // severity 0-2: 0=smooth, 2=wobbly
        
        if (transitionScores.length === 0) return { smoothnessScore: null, transitionCount: 0, severity: null };
        const avgSmoothness = transitionScores.reduce((a,b)=>a+b,0) / transitionScores.length;
        const severity = Utils.clamp(2 * (1 - Math.max(0, Math.min(1, avgSmoothness))), 0, 2);
        return { smoothnessScore: Math.round(avgSmoothness * 10) / 10, transitionCount: transitionScores.length, severity: Math.round(severity * 10) / 10 };
    },
    
    /**
     * Analyze vocal fatigue via energy slope (linear regression).
     * Negative slope = energy declining over time (fatigue); flat/rising = no fatigue.
     * Trims trailing silence so slope reflects actual speech, not post-phrase silence.
     */
    analyzeFatigue(amplitudeData, segments, secondsPerReading) {
        if (!amplitudeData || amplitudeData.length < 8) return { fatigueRatio: null, severity: null };
        
        const threshold = this.config.silenceThreshold;
        let endIdx = amplitudeData.length - 1;
        const maxTrim = Math.floor(amplitudeData.length * 0.2);
        for (let i = amplitudeData.length - 1; i >= Math.max(0, amplitudeData.length - maxTrim); i--) {
            if (amplitudeData[i].amplitude > threshold) {
                endIdx = i;
                break;
            }
            endIdx = i - 1;
        }
        const data = amplitudeData.slice(0, Math.max(8, endIdx + 1));
        
        const totalLen = data.length;
        const windowSize = Math.max(2, Math.floor(totalLen * 0.2));
        const step = Math.max(1, Math.floor(windowSize / 2));
        
        const windowEnergies = [];
        for (let i = 0; i <= totalLen - windowSize; i += step) {
            const window = data.slice(i, i + windowSize).map(d => d.amplitude);
            const mean = window.reduce((a, b) => a + b, 0) / window.length;
            windowEnergies.push(mean);
        }
        
        if (windowEnergies.length < 3) return { fatigueRatio: null, severity: null };
        
        const n = windowEnergies.length;
        const sumX = (n * (n - 1)) / 2;
        const sumY = windowEnergies.reduce((a, b) => a + b, 0);
        let sumXY = 0;
        let sumX2 = 0;
        for (let i = 0; i < n; i++) {
            sumXY += i * windowEnergies[i];
            sumX2 += i * i;
        }
        const denom = n * sumX2 - sumX * sumX;
        const slope = Math.abs(denom) < 1e-12 ? 0 : (n * sumXY - sumX * sumY) / denom;
        const meanEnergy = sumY / n;
        const slopeNorm = meanEnergy > 1e-10 ? slope / meanEnergy : 0;
        
        let severity;
        if (slopeNorm >= 0) {
            severity = 0;
            // Penalize breathy/weak onset: if first 25% of windows are much quieter than mean, add severity
            const firstQuarter = Math.max(1, Math.floor(n * 0.25));
            const firstMean = windowEnergies.slice(0, firstQuarter).reduce((a, b) => a + b, 0) / firstQuarter;
            if (meanEnergy > 1e-10 && firstMean < 0.5 * meanEnergy) {
                const weakStartPenalty = Math.max(0, 0.5 - firstMean / meanEnergy);
                severity = Math.min(2, 0.5 + weakStartPenalty);
            }
        } else {
            const scaleFactor = 80;
            severity = Math.min(2, -slopeNorm * scaleFactor);
        }
        severity = Math.round(severity * 10) / 10;
        const fatigueRatio = Utils.clamp(1 + slopeNorm * 20, 0, 1);
        const result = { fatigueRatio: Math.round(fatigueRatio * 10) / 10, severity };
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4c1b23'},body:JSON.stringify({sessionId:'4c1b23',location:'voice-logic.js:analyzeFatigue:exit',message:'Fatigue slope',data:{slope,slopeNorm,meanEnergy,...result},timestamp:Date.now(),hypothesisId:'fatigueFix'})}).catch(()=>{});
        // #endregion
        return result;
    },
    
    /**
     * Analyze vowel clarity via Harmonic-to-Noise Ratio (HNR).
     * Low HNR = breathy/mumbled; high HNR = clear.
     */
    analyzeVowelHNR(rawAudio, sampleRate) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4c1b23'},body:JSON.stringify({sessionId:'4c1b23',location:'voice-logic.js:analyzeVowelHNR:entry',message:'analyzeVowelHNR called',data:{rawAudioLen:rawAudio?.length,sampleRate},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        if (!rawAudio || rawAudio.length < sampleRate * 0.05) return { hnrDb: null, severity: null };
        
        const winMs = 25;
        const hopMs = 10;
        const winSamples = Math.floor(sampleRate * winMs / 1000);
        const hopSamples = Math.floor(sampleRate * hopMs / 1000);
        const minLag = Math.floor(sampleRate / 400);
        const maxLag = Math.floor(sampleRate / 80);
        
        const hnrs = [];
        for (let i = 0; i <= rawAudio.length - winSamples; i += hopSamples) {
            const window = new Float32Array(winSamples);
            for (let j = 0; j < winSamples; j++) {
                window[j] = rawAudio[i + j] * (0.5 * (1 - Math.cos(2 * Math.PI * j / (winSamples - 1))));
            }
            
            let r0 = 0;
            for (let j = 0; j < winSamples; j++) r0 += window[j] * window[j];
            if (r0 < 1e-12) continue;
            
            let maxCorr = 0;
            let bestLag = 0;
            for (let lag = minLag; lag <= maxLag && lag < winSamples / 2; lag++) {
                let sum = 0;
                for (let j = 0; j < winSamples - lag; j++) sum += window[j] * window[j + lag];
                const corr = sum / r0;
                if (corr > maxCorr) { maxCorr = corr; bestLag = lag; }
            }
            
            if (maxCorr < 0.2 || bestLag === 0) continue;
            const noise = Math.max(1e-12, r0 - maxCorr * r0);
            const harmonic = maxCorr * r0;
            const hnrDb = 10 * Math.log10(harmonic / noise);
            hnrs.push(hnrDb);
        }
        
        if (hnrs.length < 3) return { hnrDb: null, severity: null };
        
        const avgHnr = hnrs.reduce((a, b) => a + b, 0) / hnrs.length;
        // Calibrated for observed HNR range (-3 to +2 dB). HNR >= 1.5 = clearest, HNR <= -2.5 = worst.
        let severity;
        if (avgHnr >= 1.5) severity = 0;
        else if (avgHnr >= 0) severity = 0.5;
        else if (avgHnr >= -1.5) severity = 1;
        else if (avgHnr >= -2.5) severity = 1.5;
        else severity = 2;
        severity = Math.round(severity * 10) / 10;
        const result = { hnrDb: Math.round(avgHnr * 10) / 10, severity };
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4c1b23'},body:JSON.stringify({sessionId:'4c1b23',location:'voice-logic.js:analyzeVowelHNR:exit',message:'analyzeVowelHNR success',data:result,timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        return result;
    },
    
    /**
     * Analyze volume steadiness via local vs global variance.
     * High ratio = jerky (concentrated fluctuation); low ratio = steady.
     */
    analyzeSteadiness(amplitudes, threshold) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4c1b23'},body:JSON.stringify({sessionId:'4c1b23',location:'voice-logic.js:analyzeSteadiness:entry',message:'analyzeSteadiness called',data:{amplitudesLen:amplitudes?.length},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        if (!amplitudes || amplitudes.length < 2) return { localGlobalRatio: null, severity: null };
        
        const globalVar = Utils.standardDeviation(amplitudes);
        const winSize = Math.max(2, Math.floor(amplitudes.length * 0.1));
        const step = Math.max(1, Math.floor(winSize / 2));
        const localVariances = [];
        
        for (let i = 0; i <= amplitudes.length - winSize; i += step) {
            const win = amplitudes.slice(i, i + winSize);
            localVariances.push(Utils.standardDeviation(win));
        }
        
        if (localVariances.length < 2 || globalVar < 1e-10) return { localGlobalRatio: null, severity: null };
        
        const meanLocalVar = localVariances.reduce((a, b) => a + b, 0) / localVariances.length;
        const ratio = meanLocalVar / Math.max(1e-10, globalVar);
        const severity = Utils.clamp((ratio - 0.6) * 1.5, 0, 2);
        const result = { localGlobalRatio: Math.round(ratio * 100) / 100, severity: Math.round(severity * 10) / 10 };
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4c1b23'},body:JSON.stringify({sessionId:'4c1b23',location:'voice-logic.js:analyzeSteadiness:exit',message:'analyzeSteadiness success',data:result,timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        return result;
    },
    
    /**
     * Calculate voice score (0-10)
     * Lower score = better voice control
     * @param {Object} metrics - Voice metrics
     * @returns {number} Score 0-10
     */
    calculateScore(params) {
        const { wordCount, speechRecognitionAvailable, metrics: voiceMetrics, pauseCount = 0 } = params;
        
        let score = 0;
        
        // Pause penalty (0-2 max): stutter/choppy speech = more pauses
        if (pauseCount > 1) {
            score += Math.min(2, (pauseCount - 1) * 0.7); // 2 pauses=0.7, 3=1.4, 4+=2
        }
        
        // Word count (0-1 max): 9=0, 8=0.5, 7=1; 10=0.5, 11+=1; <7=max penalty
        const targetWordCount = 9; // "The quick brown fox jumps over the lazy dog"
        if (speechRecognitionAvailable && wordCount > 0) {
            if (wordCount === 9) {
                score += 0;
            } else if (wordCount === 8 || wordCount === 10) {
                score += 0.5;
            } else if (wordCount === 7 || wordCount >= 11) {
                score += 1;
            } else {
                score += 1;  // Below retake threshold - max penalty
            }
        }
        
        // 5 metrics: VOT, transitions, fatigue, vowels = 0-2 each; steadiness = 0-1 (severity/2)
        // Uncalculable metrics get max severity (2) as conservative penalty
        const severityOrMax = (s) => (s != null && !isNaN(s)) ? s : 2;
        if (voiceMetrics) {
            score += severityOrMax(voiceMetrics.vot?.severity);
            score += severityOrMax(voiceMetrics.transitions?.severity);
            score += severityOrMax(voiceMetrics.fatigue?.severity);
            score += severityOrMax(voiceMetrics.vowels?.severity);
            score += severityOrMax(voiceMetrics.steadiness?.severity) / 2;  // steadiness contributes 0-1
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
        if (this.state.frequencyPollId) {
            clearInterval(this.state.frequencyPollId);
            this.state.frequencyPollId = null;
        }
        this.state.frequencyHistory = [];
        this.state.frequencyDataArray = null;
        
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
     * Reset state
     */
    reset() {
        this.cleanupRecording();
        this.state.audioBuffer = [];
        this.state.amplitudeData = [];
        this.state.frequencyHistory = [];
        this.state.startTime = null;
        this.state.recognizedText = '';
        this.state.wordCount = 0;
    }
};

// Make VoiceLogic available globally
window.VoiceLogic = VoiceLogic;
