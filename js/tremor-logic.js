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
     * Primary score from raw magnitude variability (std dev / range) so that
     * any shaking (fast, slow, hard, light) is detected. Frequency/regularity
     * used as modifiers for 4-6 Hz Parkinsonian tremor.
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
        
        // 1) Raw magnitude variability = primary movement indicator
        //    (Still phone ~constant 9.8; any shake = variance)
        const meanMag = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
        const variance = magnitudes.reduce((sum, m) => sum + Math.pow(m - meanMag, 2), 0) / magnitudes.length;
        const stdDev = Math.sqrt(variance);
        const range = Math.max(...magnitudes) - Math.min(...magnitudes);
        // Use the larger of stdDev or range/4 as "movement intensity" (range is robust to outliers)
        const movementIntensity = Math.max(stdDev, range / 4);
        
        // 2) High-pass filtered signal for frequency/regularity (4-6 Hz tremor)
        const filtered = this.highPassFilter(magnitudes);
        const tremorAnalysis = this.detectTremor(filtered);
        
        // 3) Score from movement intensity first, then adjust for tremor-like pattern
        const score = this.calculateScore({
            movementIntensity,
            stdDev,
            range,
            ...tremorAnalysis
        });
        
        const severity = Utils.getSeverity(score);
        
        return {
            score,
            severity,
            rawData: this.state.magnitudes.slice(-500),
            details: {
                sampleCount: magnitudes.length,
                movementIntensity,
                stdDev,
                range,
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
     * Calculate tremor score (0-10) based on clinical research
     * 
     * Clinical reference ranges (accelerometer studies on Parkinson's patients):
     * - Healthy/minimal: < 0.15 m/s² → Score 0-2
     * - Mild tremor: 0.15-0.5 m/s² → Score 2-4
     * - Moderate tremor: 0.5-1.5 m/s² → Score 4-7
     * - Severe tremor: 1.5-3.0 m/s² → Score 7-9
     * - Very severe: > 3.0 m/s² → Score 9-10
     * 
     * Additional boost for tremor in Parkinson's frequency range (4-6 Hz) with regularity
     * 
     * @param {Object} analysis - Contains movementIntensity, frequency, inTremorRange, regularity
     * @returns {number} Score 0-10
     */
    calculateScore(analysis) {
        const { movementIntensity, frequency, inTremorRange, regularity } = analysis;
        
        // Clinical thresholds based on accelerometer research
        // These values are calibrated for accelerationIncludingGravity data
        let score = 0;
        
        if (movementIntensity < 0.05) {
            // Minimal/no detectable tremor
            score = 0;
        } else if (movementIntensity < 0.15) {
            // Very slight movement (0-2 points)
            score = (movementIntensity / 0.15) * 2;
        } else if (movementIntensity < 0.5) {
            // Mild tremor (2-4 points)
            // Linear scale from 2 to 4
            score = 2 + ((movementIntensity - 0.15) / 0.35) * 2;
        } else if (movementIntensity < 1.5) {
            // Moderate tremor (4-7 points)
            // Linear scale from 4 to 7
            score = 4 + ((movementIntensity - 0.5) / 1.0) * 3;
        } else if (movementIntensity < 3.0) {
            // Severe tremor (7-9 points)
            // Linear scale from 7 to 9
            score = 7 + ((movementIntensity - 1.5) / 1.5) * 2;
        } else {
            // Very severe tremor (9-10 points)
            // Cap at 10
            score = 9 + Math.min((movementIntensity - 3.0) / 2.0, 1);
        }
        
        // Frequency and regularity modifiers
        // Boost score if tremor shows Parkinsonian characteristics
        if (inTremorRange && regularity > 0.4) {
            // Classic Parkinson's tremor: 4-6 Hz, regular
            // Add up to +15% to score
            score *= 1.15;
        } else if (inTremorRange && regularity > 0.2) {
            // In frequency range but less regular
            // Add up to +10% to score
            score *= 1.10;
        } else if (frequency > 2 && frequency < 8 && regularity > 0.3) {
            // Tremor-like frequency and somewhat regular
            // Add up to +5% to score
            score *= 1.05;
        }
        
        // Ensure score stays within 0-10 range and round to 1 decimal
        score = Math.max(0, Math.min(10, score));
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