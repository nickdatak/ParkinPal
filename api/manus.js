/**
 * Vercel Serverless Function - Manus AI API Proxy
 * 
 * This function proxies requests to the Manus AI API, keeping the API key secure.
 * Supports both creating tasks and polling for results.
 */

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const MANUS_API_KEY = process.env.MANUS_API_KEY;

    if (!MANUS_API_KEY) {
        return res.status(500).json({ 
            error: 'API key not configured',
            message: 'Please set MANUS_API_KEY environment variable'
        });
    }

    try {
        // POST: Create a new task
        if (req.method === 'POST') {
            const { prompt } = req.body;

            if (!prompt) {
                return res.status(400).json({ error: 'Prompt is required' });
            }

            const response = await fetch('https://api.manus.ai/v1/tasks', {
                method: 'POST',
                headers: {
                    'API_KEY': MANUS_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: prompt,
                    agentProfile: 'manus-1.6-lite' // Using lite for faster responses
                })
            });

            if (!response.ok) {
                const error = await response.text();
                console.error('Manus API error:', error);
                return res.status(response.status).json({ 
                    error: 'Manus API error', 
                    details: error 
                });
            }

            const data = await response.json();
            return res.status(200).json(data);
        }

        // GET: Poll task status
        if (req.method === 'GET') {
            const { taskId } = req.query;

            if (!taskId) {
                return res.status(400).json({ error: 'Task ID is required' });
            }

            const response = await fetch(`https://api.manus.ai/v1/tasks/${taskId}`, {
                method: 'GET',
                headers: {
                    'API_KEY': MANUS_API_KEY
                }
            });

            if (!response.ok) {
                const error = await response.text();
                console.error('Manus API error:', error);
                return res.status(response.status).json({ 
                    error: 'Manus API error', 
                    details: error 
                });
            }

            const data = await response.json();
            return res.status(200).json(data);
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ 
            error: 'Server error', 
            message: error.message 
        });
    }
}
