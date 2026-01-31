/**
 * ParkinPal - Tremor Detection Logic
 * Uses DeviceMotion API to detect 4-6 Hz tremor oscillations
 */

const TremorLogic = {
    // Configuration
    config: {
        testDuration: 10000, // 10 seconds
        sampleRate: 30, // Target samples per second (iOS typically 20-30 Hz)
        tremorFreqMin: 4, // Hz
        tremorFreqMax: 6, // Hz
        highPassCutoff: 1 // Hz - remove gravity/slow movements
    },
    
    // State
    state: {
        isRecording: false,
        permissionGranted: false,
        rawData: [],
        magnitudes: [],
        startTime: null,
        eventListener: null
    },
    
    /**
     * Check if DeviceMotion is supported
     * @returns {boolean}
     */
    isSupported() {
        return 'DeviceMotionEvent' in window;
    },
    
    /**
     * Request DeviceMotion permission (required for iOS 13+)
     * Must be called from a user gesture (click event)
     * @returns {Promise<boolean>}
     */
    async requestPermission() {
        if (!this.isSupported()) {
            console.warn('DeviceMotion not supported');
            return false;
        }
        
        // Check if permission API exists (iOS 13+)
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceMotionEvent.requestPermission();
                this.state.permissionGranted = permission === 'granted';
                return this.state.permissionGranted;
            } catch (error) {
                console.error('Error requesting DeviceMotion permission:', error);
                return false;
            }
        }
        
        // Non-iOS or older iOS - permission not needed
        this.state.permissionGranted = true;
        return true;
    },
    
    /**
     * Start recording motion data
     * @param {Function} onData - Callback for each data point (magnitude)
     * @returns {Promise<boolean>}
     */
    async startRecording(onData) {
        if (!this.state.permissionGranted) {
            const granted = await this.requestPermission();
            if (!granted) {
                return false;
            }
        }
        
        // Reset state
        this.state.rawData = [];
        this.state.magnitudes = [];
        this.state.isRecording = true;
        this.state.startTime = Date.now();
        
        // Throttle to target sample rate
        let lastSampleTime = 0;
        const minInterval = 1000 / this.config.sampleRate;
        
        // Create event listener
        this.state.eventListener = (event) => {
            if (!this.state.isRecording) return;
            
            const now = Date.now();
            if (now - lastSampleTime < minInterval) return;
            lastSampleTime = now;
            
            // Use accelerationIncludingGravity for better iOS compatibility
            // Falls back to acceleration if not available
            const accel = event.accelerationIncludingGravity || event.acceleration;
            
            // Check if we have valid acceleration data
            if (!accel || (accel.x === null && accel.y === null && accel.z === null)) {
                console.warn('No acceleration data available');
                return;
            }
            
            const x = accel.x || 0;
            const y = accel.y || 0;
            const z = accel.z || 0;
            
            // Calculate magnitude
            const magnitude = Math.sqrt(x * x + y * y + z * z);
            
            // Store raw data
            this.state.rawData.push({
                time: now - this.state.startTime,
                x, y, z, magnitude
            });
            
            this.state.magnitudes.push(magnitude);
            
            // Callback with current magnitude for visualization
            if (onData) {
                onData(magnitude, now - this.state.startTime);
            }
        };
        
        // Add listener
        window.addEventListener('devicemotion', this.state.eventListener);
        
        return true;
    },
    
    /**
     * Stop recording
     * @returns {Object} Analysis results
     */
    stopRecording() {
        this.state.isRecording = false;
        
        // Remove listener
        if (this.state.eventListener) {
            window.removeEventListener('devicemotion', this.state.eventListener);
            this.state.eventListener = null;
        }
        
        // Analyze collected data
        return this.analyzeData();
    },
    
    /**
     * Analyze recorded data for tremor characteristics
     * @returns {Object} Analysis results
     */
    analyzeData() {
        const magnitudes = this.state.magnitudes;
        
        if (magnitudes.length < 10) {
            return {
                score: 0,
                severity: 'Low',
                rawData: [],
                details: {
                    sampleCount: magnitudes.length,
                    error: 'Insufficient data'
                }
            };
        }
        
        // Apply high-pass filter to remove gravity/slow movements
        const filtered = this.highPassFilter(magnitudes);
        
        // Detect tremor using zero-crossing and amplitude analysis
        const tremorAnalysis = this.detectTremor(filtered);

        console.log('=== TREMOR ANALYSIS DEBUG ===');
        console.log('Raw magnitudes (first 10):', this.state.magnitudes.slice(0, 10));
        console.log('Filtered data (first 10):', filtered.slice(0, 10));
        console.log('Analysis results:', {
        amplitude: tremorAnalysis.amplitude,
        peakAmplitude: tremorAnalysis.peakAmplitude,
        frequency: tremorAnalysis.frequency,
        regularity: tremorAnalysis.regularity,
        inTremorRange: tremorAnalysis.inTremorRange,
        zeroCrossings: tremorAnalysis.zeroCrossings
        });
        console.log('=== END TREMOR ANALYSIS DEBUG ===');
        
        // Calculate score (0-10)
        const score = this.calculateScore(tremorAnalysis);
        
        // Determine severity
        const severity = Utils.getSeverity(score);
        
        return {
            score,
            severity,
            rawData: this.state.magnitudes.slice(-500), // Keep last 500 samples for chart
            details: {
                sampleCount: magnitudes.length,
                ...tremorAnalysis
            }
        };
    },
    
    /**
     * Simple high-pass filter to remove DC offset and slow movements
     * @param {number[]} data - Input data
     * @returns {number[]} Filtered data
     */
    highPassFilter(data) {
        if (data.length < 2) return data;
        
        const alpha = 0.8; // Filter coefficient
        const filtered = [0];
        
        for (let i = 1; i < data.length; i++) {
            filtered[i] = alpha * (filtered[i - 1] + data[i] - data[i - 1]);
        }
        
        return filtered;
    },
    
    /**
     * Detect tremor characteristics using zero-crossing analysis
     * @param {number[]} data - Filtered magnitude data
     * @returns {Object} Tremor characteristics
     */
    detectTremor(data) {
        if (data.length < 10) {
            return {
                frequency: 0,
                amplitude: 0,
                regularity: 0,
                inTremorRange: false
            };
        }
        
        // Count zero crossings
        let zeroCrossings = 0;
        for (let i = 1; i < data.length; i++) {
            if ((data[i - 1] < 0 && data[i] >= 0) || 
                (data[i - 1] >= 0 && data[i] < 0)) {
                zeroCrossings++;
            }
        }
        
        // Calculate frequency from zero crossings
        // Each full cycle has 2 zero crossings
        const duration = this.state.rawData.length > 0 
            ? (this.state.rawData[this.state.rawData.length - 1].time) / 1000 
            : this.config.testDuration / 1000;
        
        const frequency = (zeroCrossings / 2) / duration;
        
        // Calculate amplitude (RMS)
        const sumSquares = data.reduce((sum, val) => sum + val * val, 0);
        const rms = Math.sqrt(sumSquares / data.length);
        const amplitude = rms;
        
        // Calculate peak amplitude
        const peakAmplitude = Math.max(...data.map(Math.abs));
        
        // Calculate regularity (consistency of oscillations)
        // Using standard deviation of absolute values
        const absValues = data.map(Math.abs);
        const avgAbs = absValues.reduce((a, b) => a + b, 0) / absValues.length;
        const variance = absValues.reduce((sum, val) => 
            sum + Math.pow(val - avgAbs, 2), 0) / absValues.length;
        const stdDev = Math.sqrt(variance);
        
        // Regularity: lower variation = more regular tremor
        // Normalize to 0-1 (1 = very regular)
        const regularity = avgAbs > 0 
            ? Math.max(0, 1 - (stdDev / avgAbs)) 
            : 0;
        
        // Check if frequency is in typical Parkinson's tremor range (4-6 Hz)
        const inTremorRange = frequency >= this.config.tremorFreqMin && 
                             frequency <= this.config.tremorFreqMax;
        
        return {
            frequency: Math.round(frequency * 10) / 10,
            amplitude: Math.round(amplitude * 1000) / 1000,
            peakAmplitude: Math.round(peakAmplitude * 1000) / 1000,
            regularity: Math.round(regularity * 100) / 100,
            inTremorRange,
            zeroCrossings,
            duration: Math.round(duration * 10) / 10
        };
    },
    
    /**
     * Calculate tremor score (0-10)
     * Higher score = more severe tremor
     * @param {Object} analysis - Tremor analysis results
     * @returns {number} Score 0-10
     */
    calculateScore(analysis) {

        console.log('=== SCORE CALCULATION ===');
        console.log('Input to calculateScore:', analysis);
        
        const { frequency, amplitude, peakAmplitude, regularity, inTremorRange } = analysis;
        
        // Base score from amplitude
        // When using accelerationIncludingGravity:
        // - Still phone: ~9.8 m/s² (just gravity)
        // - Light movement: 10-15 m/s²
        // - Moderate shake: 15-30 m/s²
        // - Heavy shake: 30-60 m/s²
        // - Seizure-level: 60+ m/s²
        
        // After high-pass filter, typical tremor amplitudes: 0.1-2.0
        // Vigorous shaking: 5.0-20.0

        
        let amplitudeScore = 0;
        
        if (amplitude < 0.5) {
            amplitudeScore = amplitude * 4; // 0-2 points for minimal tremor
        } else if (amplitude < 2.0) {
            amplitudeScore = 2 + (amplitude - 0.5) * 2; // 2-5 points for mild tremor
        } else if (amplitude < 5.0) {
            amplitudeScore = 5 + (amplitude - 2.0) * 1; // 5-8 points for moderate
        } else {
            amplitudeScore = 8 + Math.min(amplitude - 5.0, 2); // 8-10 points for severe
        }
        
        // Frequency factor: boost if in Parkinson's range (4-6 Hz)
        let frequencyFactor = 1.0;
        if (inTremorRange) {
            frequencyFactor = 1.3; // Boost for clinical tremor frequency
        } else if (frequency > 2 && frequency < 8) {
            frequencyFactor = 1.1; // Slight boost for tremor-like frequencies
        }
        
        // Regularity factor: more regular = more pathological
        // For testing: any rhythmic shaking should score high
        const regularityBoost = 1.0 + (regularity * 0.3);
        
        // Calculate final score
        let score = amplitudeScore * frequencyFactor * regularityBoost;
        
        // Clamp to 0-10
        score = Math.max(0, Math.min(10, score));

        console.log('Final score:', score);
        
        // Round to 1 decimal place
        return Math.round(score * 10) / 10;
    },
    
    /**
     * Get current recording state
     * @returns {Object}
     */
    getState() {
        return {
            isRecording: this.state.isRecording,
            permissionGranted: this.state.permissionGranted,
            sampleCount: this.state.magnitudes.length,
            duration: this.state.startTime 
                ? Date.now() - this.state.startTime 
                : 0
        };
    },
    
    /**
     * Reset state
     */
    reset() {
        this.state.rawData = [];
        this.state.magnitudes = [];
        this.state.startTime = null;
    }
};

// Make TremorLogic available globally
window.TremorLogic = TremorLogic;