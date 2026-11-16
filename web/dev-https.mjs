import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

export function lanIpv4() {
  const ips = []
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if ((entry.family === 'IPv4' || entry.family === 4) && !entry.internal) ips.push(entry.address)
    }
  }
  return [...new Set(ips)]
}

async function forgeLibrary() {
  const bundle = path.join(root, 'node_modules/@vitejs/plugin-basic-ssl/dist/chunks/certificate.mjs')
  const cacheDir = path.join(root, 'node_modules/.vite/dev-https')
  await mkdir(cacheDir, { recursive: true })
  const modified = String((await stat(bundle)).mtimeMs)
  const wrapper = path.join(cacheDir, 'forge-export.mjs')
  let current = ''
  try { current = await readFile(path.join(cacheDir, 'bundle-mtime'), 'utf8') } catch { /* first run */ }
  if (current !== modified) {
    const source = await readFile(bundle, 'utf8')
    await writeFile(wrapper, source.replace('export { createCertificate };', 'export { createCertificate, forge };'))
    await writeFile(path.join(cacheDir, 'bundle-mtime'), modified)
  }
  return import(pathToFileURL(wrapper).href + `?${modified}`)
}

function certificate(forge, ips) {
  const keyPair = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.serialNumber = `01${forge.util.bytesToHex(forge.random.getBytesSync(8))}`
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
  const subject = [{ name: 'commonName', value: 'Vendor Desk' }]
  cert.setSubject(subject)
  cert.setIssuer(subject)
  cert.publicKey = keyPair.publicKey
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
        ...ips.map((ip) => ({ type: 7, ip })),
      ],
    },
  ])
  cert.sign(keyPair.privateKey, forge.md.sha256.create())
  return {
    key: forge.pki.privateKeyToPem(keyPair.privateKey),
    cert: forge.pki.certificateToPem(cert),
  }
}

export async function devHttps() {
  const ips = lanIpv4()
  const cacheDir = path.join(root, 'node_modules/.vite/dev-https')
  await mkdir(cacheDir, { recursive: true })
  const stamp = createHash('sha256').update(ips.join(',')).digest('hex').slice(0, 12)
  const certPath = path.join(cacheDir, `cert-${stamp}.pem`)
  const keyPath = path.join(cacheDir, `key-${stamp}.pem`)
  try {
    return { cert: await readFile(certPath), key: await readFile(keyPath) }
  } catch { /* this address does not have a certificate yet */ }
  const { forge } = await forgeLibrary()
  const created = certificate(forge, ips)
  await writeFile(certPath, created.cert)
  await writeFile(keyPath, created.key)
  return { cert: created.cert, key: created.key }
}
