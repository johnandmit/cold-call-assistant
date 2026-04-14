/**
 * Convert a WebM audio blob to WAV.
 * This guarantees proper duration headers so the audio is seekable in all players.
 */
export async function convertToMp3(webmBlob: Blob): Promise<Blob> {
  const arrayBuffer = await webmBlob.arrayBuffer();
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const sampleRate = audioBuffer.sampleRate;

  // Get audio data as Float32Array, downmix to mono if needed
  let samples: Float32Array;
  if (audioBuffer.numberOfChannels === 1) {
    samples = audioBuffer.getChannelData(0);
  } else {
    // Downmix to mono
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    samples = new Float32Array(left.length);
    for (let i = 0; i < left.length; i++) {
      samples[i] = (left[i] + right[i]) / 2;
    }
  }

  // Trim initial silence (up to 30 seconds)
  const maxTrimSamples = sampleRate * 30;
  const threshold = 0.015; // Absolute amplitude threshold for silence
  const blockSizeTrim = Math.floor(sampleRate * 0.1); // Check in 100ms blocks
  let trimStartIndex = 0;

  for (let i = 0; i < Math.min(samples.length, maxTrimSamples); i += blockSizeTrim) {
    let sum = 0;
    const end = Math.min(i + blockSizeTrim, samples.length);
    for (let j = i; j < end; j++) {
      sum += Math.abs(samples[j]);
    }
    const avg = sum / (end - i);
    if (avg > threshold) {
      break; // Sound detected
    }
    trimStartIndex = end;
  }

  // Keep a 0.5s buffer before the sound actually starts to prevent harsh cut-offs
  trimStartIndex = Math.max(0, trimStartIndex - Math.floor(sampleRate * 0.5));
  
  if (trimStartIndex > 0) {
    samples = samples.subarray(trimStartIndex);
  }

  // Generate standard WAV RIFF header and payload
  const wavBuffer = encodeWav(samples, sampleRate);
  
  await audioContext.close();

  // Return a WAV blob instead of MP3 (keeping function name same for compatibility)
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // write float32 to int16
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
