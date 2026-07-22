import assert from 'node:assert/strict'
import { consumeControlledAnswer } from '../src/modules/voice/services/controlledTurnGuard.ts'

const first = consumeControlledAnswer(true, 'I will study computer science.')
assert.equal(first.accepted, true)
assert.equal(first.awaitingAnswer, false)
assert.equal(first.text, 'I will study computer science.')

const duplicate = consumeControlledAnswer(first.awaitingAnswer, 'I will study computer science.')
assert.equal(duplicate.accepted, false, 'a duplicate completion event must not advance the interview again')
assert.equal(duplicate.awaitingAnswer, false)

const empty = consumeControlledAnswer(true, '   ')
assert.equal(empty.accepted, false)
assert.equal(empty.awaitingAnswer, true, 'silence must keep the current question open')

const nextTurn = consumeControlledAnswer(true, 'My parents will fund my studies.')
assert.equal(nextTurn.accepted, true, 'the next officer question opens one fresh answer turn')

console.log('realtime-turn-guard=passed')
