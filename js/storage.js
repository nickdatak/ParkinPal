/**
 * ParkinPal - LocalStorage Operations
 * 
 * Data Model:
 * {
 *   id: string,
 *   date: ISO string,
 *   tremor_score: 0-10,
 *   tremor_severity: "Low"|"Medium"|"High",
 *   tremor_raw_data: number[],
 *   voice_score: 0-10,
 *   voice_duration: number,
 *   voice_pauses: number,
 *   voice_variance: number,
 *   notes: string
 * }
 */

const Storage = {
    STORAGE_KEY: 'parkinpal_entries',
    MAX_ENTRIES: 100, // Maximum entries to keep (to manage quota)
    
    /**
     * Initialize storage
     */
    init() {
        // Ensure storage key exists
        if (!localStorage.getItem(this.STORAGE_KEY)) {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify([]));
        }
    },
    
    /**
     * Get all entries
     * @returns {Array} Array of entries
     */
    getAllEntries() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('Error reading from storage:', error);
            return [];
        }
    },
    
    /**
     * Save entries to storage
     * @param {Array} entries - Array of entries to save
     * @returns {boolean} Success status
     */
    saveEntries(entries) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(entries));
            return true;
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                // Try to free up space by removing oldest entries
                console.warn('Storage quota exceeded, trimming old entries...');
                return this.handleQuotaExceeded(entries);
            }
            console.error('Error saving to storage:', error);
            return false;
        }
    },
    
    /**
     * Handle quota exceeded by trimming old entries
     * @param {Array} entries - Entries to save
     * @returns {boolean} Success status
     */
    handleQuotaExceeded(entries) {
        // Remove raw data from older entries to save space
        const trimmedEntries = entries.map((entry, index) => {
            if (index < entries.length - 7) {
                // Keep only essential data for entries older than 7 days
                return {
                    ...entry,
                    tremor_raw_data: [] // Clear raw data for older entries
                };
            }
            return entry;
        });
        
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(trimmedEntries));
            Utils.showToast('Storage optimized - older raw data removed', 'warning');
            return true;
        } catch (error) {
            // If still failing, remove oldest entries
            const reducedEntries = trimmedEntries.slice(-this.MAX_ENTRIES / 2);
            try {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(reducedEntries));
                Utils.showToast('Storage full - some old entries removed', 'warning');
                return true;
            } catch (e) {
                Utils.showToast('Unable to save data - storage full', 'error');
                return false;
            }
        }
    },
    
    /**
     * Save a new entry or update existing one for today
     * @param {Object} entry - Entry data to save
     * @returns {Object|null} Saved entry or null on failure
     */
    saveEntry(entry) {
        const entries = this.getAllEntries();
        const today = new Date().toISOString().split('T')[0];
        
        // Check if entry for today exists
        const existingIndex = entries.findIndex(e => 
            e.date.split('T')[0] === today
        );
        
        if (existingIndex !== -1) {
            // Update existing entry
            const existing = entries[existingIndex];
            const updated = {
                ...existing,
                ...entry,
                date: existing.date, // Keep original date
                id: existing.id // Keep original ID
            };
            entries[existingIndex] = updated;
            
            if (this.saveEntries(entries)) {
                return updated;
            }
        } else {
            // Create new entry
            const newEntry = {
                id: Utils.generateId(),
                date: new Date().toISOString(),
                tremor_score: null,
                tremor_severity: null,
                tremor_raw_data: [],
                voice_score: null,
                voice_duration: null,
                voice_pauses: null,
                voice_variance: null,
                notes: '',
                ...entry
            };
            
            entries.push(newEntry);
            
            // Limit total entries
            if (entries.length > this.MAX_ENTRIES) {
                entries.shift(); // Remove oldest
            }
            
            if (this.saveEntries(entries)) {
                return newEntry;
            }
        }
        
        return null;
    },
    
    /**
     * Get entries with limit
     * @param {number} limit - Maximum number of entries to return
     * @returns {Array} Array of entries (newest first)
     */
    getEntries(limit = 10) {
        const entries = this.getAllEntries();
        // Sort by date descending and limit
        return entries
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, limit);
    },
    
    /**
     * Get entries from the last 7 days
     * @returns {Array} Array of entries from last 7 days
     */
    getLast7Days() {
        const entries = this.getAllEntries();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);
        
        return entries
            .filter(entry => new Date(entry.date) >= sevenDaysAgo)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    },
    
    /**
     * Get entry by ID
     * @param {string} id - Entry ID
     * @returns {Object|null} Entry or null if not found
     */
    getEntryById(id) {
        const entries = this.getAllEntries();
        return entries.find(entry => entry.id === id) || null;
    },
    
    /**
     * Get today's entry if it exists
     * @returns {Object|null} Today's entry or null
     */
    getTodayEntry() {
        const entries = this.getAllEntries();
        const today = new Date().toISOString().split('T')[0];
        return entries.find(e => e.date.split('T')[0] === today) || null;
    },
    
    /**
     * Delete an entry by ID
     * @param {string} id - Entry ID
     * @returns {boolean} Success status
     */
    deleteEntry(id) {
        const entries = this.getAllEntries();
        const filtered = entries.filter(entry => entry.id !== id);
        
        if (filtered.length !== entries.length) {
            return this.saveEntries(filtered);
        }
        return false;
    },
    
    /**
     * Get weekly statistics
     * @returns {Object} Statistics object
     */
    getWeeklyStats() {
        const entries = this.getLast7Days();
        
        if (entries.length === 0) {
            return {
                avgTremor: null,
                avgVoice: null,
                trend: 'stable',
                entryCount: 0
            };
        }
        
        // Calculate averages
        const tremorScores = entries
            .filter(e => e.tremor_score !== null)
            .map(e => e.tremor_score);
        
        const voiceScores = entries
            .filter(e => e.voice_score !== null)
            .map(e => e.voice_score);
        
        const avgTremor = tremorScores.length > 0
            ? (tremorScores.reduce((a, b) => a + b, 0) / tremorScores.length).toFixed(1)
            : null;
        
        const avgVoice = voiceScores.length > 0
            ? (voiceScores.reduce((a, b) => a + b, 0) / voiceScores.length).toFixed(1)
            : null;
        
        // Calculate trend (compare first half to second half of week)
        const trend = this.calculateTrend(entries);
        
        return {
            avgTremor,
            avgVoice,
            trend,
            entryCount: entries.length
        };
    },
    
    /**
     * Calculate trend direction
     * @param {Array} entries - Entries to analyze
     * @returns {string} 'improving' | 'stable' | 'worsening'
     */
    calculateTrend(entries) {
        if (entries.length < 2) return 'stable';
        
        // Get average of combined scores
        const getAvgScore = (entrySubset) => {
            let scores = [];
            entrySubset.forEach(e => {
                if (e.tremor_score !== null) scores.push(e.tremor_score);
                if (e.voice_score !== null) scores.push(e.voice_score);
            });
            return scores.length > 0 
                ? scores.reduce((a, b) => a + b, 0) / scores.length 
                : null;
        };
        
        const midpoint = Math.floor(entries.length / 2);
        const firstHalf = entries.slice(0, midpoint);
        const secondHalf = entries.slice(midpoint);
        
        const firstAvg = getAvgScore(firstHalf);
        const secondAvg = getAvgScore(secondHalf);
        
        if (firstAvg === null || secondAvg === null) return 'stable';
        
        const diff = secondAvg - firstAvg;
        
        // Higher scores = worse symptoms
        // So if secondAvg < firstAvg, symptoms are improving
        if (diff < -1) return 'improving';
        if (diff > 1) return 'worsening';
        return 'stable';
    },
    
    /**
     * Get data formatted for 7-day chart
     * @returns {Object} Chart data with labels and datasets
     */
    getChartData() {
        const entries = this.getLast7Days();
        
        // Generate labels for last 7 days
        const labels = [];
        const tremorData = [];
        const voiceData = [];
        
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            
            labels.push(Utils.formatDate(date));
            
            // Find entry for this day
            const entry = entries.find(e => e.date.split('T')[0] === dateStr);
            
            tremorData.push(entry?.tremor_score ?? null);
            voiceData.push(entry?.voice_score ?? null);
        }
        
        return { labels, tremorData, voiceData };
    },
    
    /**
     * Clear all data (for testing/reset)
     */
    clearAll() {
        localStorage.removeItem(this.STORAGE_KEY);
        this.init();
    },
    
    /**
     * Generate demo data for demonstration purposes
     * Creates 7 days of realistic historical data
     */
    generateDemoData() {
        console.log('Generating demo data...');
        
        // Realistic scores showing variation and patterns
        const tremorScores = [4.2, 3.1, 5.8, 4.5, 2.9, 6.3, 3.7];
        const voiceScores = [3.8, 2.9, 5.2, 4.1, 3.2, 5.9, 3.5];
        
        const demoEntries = [];
        
        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() - (6 - i)); // Go back 6 days, then forward
            date.setHours(10 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0);
            
            const tremorScore = tremorScores[i];
            const voiceScore = voiceScores[i];
            
            // Calculate severity based on score
            const getSeverity = (score) => {
                if (score < 3) return 'Low';
                if (score <= 7) return 'Medium';
                return 'High';
            };
            
            const entry = {
                id: Utils.generateId(),
                date: date.toISOString(),
                tremor_score: tremorScore,
                tremor_severity: getSeverity(tremorScore),
                tremor_raw_data: [], // Empty for demo data
                voice_score: voiceScore,
                voice_duration: 4.0 + Math.random() * 2, // 4-6 seconds
                voice_pauses: Math.floor(Math.random() * 3), // 0-2 pauses
                voice_variance: 0.03 + Math.random() * 0.05, // 0.03-0.08
                notes: ''
            };
            
            demoEntries.push(entry);
        }
        
        // Save to localStorage
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(demoEntries));
            console.log('Demo data generated successfully:', demoEntries);
            Utils.showToast('Demo data generated! Reloading...', 'success');
            
            // Reload page after short delay
            setTimeout(() => {
                window.location.reload();
            }, 1000);
            
            return true;
        } catch (error) {
            console.error('Error generating demo data:', error);
            Utils.showToast('Failed to generate demo data', 'error');
            return false;
        }
    }
};

// Make Storage available globally
window.Storage = Storage;
