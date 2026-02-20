/**
 * Vercel Serverless Function - Voice Analysis Proxy
 * Forwards audio to Render backend (Parselmouth + Whisper) for analysis
 */

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const raw = process.env.VOICE_BACKEND_URL;
    const host = (req.headers?.host || '').toLowerCase();
    const isLocalDev = host.includes('localhost') || host.includes('127.0.0.1');
    const defaultForDev = (process.env.VERCEL_ENV === 'development' || isLocalDev) ? 'http://localhost:8000' : '';
    const resolved = (raw ? String(raw).trim().replace(/^["']|["']$/g, '') : '') || defaultForDev;
    const VOICE_BACKEND_URL = resolved;
    const isSet = VOICE_BACKEND_URL.length > 0;

    if (!isSet) {
        return res.status(500).json({
            error: 'Voice backend not configured',
            message: 'VOICE_BACKEND_URL is not set for this deployment. In Vercel: Settings → Environment Variables, add VOICE_BACKEND_URL and ensure it is enabled for Preview (not just Production). Then trigger a new deployment.',
            hint: 'Preview deployments (branch/PR URLs) use a separate env scope. The variable must be checked for "Preview" when adding it.',
        });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { audio } = req.body || {};

    if (!audio || typeof audio !== 'string') {
        return res.status(400).json({
            error: 'Bad request',
            message: 'Request body must include audio (base64-encoded WAV string)',
        });
    }

    try {
        const backendUrl = VOICE_BACKEND_URL.replace(/\/$/, '') + '/analyze';
        const response = await fetch(backendUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ audio }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const status = response.status;
            const technicalMsg = data.detail || data.message || response.statusText;

            if (status === 502 || status === 503) {
                return res.status(status).json({
                    error: 'Voice backend temporarily unavailable',
                    message: 'The voice analysis service is starting up or overloaded (Render free tier may take 30–60 seconds on first request). Please wait a moment and try again.',
                    hint: technicalMsg ? `Server response: ${technicalMsg}` : undefined,
                });
            }

            return res.status(status).json({
                error: 'Voice analysis failed',
                message: technicalMsg,
            });
        }

        return res.status(200).json(data);
    } catch (error) {
        console.error('Voice analysis proxy error:', error);
        return res.status(500).json({
            error: 'Voice analysis unavailable',
            message: error.message || 'Please try again later',
        });
    }
}
