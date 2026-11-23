import { r as React, c as ReactDOM, H as HistoryPanel } from "./assets/history-panel-DFDXp4P1.js"
import { ShapeLibrary } from "./assets/sidebar-Zb3ksJNI.js"
import { Materials } from "./materials.js"
import { RecommendedShapes } from "./recommended-shapes.js"

await berth.ready
const zh = berth.ui.locale.startsWith("zh")
const text = (cn, en) => zh ? cn : en
const h = React.createElement
const { useEffect, useLayoutEffect, useRef, useState } = React
const drawing = /\.excalidraw(?:\.md)?$/i
const historyScript = "private/history.js"
const message = (error) => error?.message ?? String(error)
const tabs = [
  { id: "gallery", label: text("图库", "Gallery") },
  { id: "library", label: text("素材库", "Library") },
]

function DrawingPreview({ item }) {
  const target = useRef(null)
  const [image, setImage] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    async function load() {
      try {
        window.EXCALIDRAW_ASSET_PATH ??= new URL("./", import.meta.url).href
        const [content, { renderScene }] = await Promise.all([
          berth.files.readText(item.relative), import("./assets/editor-Bz17e3sU.js"),
        ])
        if (!live) return
        const src = await renderScene({ path: item.relative, content, theme: "light", thumbnail: true })
        if (live) { setImage(src); setFailed(!src) }
      } catch {
        if (live) setFailed(true)
      }
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      void load()
    })
    observer.observe(target.current)
    return () => { live = false; observer.disconnect() }
  }, [item.relative])
  return h("span", { className: "drawing-preview", ref: target },
    image && !failed ? h("img", { src: image, alt: "", decoding: "async", onError: () => setFailed(true) }) :
      h("span", { "aria-hidden": true }, failed ? "◇" : "⋯"))
}

function Gallery({ editor, isCurrent }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState("")
  const [opening, setOpening] = useState("")
  const [openError, setOpenError] = useState("")
  const [historyRevision, setHistoryRevision] = useState(0)
  const [saving, setSaving] = useState(false)
  const [composerMount, setComposerMount] = useState(null)
  const [historyPath, setHistoryPath] = useState(null)
  const galleryScroll = useRef(0)
  const historyVisible = Boolean(editor?.path && historyPath === editor.path)

  useEffect(() => {
    if (historyPath && historyPath !== editor?.path) setHistoryPath(null)
  }, [historyPath, editor?.path])

  useLayoutEffect(() => {
    const scroll = document.getElementById("sidebar-scroll")
    if (scroll) scroll.scrollTop = historyVisible ? 0 : galleryScroll.current
  }, [historyVisible])

  function showHistory() {
    galleryScroll.current = document.getElementById("sidebar-scroll")?.scrollTop ?? 0
    setHistoryPath(editor.path)
  }

  useEffect(() => {
    let controller
    let closed = false
    async function load() {
      if (controller || closed) return
      controller = new AbortController()
      try {
        const result = await berth.scripts.run("private/gallery.js", {}, { signal: controller.signal })
        if (!closed) { setData(result); setError("") }
      } catch (error) {
        if (!closed) setError(message(error))
      } finally {
        controller = null
      }
    }
    const onVisible = () => { if (!document.hidden) void load() }
    void load()
    const timer = setInterval(onVisible, 15000)
    window.addEventListener("focus", onVisible)
    document.addEventListener("visibilitychange", onVisible)
    const stopDrop = berth.ui.context.onDrop?.((item) => {
      if (item.kind === "file" && drawing.test(item.path)) void open(item.path)
    })
    return () => {
      closed = true
      controller?.abort()
      clearInterval(timer)
      window.removeEventListener("focus", onVisible)
      document.removeEventListener("visibilitychange", onVisible)
      stopDrop?.()
    }
  }, [])

  async function open(path) {
    setOpening(path)
    setOpenError("")
    try { await berth.files.open(path) }
    catch (error) { setOpenError(message(error)) }
    finally { setOpening("") }
  }

  async function saveVersion() {
    if (!editor?.path || !isCurrent(editor.editorPath)) return
    setSaving(true)
    setOpenError("")
    try {
      const { content } = await berth.editor.request(editor.editorPath, "archiveSnapshot")
      if (!isCurrent(editor.editorPath)) return
      await berth.scripts.run(historyScript, { action: "snapshot", path: editor.path, content, by: "manual" })
      setHistoryRevision((n) => n + 1)
      await berth.ui.notify(text("当前画板已存档", "Current drawing archived"))
    } catch (error) { setOpenError(message(error)) }
    finally { setSaving(false) }
  }

  async function fork() {
    if (!isCurrent(editor.editorPath)) return
    setOpenError("")
    try { await berth.editor.request(editor.editorPath, "forkIdentity") }
    catch (error) { setOpenError(message(error)) }
  }

  const entries = data?.entries ?? []
  return h("section", { className: "drawing-gallery" },
    error && h("p", { className: "berth-error-text", role: "alert" }, error),
    openError && h("p", { className: "berth-error-text", role: "alert" }, openError),
    editor?.path && !editor.identityConflict && h("section", { className: "gallery-history", key: editor.path, hidden: !historyVisible },
      historyVisible && h("header", { className: "gallery-history-toolbar" },
        h("button", { type: "button", onClick: () => setHistoryPath(null) }, text("← 返回图库", "← Back to gallery")),
        h("h2", null, text("修改历史", "Revision history")),
        h("button", { type: "button", disabled: saving, onClick: saveVersion },
          saving ? text("存档中…", "Saving…") : text("保存当前版本", "Archive current version"))),
      h(HistoryPanel, { ...editor, key: editor.path, composerMount, isCurrent: () => isCurrent(editor.editorPath), revision: `${editor.revision}:${historyRevision}` })),
    h("div", { className: "gallery-drawings", hidden: historyVisible },
      editor?.identityConflict && h("div", { className: "gallery-identity-conflict" },
        h("p", { className: "berth-muted", title: editor.identityConflict }, text("这张图与另一文件共用编号。请先登记为新图，再使用历史。", "This copy shares another file’s ID. Register it as a new drawing before using history.")),
        h("button", { type: "button", onClick: fork }, text("作为新画板", "Register as new drawing"))),
      editor?.path && !editor.identityConflict && h("button", { type: "button", className: "gallery-history-entry", title: editor.path, onClick: showHistory },
        text("查看修改历史 →", "View revision history →")),
      data?.warnings?.length > 0 && h("details", { className: "berth-muted" },
        h("summary", null, text("部分目录无法读取", "Some folders could not be read")),
        h("ul", null, ...data.warnings.map((warning) => h("li", { key: warning }, warning)))),
      data && !entries.length && h("p", { className: "berth-muted" }, data.hasProject ?
        text("当前空间没有画板。", "No drawings in this workspace.") : text("还没有打开空间。", "No workspace is open.")),
      h("ul", { className: "gallery-list" }, entries.map((item) =>
        h("li", { key: item.path }, h("button", { type: "button", title: item.relative, "aria-label": item.relative,
          disabled: Boolean(opening), "aria-current": editor?.path === item.path ? "true" : undefined,
          onClick: () => open(item.relative) },
          h(DrawingPreview, { item, key: `${item.mtime}:${item.size}` })))))),
    editor?.path && h("footer", { className: "gallery-composer", ref: setComposerMount, hidden: historyVisible }))
}

function StoredShapes() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState("")
  useEffect(() => {
    let live = true
    berth.storage.get("shape-library").then((data) => {
      if (live) setItems(Array.isArray(data?.libraryItems) ? data.libraryItems : [])
    }).catch((e) => { if (live) setError(message(e)) })
    return () => { live = false }
  }, [])
  return h(React.Fragment, null,
    h("p", { className: "berth-muted" }, text("打开一张可编辑画板后，可以插入、收藏和管理图形。", "Open an editable drawing to insert, collect and manage shapes.")),
    error && h("p", { className: "berth-error-text", role: "alert" }, error),
    items?.length === 0 && h("p", { className: "berth-muted" }, text("还没有收藏图形。", "No saved shapes yet.")),
    items?.length > 0 && h("ul", { className: "gallery-stored-shapes" }, ...items.map((item, n) => h("li", { key: item.id },
      item.name || text(`图形 ${n + 1}`, `Shape ${n + 1}`), ` · ${item.elements?.length ?? 0}`, text(" 个元素", " elements")))))
}

function Sidebar() {
  const [tab, setTab] = useState("gallery")
  const [editor, setEditor] = useState(null)
  const [error, setError] = useState("")
  const active = useRef(null)
  useEffect(() => {
    const unsubscribe = berth.ui.onHeaderTab((id) => { if (tabs.some((x) => x.id === id)) setTab(id) })
    berth.ui.setHeaderTabs(tabs, "gallery").catch((e) => setError(message(e)))
    return unsubscribe
  }, [])
  useEffect(() => {
    let closed = false
    let revision = 0
    async function update() {
      const next = ++revision
      try {
        const current = await berth.editor.active()
        if (closed || next !== revision) return
        active.current = current?.path ?? null
        const state = current ? await berth.editor.request(current.path, "state") : null
        if (!closed && next === revision) setEditor(state ? { ...state, editorPath: current.path } : null)
      } catch {
        // The host briefly reports a new editor before its request handler mounts.
        if (!closed && next === revision) { active.current = null; setEditor(null) }
      }
    }
    const stop = berth.editor.onChange(update)
    void update()
    return () => { closed = true; active.current = null; stop() }
  }, [])
  return h(React.Fragment, null,
    error && h("p", { className: "berth-error-text", role: "alert" }, error),
    tab === "gallery" ? h(Gallery, { editor, isCurrent: (path) => active.current === path }) :
      h(Materials, { shapes: h("section", { className: "material-shapes" },
        h("h2", null, text("组件与图标", "Components & icons")),
        h(RecommendedShapes, { editor }),
        editor ? h(ShapeLibrary, { ...editor, key: editor.path ?? editor.editorPath }) : h(StoredShapes)) }))
}

ReactDOM.createRoot(document.getElementById("root")).render(h(Sidebar))
