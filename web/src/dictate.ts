import { api, ApiError } from './api'
import { formatHeard } from './heard'

export type Dictation = { stop: () => void; cancel: () => void }

type DictationOptions = {
  kind: 'text' | 'phone' | 'email'
  multiline: boolean
  listeningMessage: string
  onListen: (listening: boolean) => void
  onStatus: (message: string) => void
  onText: (text: string) => void
  onError: (message: string) => void
  onEnd: () => void
}

type MicHandle = { stop: () => void; cancel: () => void; hasAudio: () => boolean }

function registry() {
  const host = window as Window & { __vendorDeskMic?: { current: MicHandle | null } }
  host.__vendorDeskMic ??= { current: null }
  return host.__vendorDeskMic
}

/** Records until the speaker pauses or taps again, then asks Google for the words. */
export function startDictation(options: DictationOptions): Dictation {
  const previous = registry().current
  registry().current = null
  if (previous?.hasAudio()) previous.stop()
  else previous?.cancel()

  const context = new AudioContext({ sampleRate: 16000 })
  void context.resume()
  const pauseMs = options.multiline ? 1000 : 650
  const maxMs = options.multiline ? 12000 : 8000
  const pieces: Float32Array[] = []
  let stream: MediaStream | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let processor: ScriptProcessorNode | null = null
  let closed = false
  let drop = false
  let heard = false
  let quietFor = 0
  let peak = 0
  let noise = 0.004
  let cap = 0

  const handle: MicHandle = {
    hasAudio: () => pieces.length > 0,
    stop: () => finish(false),
    cancel: () => finish(true),
  }
  registry().current = handle
  cap = window.setTimeout(() => finish(false), 15000)

  function finish(discard: boolean) {
    if (closed) return
    const rate = context.sampleRate || 16000
    closed = true
    drop = discard
    window.clearTimeout(cap)
    if (registry().current === handle) registry().current = null
    release()
    options.onListen(false)
    if (drop) {
      options.onEnd()
      return
    }
    options.onStatus('Working out what you said…')
    void upload(rate)
  }

  function release() {
    try { processor?.disconnect() } catch { /* the node is already disconnected */ }
    try { source?.disconnect() } catch { /* the node is already disconnected */ }
    processor = null
    source = null
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    void context.close().catch(() => undefined)
  }

  async function upload(rate: number) {
    try {
      const merged = resample(merge(pieces), rate, 16000)
      const samples = usable(merged)
      if (!samples) {
        options.onError('Could not hear that. Tap the mic and speak again.')
        return
      }
      const body = new FormData()
      body.append('file', wavBlob(samples), 'speech.wav')
      body.append('kind', options.kind)
      const result = await api<{ text: string }>('/api/speech', { method: 'POST', body, signal: AbortSignal.timeout(20000) })
      if (drop) return
      const text = formatHeard(result.text ?? '', options.kind, true)
      if (text) options.onText(text)
      else options.onError('Could not hear that. Tap the mic and speak again.')
    } catch (error) {
      if (drop) return
      const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
      options.onError(timedOut ? 'Voice recognition took too long. Tap the mic and speak again.' : error instanceof ApiError ? error.message : 'Voice recognition could not hear that. Tap the mic and speak again.')
    } finally {
      if (!drop) options.onEnd()
    }
  }

  function attach(rate: number) {
    if (!stream || closed) return
    source = context.createMediaStreamSource(stream)
    processor = scriptProcessor(context)
    const mute = context.createGain()
    mute.gain.value = 0
    source.connect(processor)
    processor.connect(mute)
    mute.connect(context.destination)
    const frameMs = (processor.bufferSize / rate) * 1000
    processor.onaudioprocess = (event) => {
      if (closed) return
      const input = event.inputBuffer.getChannelData(0)
      const copy = new Float32Array(input.length)
      copy.set(input)
      pieces.push(copy)
      let sum = 0
      for (const value of copy) sum += value * value
      const level = Math.sqrt(sum / copy.length)
      const warmedUp = pieces.length * frameMs > 240
      if (!warmedUp) {
        if (level < 0.05) noise += (level - noise) * 0.35
        return
      }
      const gate = Math.max(noise * 2.3, noise + 0.01, 0.015)
      if (level >= gate) {
        heard = true
        peak = Math.max(peak, level)
        quietFor = 0
        return
      }
      if (!heard) return
      if (level <= Math.max(noise + 0.006, peak * 0.45)) {
        quietFor += frameMs
        if (quietFor >= pauseMs) finish(false)
      } else quietFor = 0
    }
  }

  void (async () => {
    try {
      await context.resume()
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1 },
      })
      if (closed) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      await context.resume()
      attach(context.sampleRate || 16000)
      options.onListen(true)
      options.onStatus(options.listeningMessage)
      window.clearTimeout(cap)
      cap = window.setTimeout(() => finish(false), maxMs)
    } catch {
      if (closed) return
      closed = true
      window.clearTimeout(cap)
      if (registry().current === handle) registry().current = null
      release()
      options.onListen(false)
      options.onError('Allow the microphone for this site, then tap the mic again.')
      options.onEnd()
    }
  })()

  return handle
}

function scriptProcessor(context: AudioContext) {
  try { return context.createScriptProcessor(2048, 1, 1) }
  catch { return context.createScriptProcessor(4096, 1, 1) }
}

function merge(pieces: Float32Array[]) {
  const length = pieces.reduce((total, piece) => total + piece.length, 0)
  const merged = new Float32Array(length)
  let offset = 0
  for (const piece of pieces) {
    merged.set(piece, offset)
    offset += piece.length
  }
  return merged
}

function resample(input: Float32Array, from: number, to: number) {
  if (input.length === 0 || from === to) return input
  const length = Math.max(1, Math.round(input.length * to / from))
  const output = new Float32Array(length)
  const scale = (input.length - 1) / Math.max(1, length - 1)
  for (let index = 0; index < length; index++) {
    const position = index * scale
    const left = Math.floor(position)
    const right = Math.min(left + 1, input.length - 1)
    const mix = position - left
    output[index] = input[left] * (1 - mix) + input[right] * mix
  }
  return output
}

function usable(samples: Float32Array) {
  const trimmed = trimSilence(samples)
  if (trimmed.length >= 16000 * 0.25) return trimmed
  let peak = 0
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample))
  return peak > 0.008 && samples.length >= 16000 * 0.25 ? samples : null
}

function trimSilence(samples: Float32Array) {
  const window = 320
  const loud = (offset: number) => {
    let sum = 0
    const end = Math.min(samples.length, Math.max(0, offset) + window)
    const start = Math.max(0, offset)
    for (let index = start; index < end; index++) sum += samples[index] * samples[index]
    return Math.sqrt(sum / Math.max(1, end - start)) > 0.012
  }
  let start = 0
  while (start < samples.length && !loud(start)) start += window
  let end = samples.length
  while (end - window > start && !loud(end - window)) end -= window
  const pad = 16000 * 0.12
  start = Math.max(0, start - pad)
  end = Math.min(samples.length, end + pad)
  return start >= end ? samples.subarray(0, 0) : samples.subarray(start, end)
}

function wavBlob(samples: Float32Array) {
  const pcm = new Int16Array(samples.length)
  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }
  const buffer = new ArrayBuffer(44 + pcm.length * 2)
  const view = new DataView(buffer)
  const write = (offset: number, value: string) => { for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index)) }
  write(0, 'RIFF')
  view.setUint32(4, 36 + pcm.length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 16000, true)
  view.setUint32(28, 32000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, pcm.length * 2, true)
  new Int16Array(buffer, 44).set(pcm)
  return new Blob([buffer], { type: 'audio/wav' })
}
