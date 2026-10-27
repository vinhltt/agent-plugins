import { expect, test } from 'claude-code/testing'
import { modelTag } from './format.ts'

const cases: [id: string, tag: string][] = [
  ['claude-opus-5-5', 'opus-5.5'],
  ['claude-sonnet-4-5-20250929', 'sonnet-4.5'],
  ['claude-3-5-haiku-20241022', 'haiku-3.5'],
  ['claude-opus-4-1', 'opus-4.1'],
  ['claude-opus-4-20250514', 'opus-4'],
  ['claude-3-opus-20240229', 'opus-3'],
  ['claude-opus-5-5[1m]', 'opus-5.5'],
  ['claude-opus-4-1@20250805', 'opus-4.1'],
  ['us.anthropic.claude-opus-4-1-20250805-v1:0', 'opus-4.1'],
  ['anthropic.claude-3-5-sonnet-20240620-v2:0', 'sonnet-3.5'],
  ['global.anthropic.claude-sonnet-4-5-20250929-v1:0', 'sonnet-4.5'],
  ['arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0', 'sonnet-3.5'],
  ['claude-3-7-sonnet-latest', 'sonnet-3.7'],
  ['opus', 'opus'],
  ['gpt-4o', 'gpt-4o'],
]

for (const [id, tag] of cases) {
  test(`modelTag('${id}') is '${tag}'`, () => {
    expect(modelTag(id)).toBe(tag)
  })
}
