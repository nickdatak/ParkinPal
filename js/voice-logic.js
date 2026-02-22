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
            
            // Try to use AudioWorklet, fall back to ScriptProcessor
            if (this.isAudioWorkletSupported()) {
                try {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:startRecording',message:'Attempting AudioWorklet setup',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'WORKLET'})}).catch(()=>{});
                    // #endregion
                    await this.setupAudioWorklet(source, onAmplitude);
                    this.state.useAudioWorklet = true;
                    console.log('Using AudioWorklet for audio processing');
                } catch (workletError) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:startRecording',message:'AudioWorklet FAILED - falling back',data:{error:workletError.message,errorName:workletError.name},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'WORKLET'})}).catch(()=>{});
                    // #endregion
                    console.warn('AudioWorklet failed, falling back to ScriptProcessor:', workletError);
                    this.setupScriptProcessor(source, onAmplitude);
                    this.state.useAudioWorklet = false;
                }
            } else {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:startRecording',message:'Using ScriptProcessor (no AudioWorklet)',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'SCRIPT'})}).catch(()=>{});
                // #endregion
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
                pitch: { f0Contour: [], meanF0: 0, f0StdDev: 0, f0Range: 0, jitter: 0, voicedFrameRatio: 0 },
                details: { error: 'Insufficient data' }
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
        
        // Pitch analysis from raw audio
        const audioData = this.combineAudioBuffers();
        const sampleRate = this.state.audioContext?.sampleRate ?? this.config.sampleRate;
        const pitch = audioData.length >= Math.round(0.03 * sampleRate)
            ? this.analyzePitch(audioData, sampleRate)
            : { f0Contour: [], meanF0: 0, f0StdDev: 0, f0Range: 0, jitter: 0, voicedFrameRatio: 0 };
        
        // Calculate score
        const score = this.calculateScore({
            speakingDuration,
            pauseCount,
            speakingRate,
            wordCount: actualWordCount,
            speechRecognitionAvailable: this.state.speechRecognitionSupported,
            f0StdDev: pitch.f0StdDev,
            jitter: pitch.jitter
        });
        
        return {
            score,
            duration: Math.round(speakingDuration * 10) / 10,
            pauses: pauseCount,
            variance: Math.round(variance * 1000) / 1000,
            speakingRate: Math.round(speakingRate),
            pitch,
            details: {
                totalDuration: this.state.amplitudeData.length > 0
                    ? this.state.amplitudeData[this.state.amplitudeData.length - 1].time / 1000
                    : 0,
                segmentCount: segments.length,
                wordCount: actualWordCount,
                pitch
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
        // #region agent log
        const aboveThreshold = amplitudes.filter(a => a > threshold).length;
        fetch('http://127.0.0.1:7242/ingest/ec1df7ec-b0cb-4e72-a7d0-98b9769bdbd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voice-logic.js:detectSpeechSegments:result',message:'Segment detection complete',data:{speakingDuration,pauseCount,segmentCount:segments.length,aboveThreshold,totalAmplitudes:amplitudes.length,percentAboveThreshold:(aboveThreshold/amplitudes.length*100).toFixed(1)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'SPEAK_C'})}).catch(()=>{});
        // #endregion
        
        return { speakingDuration, pauseCount, segments };
    },
    
    /**
     * Extract fundamental frequency (F0) contour using autocorrelation.
     * 30ms windows, 10ms hop; Hann window; normalized autocorrelation for 75-500 Hz.
     * @param {Float32Array|number[]} audioData - Raw mono audio samples
     * @param {number} sampleRate - Samples per second
     * @returns {Object} { f0Contour, meanF0, f0StdDev, f0Range, jitter, voicedFrameRatio }
     */
    analyzePitch(audioData, sampleRate) {
        const windowMs = 30;
        const hopMs = 10;
        const windowSamples = Math.round((windowMs / 1000) * sampleRate);
        const hopSamples = Math.round((hopMs / 1000) * sampleRate);
        const minLag = Math.ceil(sampleRate / 500);
        const maxLag = Math.floor(sampleRate / 75);
        const voicingThreshold = 0.3;

        const f0Contour = [];
        const f0Values = [];

        for (let start = 0; start + windowSamples <= audioData.length; start += hopSamples) {
            const timeSec = start / sampleRate;
            const window = new Float32Array(windowSamples);
            for (let i = 0; i < windowSamples; i++) {
                const w = windowSamples > 1 ? 0.5 * (1 - Math.cos(2 * Math.PI * i / (windowSamples - 1))) : 1;
                window[i] = audioData[start + i] * w;
            }

            let bestLag = -1;
            let bestCorr = voicingThreshold;

            for (let lag = minLag; lag <= maxLag && lag < windowSamples; lag++) {
                let sum = 0;
                let sum0 = 0;
                let sumL = 0;
                const len = windowSamples - lag;
                for (let i = 0; i < len; i++) {
                    sum += window[i] * window[i + lag];
                    sum0 += window[i] * window[i];
                    sumL += window[i + lag] * window[i + lag];
                }
                const denom = Math.sqrt(sum0 * sumL);
                const corr = denom > 0 ? sum / denom : 0;
                if (corr > bestCorr) {
                    bestCorr = corr;
                    bestLag = lag;
                }
            }

            if (bestLag > 0) {
                const f0 = sampleRate / bestLag;
                f0Contour.push({ time: timeSec, f0 });
                f0Values.push(f0);
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
     * Calculate voice score (0-10)
     * Lower score = better voice control. Includes pitch metrics: reduced F0 range
     * (monotone) and elevated jitter are PD indicators.
     * @param {Object} metrics - Voice metrics (speakingDuration, pauseCount, speakingRate,
     *   wordCount, speechRecognitionAvailable, f0StdDev, jitter)
     * @returns {number} Score 0-10
     */
    calculateScore(metrics) {
        const {
            speakingDuration,
            pauseCount,
            speakingRate,
            wordCount,
            speechRecognitionAvailable,
            f0StdDev = 0,
            jitter = 0
        } = metrics;
        
        const idealDuration = 4;
        const idealRate = 135;
        
        let score = 0;
        
        // Duration factor (0-2 points, rebalanced)
        const durationRatio = speakingDuration / idealDuration;
        if (durationRatio < 0.5 || durationRatio > 2) {
            score += 2;
        } else if (durationRatio < 0.7 || durationRatio > 1.5) {
            score += 1.5;
        } else if (durationRatio < 0.8 || durationRatio > 1.2) {
            score += 0.5;
        }
        
        // Pause factor (0-2 points, rebalanced)
        if (pauseCount >= 4) {
            score += 2;
        } else if (pauseCount >= 2) {
            score += 1.5;
        } else if (pauseCount >= 1) {
            score += 0.5;
        }
        
        // Speaking rate factor (0-1.5 points, rebalanced)
        if (speechRecognitionAvailable && wordCount > 0 && speakingRate > 0) {
            if (speakingRate < 115 || speakingRate > 210) {
                score += 1.5;
            } else if (speakingRate < 150) {
                score += 0.75;
            }
        }
        
        // Word count penalty (0-1.5 points, rebalanced)
        const targetWordCount = 9;
        if (speechRecognitionAvailable && wordCount < targetWordCount) {
            const missingWords = targetWordCount - wordCount;
            if (missingWords >= 4) {
                score += 1.5;
            } else if (missingWords >= 1) {
                score += 0.5;
            }
        }
        
        // F0 stdDev: reduced range (stdDev < 20 Hz) = monotone speech, PD indicator (0-1.5 points)
        if (f0StdDev > 0 && f0StdDev < 20) {
            score += 1.5 * (1 - f0StdDev / 20);
        }
        
        // Jitter: elevated (> 1.5%) = PD indicator (0-1.5 points)
        if (jitter > 1.5) {
            score += Math.min(1.5, 1.5 * (jitter - 1.5) / 2.5);
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
