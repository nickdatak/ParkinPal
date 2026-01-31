/**
 * ParkinPal - Main Application Entry Point
 */

const App = {
    // Application state
    state: {
        userName: null,
        isFirstVisit: true,
        currentSection: 'welcome',
        isTestRunning: false
    },
    
    /**
     * Initialize the application
     */
    init() {
        console.log('ParkinPal initializing...');
        
        // Load user data from storage
        this.loadUserData();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Initialize modules
        this.initModules();
        
        // Show appropriate initial section
        if (this.state.userName) {
            Utils.showSection('greeting');
            this.showGreeting(this.state.userName);
        } else {
            Utils.showSection('welcome');
        }
        
        console.log('ParkinPal initialized');
    },
    
    /**
     * Load user data from localStorage
     */
    loadUserData() {
        const name = localStorage.getItem('parkinpal_username');
        const hasVisited = localStorage.getItem('parkinpal_visited');
        
        if (name) {
            this.state.userName = name;
        }
        
        // Check if this is a returning user (has visited before)
        this.state.isFirstVisit = !hasVisited;
    },
    
    /**
     * Save user name to localStorage
     * @param {string} name - User's name
     */
    saveUserName(name) {
        localStorage.setItem('parkinpal_username', name);
        this.state.userName = name;
        
        // Switch to greeting section
        Utils.showSection('greeting');
        this.showGreeting(name);
    },
    
    /**
     * Show greeting with user's name
     * @param {string} name - User's name
     */
    showGreeting(name) {
        const userNameSpan = document.getElementById('user-name');
        const greetingHeading = document.getElementById('greeting-heading');
        const greetingSubtext = document.getElementById('greeting-subtext');
        
        if (userNameSpan) {
            userNameSpan.textContent = name;
        }
        
        // Update greeting text based on first visit status
        if (greetingSubtext) {
            if (this.state.isFirstVisit) {
                greetingSubtext.textContent = 'great meeting you';
            } else {
                greetingSubtext.textContent = 'nice to see you again';
            }
        }
        
        // Mark as visited after showing the greeting
        if (this.state.isFirstVisit) {
            localStorage.setItem('parkinpal_visited', 'true');
            this.state.isFirstVisit = false;
        }
    },
    
    /**
     * Navigate back to greeting page
     */
    goToGreeting() {
        Utils.showSection('greeting');
        this.state.currentSection = 'greeting';
    },
    
    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Name input
        const nameSubmit = document.getElementById('name-submit');
        const nameInput = document.getElementById('name-input');
        
        nameSubmit.addEventListener('click', () => {
            const name = nameInput.value.trim();
            if (name) {
                this.saveUserName(name);
                Utils.showToast(`Welcome, ${name}!`, 'success');
            } else {
                Utils.showToast('Please enter your name', 'warning');
            }
        });
        
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                nameSubmit.click();
            }
        });
        
        // Greeting section buttons
        const greetingTremorBtn = document.getElementById('greeting-tremor-btn');
        const greetingVoiceBtn = document.getElementById('greeting-voice-btn');
        
        if (greetingTremorBtn) {
            greetingTremorBtn.addEventListener('click', () => {
                if (!this.state.isTestRunning) {
                    Utils.showSection('tremor-test');
                    this.state.currentSection = 'tremor-test';
                }
            });
        }
        
        if (greetingVoiceBtn) {
            greetingVoiceBtn.addEventListener('click', () => {
                if (!this.state.isTestRunning) {
                    Utils.showSection('voice-test');
                    this.state.currentSection = 'voice-test';
                }
            });
        }
        
        // Back buttons
        const tremorBack = document.getElementById('tremor-back');
        const voiceBack = document.getElementById('voice-back');
        const trendsBack = document.getElementById('trends-back');
        const reportBack = document.getElementById('report-back');
        
        if (tremorBack) {
            tremorBack.addEventListener('click', () => {
                if (!this.state.isTestRunning) {
                    this.goToGreeting();
                }
            });
        }
        
        if (voiceBack) {
            voiceBack.addEventListener('click', () => {
                if (!this.state.isTestRunning) {
                    this.goToGreeting();
                }
            });
        }
        
        if (trendsBack) {
            trendsBack.addEventListener('click', () => {
                this.goToGreeting();
            });
        }
        
        if (reportBack) {
            reportBack.addEventListener('click', () => {
                Utils.showSection('trends');
                this.state.currentSection = 'trends';
            });
        }
        
        // Analyse Data button
        document.getElementById('analyse-btn').addEventListener('click', () => {
            if (!this.state.isTestRunning) {
                Utils.showSection('trends');
                this.state.currentSection = 'trends';
                // Refresh charts when navigating to trends
                if (typeof Charts !== 'undefined') {
                    Charts.updateTrendsChart();
                    Charts.updateHistoryList();
                }
            }
        });
        
        // Generate Report button
        document.getElementById('generate-report-btn').addEventListener('click', async () => {
            Utils.showSection('report');
            await API.generateDoctorReport();
        });
        
        // Back to Trends button
        document.getElementById('back-to-trends').addEventListener('click', () => {
            Utils.showSection('trends');
        });
        
        // Copy Report button
        document.getElementById('copy-report').addEventListener('click', async () => {
            const content = document.getElementById('report-content').innerText;
            const success = await Utils.copyToClipboard(content);
            if (success) {
                Utils.showToast('Copied to clipboard!', 'success');
            } else {
                Utils.showToast('Failed to copy', 'error');
            }
        });
        
        // Download Report button
        document.getElementById('download-report').addEventListener('click', () => {
            const content = document.getElementById('report-content').innerText;
            const date = new Date().toISOString().split('T')[0];
            Utils.downloadTextFile(content, `ParkinPal-Report-${date}.txt`);
            Utils.showToast('Report downloaded!', 'success');
        });
        
        // Demo Data button
        document.getElementById('demo-data-btn').addEventListener('click', () => {
            if (confirm('Generate demo data? This will replace existing entries.')) {
                Storage.generateDemoData();
            }
        });
    },
    
    /**
     * Initialize all modules
     */
    initModules() {
        // Initialize storage
        if (typeof Storage !== 'undefined') {
            Storage.init();
        }
        
        // Initialize charts
        if (typeof Charts !== 'undefined') {
            Charts.init();
        }
        
        // Initialize tremor UI
        if (typeof TremorUI !== 'undefined') {
            TremorUI.init();
        }
        
        // Initialize voice UI
        if (typeof VoiceUI !== 'undefined') {
            VoiceUI.init();
        }
    },
    
    /**
     * Set test running state
     * @param {boolean} running - Whether a test is running
     */
    setTestRunning(running) {
        this.state.isTestRunning = running;
        
        // Disable back buttons and analyse button during tests
        const backButtons = document.querySelectorAll('#tremor-back, #voice-back');
        const analyseBtn = document.getElementById('analyse-btn');
        
        backButtons.forEach(btn => {
            btn.style.opacity = running ? '0.5' : '1';
            btn.style.pointerEvents = running ? 'none' : 'auto';
        });
        
        analyseBtn.style.opacity = running ? '0.5' : '1';
        analyseBtn.style.pointerEvents = running ? 'none' : 'auto';
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Make App available globally
window.App = App;
