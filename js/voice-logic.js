/**
 * ParkinPal - Voice Analysis Logic
 * Uses Web Audio API (AudioWorklet/ScriptProcessor) for recording
 * Analysis performed by backend (Parselmouth + Whisper)
 */

const VoiceLogic = {
    config: {
        testDuration: 7000,
        sampleRate: 44100,
        fftSize: 2048,
        targetPhrase: "The quick brown fox jumps over the lazy dog",
        bufferSize: 4096
    },

    state: {
        isRecording: false,
        permissionGranted: false,
        audioContext: null,
        mediaStream: null,
        analyser: null,
        audioWorkletNode: null,
        scriptProcessor: null,
        useAudioWorklet: false,
        audioBuffer: [],
        amplitudeData: [],
        startTime: null
    },

    isSupported() {
        return !!(window.AudioContext || window.webkitAudioContext) &&
               !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    },

    isAudioWorkletSupported() {
        try {
            return typeof window.AudioContext !== 'undefined' &&
                   typeof AudioWorkletNode !== 'undefined';
        } catch (e) {
            return false;
        }
    },

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
     * @param {Function} onAmplitude - Callback for amplitude data (for soundwave visualization)
     * @returns {Promise<boolean>}
     */
    async startRecording(onAmplitude) {
        try {
            this.state.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: this.config.sampleRate
                }
            });

            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.state.audioContext = new AudioContextClass({
                sampleRate: this.config.sampleRate
            });

            if (this.state.audioContext.state === 'suspended') {
                await this.state.audioContext.resume();
            }

            const source = this.state.audioContext.createMediaStreamSource(this.state.mediaStream);
            this.state.analyser = this.state.audioContext.createAnalyser();
            this.state.analyser.fftSize = this.config.fftSize;

            this.state.audioBuffer = [];
            this.state.amplitudeData = [];
            this.state.isRecording = true;
            this.state.startTime = Date.now();

            if (this.isAudioWorkletSupported()) {
                try {
                    await this.setupAudioWorklet(source, onAmplitude);
                    this.state.useAudioWorklet = true;
                } catch (workletError) {
                    console.warn('AudioWorklet failed, falling back to ScriptProcessor:', workletError);
                    this.setupScriptProcessor(source, onAmplitude);
                    this.state.useAudioWorklet = false;
                }
            } else {
                this.setupScriptProcessor(source, onAmplitude);
                this.state.useAudioWorklet = false;
            }

            source.connect(this.state.analyser);
            return true;
        } catch (error) {
            console.error('Error starting recording:', error);
            this.cleanup();
            return false;
        }
    },

    async setupAudioWorklet(source, onAmplitude) {
        await this.state.audioContext.audioWorklet.addModule('js/audio-processor.worklet.js');
        this.state.audioWorkletNode = new AudioWorkletNode(
            this.state.audioContext,
            'audio-processor'
        );

        this.state.audioWorkletNode.port.onmessage = (event) => {
            if (!this.state.isRecording) return;
            const { type, amplitude, audioData } = event.data;
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

        source.connect(this.state.audioWorkletNode);
        this.state.audioWorkletNode.connect(this.state.audioContext.destination);
    },

    setupScriptProcessor(source, onAmplitude) {
        this.state.scriptProcessor = this.state.audioContext.createScriptProcessor(
            this.config.bufferSize, 1, 1
        );

        this.state.scriptProcessor.onaudioprocess = (e) => {
            if (!this.state.isRecording) return;
            const inputData = e.inputBuffer.getChannelData(0);
            this.state.audioBuffer.push(new Float32Array(inputData));
            let sum = 0;
            for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
            }
            const rms = Math.sqrt(sum / inputData.length);
            this.state.amplitudeData.push({
                time: Date.now() - this.state.startTime,
                amplitude: rms
            });
            if (onAmplitude) {
                onAmplitude(rms, Date.now() - this.state.startTime);
            }
        };

        source.connect(this.state.scriptProcessor);
        this.state.scriptProcessor.connect(this.state.audioContext.destination);
    },

    /**
     * Stop recording and return raw audio data for backend analysis
     * @returns {{ audioData: Float32Array, amplitudeData: Array }}
     */
    stopRecording() {
        this.state.isRecording = false;
        const audioData = this.combineAudioBuffers();
        this.cleanupRecording();
        return { audioData, amplitudeData: this.state.amplitudeData };
    },

    combineAudioBuffers() {
        const totalLength = this.state.audioBuffer.reduce((acc, buf) => acc + buf.length, 0);
        const combined = new Float32Array(totalLength);
        let offset = 0;
        for (const buffer of this.state.audioBuffer) {
            combined.set(buffer, offset);
            offset += buffer.length;
        }
        return combined;
    },

    /**
     * Encode Float32 mono audio to WAV (16-bit PCM) and base64
     * @param {Float32Array} audioData - Raw mono float samples
     * @param {number} sampleRate - Sample rate in Hz
     * @returns {string} Base64-encoded WAV
     */
    float32ToWavBase64(audioData, sampleRate = 44100) {
        const numChannels = 1;
        const bitsPerSample = 16;
        const bytesPerSample = bitsPerSample / 8;
        const blockAlign = numChannels * bytesPerSample;
        const byteRate = sampleRate * blockAlign;
        const dataSize = audioData.length * bytesPerSample;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        function writeString(offset, str) {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
            }
        }

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        writeString(36, 'data');
        view.setUint32(40, dataSize, true);

        const offset = 44;
        for (let i = 0; i < audioData.length; i++) {
            const s = Math.max(-1, Math.min(1, audioData[i]));
            const v = s < 0 ? s * 0x8000 : s * 0x7FFF;
            view.setInt16(offset + i * 2, v, true);
        }

        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    },

    async playback(audioData) {
        if (!audioData || audioData.length === 0) return;
        try {
            if (!this.state.audioContext || this.state.audioContext.state === 'closed') {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                this.state.audioContext = new AudioContextClass();
            }
            if (this.state.audioContext.state === 'suspended') {
                await this.state.audioContext.resume();
            }
            const buffer = this.state.audioContext.createBuffer(
                1, audioData.length,
                this.state.audioContext.sampleRate
            );
            buffer.getChannelData(0).set(audioData);
            const source = this.state.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.state.audioContext.destination);
            source.start();
            return new Promise(resolve => { source.onended = resolve; });
        } catch (error) {
            console.error('Error playing audio:', error);
        }
    },

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
    },

    cleanup() {
        this.cleanupRecording();
        if (this.state.audioContext && this.state.audioContext.state !== 'closed') {
            this.state.audioContext.close();
            this.state.audioContext = null;
        }
        this.state.audioBuffer = [];
        this.state.amplitudeData = [];
    },

    getWaveformData() {
        if (!this.state.analyser) return new Uint8Array(0);
        const bufferLength = this.state.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.state.analyser.getByteTimeDomainData(dataArray);
        return dataArray;
    },

    getTargetPhrase() {
        return this.config.targetPhrase;
    },

    getTestDuration() {
        return this.config.testDuration;
    },

    reset() {
        this.cleanupRecording();
        this.state.audioBuffer = [];
        this.state.amplitudeData = [];
        this.state.startTime = null;
    }
};

window.VoiceLogic = VoiceLogic;
