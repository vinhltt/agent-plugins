// Text formatting shared by the log lines and the status line.

const pad = (n: number) => String(n).padStart(2, '0')

export const stamp = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export const compact =(n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(n)

export const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`

// A version part is one or two digits; a snapshot date has eight.
const VERSION_PART = /^\d{1,2}$/

// Short model name for the status line, family plus dotted version (`opus-5.5`), from any
// provider's id. No family list, so a new family needs no code change.
export const modelTag = (id: string) => {
  const s = id
    .trim()
    .replace(/^.*\//, '') // Bedrock ARN: …/foundation-model/<id>
    .replace(/\[[^\]]*\]$/, '') // context variant: [1m]
    .replace(/@.*$/, '') // Vertex: @20250805
    .replace(/-v\d+(?::\d+)?$/, '') // Bedrock: -v1:0
    .replace(/^(?:[a-z]+\.)*anthropic\./, '') // Bedrock: us. / global. / anthropic.
    .replace(/^claude-/, '')
    .replace(/-(?:\d{8}|latest)$/, '') // snapshot date or -latest
  const parts = s.split('-').filter(Boolean)
  // Legacy ids put the version first (3-5-haiku), current ones after the family (opus-4-1).
  let i = 0
  while (i < parts.length && VERSION_PART.test(parts[i]!)) i++
  const rest = parts.slice(i)
  let j = rest.length
  while (j > 0 && VERSION_PART.test(rest[j - 1]!)) j--
  const family = rest.slice(0, j).join('-')
  const version = [...parts.slice(0, i), ...rest.slice(j)].join('.')
  if (!family) return s
  return version ? `${family}-${version}` : family
}
