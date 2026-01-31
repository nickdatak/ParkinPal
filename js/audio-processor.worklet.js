/**
 * ParkinPal - AudioWorklet Processor for Voice Analysis
 * Calculates RMS amplitude in real-time on the audio thread
 */

class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.sampleCount = 0;
        this.bufferSize = 4096; // Match original buffer size for consistency
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        
        // Check if we have input data
        if (!input || !input[0] || input[0].length === 0) {
            return true;
        }

        const channelData = input[0];
        
        // Calculate RMS (Root Mean Square) amplitude
        let sum = 0;
        for (let i = 0; i < channelData.length; i++) {
            sum += channelData[i] * channelData[i];
        }
        const rms = Math.sqrt(sum / channelData.length);

        // Send amplitude data to main thread
        this.port.postMessage({
            type: 'amplitude',
            amplitude: rms,
            timestamp: currentTime * 1000 // Convert to milliseconds
        });

        // Also send raw audio data for buffer storage
        this.port.postMessage({
            type: 'audioData',
            audioData: Array.from(channelData)
        });

        return true; // Keep processor alive
    }
}

registerProcessor('audio-processor', AudioProcessor);
