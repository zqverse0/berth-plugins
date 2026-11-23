// Read-only inventory of original drawings in the current Berth project.
const DRAWING = /\.excalidraw(?:\.md)?$/i
const SKIP = new Set([".git", "node_modules", ".venv", "__pycache__"])
const join = (dir, name) => `${dir.replace(/\/$/, "")}/${name}`
const within = (path, root) => path === root || path.startsWith(join(root, ""))

export default async function gallery() {
  const project = await berth.env.project()
  if (!project?.root) return { entries: [], hasProject: false, warnings: [] }

  const root = await berth.fs.resolve(project.root)
  const entries = []
  const warnings = []
  const pending = [root]
  // Exclude plugin artifacts, not the entire state directory: users can put real drawings there.
  const storage = await berth.fs.resolve(berth.storage.dir).catch(() => berth.storage.dir)
  const home = storage.replace(/[/\\]state[/\\][^/\\]+$/, "")
  const internal = [
    ...["tools", ".plugin-staging"].map((name) => join(home, name)),
    ...["history", "history-by-id", "drawing-ids", "library"].map((name) => join(storage, name)),
  ]
  if (internal.some((dir) => within(root, dir))) return { entries, hasProject: true, warnings }

  while (pending.length) {
    const dir = pending.pop()
    let names
    try {
      names = await berth.fs.list(dir)
    } catch (error) {
      if (warnings.length < 12) warnings.push(`${dir}: ${error.message}`)
      continue
    }
    for (let i = 0; i < names.length; i += 32) {
      await Promise.all(names.slice(i, i + 32).map(async (name) => {
        if (SKIP.has(name)) return
        const path = join(dir, name)
        if (internal.includes(path)) return
        try {
          const info = await berth.fs.stat(path)
          if (info?.kind !== "dir" && !(info?.kind === "file" && DRAWING.test(name))) return
          // Skip symlinks: a drawing must belong to this space, and a directory cannot loop.
          if (await berth.fs.resolve(path) !== path) return
          if (info.kind === "dir") pending.push(path)
          else {
            const relative = path.slice(join(root, "").length)
            entries.push({ name, path: join(project.root, relative), relative, mtime: info.mtimeMs, size: info.size })
          }
        } catch (error) {
          if (error.reason !== "not-found" && warnings.length < 12) warnings.push(`${path}: ${error.message}`)
        }
      }))
    }
  }
  entries.sort((a, b) => b.mtime - a.mtime || a.path.localeCompare(b.path))
  return { entries, hasProject: true, warnings }
}
