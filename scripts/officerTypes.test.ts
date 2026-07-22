import assert from 'node:assert/strict'
import {
  RANDOM_OFFICER_POOL,
  isOfficerType,
  officerTypes,
  resolveOfficerType,
} from '../src/modules/voice/data/officerTypes.ts'

assert.equal(isOfficerType('random'), true)
assert.equal(isOfficerType('trump'), false)
assert.equal(officerTypes.some(officer => officer.id === 'trump'), false)
assert.deepEqual(RANDOM_OFFICER_POOL, ['pressure', 'standard', 'friendly'])
assert.equal(resolveOfficerType('random', 0), 'pressure')
assert.equal(resolveOfficerType('random', 0.34), 'standard')
assert.equal(resolveOfficerType('random', 0.999999), 'friendly')
assert.equal(resolveOfficerType('standard', 0), 'standard')

console.log('officer-types=passed')
