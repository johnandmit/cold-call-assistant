// @ts-nocheck
import lamejs from 'lamejs';

/**
 * Convert a WebM audio blob to MP3 using lamejs.
 * Uses the Web Audio API to decode the WebM, then encodes to MP3.
 */
export async function convertToMp3(webmBlob: Blob): Promise<Blob> {
  const arrayBuffer = await webmBlob.arrayBuffer();
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const numChannels = 1; // mono for voice
  const sampleRate = audioBuffer.sampleRate;
  const kbps = 128;

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

  // Convert float32 samples to int16
  const int16Samples = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16Samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  // Encode with lamejs
  const mp3Encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);
  const mp3Data: Int8Array[] = [];
  const blockSize = 1152;

  for (let i = 0; i < int16Samples.length; i += blockSize) {
    const chunk = int16Samples.subarray(i, i + blockSize);
    const mp3buf = mp3Encoder.encodeBuffer(chunk);
    if (mp3buf.length > 0) {
      mp3Data.push(new Int8Array(mp3buf));
    }
  }

  const end = mp3Encoder.flush();
  if (end.length > 0) {
    mp3Data.push(new Int8Array(end));
  }

  await audioContext.close();

  return new Blob(mp3Data, { type: 'audio/mpeg' });
}
