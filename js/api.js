/**
 * ParkinPal - API Integration
 * Handles calls to Manus AI via serverless proxy
 */

const API = {
    // Configuration
    config: {
        manusEndpoint: '/api/manus',
        maxPollAttempts: 30, // 30 attempts * 2 seconds = 60 seconds max
        pollInterval: 2000 // 2 seconds between polls
    },
    
    /**
     * Generate Doctor Report using Manus AI
     * @returns {Promise<string>} Generated report text
     */
    async generateDoctorReport() {
        const reportContent = document.getElementById('report-content');
        const copyBtn = document.getElementById('copy-report');
        const downloadBtn = document.getElementById('download-report');
        
        // Show loading state
        Utils.showLoading('Generating your medical report...');
        reportContent.innerHTML = '<p class="text-gray-400 italic">Analyzing your data...</p>';
        copyBtn.disabled = true;
        downloadBtn.disabled = true;
        
        // Get report data
        const reportData = Charts.getReportData();
        
        if (reportData.entries.length === 0) {
            Utils.hideLoading();
            reportContent.innerHTML = '<p class="text-gray-500">No data available. Complete some tests first to generate a report.</p>';
            return null;
        }
        
        // Build prompt
        const prompt = this.buildReportPrompt(reportData);
        
        try {
            let report = await this.callManusAI(prompt);
            
            if (!report) {
                // Use template fallback
                report = this.getTemplateFallback(reportData);
            }
            
            // Display report
            Utils.hideLoading();
            reportContent.innerHTML = this.formatReport(report);
            copyBtn.disabled = false;
            downloadBtn.disabled = false;
            
            Utils.showToast('Report generated!', 'success');
            return report;
            
        } catch (error) {
            console.error('Error generating report:', error);
            Utils.hideLoading();
            
            // Use template fallback
            const report = this.getTemplateFallback(reportData);
            reportContent.innerHTML = this.formatReport(report);
            copyBtn.disabled = false;
            downloadBtn.disabled = false;
            
            Utils.showToast('Generated basic report (AI unavailable)', 'warning');
            return report;
        }
    },
    
    /**
     * Build the prompt for medical report generation
     * @param {Object} reportData - Data from Charts.getReportData()
     * @returns {string} Prompt string
     */
    buildReportPrompt(reportData) {
        const { entries, stats } = reportData;
        
        // Calculate tremor statistics
        const tremorScores = entries.map(e => e.tremor_score).filter(v => v != null);
        const avgTremor = stats.avgTremor ?? 'N/A';
        const minTremor = tremorScores.length ? Math.min(...tremorScores).toFixed(1) : 'N/A';
        const maxTremor = tremorScores.length ? Math.max(...tremorScores).toFixed(1) : 'N/A';
        const stdDevTremor = tremorScores.length > 1 ? this.calculateStdDev(tremorScores).toFixed(2) : 'N/A';
        
        // Calculate voice statistics
        const voiceScores = entries.map(e => e.voice_score).filter(v => v != null);
        const avgVoice = stats.avgVoice ?? 'N/A';
        const minVoice = voiceScores.length ? Math.min(...voiceScores).toFixed(1) : 'N/A';
        const maxVoice = voiceScores.length ? Math.max(...voiceScores).toFixed(1) : 'N/A';
        const stdDevVoice = voiceScores.length > 1 ? this.calculateStdDev(voiceScores).toFixed(2) : 'N/A';
        
        // Calculate correlation between tremor and voice
        const correlation = this.calculateCorrelation(tremorScores, voiceScores);
        
        // Trend
        const trend = stats.trend || 'stable';
        
        // Format daily measurements
        const dailyData = entries.map((e, i) => {
            const date = new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const dayOfWeek = new Date(e.date).toLocaleDateString('en-US', { weekday: 'short' });
            const tremor = e.tremor_score != null ? `${e.tremor_score}/10` : 'N/A';
            const voice = e.voice_score != null ? `${e.voice_score}/10` : 'N/A';
            const severity = e.tremor_severity ? ` (${e.tremor_severity})` : '';
            const notes = e.notes ? ` - "${e.notes}"` : '';
            return `${dayOfWeek} ${date}: Tremor ${tremor}${severity}, Voice ${voice}${notes}`;
        }).join('\n');
        
        return `PATIENT DATA:

DAILY MEASUREMENTS (7 days):
${dailyData || 'No data recorded.'}

STATISTICS:
- Tremor: Avg ${avgTremor}/10, Range ${minTremor}-${maxTremor}, StdDev ${stdDevTremor}
- Voice: Avg ${avgVoice}/10, Range ${minVoice}-${maxVoice}, StdDev ${stdDevVoice}
- Trend: ${trend}
- Tremor-Voice Correlation: ${correlation}

YOUR TASK:
Your task is to write a clinical summary of the patient's symptoms. You write ONLY the summary you don't write anything before or after it. The summary should strictly follow the following structure:

1) 2 sentence overview of all the symptoms with average daily tremor severity (${avgTremor}/10) and average daily voice impairment (${avgVoice}/10).

2) If there are any notable outlier days (tremor or voice scores significantly above/below the average), explicitly mention them with dates. If there are not any outliers, mention that as well.

3) If voice and tremor significantly differ from each other (e.g., one is much higher/lower than the other, or correlation is ${correlation}), mention that as well.

Each of the points has to be its own explicit paragraph separated by a line.

FORMATTING: Use **double asterisks** for key terms (e.g. **Average tremor**, **Outlier days**). Use *single asterisks* for dates and clinical terms (e.g. *Jan 25*, *moderate correlation*). Make objective observations only.`;
    },
    
    /**
     * Calculate standard deviation
     * @param {number[]} values - Array of numbers
     * @returns {number} Standard deviation
     */
    calculateStdDev(values) {
        if (values.length === 0) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
        return Math.sqrt(variance);
    },
    
    /**
     * Calculate correlation between tremor and voice scores
     * @param {number[]} tremorScores - Tremor scores
     * @param {number[]} voiceScores - Voice scores
     * @returns {string} Correlation description
     */
    calculateCorrelation(tremorScores, voiceScores) {
        if (tremorScores.length < 2 || voiceScores.length < 2) return 'insufficient data';
        
        // Align arrays (use only indices where both exist)
        const paired = [];
        const minLen = Math.min(tremorScores.length, voiceScores.length);
        for (let i = 0; i < minLen; i++) {
            if (tremorScores[i] != null && voiceScores[i] != null) {
                paired.push({ tremor: tremorScores[i], voice: voiceScores[i] });
            }
        }
        
        if (paired.length < 2) return 'insufficient data';
        
        // Calculate Pearson correlation
        const n = paired.length;
        const tremorMean = paired.reduce((sum, p) => sum + p.tremor, 0) / n;
        const voiceMean = paired.reduce((sum, p) => sum + p.voice, 0) / n;
        
        let numerator = 0;
        let tremorSumSq = 0;
        let voiceSumSq = 0;
        
        for (const p of paired) {
            const tremorDiff = p.tremor - tremorMean;
            const voiceDiff = p.voice - voiceMean;
            numerator += tremorDiff * voiceDiff;
            tremorSumSq += tremorDiff * tremorDiff;
            voiceSumSq += voiceDiff * voiceDiff;
        }
        
        const denominator = Math.sqrt(tremorSumSq * voiceSumSq);
        const r = denominator === 0 ? 0 : numerator / denominator;
        
        // Describe correlation
        const absR = Math.abs(r);
        if (absR > 0.7) return `strong positive (r=${r.toFixed(2)})`;
        if (absR > 0.4) return `moderate positive (r=${r.toFixed(2)})`;
        if (absR > 0.2) return `weak positive (r=${r.toFixed(2)})`;
        return `minimal (r=${r.toFixed(2)})`;
    },
    
    /**
     * Call Manus AI API
     * @param {string} prompt - The prompt to send
     * @returns {Promise<string|null>} Response text or null on failure
     */
    async callManusAI(prompt) {
        try {
            // Create task
            const createResponse = await fetch(this.config.manusEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });
            
            if (!createResponse.ok) {
                console.error('Manus create task failed:', createResponse.status);
                return null;
            }
            
            const { task_id } = await createResponse.json();
            
            if (!task_id) {
                console.error('No task_id returned from Manus');
                return null;
            }
            
            // Poll for completion
            return await this.pollManusTask(task_id);
            
        } catch (error) {
            console.error('Manus API error:', error);
            return null;
        }
    },
    
    /**
     * Poll Manus task until completion
     * @param {string} taskId - Task ID to poll
     * @returns {Promise<string|null>} Response text or null
     */
    async pollManusTask(taskId) {
        for (let attempt = 0; attempt < this.config.maxPollAttempts; attempt++) {
            try {
                const response = await fetch(
                    `${this.config.manusEndpoint}?taskId=${taskId}`
                );
                
                if (!response.ok) {
                    console.error('Manus poll failed:', response.status);
                    return null;
                }
                
                const data = await response.json();
                
                if (data.status === 'completed') {
                    // Extract text from output
                    const output = data.output || [];
                    for (const item of output) {
                        if (item.role === 'assistant' && item.content) {
                            for (const content of item.content) {
                                if (content.type === 'output_text' && content.text) {
                                    return content.text;
                                }
                            }
                        }
                    }
                    return null;
                }
                
                if (data.status === 'failed') {
                    console.error('Manus task failed:', data.error);
                    return null;
                }
                
                // Still running, wait and try again
                await this.sleep(this.config.pollInterval);
                
            } catch (error) {
                console.error('Poll error:', error);
                return null;
            }
        }
        
        console.error('Manus polling timed out');
        return null;
    },
    
    
    /**
     * Get daily insight for a test result (2-sentence summary)
     * Separated by test type: tremor or voice
     * @param {'tremor'|'voice'} type - Which test was completed
     * @param {number|null} tremorScore - Tremor score (0-10), for tremor insights
     * @param {number|null} voiceScore - Voice score (0-10), for voice insights
     * @param {Object|null} voiceMetrics - Full voice metrics for Manus to interpret (vot, transitions, fatigue, vowels, steadiness)
     * @returns {Promise<string>} Insight text
     */
    async getDailyInsight(type, tremorScore, voiceScore, voiceMetrics = null) {
        let prompt;
        if (type === 'tremor') {
            prompt = `Based on today's Parkinson's tremor test: score ${tremorScore ?? 'N/A'}/10 (0-2 minimal, 3-5 moderate, 6-10 severe). Write exactly 2 sentences: (1) a brief summary of how the tremor levels look today, (2) one practical tip or encouragement for tremor management. Be warm and supportive. Output ONLY the 2 sentences, nothing else.`;
        } else {
            if (voiceMetrics && (voiceMetrics.vot || voiceMetrics.transitions || voiceMetrics.fatigue || voiceMetrics.vowels || voiceMetrics.steadiness)) {
                const m = voiceMetrics;
                const sev = (s) => (s != null && !isNaN(s)) ? s.toFixed(1) : '-';
                const votStr = m.vot ? `- Voice onset: ${sev(m.vot.severity)}${m.vot.avgVotMs != null ? ` (${m.vot.avgVotMs}ms)` : ''}` : '';
                const transStr = m.transitions ? `- Word transitions: ${sev(m.transitions.severity)}` : '';
                const fatigueStr = m.fatigue ? `- Vocal fatigue: ${sev(m.fatigue.severity)}${m.fatigue.fatigueRatio != null ? ` (energy ratio: ${m.fatigue.fatigueRatio})` : ''}` : '';
                const vowelStr = m.vowels ? `- Vowel clarity: ${sev(m.vowels.severity)}${m.vowels.hnrDb != null ? ` (${m.vowels.hnrDb} dB HNR)` : ''}` : '';
                const steadyStr = m.steadiness ? `- Volume steadiness: ${sev(m.steadiness.severity)}` : '';
                const metricsBlock = [votStr, transStr, fatigueStr, vowelStr, steadyStr].filter(Boolean).join('\n');
                prompt = `Based on today's Parkinson's voice test:
- Overall score: ${voiceScore ?? 'N/A'}/10 (0-2 minimal, 3-5 moderate, 6-10 severe)
- Per-metric severity 0-2 (0=perfect, 2=bad):
${metricsBlock}

Write exactly 2 sentences: (1) a brief summary interpreting these voice metrics for a Parkinson's patient, (2) one practical tip. Be warm and supportive. Output ONLY the 2 sentences, nothing else.`;
            } else {
                prompt = `Based on today's Parkinson's voice test: score ${voiceScore ?? 'N/A'}/10 (0-2 minimal, 3-5 moderate, 6-10 severe). Write exactly 2 sentences: (1) a brief summary of how the voice/speech looks today, (2) one practical tip or encouragement for voice/speech. Be warm and supportive. Output ONLY the 2 sentences, nothing else.`;
            }
        }
        
        try {
            const insight = await this.callManusAI(prompt);
            if (insight) {
                return insight;
            }
        } catch (error) {
            console.error('Daily insight error:', error);
        }
        
        // Fallback insight when AI unavailable
        return this.getInsightFallback(type, tremorScore, voiceScore);
    },
    
    /**
     * Get fallback insight when API is unavailable
     * @param {'tremor'|'voice'} type - Which test was completed
     * @param {number|null} tremorScore - Tremor score
     * @param {number|null} voiceScore - Voice score
     * @returns {string} Insight text
     */
    getInsightFallback(type, tremorScore, voiceScore) {
        if (type === 'tremor') {
            const score = tremorScore ?? 5;
            if (score <= 3) {
                return "Great job! Your tremor levels look good today. Keep up with your regular activities and stay hydrated.";
            } else if (score <= 6) {
                return "Thanks for tracking today. Consider some gentle stretching and take breaks during tasks requiring fine motor control.";
            } else {
                return "We captured important tremor data today. Try relaxation techniques and ensure you're following your medication schedule.";
            }
        } else {
            const score = voiceScore ?? 5;
            if (score <= 3) {
                return "Excellent voice control today! Keep practicing speaking clearly and maintaining good posture while talking.";
            } else if (score <= 6) {
                return "Good effort. Try vocal warm-up exercises like humming or reading aloud slowly. Stay hydrated for better voice quality.";
            } else {
                return "Your voice data helps your doctor see patterns. Consider speech therapy exercises and remember to speak slowly and deliberately.";
            }
        }
    },
    
    /**
     * Get template fallback report when AI is unavailable
     * @param {Object} reportData - Report data
     * @returns {string} Template report
     */
    getTemplateFallback(reportData) {
        const { entries, stats } = reportData;
        
        const tremorSummary = stats.avgTremor !== null
            ? `Average tremor score: ${stats.avgTremor}/10`
            : 'Tremor data not recorded';
        
        const voiceSummary = stats.avgVoice !== null
            ? `Average voice score: ${stats.avgVoice}/10`
            : 'Voice data not recorded';
        
        const trendText = {
            improving: 'showing improvement over the week',
            stable: 'remaining stable',
            worsening: 'showing some increase in symptom severity'
        }[stats.trend] || 'stable';
        
        return `ParkinPal Weekly Symptom Summary

Tracking Period: Last 7 days (${entries.length} entries recorded)

${tremorSummary}
${voiceSummary}
Overall trend: Symptoms are ${trendText}.

Discussion Points for Your Doctor:
1. Review the pattern of scores over the past week
2. Discuss any correlation between symptom changes and daily activities
3. Consider whether medication timing adjustments might be beneficial

Note: This summary is generated from self-tracked data using a mobile app. Scores are on a 0-10 scale where higher values indicate more pronounced symptoms. This is intended to supplement, not replace, clinical assessment.`;
    },
    
    /**
     * Format report text for display (markdown-style bold/italic to HTML)
     * @param {string} text - Raw report text (may contain **bold** and *italic*)
     * @returns {string} HTML formatted report
     */
    formatReport(text) {
        if (!text || !text.trim()) return '<p class="text-gray-500">No report content.</p>';
        
        // Escape HTML to prevent XSS, then convert markdown-style formatting
        const escapeHtml = (str) => str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        
        let html = escapeHtml(text);
        
        // Convert **bold** to <strong> (greedy, non-overlapping)
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        // Convert *italic* to <em> (single asterisks not part of **)
        html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
        
        // Convert line breaks to paragraphs and <br>
        const paragraphs = html.split(/\n\n+/)
            .filter(p => p.trim())
            .map(p => `<p class="report-p">${p.trim().replace(/\n/g, '<br>')}</p>`)
            .join('');
        
        return paragraphs || `<p class="report-p">${html}</p>`;
    },
    
    /**
     * Sleep helper
     * @param {number} ms - Milliseconds to sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// Make API available globally
window.API = API;
