// Shared by the browser editor and Berth scripts. No filesystem side effects.
const idPattern = /^[0-9a-f]{32}$/
const jsonPrefix = /^\{\n  "berthDrawingId": "([0-9a-f]{32})",(?=\s*")/
const mdId = /\r?\n<!-- berth-drawing-id: ([0-9a-f]{32}) -->\r?\n?$/
export const validId = (id) => typeof id === "string" && idPattern.test(id)
export const isMarkdown = (path) => /\.excalidraw\.md$/i.test(path)

export function newId() {
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("")
}

export function drawingId(path, content) {
  if (typeof content !== "string" || !content.trim()) return null
  if (isMarkdown(path)) return content.match(mdId)?.[1] ?? null
  const fast = content.match(jsonPrefix)?.[1]
  if (fast) return fast
  try {
    const id = JSON.parse(content)?.berthDrawingId
    return validId(id) ? id : null
  } catch { return null }
}

export function withoutId(path, content) {
  if (isMarkdown(path)) return content.replace(mdId, "")
  if (jsonPrefix.test(content)) return content.replace(jsonPrefix, "{")
  if (!drawingId(path, content)) return content
  const scene = JSON.parse(content)
  delete scene.berthDrawingId
  return JSON.stringify(scene, null, 2) + "\n"
}

export function withId(path, content, id) {
  if (!validId(id)) throw new Error("Invalid drawing ID")
  if (drawingId(path, content) === id) return content
  const plain = withoutId(path, content)
  if (isMarkdown(path)) return `${plain}\n<!-- berth-drawing-id: ${id} -->\n`
  if (!plain.trim()) throw new Error("Cannot identify an empty JSON drawing")
  const scene = JSON.parse(plain)
  if (!Array.isArray(scene?.elements)) throw new Error("Not an Excalidraw scene")
  const json = plain.trimStart()
  return `{\n  "berthDrawingId": "${id}",${json.slice(1)}`
}
