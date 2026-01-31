/**
 * ParkinPal - Utility Functions
 */

const Utils = {
    /**
     * Show a specific section and hide all others
     * @param {string} sectionId - The ID of the section to show
     */
    showSection(sectionId) {
        const sections = document.querySelectorAll('.section');
        sections.forEach(section => {
            section.classList.add('hidden');
        });
        
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.remove('hidden');
        }
        
        // Update navigation state
        this.updateNavState(sectionId);
    },
    
    /**
     * Update navigation button active states (deprecated - no longer using bottom nav)
     * @param {string} activeSectionId - The currently active section ID
     */
    updateNavState(activeSectionId) {
        // Bottom navigation has been removed
        // This function is kept for backwards compatibility
    },
    
    /**
     * Show a toast notification
     * @param {string} message - The message to display
     * @param {string} type - Type of toast: 'success', 'error', 'info', 'warning'
     * @param {number} duration - Duration in milliseconds (default: 3000)
     */
    showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        // Auto-remove after duration
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, duration);
    },
    
    /**
     * Show loading overlay
     * @param {string} text - Optional loading text
     */
    showLoading(text = 'Loading...') {
        const overlay = document.getElementById('loading-overlay');
        const loadingText = document.getElementById('loading-text');
        loadingText.textContent = text;
        overlay.classList.remove('hidden');
    },
    
    /**
     * Hide loading overlay
     */
    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        overlay.classList.add('hidden');
    },
    
    /**
     * Format a date for display
     * @param {string|Date} date - The date to format
     * @returns {string} Formatted date string
     */
    formatDate(date) {
        const d = new Date(date);
        const options = { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric'
        };
        return d.toLocaleDateString('en-US', options);
    },
    
    /**
     * Format a date for detailed display
     * @param {string|Date} date - The date to format
     * @returns {string} Formatted date string with time
     */
    formatDateTime(date) {
        const d = new Date(date);
        const options = { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        };
        return d.toLocaleDateString('en-US', options);
    },
    
    /**
     * Generate a unique ID
     * @returns {string} Unique identifier
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },
    
    /**
     * Get severity label from score
     * @param {number} score - Score from 0-10
     * @returns {string} Severity label
     */
    getSeverity(score) {
        if (score <= 3) return 'Low';
        if (score <= 6) return 'Medium';
        return 'High';
    },
    
    /**
     * Get severity CSS class
     * @param {string} severity - Severity label
     * @returns {string} CSS class name
     */
    getSeverityClass(severity) {
        switch (severity.toLowerCase()) {
            case 'low': return 'severity-low';
            case 'medium': return 'severity-medium';
            case 'high': return 'severity-high';
            default: return 'severity-low';
        }
    },
    
    /**
     * Calculate standard deviation
     * @param {number[]} values - Array of numbers
     * @returns {number} Standard deviation
     */
    standardDeviation(values) {
        if (values.length === 0) return 0;
        
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
        const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
        
        return Math.sqrt(avgSquaredDiff);
    },
    
    /**
     * Clamp a value between min and max
     * @param {number} value - The value to clamp
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {number} Clamped value
     */
    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    },
    
    /**
     * Debounce function
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    /**
     * Create empty state HTML
     * @param {string} message - Message to display
     * @returns {string} HTML string
     */
    createEmptyState(message) {
        return `
            <div class="p-8 text-center text-gray-500">
                <svg class="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                </svg>
                <p>${message}</p>
            </div>
        `;
    },
    
    /**
     * Copy text to clipboard
     * @param {string} text - Text to copy
     * @returns {Promise<boolean>} Success status
     */
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                document.body.removeChild(textArea);
                return true;
            } catch (e) {
                document.body.removeChild(textArea);
                return false;
            }
        }
    },
    
    /**
     * Download text as a file
     * @param {string} content - File content
     * @param {string} filename - Name for the downloaded file
     */
    downloadTextFile(content, filename) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },
    
    /**
     * Check if device is iOS
     * @returns {boolean}
     */
    isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    },
    
    /**
     * Check if running in secure context (HTTPS)
     * @returns {boolean}
     */
    isSecureContext() {
        return window.isSecureContext || window.location.protocol === 'https:';
    }
};

// Make Utils available globally
window.Utils = Utils;
