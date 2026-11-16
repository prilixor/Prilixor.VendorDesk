import assert from 'node:assert/strict'
import { bestLine, spokenField } from '../src/heard.ts'
import { dictationRoute, listenWithEngine, micIsOn, microphoneBlockedMessage, seatMic, unseatMic, type Clock, type RecognitionEvent, type SpeechEngine } from '../src/dictate.ts'

function fakeClock() {
  let now = 0
  let next = 1
  const tasks: { id: number; at: number; fn: () => void }[] = []
  const clock: Clock & { flush: (ms: number) => void } = {
    setTimeout(fn, ms) {
      const id = next++
      tasks.push({ id, at: now + ms, fn })
      return id
    },
    clearTimeout(id) {
      const index = tasks.findIndex((task) => task.id === id)
      if (index >= 0) tasks.splice(index, 1)
    },
    flush(ms) {
      const end = now + ms
      for (;;) {
        const waiting = tasks.filter((task) => task.at <= end).sort((left, right) => left.at - right.at || left.id - right.id)
        if (!waiting.length) break
        const task = waiting[0]
        const index = tasks.indexOf(task)
        if (index < 0) continue
        now = task.at
        tasks.splice(index, 1)
        task.fn()
      }
      now = end
    },
  }
  return clock
}

function fakeEngine() {
  const engine: SpeechEngine & {
    starts: number
    hear: (transcript: string, isFinal?: boolean) => void
    hearResults: (results: RecognitionEvent['results']) => void
  } = {
    lang: '',
    continuous: false,
    interimResults: false,
    maxAlternatives: 1,
    starts: 0,
    onresult: null,
    onspeechstart: null,
    onspeechend: null,
    onerror: null,
    onend: null,
    start() { engine.starts += 1 },
    stop() { engine.onend?.() },
    abort() { engine.onend?.() },
    hear(transcript, isFinal = false) {
      engine.onresult?.({ results: [{ isFinal, alternatives: [{ transcript, confidence: 0.8 }] }] })
    },
    hearResults(results) {
      engine.onresult?.({ results })
    },
  }
  return engine
}

function session(kind: 'text' | 'phone' | 'email', multiline = false) {
  const clock = fakeClock()
  const engine = fakeEngine()
  const texts: string[] = []
  const errors: string[] = []
  let ended = 0
  const handle = listenWithEngine(engine, {
    kind,
    multiline,
    listeningMessage: 'Listening…',
    onListen: () => undefined,
    onStatus: () => undefined,
    onText: (text) => texts.push(text),
    onError: (message) => errors.push(message),
    onEnd: () => { ended += 1 },
  }, clock)
  return { clock, engine, texts, errors, ended: () => ended, handle }
}

assert.equal(dictationRoute(true, true), 'browser')
assert.equal(dictationRoute(false, true), 'blocked')
assert.equal(dictationRoute(true, false), 'server')
assert.match(microphoneBlockedMessage({ protocol: 'http:', host: '192.168.1.15:5173' }), /https:\/\/192\.168\.1\.15:5173/)
assert.match(microphoneBlockedMessage({ protocol: 'http:', host: 'localhost:5173' }), /https:\/\/localhost:5173/)

assert.equal(spokenField('rahul sharma.', 'text'), 'Rahul Sharma')
assert.equal(spokenField('nine eight seven six five four three two one zero', 'phone'), '9876543210')
assert.equal(spokenField('hello there', 'phone'), '')
assert.equal(spokenField('rahul at gmail dot com', 'email'), 'rahul@gmail.com')
assert.equal(bestLine(
  [{ transcript: 'call me', confidence: 0.9 }, { transcript: '9876543210', confidence: 0.4 }],
  'phone',
), '9876543210')

{
  const run = session('text')
  run.engine.hear('rahul')
  assert.equal(run.texts.at(-1), 'Rahul')
  assert.equal(run.ended(), 0)
  run.engine.hearResults([
    { isFinal: true, alternatives: [{ transcript: 'rahul', confidence: 0.9 }] },
    { isFinal: false, alternatives: [{ transcript: 'sharma', confidence: 0.8 }] },
  ])
  assert.equal(run.texts.at(-1), 'Rahul Sharma')
  run.clock.flush(5000)
  assert.equal(run.ended(), 0)
  run.handle.stop()
  assert.equal(run.texts.at(-1), 'Rahul Sharma')
  assert.equal(run.ended(), 1)
  assert.deepEqual(run.errors, [])
}

{
  const run = session('phone')
  run.engine.hear('nine eight double two')
  assert.equal(run.texts.at(-1), '9822')
  run.engine.hear('nine eight seven six five four three two one zero', true)
  run.clock.flush(5000)
  assert.equal(run.ended(), 0)
  run.handle.stop()
  assert.equal(run.texts.at(-1), '9876543210')
  assert.equal(run.ended(), 1)
}

{
  const run = session('email')
  run.engine.hear('rahul at gmail dot com', true)
  run.clock.flush(5000)
  assert.equal(run.ended(), 0)
  run.handle.stop()
  assert.equal(run.texts.at(-1), 'rahul@gmail.com')
  assert.equal(run.ended(), 1)
}

{
  const run = session('text')
  run.clock.flush(60000)
  assert.equal(run.texts.length, 0)
  assert.match(run.errors[0] ?? '', /Could not hear/)
  assert.equal(run.ended(), 1)
}

{
  const run = session('phone')
  run.engine.hear('hello there')
  run.clock.flush(5000)
  assert.deepEqual(run.texts, [])
  assert.equal(run.ended(), 0)
  run.handle.stop()
  assert.match(run.errors[0] ?? '', /Could not hear/)
  assert.equal(run.ended(), 1)
}

{
  const run = session('text')
  run.engine.onerror?.({ error: 'not-allowed' })
  run.engine.onend?.()
  assert.match(run.errors[0] ?? '', /Allow the microphone/)
  assert.equal(run.ended(), 1)
}

{
  const run = session('text')
  run.engine.onerror?.({ error: 'network' })
  run.clock.flush(800)
  assert.match(run.errors[0] ?? '', /internet connection/)
  assert.equal(run.ended(), 1)
}

{
  const run = session('text')
  run.engine.hear('rahul')
  run.handle.cancel()
  assert.deepEqual(run.errors, [])
  assert.equal(run.ended(), 1)
  assert.equal(run.texts.at(-1), 'Rahul')
}

{
  const run = session('text')
  run.engine.hear('rahul', true)
  assert.equal(run.texts.at(-1), 'Rahul')
  assert.equal(run.ended(), 0)
  run.engine.onend?.()
  run.clock.flush(120)
  assert.equal(run.engine.starts, 2)
  run.handle.stop()
  assert.equal(run.ended(), 1)
  assert.equal(run.texts.at(-1), 'Rahul')
}

{
  const run = session('text')
  run.engine.stop = () => undefined
  run.engine.hear('rahul')
  assert.equal(run.ended(), 0)
  run.handle.stop()
  assert.equal(run.ended(), 1)
  assert.equal(run.texts.at(-1), 'Rahul')
}

{
  const run = session('text')
  run.engine.hear('rahul')
  run.engine.onspeechend?.()
  run.clock.flush(5000)
  run.engine.onspeechstart?.()
  run.engine.hear('rahul sharma', true)
  assert.equal(run.texts.at(-1), 'Rahul Sharma')
  assert.equal(run.ended(), 0)
  run.handle.stop()
  assert.equal(run.ended(), 1)
  assert.deepEqual(run.errors, [])
}

{
  const silenced: string[] = []
  const stopped: string[] = []
  seatMic('name', { silence: () => silenced.push('name'), stop: () => stopped.push('name') })
  assert.equal(micIsOn('name'), true)
  assert.equal(micIsOn('mobile'), false)
  seatMic('mobile', { silence: () => silenced.push('mobile'), stop: () => stopped.push('mobile') })
  assert.equal(micIsOn('name'), false)
  assert.equal(micIsOn('mobile'), true)
  assert.deepEqual(stopped, ['name'])
  assert.deepEqual(silenced, ['name'])
  unseatMic('mobile')
  assert.equal(micIsOn('mobile'), false)
}

{
  const run = session('text')
  assert.equal(run.engine.starts, 1)
  run.engine.onend?.()
  run.clock.flush(120)
  run.engine.onend?.()
  run.clock.flush(120)
  run.engine.onend?.()
  assert.match(run.errors[0] ?? '', /Could not hear/)
  assert.equal(run.ended(), 1)
  assert.equal(run.engine.starts, 3)
}

{
  const run = session('text')
  run.engine.start = () => { throw new Error('blocked') }
  const failed = listenWithEngine(run.engine, {
    kind: 'text',
    multiline: false,
    listeningMessage: 'Listening…',
    onListen: () => undefined,
    onStatus: () => undefined,
    onText: (text) => run.texts.push(text),
    onError: (message) => run.errors.push(message),
    onEnd: () => undefined,
  }, run.clock)
  void failed
  run.clock.flush(0)
  assert.match(run.errors.at(-1) ?? '', /Allow the microphone/)
}

console.log('speech session checks passed')
