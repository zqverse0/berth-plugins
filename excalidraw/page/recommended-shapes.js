import { r as React } from "./assets/history-panel-DFDXp4P1.js"

const h = React.createElement
const packs = [
  ["youritjang/software-architecture.excalidrawlib", "软件架构", "Software Architecture", "Youri Tjang", "服务、数据库、缓存、事件总线等", "Services, databases, caches, event buses"],
  ["pgilfernandez/basic-shapes.excalidrawlib", "基础图形", "Basic shapes", "Pablo Gil Fernández", "通用几何组件", "General-purpose geometry"],
  ["BjoernKW/UML-ER-library.excalidrawlib", "UML 与实体关系", "Shapes for UML & ER Diagrams", "BjoernKW", "类图和实体关系图常用符号", "Symbols for class and entity-relationship diagrams"],
]

export function RecommendedShapes({ editor }) {
  const zh = berth.ui.locale.startsWith("zh")
  const t = (cn, en) => zh ? cn : en
  const [busy, setBusy] = React.useState(false)
  const [added, setAdded] = React.useState(null)
  const [error, setError] = React.useState("")
  React.useEffect(() => {
    let live = true
    berth.storage.get("recommended-shape-packs").then((items) => {
      if (live) setAdded(new Set(Array.isArray(items) ? items : []))
    }).catch((reason) => { if (live) setError(reason.message) })
    return () => { live = false }
  }, [])

  async function add(source, label) {
    if (!editor || busy || !added || added.has(source)) return
    setBusy(true); setError("")
    try {
      const { content } = await berth.scripts.run("private/library.js", { action: "publicLibrary", source })
      const active = await berth.editor.active()
      if (active?.path !== editor.editorPath) throw new Error(t("画板已切换，请重试。", "Drawing changed. Try again."))
      await berth.editor.request(editor.editorPath, "library.import", { content, name: label, published: true })
      const next = new Set([...added, source])
      setAdded(next)
      await berth.storage.set("recommended-shape-packs", [...next])
      await berth.ui.notify(t(`已导入：${label}`, `Imported: ${label}`))
    } catch (reason) { setError(reason.message) }
    finally { setBusy(false) }
  }

  return h("details", { className: "recommended-shapes", open: true },
    h("summary", null, t("推荐组件包", "Recommended packs")),
    !editor && h("p", { className: "berth-muted" }, t("打开画板后可按需导入。", "Open a drawing to import a pack.")),
    error && h("p", { className: "berth-error-text", role: "alert" }, error),
    h("ul", null, packs.map(([source, cn, en, author, desc, description]) => h("li", { key: source },
      h("div", null, h("strong", null, t(cn, en)), h("small", null, `${author} · ${t(desc, description)}`)),
      h("button", { type: "button", className: "action quiet", disabled: !editor || busy || !added || added.has(source),
        onClick: () => add(source, en) }, added?.has(source) ? t("已导入", "Imported") : t("导入", "Import"))))))
}
