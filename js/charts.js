/**
 * ParkinPal - Charts and History Management
 */

const Charts = {
    // Chart instance
    trendsChart: null,
    
    /**
     * Initialize charts module
     */
    init() {
        // Initialize trends chart when first viewed
        this.initTrendsChart();
    },
    
    /**
     * Initialize the 7-day trends chart
     */
    initTrendsChart() {
        const canvas = document.getElementById('trends-chart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        this.trendsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Tremor Score',
                        data: [],
                        borderColor: '#3B82F6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 3,
                        fill: false,
                        tension: 0.3,
                        pointRadius: 6,
                        pointBackgroundColor: '#3B82F6',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        spanGaps: true
                    },
                    {
                        label: 'Voice Score',
                        data: [],
                        borderColor: '#10B981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderWidth: 3,
                        fill: false,
                        tension: 0.3,
                        pointRadius: 6,
                        pointBackgroundColor: '#10B981',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        spanGaps: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                scales: {
                    x: {
                        display: true,
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: { size: 10 }
                        }
                    },
                    y: {
                        display: true,
                        min: 0,
                        max: 10,
                        ticks: {
                            stepSize: 2,
                            font: { size: 10 }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            padding: 20,
                            font: { size: 12 }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'white',
                        titleColor: '#1F2937',
                        bodyColor: '#4B5563',
                        borderColor: '#E5E7EB',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                const value = context.parsed.y;
                                if (value === null) return `${context.dataset.label}: No data`;
                                return `${context.dataset.label}: ${value.toFixed(1)}`;
                            }
                        }
                    }
                }
            }
        });
    },
    
    /**
     * Update trends chart with latest data
     */
    updateTrendsChart() {
        if (!this.trendsChart) {
            this.initTrendsChart();
        }
        
        const chartData = Storage.getChartData();
        const stats = Storage.getWeeklyStats();
        
        // Update chart data
        this.trendsChart.data.labels = chartData.labels;
        this.trendsChart.data.datasets[0].data = chartData.tremorData;
        this.trendsChart.data.datasets[1].data = chartData.voiceData;
        this.trendsChart.update();
        
        // Update summary stats
        this.updateSummaryStats(stats);
    },
    
    /**
     * Update summary statistics display
     * @param {Object} stats - Weekly statistics
     */
    updateSummaryStats(stats) {
        const avgTremorEl = document.getElementById('avg-tremor');
        const avgVoiceEl = document.getElementById('avg-voice');
        const trendEl = document.getElementById('trend-direction');
        
        // Update averages
        avgTremorEl.textContent = stats.avgTremor !== null ? stats.avgTremor : '-';
        avgVoiceEl.textContent = stats.avgVoice !== null ? stats.avgVoice : '-';
        
        // Update trend with icon and color
        const trendIcons = {
            improving: '↓ Improving',
            stable: '→ Stable',
            worsening: '↑ Worsening'
        };
        
        const trendColors = {
            improving: 'text-green-600',
            stable: 'text-gray-600',
            worsening: 'text-red-600'
        };
        
        trendEl.textContent = trendIcons[stats.trend] || '→ Stable';
        trendEl.className = `text-lg font-semibold ${trendColors[stats.trend] || 'text-gray-600'}`;
    },
    
    /**
     * Update history list
     */
    updateHistoryList() {
        const listContainer = document.getElementById('history-list');
        const emptyState = document.getElementById('history-empty');
        
        const entries = Storage.getEntries(7);
        
        if (entries.length === 0) {
            listContainer.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }
        
        emptyState.classList.add('hidden');
        
        // Build history HTML
        listContainer.innerHTML = entries.map(entry => this.createHistoryItem(entry)).join('');
        
        // Add click handlers
        listContainer.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                const entryId = item.dataset.entryId;
                this.showEntryDetail(entryId);
            });
        });
    },
    
    /**
     * Create HTML for a history item
     * @param {Object} entry - Entry data
     * @returns {string} HTML string
     */
    createHistoryItem(entry) {
        const date = Utils.formatDateTime(entry.date);
        const tremorScore = entry.tremor_score !== null ? entry.tremor_score.toFixed(1) : '-';
        const voiceScore = entry.voice_score !== null ? entry.voice_score.toFixed(1) : '-';
        
        // Determine overall severity
        let severity = 'Low';
        if (entry.tremor_severity) {
            severity = entry.tremor_severity;
        } else if (entry.tremor_score !== null) {
            severity = Utils.getSeverity(entry.tremor_score);
        } else if (entry.voice_score !== null) {
            severity = Utils.getSeverity(entry.voice_score);
        }
        
        const severityClass = Utils.getSeverityClass(severity);
        
        return `
            <div class="history-item" data-entry-id="${entry.id}">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="font-medium text-gray-800">${date}</div>
                        <div class="flex gap-4 mt-1 text-sm text-gray-500">
                            <span class="flex items-center gap-1">
                                <span class="w-2 h-2 rounded-full bg-blue-500"></span>
                                Tremor: ${tremorScore}
                            </span>
                            <span class="flex items-center gap-1">
                                <span class="w-2 h-2 rounded-full bg-green-500"></span>
                                Voice: ${voiceScore}
                            </span>
                        </div>
                    </div>
                    <span class="severity-badge ${severityClass}">${severity}</span>
                </div>
            </div>
        `;
    },
    
    /**
     * Show entry detail (could expand to modal in future)
     * @param {string} entryId - Entry ID
     */
    showEntryDetail(entryId) {
        const entry = Storage.getEntryById(entryId);
        if (!entry) return;
        
        // For now, just show a toast with summary
        const tremorInfo = entry.tremor_score !== null 
            ? `Tremor: ${entry.tremor_score.toFixed(1)} (${entry.tremor_severity || Utils.getSeverity(entry.tremor_score)})` 
            : 'No tremor data';
        
        const voiceInfo = entry.voice_score !== null
            ? `Voice: ${entry.voice_score.toFixed(1)}${entry.voice_duration != null ? `, ${entry.voice_duration}s` : ''}`
            : 'No voice data';
        
        Utils.showToast(`${tremorInfo}\n${voiceInfo}`, 'info', 4000);
    },
    
    /**
     * Get data formatted for report generation
     * @returns {Object} Report data
     */
    getReportData() {
        const entries = Storage.getLast7Days();
        const stats = Storage.getWeeklyStats();
        
        return {
            entries: entries.map(e => ({
                date: e.date.split('T')[0],
                tremor_score: e.tremor_score,
                voice_score: e.voice_score,
                voice_duration: e.voice_duration,
                voice_vot: e.voice_vot,
                voice_transition_stability: e.voice_transition_stability,
                voice_prosodic_decay: e.voice_prosodic_decay,
                voice_vowel_space: e.voice_vowel_space,
                voice_amplitude_jitter: e.voice_amplitude_jitter,
                tremor_severity: e.tremor_severity
            })),
            stats: {
                avgTremor: stats.avgTremor,
                avgVoice: stats.avgVoice,
                trend: stats.trend,
                entryCount: stats.entryCount
            }
        };
    }
};

// Make Charts available globally
window.Charts = Charts;
