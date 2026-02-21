# ParkinPal

**ParkinPal** is a mobile-first web app for people with Parkinson’s to track tremor and voice symptoms, view trends, and generate AI summaries for doctor visits. All data stays on the device except when generating reports or daily insights.

**Live app:** [https://parkin-pal.vercel.app](https://parkin-pal.vercel.app) — the best way to use ParkinPal is to open this link on your phone or tablet (HTTPS is required for the tremor test on iOS).

---

## Features

### Tremor Test
- Uses the **DeviceMotion API** (accelerometer) to measure hand tremor
- **30-second** test with live magnitude chart
- Detects tremor in the 4–6 Hz range (typical of Parkinson’s)
- Produces a **tremor score (0–10)** and severity (Low / Medium / High)
- Requires **HTTPS** and a **user gesture** on iOS Safari for permission

### Voice Test
- Uses the **Web Audio API** and an **AudioWorklet** (or ScriptProcessor fallback) for recording
- **Web Speech API** for live transcript and word count
- **7-second** recording after a short countdown; user reads: *“The quick brown fox jumps over the lazy dog”*
- Analyzes: speaking time, pauses between speech segments (silence ≥ 0.3 s; leading/trailing silence excluded), volume variance
- Produces a **voice score (0–10)**
- If fewer than **7 of 9** target words are recognized, the app prompts to retake the test
- **Retake Test** button in case user wants to redo the test, after viewing results
- Playback of the recording and optional save

### Data & Trends
- **LocalStorage** for all entries (tremor/voice scores, severity, metadata)
- **7-day** history with a Chart.js line chart (tremor and voice over time)
- Weekly averages, trend (improving / stable / worsening), and recent history list
- **Analyse Data** screen: chart, averages, and “Generate Doctor Report”

### AI – Doctor Report
- **Manus AI** (via Vercel serverless proxy) generates a short clinical summary
- Uses last 7 days of data: daily scores, averages, ranges, std dev, trend, tremor–voice correlation
- Structured summary: overview, outlier days, tremor–voice relationship
- Copy to clipboard and download as `.txt`
- If Manus is unavailable, a template fallback is shown

### AI – Daily Insights
- After saving **tremor** or **voice** results, a **2-sentence** Manus insight is shown
- **Tremor**: insight and tip based only on tremor score
- **Voice**: insight and tip based only on voice score
- Scripted fallback if the API is unavailable

### UI/UX
- Welcome screen: name input, then main “Hey, [name]” greeting with typewriter effect
- **Montserrat** for body text, **Montserrat Alternates** for headings
- Accent palette: teal/blue grays (`#ADBABD`, `#91B7C7`, `#6EB4D1`, `#6CBEED`)
- Mobile-first layout; “Analyse Data” only after name is set
- Headers and back buttons; no sticky header

---

## Tech Stack

| Layer | Technology |
|--------|------------|
| **Markup / app shell** | Single-page HTML5, semantic sections |
| **Styling** | Tailwind CSS (CDN), custom `css/styles.css` |
| **Fonts** | Google Fonts: Montserrat, Montserrat Alternates |
| **Charts** | Chart.js (CDN) – trends chart, tremor live chart |
| **Logic** | Vanilla JavaScript (ES6+), no framework |
| **Browser APIs** | DeviceMotion (tremor), Web Audio (voice), MediaDevices (mic), SpeechRecognition (optional) |
| **Audio processing** | AudioWorklet (`audio-processor.worklet.js`) with ScriptProcessor fallback |
| **Storage** | LocalStorage only; quota handling in `storage.js` |
| **AI** | Manus AI only (doctor report + daily insights) |
| **Backend** | Vercel serverless: `api/manus.js` proxies Manus (POST create task, GET poll) |
| **Hosting** | Vercel (static + serverless functions) |
| **Node** | 20.x (`.nvmrc`, `package.json` engines) for local tooling / Vercel |

### Main files

- **`index.html`** – Structure, Tailwind config, script order
- **`css/styles.css`** – Overrides, spinner, toasts, report styling, typewriter
- **`js/main.js`** – Init, routing, section visibility, report actions
- **`js/utils.js`** – showSection, toasts, loading, formatDate, std dev, clamp, etc.
- **`js/storage.js`** – CRUD, 7-day data, chart data, stats, demo data generator
- **`js/tremor-logic.js`** – DeviceMotion, high-pass filter, tremor detection, scoring
- **`js/tremor-ui.js`** – Tremor test UI, chart, countdown, save, insight
- **`js/voice-logic.js`** – Web Audio, SpeechRecognition, segment/pause detection, scoring
- **`js/voice-ui.js`** – Voice test UI, soundwave, transcript, save, insight
- **`js/audio-processor.worklet.js`** – RMS amplitude in AudioWorklet
- **`js/charts.js`** – Trends chart, history list, report data for API
- **`js/api.js`** – Manus: doctor report (build prompt, call, poll), daily insight (tremor/voice)
- **`api/manus.js`** – Vercel function: POST → create task, GET → poll by `taskId`

---

## How to run the project

**Best way:** Use the live app at [https://parkin-pal.vercel.app](https://parkin-pal.vercel.app) (HTTPS is required for the tremor test on iOS).

**Local development** (optional; e.g. to work on the code):
- **Node.js 20.x** and `npm start` from the project root (runs `npx serve .` at http://localhost:3000).
- **Tremor test** on a real device needs HTTPS; for local testing you can use ngrok/mkcert or the deployed link.

---

## Deployment (Vercel)

1. **Install Vercel CLI** (optional):
   ```bash
   npm i -g vercel
   ```

2. **Deploy** from the project root:
   ```bash
   vercel
   ```
   Or connect the repo in the Vercel dashboard and deploy from there.

3. **Environment variable** (Vercel project → Settings → Environment Variables):
   - **`MANUS_API_KEY`** – Your Manus AI API key (needed for doctor report and daily insights)

4. **Node version**: The project uses Node 20 (`.nvmrc` and `package.json` engines). Vercel will use this for serverless functions.

---

## API key (Manus)

1. Sign up at [manus.im](https://manus.im)
2. Go to **Settings → Integrations → API**
3. Create an API key and set it as **`MANUS_API_KEY`** in Vercel (or in `.env` for local serverless testing)

---

## Project structure

```
ParkinPal/
├── index.html              # Single-page app shell and config
├── css/
│   └── styles.css          # Custom styles and animations
├── js/
│   ├── main.js             # App init, routing, report actions
│   ├── utils.js            # Shared utilities
│   ├── storage.js          # LocalStorage and demo data
│   ├── tremor-logic.js     # Tremor analysis
│   ├── tremor-ui.js        # Tremor test UI
│   ├── voice-logic.js      # Voice analysis
│   ├── voice-ui.js         # Voice test UI
│   ├── audio-processor.worklet.js  # AudioWorklet RMS
│   ├── charts.js           # Trends chart and report data
│   └── api.js              # Manus: report + daily insight
├── api/
│   └── manus.js            # Vercel serverless Manus proxy
├── assets/
│   ├── tremor-icon.png
│   └── voice-icon.png
├── package.json
├── vercel.json
├── .nvmrc
└── README.md
```

---

## Security and privacy

- **API key**: Only stored in Vercel env; all Manus requests go through `api/manus.js`.
- **Data**: Symptom data lives only in the browser’s LocalStorage; no backend database.
- **AI**: Only aggregated scores and stats are sent in prompts (no raw audio or motion streams).

---

## Browser support

- **iOS Safari 13+** (primary; required for DeviceMotion on iPhone/iPad)
- Chrome, Firefox, Edge (Android)
- Microphone and (on iOS) motion permissions must be granted by the user.

---

## Limitations

- **DeviceMotion** is not available on all devices and requires HTTPS + user gesture on iOS.
- **Speech recognition** is browser-dependent; word count and “retake” prompt only when supported.
- **LocalStorage** is limited (e.g. 5MB); the app includes basic quota handling.
- **AI** features (report and daily insights) require internet and a valid Manus API key.

---

## License

MIT. See the LICENSE file for details.
