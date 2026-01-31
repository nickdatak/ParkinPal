/**
 * ParkinPal - API Integration
 * Handles calls to Manus AI and Gemini APIs via serverless proxy
 */

const API = {
    // Configuration
    config: {
        manusEndpoint: '/api/manus',
        geminiEndpoint: '/api/gemini',
        maxPollAttempts: 30, // 30 attempts * 2 seconds = 60 seconds max
        pollInterval: 2000 // 2 seconds between polls
    },
    
    /**
     * Generate Doctor Report using Manus AI (with Gemini fallback)
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
            // Try Manus AI first
            let report = await this.callManusAI(prompt);
            
            if (!report) {
                // Fallback to Gemini
                console.log('Falling back to Gemini...');
                Utils.showLoading('Trying alternative AI...');
                report = await this.callGeminiAI(prompt);
            }
            
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
        
        const tremorScores = entries.map(e => e.tremor_score).filter(v => v != null);
        const voiceScores = entries.map(e => e.voice_score).filter(v => v != null);
        const tremorMin = tremorScores.length ? Math.min(...tremorScores).toFixed(1) : 'N/A';
        const tremorMax = tremorScores.length ? Math.max(...tremorScores).toFixed(1) : 'N/A';
        const voiceMin = voiceScores.length ? Math.min(...voiceScores).toFixed(1) : 'N/A';
        const voiceMax = voiceScores.length ? Math.max(...voiceScores).toFixed(1) : 'N/A';
        
        const tremorRange = tremorScores.length ? Math.max(...tremorScores) - Math.min(...tremorScores) : 0;
        const voiceRange = voiceScores.length ? Math.max(...voiceScores) - Math.min(...voiceScores) : 0;
        const maxRange = Math.max(tremorRange, voiceRange);
        const variability = maxRange > 3 ? 'high' : maxRange > 1.5 ? 'moderate' : 'low';
        
        const dataLines = entries.map((e, i) => {
            const d = new Date(e.date);
            const shortDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const tremor = e.tremor_score != null ? `${e.tremor_score}/10` : 'N/A';
            const voice = e.voice_score != null ? `${e.voice_score}/10` : 'N/A';
            return `Day ${i + 1} (${shortDate}): Tremor ${tremor}, Voice ${voice}`;
        }).join('\n');
        
        return `You are a medical AI assistant helping Parkinson's patients communicate symptom patterns to their neurologists.

PATIENT SYMPTOM DATA (Last 7 Days):
${dataLines || 'No data recorded.'}

SUMMARY METRICS:
- Tremor: Average ${stats.avgTremor ?? 'N/A'}, Range ${tremorMin}-${tremorMax}, Trend ${stats.trend}
- Voice: Average ${stats.avgVoice ?? 'N/A'}, Range ${voiceMin}-${voiceMax}, Trend ${stats.trend}
- Variability: ${variability}

CONTEXT:
- Scores measured via smartphone accelerometer (tremor) and voice analysis
- Scale: 0-2 = minimal, 3-5 = moderate, 6-10 = severe symptoms
- Patient is already diagnosed with Parkinson's; this is symptom tracking, not diagnosis

TASK:
Generate a 150-200 word medical summary for this patient's neurologist. Structure:

1. SYMPTOM OVERVIEW (2-3 sentences)
   - State average scores and overall trend
   - Note day-to-day variability level

2. PATTERN ANALYSIS (2-3 sentences)
   - Identify correlation between tremor and voice scores
   - Highlight any concerning patterns (e.g., worsening trend, high variability)
   - Note best/worst days

3. CLINICAL IMPLICATIONS (2-3 sentences)
   - What might this suggest about medication timing/effectiveness?
   - Are symptoms stable, improving, or declining?

4. DISCUSSION POINTS (3 bullet points)
   - Specific, actionable items for doctor-patient conversation
   - Focus on medication optimization, symptom management

TONE: Professional medical communication, objective and data-focused
CONSTRAINTS: 
- Do NOT diagnose conditions
- Do NOT recommend specific medications or dosage changes
- Do NOT make treatment decisions
- DO focus on observable patterns and questions to raise with doctor`;
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
     * Call Gemini AI API
     * @param {string} prompt - The prompt to send
     * @returns {Promise<string|null>} Response text or null on failure
     */
    async callGeminiAI(prompt) {
        try {
            const response = await fetch(this.config.geminiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });
            
            if (!response.ok) {
                console.error('Gemini API failed:', response.status);
                return null;
            }
            
            const data = await response.json();
            return data.text || null;
            
        } catch (error) {
            console.error('Gemini API error:', error);
            return null;
        }
    },
    
    /**
     * Get daily insight for a test result
     * @param {number|null} tremorScore - Tremor score (0-10)
     * @param {number|null} voiceScore - Voice score (0-10)
     * @returns {Promise<string>} Insight text
     */
    async getDailyInsight(tremorScore, voiceScore) {
        const prompt = `Based on today's Parkinson's symptom tracking results (tremor score: ${tremorScore ?? 'not measured'}/10, voice score: ${voiceScore ?? 'not measured'}/10), provide brief encouraging feedback and one practical tip. Keep response under 40 words. Be warm and supportive.`;
        
        try {
            // Use Gemini for quick sync response
            const response = await fetch(this.config.geminiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.text) {
                    return data.text;
                }
            }
        } catch (error) {
            console.error('Daily insight error:', error);
        }
        
        // Fallback insight
        return this.getInsightFallback(tremorScore, voiceScore);
    },
    
    /**
     * Get fallback insight when API is unavailable
     * @param {number|null} tremorScore - Tremor score
     * @param {number|null} voiceScore - Voice score
     * @returns {string} Insight text
     */
    getInsightFallback(tremorScore, voiceScore) {
        const avgScore = [tremorScore, voiceScore]
            .filter(s => s !== null)
            .reduce((a, b, _, arr) => a + b / arr.length, 0);
        
        if (avgScore <= 3) {
            return "Great results today! Your symptoms appear well-controlled. Keep up your routine and stay active.";
        } else if (avgScore <= 6) {
            return "Thanks for tracking today. Remember that consistency helps your doctor see patterns. Try some gentle stretching.";
        } else {
            return "We captured important data today. This helps your healthcare team understand your symptoms better. Rest well.";
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
     * Format report text for display
     * @param {string} text - Raw report text
     * @returns {string} HTML formatted report
     */
    formatReport(text) {
        // Convert line breaks to paragraphs
        const paragraphs = text.split('\n\n')
            .filter(p => p.trim())
            .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
            .join('');
        
        return paragraphs || `<p>${text}</p>`;
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
