import assert from 'node:assert/strict'
import net from 'node:net'
import { diagnoseEndpoint, resolveDiagnosticTargets } from '../desktop/networkDiagnostics.mjs'

const targets = resolveDiagnosticTargets({
  voice: { provider: 'gemini' },
  report: { provider: 'custom', apiBaseUrl: 'http://127.0.0.1:11434/v1' },
})
assert.equal(targets[0].url.hostname, 'generativelanguage.googleapis.com')
assert.equal(targets[1].url.hostname, '127.0.0.1')
assert.throws(() => resolveDiagnosticTargets({
  voice: { provider: 'doubao', doubaoEndpoint: 'ws://example.com/realtime' },
  report: { provider: 'custom', apiBaseUrl: 'http://127.0.0.1:11434/v1' },
}), /WSS/)

const localServer = net.createServer(socket => socket.end())
await new Promise((resolve, reject) => {
  localServer.once('error', reject)
  localServer.listen(0, '127.0.0.1', resolve)
})
const address = localServer.address()
assert.ok(address && typeof address === 'object')
const result = await diagnoseEndpoint({
  id: 'local',
  provider: 'test',
  label: '本地测试服务',
  url: new URL(`http://127.0.0.1:${address.port}`),
})
assert.equal(result.reachable, true)
await new Promise(resolve => localServer.close(resolve))

console.log('desktop-network-diagnostics=passed')
