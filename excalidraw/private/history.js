// 画板的改图记录：Agent 改画板前自动存档，用户在 Excalidraw 侧栏「图库 → 修改历史」里看每一版、回到任意一版。
// 版本按画板编号存入 history-by-id/<画板编号>/，不读取按路径存放的旧历史。
//
// Agent 改画板一律经 apply（先存当前版，再写入新版，记下这次改了什么），不直接写画板文件：
//   berth tools run excalidraw private/history.js apply <画板> <新版文件> "<一句话：改了什么>"
//   berth tools run excalidraw private/history.js list <画板>
// 画板页面经 berth.scripts.run 调 list / get / request / snapshot / restore（见 default 导出）。

import { absolute } from "./paths.js"
import { drawingId, withId, withoutId } from "../page/identity.js"
import { archiveDir, lookup, prepare, readJson, readText, writeJson } from "./registry.js"

// ponytail: 每张画板只留最近 100 版，按版本数截断；画板很大时再按总字节截
const KEEP = 100

/** 内容指纹（djb2），页面用同一算法判断「当前是哪一版」、去重。 */
export function hash(text) {
  let value = 5381
  for (let i = 0; i < text.length; i++)
    value = ((value << 5) + value + text.charCodeAt(i)) | 0
  return `${(value >>> 0).toString(36)}-${text.length}`
}

const versionFile = (index, version) => `${index.dir}/${version.id}.excalidraw`

async function readIndex(path, binding) {
  const dir = binding ? archiveDir(binding.id) : null
  const stored = dir ? await readJson(`${dir}/index.json`) : null
  return { ...(stored ?? { next: 1, pending: null, versions: [] }), path, dir }
}

const writeIndex = ({ dir, ...index }) => writeJson(`${dir}/index.json`, index)

async function openHistory(path, content, write = false, requestedId) {
  const current = await readText(path)
  const binding = await lookup(path, current, drawingId(path, content) ?? requestedId)
  if (binding?.conflict) throw new Error(`编号已被另一张画板使用 / Drawing ID already used by: ${binding.conflict}`)
  if (write && !binding) throw new Error("先保存画板以登记新编号 / Save the drawing to register a new ID first")
  return { index: await readIndex(path, binding), binding }
}

/** 存画板快照时复用已有的相同内容，Agent 修改仍可单独记录新说明。 */
async function record(index, content, entry, keepId) {
  content = withoutId(index.path, content)
  const key = hash(content)
  const last = index.versions[index.versions.length - 1]
  const candidates = ["before", "manual", "external"].includes(entry.by)
    ? [...index.versions].reverse()
    : last ? [last] : []
  for (const version of candidates) {
    if (version.hash !== key) continue
    const saved = await readText(versionFile(index, version))
    if (saved !== null && withoutId(index.path, saved) === content) return version
  }
  const version = { id: index.next++, time: Date.now(), hash: key, ...entry }
  await berth.fs.writeText(versionFile(index, version), content)
  index.versions.push(version)
  while (index.versions.length > KEEP) {
    const drop = index.versions.findIndex((item) => item.id !== keepId)
    const [old] = index.versions.splice(drop, 1)
    await berth.fs.remove(versionFile(index, old))
  }
  return version
}

/** 写坏的画板会让用户打不开，入库前先确认是场景 JSON。 */
function checkScene(path, content) {
  if (/\.excalidraw\.md$/i.test(path)) {
    if (!/\n##? Drawing\r?\n[^`]*```(?:json|compressed-json)\r?\n[\s\S]+?```/.test(content))
      throw new Error("New version is not an Excalidraw Markdown drawing")
    return
  }
  let scene
  try {
    scene = JSON.parse(content)
  } catch (error) {
    throw new Error(`new version is not valid JSON: ${error.message}`)
  }
  if (!Array.isArray(scene?.elements))
    throw new Error("new version has no elements array")
}

/** 存当前版 → 记新版（带上用户在面板里提的要求）→ 写画板。index 先落盘，页面收到改写时记录已在。 */
async function apply(path, content, note) {
  checkScene(path, content)
  const current = await readText(path)
  const binding = await prepare(path)
  if (binding.conflict) throw new Error(`Drawing ID already used by: ${binding.conflict}`)
  const index = await readIndex(path, binding)
  if (current?.trim()) await record(index, current, { by: "before" })
  const version = await record(index, content, {
    by: "agent",
    request: index.pending?.text,
    note: note || undefined,
  })
  index.pending = null
  if (await readText(path) !== current) throw new Error("画板已变更，请重新读取后再保存 / Drawing changed; reload before applying")
  await writeIndex(index)
  await berth.fs.writeText(path, withId(path, content, binding.id))
  return version
}

const summary = (index) => ({
  path: index.path,
  pending: index.pending,
  versions: [...index.versions].reverse(),
})

async function cli([command, drawing, file, ...note]) {
  if (command === "list" && drawing) {
    const { index } = await openHistory(absolute(drawing))
    for (const v of summary(index).versions)
      console.log(
        `#${v.id} ${new Date(v.time).toISOString()} ${v.by}` +
          `${v.request ? ` 要求：${v.request}` : ""}${v.note ? ` 改动：${v.note}` : ""}`
      )
    return 0
  }
  if (command === "apply" && drawing && file) {
    const path = absolute(drawing)
    const version = await apply(
      path,
      await berth.fs.readText(absolute(file)),
      note.join(" ").trim()
    )
    console.log(`${path}: saved as version #${version.id}`)
    return 0
  }
  console.error(
    "usage: berth tools run excalidraw private/history.js apply <drawing> <new-version-file> <note>\n" +
      "       berth tools run excalidraw private/history.js list <drawing>"
  )
  return 2
}

/**
 * `path` 一律是画板绝对路径。
 * - `list {path}`：`{ pending, versions }`，新的在前；版本 `by`：`agent` Agent 改的、`before` 改动前存档、
 *   `manual` 手动存档、`external` 画板被外部直接改写。
 * - `get {path, id}`：`{ content }`。
 * - `request {path, text, content}`：用户在面板提了要求：存下当前内容，要求挂到下一次 apply。
 * - `snapshot {path, content, by?}`：存一版（内容没变就不存）。
 * - `restore {path, id, content}`：当前内容还未存档才存一版，直接返回指定旧版 `content` 由页面写回。
 * - `apply {path, content, note?}`：同命令行 apply。
 */
export default async function history(input) {
  if (Array.isArray(input)) {
    try {
      return await cli(input)
    } catch (error) {
      console.error(`history failed: ${error.message}`)
      return 1
    }
  }
  const path = input?.path
  if (!path) throw new Error("history needs path")
  const action = input.action ?? "list"
  if (action === "apply")
    return apply(path, String(input.content ?? ""), input.note)
  if (action === "prepare" || action === "fork") return prepare(path, { fork: action === "fork" })
  const readId = ["list", "get"].includes(action) ? input.drawingId : undefined
  const { index, binding } = await openHistory(path, input.content, ["request", "snapshot", "restore"].includes(action), readId)
  if (action === "list") return summary(index)
  if (action === "get") {
    const version = index.versions.find((v) => v.id === input.id)
    if (!version) throw new Error(`no version #${input.id}`)
    return { content: await berth.fs.readText(versionFile(index, version)) }
  }
  if (action === "request" || action === "snapshot") {
    const content = String(input.content ?? "")
    if (content) await record(index, content, { by: input.by ?? "before" })
    if (action === "request")
      index.pending = {
        text: String(input.text ?? "").trim(),
        time: Date.now(),
      }
    await writeIndex(index)
    return summary(index)
  }
  if (action === "restore") {
    const version = index.versions.find((v) => v.id === input.id)
    if (!version) throw new Error(`no version #${input.id}`)
    const content = await berth.fs.readText(versionFile(index, version))
    checkScene(path, content)
    if (input.content) {
      const previousNext = index.next
      await record(index, String(input.content), { by: "before" }, version.id)
      if (index.next !== previousNext) await writeIndex(index)
    }
    return { content: withId(path, content, binding.id) }
  }
  throw new Error(
    `unknown action ${action}; use list, get, request, snapshot, restore or apply`
  )
}
