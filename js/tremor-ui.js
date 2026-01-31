/**
 * ParkinPal - Tremor Test UI
 */

const TremorUI = {
    // UI State
    state: {
        chart: null,
        chartData: [],
        countdownInterval: null,
        timeRemaining: 30,
        testResults: null
    },
    
    // DOM Elements
    elements: {},
    
    /**
     * Initialize tremor UI
     */
    init() {
        // Cache DOM elements
        this.elements = {
            instructions: document.getElementById('tremor-instructions'),
            timer: document.getElementById('tremor-timer'),
            countdown: document.getElementById('tremor-countdown'),
            chartContainer: document.getElementById('tremor-chart-container'),
            chart: document.getElementById('tremor-chart'),
            startBtn: document.getElementById('tremor-start'),
            stopBtn: document.getElementById('tremor-stop'),
            results: document.getElementById('tremor-results'),
            score: document.getElementById('tremor-score'),
            severity: document.getElementById('tremor-severity'),
            saveBtn: document.getElementById('tremor-save'),
            insight: document.getElementById('tremor-insight'),
            insightText: document.getElementById('tremor-insight-text')
        };
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Initialize chart
        this.initChart();
    },
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        this.elements.startBtn.addEventListener('click', () => this.startTest());
        this.elements.stopBtn.addEventListener('click', () => this.stopTest());
        this.elements.saveBtn.addEventListener('click', () => this.saveResults());
    },
    
    /**
     * Initialize Chart.js instance
     */
    initChart() {
        const ctx = this.elements.chart.getContext('2d');
        
        this.state.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Acceleration',
                    data: [],
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.2,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 0
                },
                scales: {
                    x: {
                        display: false
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'm/s²',
                            font: { size: 10 }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    },
    
    /**
     * Start the tremor test
     */
    async startTest() {
        // Check for secure context
        if (!Utils.isSecureContext()) {
            Utils.showToast('This test requires HTTPS. Please use a secure connection.', 'error');
            return;
        }
        
        // Check if DeviceMotion is supported
        if (!TremorLogic.isSupported()) {
            Utils.showToast('Motion sensors not available on this device.', 'error');
            return;
        }
        
        // Request permission (must be from user gesture)
        const granted = await TremorLogic.requestPermission();
        
        if (!granted) {
            Utils.showToast('Motion sensor permission denied. Please allow access in Settings.', 'error');
            return;
        }
        
        // Reset UI
        this.resetUI();
        
        // Show recording UI
        this.elements.instructions.classList.add('hidden');
        this.elements.timer.classList.remove('hidden');
        this.elements.chartContainer.classList.remove('hidden');
        this.elements.startBtn.classList.add('hidden');
        this.elements.stopBtn.classList.remove('hidden');
        this.elements.results.classList.add('hidden');
        
        // Set test running state
        App.setTestRunning(true);
        
        // Reset chart data
        this.state.chartData = [];
        this.state.chart.data.labels = [];
        this.state.chart.data.datasets[0].data = [];
        
        // Start countdown
        this.state.timeRemaining = 30;
        this.updateCountdown();
        
        this.state.countdownInterval = setInterval(() => {
            this.state.timeRemaining--;
            this.updateCountdown();
            
            if (this.state.timeRemaining <= 0) {
                this.stopTest();
            }
        }, 1000);
        
        // Start recording
        const started = await TremorLogic.startRecording((magnitude, time) => {
            this.onDataPoint(magnitude, time);
        });
        
        if (!started) {
            this.stopTest();
            Utils.showToast('Failed to start motion recording.', 'error');
        }
    },
    
    /**
     * Handle incoming data point
     * @param {number} magnitude - Acceleration magnitude
     * @param {number} time - Time since start in ms
     */
    onDataPoint(magnitude, time) {
        // Add to chart data (keep last 200 points for performance)
        this.state.chartData.push(magnitude);
        
        if (this.state.chartData.length > 200) {
            this.state.chartData.shift();
        }
        
        // Update chart
        this.state.chart.data.labels = this.state.chartData.map((_, i) => i);
        this.state.chart.data.datasets[0].data = this.state.chartData;
        
        // Auto-scale Y axis with tighter range to show fluctuations better
        const minVal = Math.min(...this.state.chartData);
        const maxVal = Math.max(...this.state.chartData);
        const range = maxVal - minVal;
        const padding = Math.max(range * 0.15, 0.1); // 15% padding or min 0.1
        
        this.state.chart.options.scales.y.min = Math.max(0, minVal - padding);
        this.state.chart.options.scales.y.max = maxVal + padding;
        
        this.state.chart.update('none');
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
     * Stop the tremor test
     */
    stopTest() {
        // Clear countdown
        if (this.state.countdownInterval) {
            clearInterval(this.state.countdownInterval);
            this.state.countdownInterval = null;
        }
        
        // Stop recording and get results
        const results = TremorLogic.stopRecording();
        this.state.testResults = results;
        
        // Set test running state
        App.setTestRunning(false);
        
        // Update UI
        this.elements.timer.classList.add('hidden');
        this.elements.stopBtn.classList.add('hidden');
        this.elements.results.classList.remove('hidden');
        
        // Display results
        this.elements.score.textContent = results.score.toFixed(1);
        this.elements.severity.textContent = results.severity;
        this.elements.severity.className = `text-xl font-semibold ${this.getSeverityColorClass(results.severity)}`;
        
        Utils.showToast('Test complete!', 'success');
    },
    
    /**
     * Get severity text color class
     * @param {string} severity
     * @returns {string}
     */
    getSeverityColorClass(severity) {
        switch (severity.toLowerCase()) {
            case 'low': return 'text-green-600';
            case 'medium': return 'text-yellow-600';
            case 'high': return 'text-red-600';
            default: return 'text-gray-800';
        }
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
            tremor_score: this.state.testResults.score,
            tremor_severity: this.state.testResults.severity,
            tremor_raw_data: this.state.testResults.rawData
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
            const severity = entry.tremor_severity.toLowerCase();
            let insight = '';
            
            if (severity === 'low') {
                insight = "Great job completing your test! Your tremor levels look good today. Keep up with your regular activities and stay hydrated.";
            } else if (severity === 'medium') {
                insight = "Thanks for tracking today. Consider some gentle stretching exercises and remember to take breaks during tasks requiring fine motor control.";
            } else {
                insight = "We see your tremor is elevated today. This is valuable data for your doctor. Try relaxation techniques and ensure you're following your medication schedule.";
            }
            
            this.elements.insightText.textContent = insight;
        }
    },
    
    /**
     * Reset UI to initial state
     */
    resetUI() {
        this.state.testResults = null;
        this.state.chartData = [];
        
        this.elements.instructions.classList.remove('hidden');
        this.elements.timer.classList.add('hidden');
        this.elements.chartContainer.classList.add('hidden');
        this.elements.startBtn.classList.remove('hidden');
        this.elements.stopBtn.classList.add('hidden');
        this.elements.results.classList.add('hidden');
        this.elements.insight.classList.add('hidden');
        
        this.elements.saveBtn.disabled = false;
        this.elements.saveBtn.textContent = 'Save Results';
        
        // Reset chart
        if (this.state.chart) {
            this.state.chart.data.labels = [];
            this.state.chart.data.datasets[0].data = [];
            this.state.chart.update();
        }
        
        // Reset tremor logic
        TremorLogic.reset();
    }
};

// Make TremorUI available globally
window.TremorUI = TremorUI;
