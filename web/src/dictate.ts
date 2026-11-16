import { api, ApiError } from './api'
import { bestLine, combineHeard, spokenField } from './heard'

export type Dictation = { stop: () => void; cancel: () => void; hasAudio: () => boolean }

export type DictationOptions = {
  kind: 'text' | 'phone' | 'email'
  multiline: boolean
  listeningMessage: string
  onListen: (listening: boolean) => void
  onStatus: (message: string) => void
  onText: (text: string) => void
  onError: (message: string) => void
  onEnd: () => void
}

export type Clock = {
  setTimeout: (fn: () => void, ms: number) => number
  clearTimeout: (id: number) => void
}

export type RecognitionEvent = {
  results: { isFinal: boolean; alternatives: { transcript?: string; confidence?: number }[] }[]
}

export type SpeechEngine = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: RecognitionEvent) => void) | null
  onspeechstart: (() => void) | null
  onspeechend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

type BrowserRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; length: number; [index: number]: { transcript?: string; confidence?: number } }> }) => void) | null
  onspeechstart: (() => void) | null
  onspeechend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}

const windowClock: Clock = {
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id),
}

function registry() {
  const host = globalThis as typeof globalThis & { __vendorDeskMic?: { current: Dictation | null } }
  host.__vendorDeskMic ??= { current: null }
  return host.__vendorDeskMic
}

type MicSeat = { id: string, silence: () => void, stop: () => void }
let seat: MicSeat | null = null
const seatWatchers = new Set<() => void>()

function notifySeat() {
  for (const listener of seatWatchers) listener()
}

export function subscribeMic(listener: () => void) {
  seatWatchers.add(listener)
  return () => { seatWatchers.delete(listener) }
}

export function micIsOn(id: string) {
  return seat?.id === id
}

/** Shows Listening on this field only, and turns the previous field off immediately. */
export function seatMic(id: string, api: { silence: () => void, stop: () => void }) {
  const previous = seat
  seat = { id, ...api }
  notifySeat()
  if (!previous || previous.id === id) return
  try { previous.stop() } catch { /* the previous microphone already closed */ }
  previous.silence()
}

export function unseatMic(id: string) {
  if (seat?.id !== id) return
  seat = null
  notifySeat()
}

export function microphoneBlockedMessage(page: { protocol: string; host: string } = window.location): string {
  return `The microphone is blocked on ${page.protocol}//${page.host}. Open https://${page.host}, continue past the certificate warning once, then tap the mic again.`
}

/** Records until the speaker pauses or taps again, then writes the words into the field. */
export function startDictation(options: DictationOptions): Dictation {
  const previous = registry().current
  registry().current = null
  if (previous?.hasAudio()) previous.stop()
  else previous?.cancel()

  const handle = openSession(options)
  registry().current = handle
  return handle
}

export function dictationRoute(secure: boolean, hasBrowserSpeech: boolean): 'browser' | 'blocked' | 'server' {
  if (!secure) return 'blocked'
  return hasBrowserSpeech ? 'browser' : 'server'
}

/** Turns off whichever field is listening, and keeps the words already written. */
export function stopActiveDictation() {
  const current = registry().current
  if (!current) return
  if (current.hasAudio()) current.stop()
  else current.cancel()
}

function openSession(options: DictationOptions): Dictation {
  const secure = Boolean(globalThis.isSecureContext)
  const engine = secure ? browserEngine() : null
  const route = dictationRoute(secure, engine !== null)
  if (route === 'blocked') return failDictation(options, microphoneBlockedMessage())
  if (route === 'browser' && engine) return listenWithEngine(engine, options)
  return recordDictation(options)
}

function failDictation(options: DictationOptions, message: string): Dictation {
  let dropped = false
  let done = false
  const handle: Dictation = {
    hasAudio: () => false,
    stop() { finish() },
    cancel() { dropped = true; finish() },
  }
  function finish() {
    if (done) return
    done = true
    if (registry().current === handle) registry().current = null
    options.onListen(false)
    if (!dropped) options.onError(message)
    options.onEnd()
  }
  queueMicrotask(finish)
  return handle
}

function browserEngine(): SpeechEngine | null {
  const host = window as Window & {
    SpeechRecognition?: new () => BrowserRecognition
    webkitSpeechRecognition?: new () => BrowserRecognition
  }
  const Ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition
  if (!Ctor) return null
  const raw = new Ctor()
  const engine: SpeechEngine = {
    get lang() { return raw.lang },
    set lang(value: string) { raw.lang = value },
    get continuous() { return raw.continuous },
    set continuous(value: boolean) { raw.continuous = value },
    get interimResults() { return raw.interimResults },
    set interimResults(value: boolean) { raw.interimResults = value },
    get maxAlternatives() { return raw.maxAlternatives },
    set maxAlternatives(value: number) { raw.maxAlternatives = value },
    onresult: null,
    onspeechstart: null,
    onspeechend: null,
    onerror: null,
    onend: null,
    start() { raw.start() },
    stop() { raw.stop() },
    abort() { raw.abort() },
  }
  raw.onresult = (event) => {
    const results = []
    for (let index = 0; index < event.results.length; index++) {
      const result = event.results[index]
      const alternatives = []
      for (let choice = 0; choice < result.length; choice++) {
        const alternative = result[choice]
        alternatives.push({ transcript: alternative?.transcript ?? '', confidence: alternative?.confidence ?? 0 })
      }
      results.push({ isFinal: Boolean(result.isFinal), alternatives })
    }
    engine.onresult?.({ results })
  }
  raw.onspeechstart = () => engine.onspeechstart?.()
  raw.onspeechend = () => engine.onspeechend?.()
  raw.onerror = (event) => engine.onerror?.({ error: event.error ?? '' })
  raw.onend = () => engine.onend?.()
  return engine
}

function sameWords(previous: string, next: string) {
  const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9@.\s]/g, '').replace(/\s+/g, ' ').trim()
  return key(previous) === key(next)
}

export function listenWithEngine(engine: SpeechEngine, options: DictationOptions, clock: Clock = windowClock): Dictation {
  const maxMs = 60000
  let stable = ''
  let sessionFinal = ''
  let interim = ''
  let heard = false
  let stopped = false
  let dropped = false
  let finished = false
  let error = ''
  let emptyEnds = 0
  let lastRaw = ''
  let maxTimer = 0
  let restartTimer = 0

  const handle: Dictation = {
    hasAudio: () => heard,
    stop() { requestStop(false) },
    cancel() { dropped = true; requestStop(true) },
  }

  function clearTimers() {
    clock.clearTimeout(maxTimer)
    clock.clearTimeout(restartTimer)
  }

  function currentText() {
    return spokenField(combineHeard(stable, sessionFinal, interim), options.kind)
  }

  function finish() {
    if (finished) return
    finished = true
    stopped = true
    clearTimers()
    if (registry().current === handle) registry().current = null
    options.onListen(false)
    if (!dropped) {
      const text = currentText()
      if (text) options.onText(text)
      else options.onError(error || 'Could not hear that. Tap the mic and speak again.')
    }
    options.onEnd()
  }

  function requestStop(discard: boolean) {
    if (finished) return
    stopped = true
    if (discard) dropped = true
    finish()
    try {
      if (discard) engine.abort()
      else engine.stop()
    } catch { /* the browser already closed the microphone */ }
  }

  engine.lang = 'en-IN'
  engine.continuous = true
  engine.interimResults = true
  engine.maxAlternatives = 3
  engine.onspeechstart = () => { /* a pause is not the end; the next tap stops the mic */ }
  engine.onspeechend = () => { /* keep listening until the mic is tapped again */ }
  engine.onresult = (event) => {
    if (finished || dropped) return
    sessionFinal = ''
    interim = ''
    let final = false
    for (const result of event.results) {
      const line = bestLine(result.alternatives, options.kind)
      if (!line) continue
      if (result.isFinal) {
        final = true
        sessionFinal = combineHeard(sessionFinal, line)
      } else interim = combineHeard(interim, line)
    }
    const raw = combineHeard(stable, sessionFinal, interim)
    if (!raw || (sameWords(lastRaw, raw) && !final)) return
    lastRaw = raw
    heard = true
    emptyEnds = 0
    const text = spokenField(raw, options.kind)
    if (text) options.onText(text)
  }
  engine.onerror = (event) => {
    if (finished || dropped) return
    const code = event.error
    if (code === 'aborted' || code === 'no-speech') return
    if (code === 'language-not-supported' && engine.lang !== 'en-US') {
      engine.lang = 'en-US'
      return
    }
    stopped = true
    error = code === 'not-allowed' || code === 'service-not-allowed'
      ? 'Allow the microphone for this site, then tap the mic again.'
      : code === 'audio-capture'
        ? 'No microphone was found. Check the microphone and tap it again.'
        : code === 'network'
          ? 'Voice recognition needs an internet connection. Check the connection and tap the mic again.'
          : 'Voice recognition could not hear that. Tap the mic and speak again.'
    finish()
  }
  engine.onend = () => {
    if (finished) return
    stable = combineHeard(stable, sessionFinal, interim)
    sessionFinal = ''
    interim = ''
    if (dropped || stopped) {
      finish()
      return
    }
    if (!currentText()) {
      emptyEnds += 1
      if (emptyEnds >= 3) {
        error = error || 'Could not hear that. Tap the mic and speak again.'
        finish()
        return
      }
    }
    restartTimer = clock.setTimeout(() => {
      if (finished || stopped || dropped) return
      try { engine.start() } catch {
        error = 'Allow the microphone for this site, then tap the mic again.'
        finish()
      }
    }, 120)
  }

  maxTimer = clock.setTimeout(() => requestStop(false), maxMs)
  clock.setTimeout(() => {
    if (finished) return
    options.onListen(true)
    options.onStatus(options.listeningMessage)
  }, 0)
  try {
    engine.start()
  } catch {
    error = 'Allow the microphone for this site, then tap the mic again.'
    clock.setTimeout(finish, 0)
  }
  return handle
}

function recordDictation(options: DictationOptions): Dictation {
  let context: AudioContext
  try {
    context = new AudioContext()
  } catch {
    return failDictation(options, 'The microphone could not start. Tap it and speak again.')
  }
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

  const handle: Dictation = {
    hasAudio: () => pieces.length > 0,
    stop: () => finish(false),
    cancel: () => finish(true),
  }
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
      const text = spokenField(result.text ?? '', options.kind)
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
      if (closed) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      attach(context.sampleRate || 16000)
      if (closed) return
      options.onListen(true)
      options.onStatus(options.listeningMessage)
      if (closed) return
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
