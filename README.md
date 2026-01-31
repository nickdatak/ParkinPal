# ParkinPal - Parkinson's Symptom Tracker

A mobile-first web app for tracking Parkinson's symptoms through tremor detection (accelerometer) and voice analysis, with AI-powered medical summaries for doctor visits.

## Features

### Tremor Test
- Uses iOS DeviceMotion API to detect hand tremor
- 30-second test with real-time visualization
- Detects 4-6 Hz tremor oscillations (characteristic of Parkinson's)
- Calculates tremor score (0-10) and severity (Low/Medium/High)

### Voice Test
- Uses Web Audio API for voice analysis
- Records 10 seconds of speech while reading a standard phrase
- Analyzes: speaking duration, pause count, volume variance, speaking rate
- Calculates voice score (0-10)
- Includes audio playback feature

### Data Tracking
- LocalStorage-based persistence
- 7-day history with trend visualization
- Chart.js multi-line chart showing tremor and voice scores
- Weekly averages and trend direction (improving/stable/worsening)

### AI Medical Reports
- "Generate Doctor Report" feature
- Uses Manus AI
- 150-word medical summary covering:
  - Overall trend assessment
  - Key patterns identified
  - Medication effectiveness indicators
  - Discussion points for doctor visits
- Copy to clipboard and download as text file

### Daily Insights
- AI-generated encouragement after each test
- Practical tips based on test results

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS
- **Styling**: Tailwind CSS (CDN)
- **Charts**: Chart.js (CDN)
- **APIs**: DeviceMotion API, Web Audio API
- **AI**: Manus AI
- **Storage**: LocalStorage
- **Deployment**: Vercel (with serverless functions)

## Setup

### Local Development

1. Clone the repository
2. Serve the files with any local HTTP server (for HTTPS, use a tool like `mkcert` for local certificates)

```bash
# Using Python
python -m http.server 8000

# Using Node.js (npx)
npx serve .
```

Note: DeviceMotion API requires HTTPS on iOS Safari. For local testing on mobile, you'll need to set up HTTPS or use Vercel deployment.

### Vercel Deployment

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

3. Set environment variables in Vercel dashboard:
   - `MANUS_API_KEY` - Your Manus AI API key

### API Keys

#### Manus AI
1. Sign up at [manus.im](https://manus.im)
2. Go to Settings > Integrations > API
3. Generate an API key

## Project Structure

```
ParkinPal/
├── index.html          # Main HTML file
├── css/
│   └── styles.css      # Custom styles
├── js/
│   ├── main.js         # App initialization and routing
│   ├── utils.js        # Utility functions
│   ├── storage.js      # LocalStorage operations
│   ├── tremor-logic.js # DeviceMotion analysis
│   ├── tremor-ui.js    # Tremor test interface
│   ├── voice-logic.js  # Web Audio analysis
│   ├── voice-ui.js     # Voice test interface
│   ├── charts.js       # Chart.js configuration
│   └── api.js          # API integration
├── api/                # Vercel serverless functions
│   └── manus.js        # Manus AI proxy
├── vercel.json         # Vercel configuration
└── README.md
```

## iOS Safari Requirements

The tremor test uses the DeviceMotion API which has specific requirements on iOS Safari:

1. **HTTPS Required**: The app must be served over HTTPS
2. **User Gesture Required**: `DeviceMotionEvent.requestPermission()` must be called from a user interaction (button click)
3. **Permission Prompt**: Users will see a browser permission dialog for motion sensor access

## Security Notes

- API keys are stored as environment variables on Vercel
- Serverless functions proxy all AI API calls
- No sensitive data is transmitted to client-side code
- All data is stored locally in the browser's LocalStorage

## Privacy

- All symptom data is stored locally on the user's device
- No data is sent to external servers except for AI report generation
- AI prompts contain only aggregated scores, not personal information

## Browser Support

- iOS Safari 13+ (primary target)
- Chrome (Android/Desktop)
- Firefox
- Edge

## Limitations

- DeviceMotion API is not available on all devices
- Web Audio API requires user permission for microphone access
- LocalStorage has a 5MB limit (quota management is implemented)
- AI report generation requires internet connection

## License

MIT License - See LICENSE file for details
