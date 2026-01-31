/**
 * ParkinPal - Main Application Entry Point
 */

const App = {
    // Application state
    state: {
        userName: null,
        currentSection: 'welcome',
        isTestRunning: false
    },
    
    /**
     * Initialize the application
     */
    init() {
        console.log('ParkinPal initializing...');
        
        // Load user name from storage
        this.loadUserName();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Initialize modules
        this.initModules();
        
        // Show appropriate initial section
        if (this.state.userName) {
            Utils.showSection('welcome');
        } else {
            Utils.showSection('welcome');
        }
        
        console.log('ParkinPal initialized');
    },
    
    /**
     * Load user name from localStorage
     */
    loadUserName() {
        const name = localStorage.getItem('parkinpal_username');
        if (name) {
            this.state.userName = name;
            this.showGreeting(name);
        }
    },
    
    /**
     * Save user name to localStorage
     * @param {string} name - User's name
     */
    saveUserName(name) {
        localStorage.setItem('parkinpal_username', name);
        this.state.userName = name;
        this.showGreeting(name);
    },
    
    /**
     * Show greeting with user's name
     * @param {string} name - User's name
     */
    showGreeting(name) {
        const inputContainer = document.getElementById('name-input-container');
        const greetingContainer = document.getElementById('greeting-container');
        const userNameSpan = document.getElementById('user-name');
        
        inputContainer.classList.add('hidden');
        greetingContainer.classList.remove('hidden');
        userNameSpan.textContent = name;
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
        
        // Navigation buttons
        document.getElementById('nav-tremor').addEventListener('click', () => {
            if (!this.state.isTestRunning) {
                Utils.showSection('tremor-test');
                this.state.currentSection = 'tremor-test';
            }
        });
        
        document.getElementById('nav-voice').addEventListener('click', () => {
            if (!this.state.isTestRunning) {
                Utils.showSection('voice-test');
                this.state.currentSection = 'voice-test';
            }
        });
        
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
        
        // Disable navigation during tests
        const navButtons = document.querySelectorAll('nav button');
        const analyseBtn = document.getElementById('analyse-btn');
        
        navButtons.forEach(btn => {
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
