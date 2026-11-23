import { drawingId, newId, validId } from "../page/identity.js"

export const archiveDir = (id) => `${berth.storage.dir}/history-by-id/${id}`
const registryFile = (id) => `${berth.storage.dir}/drawing-ids/${id}.json`

export async function readText(path) {
  try { return await berth.fs.readText(path) }
  catch (error) { if (error.reason !== "not-found") throw error; return null }
}
export const readJson = async (path) => JSON.parse(await readText(path))
export const writeJson = (path, value) => berth.fs.writeText(path, JSON.stringify(value, null, 1) + "\n")

async function bind(path, id) {
  const known = await readJson(registryFile(id))
  if (known?.owner && known.owner !== path) {
    const old = await readText(known.owner)
    if (drawingId(known.owner, old) === id &&
        await berth.fs.resolve(path).catch(() => path) !== await berth.fs.resolve(known.owner).catch(() => known.owner)) {
      return { id, conflict: known.owner }
    }
  }
  const binding = { id, owner: path }
  if (!known || known.owner !== path) await writeJson(registryFile(id), binding)
  return binding
}

export async function prepare(path, { fork = false } = {}) {
  const embedded = drawingId(path, await readText(path))
  if (fork) {
    if (!embedded || !(await bind(path, embedded)).conflict) throw new Error("No conflicting drawing ID")
    return bind(path, newId())
  }
  return bind(path, embedded ?? newId())
}

export async function lookup(path, disk, supplied) {
  const embedded = drawingId(path, disk)
  if (embedded && supplied && embedded !== supplied) throw new Error("画板编号已变化，请重新打开画板。 / Drawing ID changed; reopen it.")
  if (embedded) return bind(path, embedded)
  // The editor may have queued the first stamped save but not yet flushed it to disk.
  if (validId(supplied)) {
    const reserved = await readJson(registryFile(supplied))
    if (reserved?.owner === path) return { id: supplied, owner: path }
  }
  return null
}

export async function registerDrawing(path, content) {
  const id = drawingId(path, content)
  if (!id) throw new Error("A newly created drawing must have an ID")
  return bind(path, id)
}
