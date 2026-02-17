/**
 * ParkinPal - Tremor Detection Logic
 * Uses DeviceMotion API to detect 4-6 Hz tremor oscillations
 */

const TremorLogic = {
    // Configuration
    config: {
        testDuration: 30000, // 30 seconds
        sampleRate: 60, // Target samples per second (throttle); analysis uses state.actualSampleRate when set
        tremorFreqMin: 4, // Hz
        tremorFreqMax: 6, // Hz
        bandpassLow: 2,  // Hz - bandpass filter (see bandpassFilter)
        bandpassHigh: 15 // Hz
    },
    
    // State
    state: {
        isRecording: false,
        permissionGranted: false,
        rawData: [],
        magnitudes: [],
        startTime: null,
        eventListener: null,
        actualSampleRate: null, // Measured from first ~10 timestamp gaps; used for FFT when set (e.g. when < 50 Hz)
        usingGravityCompensated: null // true = event.acceleration (device gravity-removed), false = accelerationIncludingGravity + EMA subtraction
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
     * Start recording motion data.
     * Acceleration source: prefers event.acceleration (gravity-removed) when available and non-null;
     * falls back to event.accelerationIncludingGravity if acceleration is unavailable (e.g. some iOS).
     * When using accelerationIncludingGravity, a running exponential moving average (alpha ~0.01) of
     * the magnitude is subtracted from each sample to approximate gravity removal.
     * Sets this.state.usingGravityCompensated (true = device gravity-removed, false = fallback + EMA).
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
        this.state.actualSampleRate = null;
        this.state.usingGravityCompensated = null;
        this.state.isRecording = true;
        this.state.startTime = Date.now();
        
        // Throttle to target sample rate (60 Hz => ~16.67 ms min interval)
        let lastSampleTime = 0;
        const minInterval = 1000 / this.config.sampleRate;
        // When using accelerationIncludingGravity: EMA of magnitude for approximate gravity subtraction
        const emaAlpha = 0.01;
        let magnitudeEma = null;
        
        // Create event listener
        this.state.eventListener = (event) => {
            if (!this.state.isRecording) return;
            
            const now = Date.now();
            if (now - lastSampleTime < minInterval) return;
            lastSampleTime = now;
            
            // Prefer gravity-removed acceleration when available and non-null; else fall back to including gravity
            const hasAccel = (a) => a && (a.x !== null || a.y !== null || a.z !== null);
            const accel = hasAccel(event.acceleration)
                ? event.acceleration
                : event.accelerationIncludingGravity;
            
            if (!hasAccel(accel)) {
                console.warn('No acceleration data available');
                return;
            }
            
            const x = accel.x ?? 0;
            const y = accel.y ?? 0;
            const z = accel.z ?? 0;
            
            let magnitude = Math.sqrt(x * x + y * y + z * z);
            const usingGravity = hasAccel(event.acceleration);
            this.state.usingGravityCompensated = usingGravity;
            
            if (!usingGravity) {
                // Fallback: subtract EMA of magnitude to approximate gravity removal
                if (magnitudeEma === null) magnitudeEma = magnitude;
                else magnitudeEma = emaAlpha * magnitude + (1 - emaAlpha) * magnitudeEma;
                magnitude = magnitude - magnitudeEma;
            }
            
            // Store raw data
            this.state.rawData.push({
                time: now - this.state.startTime,
                x, y, z, magnitude
            });
            
            this.state.magnitudes.push(magnitude);
            
            // After first ~10 samples, measure actual reporting rate from timestamp gaps
            if (this.state.actualSampleRate == null && this.state.rawData.length >= 10) {
                const times = this.state.rawData.map((d) => d.time);
                let sumGap = 0;
                for (let i = 1; i < 10; i++) {
                    sumGap += times[i] - times[i - 1];
                }
                const meanGapMs = sumGap / 9;
                const actualRate = meanGapMs > 0 ? 1000 / meanGapMs : this.config.sampleRate;
                this.state.actualSampleRate = actualRate;
                if (actualRate < 50) {
                    console.warn(
                        `DeviceMotion reporting rate (${Math.round(actualRate * 10) / 10} Hz) is below 50 Hz; ` +
                        'FFT/frequency analysis will use this actual rate.'
                    );
                }
            }
            
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
     * Validate recording data quality before analysis.
     * Checks: (1) minimum sample count (≥80% of expected from duration×sampleRate),
     * (2) no timestamp gaps >200ms, (3) no axis consistently at sensor max (clipping),
     * (4) non-zero variance (sensor not off / phone not perfectly stationary),
     * (5) no sudden large magnitude spikes (drop/tap).
     * @returns {{ isValid: boolean, quality: 'good'|'acceptable'|'poor', warnings: string[] }}
     */
    validateRecording() {
        const warnings = [];
        const rawData = this.state.rawData;
        const sampleRate = this.state.actualSampleRate ?? this.config.sampleRate;

        if (rawData.length < 10) {
            return { isValid: false, quality: 'poor', warnings: ['Too few samples to validate'] };
        }

        const durationSec = rawData[rawData.length - 1].time / 1000;
        const expectedSamples = durationSec * sampleRate;
        const minRequired = Math.floor(0.8 * expectedSamples);
        if (rawData.length < minRequired) {
            const pct = Math.round((rawData.length / expectedSamples) * 100);
            warnings.push(`Insufficient samples (${rawData.length}, ${pct}% of expected ${Math.round(expectedSamples)})`);
        }

        let largeGaps = 0;
        for (let i = 1; i < rawData.length; i++) {
            if (rawData[i].time - rawData[i - 1].time > 200) largeGaps++;
        }
        if (largeGaps > 0) {
            warnings.push(`Large timestamp gap(s) detected (${largeGaps} gap(s) >200ms)`);
        }

        const clipThreshold = 9;
        const clipFraction = 0.8;
        for (const axis of ['x', 'y', 'z']) {
            const vals = rawData.map((d) => d[axis]);
            const maxAbs = Math.max(...vals.map((v) => Math.abs(v)));
            if (maxAbs < clipThreshold) continue;
            const nearMax = vals.filter((v) => Math.abs(v) >= 0.9 * maxAbs).length;
            if (nearMax / vals.length >= clipFraction) {
                warnings.push('Possible sensor clipping on one or more axes');
                break;
            }
        }

        const magnitudes = this.state.magnitudes;
        const meanMag = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
        const variance = magnitudes.reduce((sum, m) => sum + Math.pow(m - meanMag, 2), 0) / magnitudes.length;
        const stdDev = Math.sqrt(variance);
        if (variance < 1e-6 || stdDev < 0.001) {
            warnings.push('No movement detected; sensor may be off or phone stationary');
        }

        const spikeThreshold = 8;
        let spikes = 0;
        for (let i = 1; i < magnitudes.length; i++) {
            if (Math.abs(magnitudes[i] - magnitudes[i - 1]) > spikeThreshold) spikes++;
        }
        if (spikes > 0) {
            warnings.push(`Sudden large movement(s) detected (${spikes}); phone may have been moved or tapped`);
        }

        const critical = warnings.some((w) =>
            w.startsWith('Insufficient samples') || w.startsWith('No movement detected'));
        const quality = critical || warnings.length >= 3 ? 'poor' : warnings.length >= 1 ? 'acceptable' : 'good';
        const isValid = quality !== 'poor';

        return { isValid, quality, warnings };
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
                parkinsonianLikelihood: 0,
                parkinsonianLikelihoodLabel: 'None',
                tremorBandPowerRatio: 0,
                dataQuality: 'poor',
                dataQualityWarnings: ['Insufficient data'],
                suggestRetake: true,
                rawData: [],
                details: {
                    sampleCount: magnitudes.length,
                    error: 'Insufficient data'
                }
            };
        }

        const validation = this.validateRecording();
        
        // 1) Raw magnitude variability = primary movement indicator
        //    (Still phone ~constant 9.8; any shake = variance)
        const meanMag = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
        const variance = magnitudes.reduce((sum, m) => sum + Math.pow(m - meanMag, 2), 0) / magnitudes.length;
        const stdDev = Math.sqrt(variance);
        const range = Math.max(...magnitudes) - Math.min(...magnitudes);
        // Use the larger of stdDev or range/4 as "movement intensity" (range is robust to outliers)
        const movementIntensity = Math.max(stdDev, range / 4);
        
        // 2) Bandpass filtered signal (2–15 Hz) for frequency/regularity (4-6 Hz tremor)
        const filtered = this.bandpassFilter(magnitudes);
        const tremorAnalysis = this.detectTremor(filtered);
        
        // 3) Score from movement intensity first, then adjust for tremor-like pattern
        const score = this.calculateScore({
            movementIntensity,
            stdDev,
            range,
            ...tremorAnalysis
        });
        
        const severity = Utils.getSeverity(score);
        const { parkinsonianLikelihood, parkinsonianLikelihoodLabel, tremorBandPowerRatio } = tremorAnalysis;

        return {
            score,
            severity,
            parkinsonianLikelihood,
            parkinsonianLikelihoodLabel,
            tremorBandPowerRatio,
            dataQuality: validation.quality,
            dataQualityWarnings: validation.warnings,
            suggestRetake: validation.quality === 'poor',
            rawData: this.state.magnitudes.slice(-500),
            details: {
                sampleCount: magnitudes.length,
                movementIntensity,
                stdDev,
                range,
                dataQuality: validation.quality,
                dataQualityWarnings: validation.warnings,
                ...tremorAnalysis
            }
        };
    },
    
    /**
     * Compute digital biquad coefficients for a second-order Butterworth bandpass
     * via bilinear transform with prewarping. Passband is (lowFreq, highFreq) Hz.
     * @param {number} lowFreq - Lower -3 dB cutoff (Hz)
     * @param {number} highFreq - Upper -3 dB cutoff (Hz)
     * @param {number} sampleRate - Samples per second
     * @returns {{ b: number[], a: number[] }} Coefficients for H(z) = (b[0]+b[1]z⁻¹+b[2]z⁻²)/(1+a[1]z⁻¹+a[2]z⁻²); a[0]=1
     */
    computeButterworth(lowFreq, highFreq, sampleRate) {
        const T = 1 / sampleRate;
        const c = 2 / T;
        // Prewarp -3 dB edges so digital response matches analog at these frequencies
        const omegaLow = c * Math.tan(Math.PI * lowFreq * T);
        const omegaHigh = c * Math.tan(Math.PI * highFreq * T);
        const B = omegaHigh - omegaLow;
        const omega0Sq = omegaLow * omegaHigh;
        const omega0 = Math.sqrt(omega0Sq);
        // Analog 2nd-order bandpass: H(s) = (B*s) / (s² + B*s + ω0²)
        // Bilinear s = c*(1-z⁻¹)/(1+z⁻¹) => H(z) = (b0 + b1*z⁻¹ + b2*z⁻²) / (1 + a1*z⁻¹ + a2*z⁻²)
        const D = c * c + B * c + omega0Sq;
        const b = [
            (B * c) / D,
            0,
            -(B * c) / D
        ];
        const a = [
            1,
            (-2 * c * c + 2 * omega0Sq) / D,
            (c * c - B * c + omega0Sq) / D
        ];
        return { b, a };
    },

    /**
     * Second-order bandpass (2–15 Hz) using direct form II transposed biquad.
     * Uses Butterworth coefficients from computeButterworth and actual sample rate when set.
     * @param {number[]} data - Input magnitude samples
     * @returns {number[]} Filtered array (same length)
     */
    bandpassFilter(data) {
        if (data.length < 3) return data.slice();
        const sampleRate = this.state.actualSampleRate ?? this.config.sampleRate;
        const { b, a } = this.computeButterworth(this.config.bandpassLow, this.config.bandpassHigh, sampleRate);
        const b0 = b[0], b1 = b[1], b2 = b[2], a1 = a[1], a2 = a[2];
        const out = new Array(data.length);
        // Direct form II transposed: state w[n] = x[n] - a1*w[n-1] - a2*w[n-2], y[n] = b0*w[n] + b1*w[n-1] + b2*w[n-2]
        let w1 = 0, w2 = 0;
        for (let n = 0; n < data.length; n++) {
            const w0 = data[n] - a1 * w1 - a2 * w2;
            out[n] = b0 * w0 + b1 * w1 + b2 * w2;
            w2 = w1;
            w1 = w0;
        }
        return out;
    },
    
    /**
     * In-place radix-2 FFT (Cooley-Tukey). Modifies real and imag arrays.
     * @param {number[]} real - Real part (length must be power of 2)
     * @param {number[]} imag - Imaginary part (same length)
     */
    _fft(real, imag) {
        const N = real.length;
        if (N <= 1) return;

        // Bit-reversal permutation
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

        // Cooley-Tukey decimation-in-time
        for (let len = 2; len <= N; len *= 2) {
            const angle = -2 * Math.PI / len;
            const wlenReal = Math.cos(angle);
            const wlenImag = Math.sin(angle);
            for (let i = 0; i < N; i += len) {
                let wReal = 1;
                let wImag = 0;
                for (let j = 0; j < len / 2; j++) {
                    const u = i + j;
                    const v = u + len / 2;
                    const tReal = real[v] * wReal - imag[v] * wImag;
                    const tImag = real[v] * wImag + imag[v] * wReal;
                    real[v] = real[u] - tReal;
                    imag[v] = imag[u] - tImag;
                    real[u] += tReal;
                    imag[u] += tImag;
                    const nextWReal = wReal * wlenReal - wImag * wlenImag;
                    const nextWImag = wReal * wlenImag + wImag * wlenReal;
                    wReal = nextWReal;
                    wImag = nextWImag;
                }
            }
        }
    },

    /**
     * Compute power spectral density via FFT and return spectral features.
     * @param {number[]} data - Real-valued signal (high-pass filtered magnitude)
     * @param {number} sampleRate - Samples per second
     * @returns {Object} { peakFrequency, tremorBandPower, totalPower, power1To15Hz, relativeTremorPower, tremorBandPowerRatio, df } or null
     */
    _computeSpectrum(data, sampleRate) {
        const N = data.length;
        if (N < 4) return null;

        // Zero-pad to next power of 2 for radix-2 FFT
        let fftSize = 2;
        while (fftSize < N) fftSize *= 2;

        const real = new Array(fftSize);
        const imag = new Array(fftSize);
        for (let i = 0; i < fftSize; i++) {
            real[i] = i < N ? data[i] : 0;
            imag[i] = 0;
        }

        this._fft(real, imag);

        // One-sided PSD: power in each positive frequency bin
        // PSD[k] = (2/N^2) * |X[k]|^2 for k=1..N/2-1, DC and Nyquist scaled by 1/N^2
        const half = fftSize / 2;
        const scale = 1 / (fftSize * fftSize);
        let totalPower = (real[0] * real[0] + imag[0] * imag[0]) * scale;
        let tremorBandPower = 0;
        let maxPower = 0;
        let peakBin = 0;

        const df = sampleRate / fftSize;
        const tremorMinBin = Math.max(1, Math.floor(4 / df));
        const tremorMaxBin = Math.min(half - 1, Math.ceil(6 / df));
        const band1HzBin = Math.max(1, Math.ceil(1 / df));
        const band15HzBin = Math.min(half, Math.floor(15 / df));

        let power1To15Hz = 0;

        for (let k = 1; k < half; k++) {
            const power = 2 * (real[k] * real[k] + imag[k] * imag[k]) * scale;
            totalPower += power;
            if (k >= tremorMinBin && k <= tremorMaxBin) {
                tremorBandPower += power;
            }
            if (k >= band1HzBin && k <= band15HzBin) {
                power1To15Hz += power;
            }
            if (power > maxPower) {
                maxPower = power;
                peakBin = k;
            }
        }
        // Nyquist bin (if fftSize even)
        const nyqPower = (real[half] * real[half] + imag[half] * imag[half]) * scale;
        totalPower += nyqPower;
        if (half >= tremorMinBin && half <= tremorMaxBin) {
            tremorBandPower += nyqPower;
        }
        if (half >= band1HzBin && half <= band15HzBin) {
            power1To15Hz += nyqPower;
        }
        if (half > peakBin && nyqPower > maxPower) {
            peakBin = half;
        }

        const peakFrequency = peakBin * df;
        const relativeTremorPower = totalPower > 0 ? tremorBandPower / totalPower : 0;
        const tremorBandPowerRatio = power1To15Hz > 0 ? tremorBandPower / power1To15Hz : 0;

        return {
            peakFrequency,
            tremorBandPower,
            totalPower,
            power1To15Hz,
            relativeTremorPower,
            tremorBandPowerRatio,
            df
        };
    },

    /**
     * Map tremor band power ratio (4-6 Hz / 1-15 Hz) to 0-100% Parkinsonian likelihood and label.
     * Thresholds: <5% → 0% (None), 5-15% → Low, 15-30% → Moderate, 30-50% → High, >50% → Very High.
     * @param {number} ratio - tremorBandPower / power1To15Hz (0..1)
     * @returns {{ likelihood: number, label: string }}
     */
    _parkinsonianLikelihoodFromRatio(ratio) {
        if (ratio < 0.05) return { likelihood: 0, label: 'None' };
        if (ratio < 0.15) return { likelihood: Math.round(0 + (ratio - 0.05) / 0.10 * 25), label: 'Low' };
        if (ratio < 0.30) return { likelihood: Math.round(25 + (ratio - 0.15) / 0.15 * 25), label: 'Moderate' };
        if (ratio < 0.50) return { likelihood: Math.round(50 + (ratio - 0.30) / 0.20 * 25), label: 'High' };
        const likelihood = Math.round(75 + Math.min(ratio - 0.50, 0.5) / 0.5 * 25);
        return { likelihood: Math.min(100, likelihood), label: 'Very High' };
    },

    /**
     * Detect tremor characteristics using FFT-based power spectral density
     * @param {number[]} data - High-pass filtered magnitude data
     * @returns {Object} Tremor characteristics (peakFrequency, tremorBandPower, totalPower, relativeTremorPower, tremorBandPowerRatio, parkinsonianLikelihood, parkinsonianLikelihoodLabel; keeps frequency, amplitude, regularity, inTremorRange, duration)
     */
    detectTremor(data) {
        if (data.length < 10) {
            return {
                frequency: 0,
                amplitude: 0,
                peakAmplitude: 0,
                regularity: 0,
                inTremorRange: false,
                peakFrequency: 0,
                tremorBandPower: 0,
                totalPower: 0,
                relativeTremorPower: 0,
                tremorBandPowerRatio: 0,
                parkinsonianLikelihood: 0,
                parkinsonianLikelihoodLabel: 'None',
                duration: 0
            };
        }

        // Use measured actual rate when available (e.g. device reports < 50 Hz), else configured target
        const sampleRate = this.state.actualSampleRate ?? this.config.sampleRate;
        const duration = this.state.rawData.length > 0
            ? (this.state.rawData[this.state.rawData.length - 1].time) / 1000
            : this.config.testDuration / 1000;

        const spectrum = this._computeSpectrum(data, sampleRate);
        let peakFrequency = 0;
        let tremorBandPower = 0;
        let totalPower = 0;
        let relativeTremorPower = 0;
        let tremorBandPowerRatio = 0;
        let parkinsonianLikelihood = 0;
        let parkinsonianLikelihoodLabel = 'None';

        if (spectrum) {
            peakFrequency = spectrum.peakFrequency;
            tremorBandPower = spectrum.tremorBandPower;
            totalPower = spectrum.totalPower;
            relativeTremorPower = spectrum.relativeTremorPower;
            tremorBandPowerRatio = spectrum.tremorBandPowerRatio;
            const pl = this._parkinsonianLikelihoodFromRatio(tremorBandPowerRatio);
            parkinsonianLikelihood = pl.likelihood;
            parkinsonianLikelihoodLabel = pl.label;
        }

        // Time-domain amplitude (RMS) and peak for compatibility
        const sumSquares = data.reduce((sum, val) => sum + val * val, 0);
        const rms = Math.sqrt(sumSquares / data.length);
        const amplitude = rms;
        const peakAmplitude = Math.max(...data.map(Math.abs));

        // Regularity from time-domain (consistency of oscillations)
        const absValues = data.map(Math.abs);
        const avgAbs = absValues.reduce((a, b) => a + b, 0) / absValues.length;
        const variance = absValues.reduce((sum, val) =>
            sum + Math.pow(val - avgAbs, 2), 0) / absValues.length;
        const stdDev = Math.sqrt(variance);
        const regularity = avgAbs > 0
            ? Math.max(0, 1 - (stdDev / avgAbs))
            : 0;

        const inTremorRange = peakFrequency >= this.config.tremorFreqMin &&
            peakFrequency <= this.config.tremorFreqMax;

        return {
            frequency: Math.round(peakFrequency * 10) / 10,
            amplitude: Math.round(amplitude * 1000) / 1000,
            peakAmplitude: Math.round(peakAmplitude * 1000) / 1000,
            regularity: Math.round(regularity * 100) / 100,
            inTremorRange,
            peakFrequency: Math.round(peakFrequency * 100) / 100,
            tremorBandPower: Math.round(tremorBandPower * 1e6) / 1e6,
            totalPower: Math.round(totalPower * 1e6) / 1e6,
            relativeTremorPower: Math.round(relativeTremorPower * 100) / 100,
            tremorBandPowerRatio: Math.round(tremorBandPowerRatio * 1000) / 1000,
            parkinsonianLikelihood,
            parkinsonianLikelihoodLabel,
            duration: Math.round(duration * 10) / 10
        };
    },
    
    /**
     * Calculate tremor score (0-10) as a weighted combination of amplitude and frequency quality.
     *
     * Weighting: 70% movement intensity (amplitude-based) + 30% frequency quality (0-10).
     * Rationale: Rest tremor in Parkinson's is typically 4-6 Hz and relatively regular; other
     * causes (essential tremor, anxiety, artifact) often differ in frequency or regularity.
     * A person with moderate shaking at random frequencies scores lower than the same
     * amplitude concentrated at 4-6 Hz with regular oscillations.
     *
     * Movement component: Clinical reference ranges (accelerometer studies on Parkinson's):
     * - Healthy/minimal: < 0.15 m/s² → 0-2, Mild: 0.15-0.5 → 2-4, Moderate: 0.5-1.5 → 4-7,
     * - Severe: 1.5-3.0 → 7-9, Very severe: > 3.0 → 9-10.
     *
     * Frequency quality (0-10): average of (1) relative power in 4-6 Hz band (tremorBandPowerRatio),
     * (2) peak frequency proximity to 5 Hz, (3) regularity. Each component normalized 0-1.
     *
     * @param {Object} analysis - movementIntensity, peakFrequency, tremorBandPowerRatio, regularity, etc.
     * @returns {number} Score 0-10
     */
    calculateScore(analysis) {
        const {
            movementIntensity,
            peakFrequency = 0,
            tremorBandPowerRatio = 0,
            regularity = 0
        } = analysis;

        // --- Movement score (0-10) from amplitude-based clinical thresholds ---
        let movementScore = 0;
        if (movementIntensity < 0.05) {
            movementScore = 0;
        } else if (movementIntensity < 0.15) {
            movementScore = (movementIntensity / 0.15) * 2;
        } else if (movementIntensity < 0.5) {
            movementScore = 2 + ((movementIntensity - 0.15) / 0.35) * 2;
        } else if (movementIntensity < 1.5) {
            movementScore = 4 + ((movementIntensity - 0.5) / 1.0) * 3;
        } else if (movementIntensity < 3.0) {
            movementScore = 7 + ((movementIntensity - 1.5) / 1.5) * 2;
        } else {
            movementScore = 9 + Math.min((movementIntensity - 3.0) / 2.0, 1);
        }

        // --- Frequency quality score (0-10): band power + peak proximity to 5 Hz + regularity ---
        const bandComponent = Math.min(1, tremorBandPowerRatio / 0.5); // 0 at 0%, 1 at ≥50% in 4-6 Hz
        const proximityComponent = Math.max(0, 1 - Math.abs(peakFrequency - 5) / 3); // 1 at 5 Hz, 0 at 2/8 Hz
        const regularityComponent = Math.max(0, Math.min(1, regularity));
        const frequencyQualityScore = ((bandComponent + proximityComponent + regularityComponent) / 3) * 10;

        // --- Weighted combination: 70% movement, 30% frequency quality ---
        let score = 0.7 * movementScore + 0.3 * frequencyQualityScore;

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
        this.state.actualSampleRate = null;
        this.state.usingGravityCompensated = null;
    }
};

// Make TremorLogic available globally
window.TremorLogic = TremorLogic;