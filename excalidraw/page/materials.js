import { r as React } from "./assets/history-panel-DFDXp4P1.js"
import { c as copy } from "./assets/clipboard-B7Antr-s.js"

const h = React.createElement
const { useEffect, useRef, useState } = React
const call = (input) => berth.scripts.run("private/library.js", input)
const labels = [
  ["prompt", "提示词", "Prompts"], ["palette", "配色", "Palettes"],
  ["reference", "参考图", "References"], ["shapes", "组件与图标", "Components & icons"],
  ["template", "模板", "Templates"], ["style", "风格", "Styles"],
]

function ReferencePreview({ item }) {
  const target = useRef(null)
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!item.thumb) return
    let live = true
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      call({ action: "get", id: item.id }).then((result) => { if (live) setUrl(result.thumbUrl) }).catch(() => {})
    })
    observer.observe(target.current)
    return () => { live = false; observer.disconnect() }
  }, [item.id, item.thumb])
  return h("div", { className: "material-reference", ref: target }, url && h("img", { src: url, alt: item.title }))
}

export function Materials({ shapes }) {
  const zh = berth.ui.locale.startsWith("zh")
  const t = (cn, en) => zh ? cn : en
  const [kind, setKind] = useState("template")
  const [data, setData] = useState(null)
  const [query, setQuery] = useState("")
  const [form, setForm] = useState(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [extras, setExtras] = useState(() => new Set())
  const [expanded, setExpanded] = useState(null)

  async function run(work) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError("")
    try { await work() } catch (reason) { setError(reason?.message ?? String(reason)) }
    finally { inFlight.current = false; setBusy(false) }
  }
  const reload = async () => setData(await call({ action: "list" }))
  useEffect(() => {
    void run(async () => {
      await reload()
      const saved = await berth.storage.get("extras").catch(() => null)
      if (Array.isArray(saved)) setExtras(new Set(saved))
    })
    const focus = () => { if (!inFlight.current) reload().catch(() => {}) }
    window.addEventListener("focus", focus)
    return () => window.removeEventListener("focus", focus)
  }, [])
  useEffect(() => berth.ui.context.onDrop?.((file) => {
    if (file.kind !== "file" || kind === "shapes") return
    void run(async () => {
      const added = await call({ action: "add", path: file.path, kind })
      await reload()
      selectKind(added.kind)
    })
  }), [kind])

  function selectKind(next) {
    setKind(next); setQuery(""); setForm(null); setExpanded(null); setError("")
  }
  function toggle(item) {
    void run(async () => {
      const next = new Set(extras)
      if (next.has(item.id)) next.delete(item.id); else next.add(item.id)
      await berth.storage.set("extras", [...next])
      setExtras(next)
    })
  }
  const selected = (data?.items ?? []).filter((item) => item.kind !== "template" && extras.has(item.id))
  const term = query.trim().toLowerCase()
  const items = (data?.items ?? []).filter((item) => item.kind === kind &&
    (!term || [item.title, item.excerpt, ...(item.tags ?? []), ...(item.colors ?? [])].some((part) => String(part ?? "").toLowerCase().includes(term))))
  const removed = (data?.removed ?? []).filter((item) => item.kind === kind)
  const filePath = (item) => `${data.dir}/${item.path}`
  const button = (label, action, className = "action quiet") => h("button", { type: "button", disabled: busy, className, onClick: action }, label)
  const update = (action, item) => run(async () => { await call({ action, id: item.id }); await reload() })
  const toClipboard = async (value) => {
    await copy(value, t("剪贴板不可用", "Clipboard unavailable"))
    await berth.ui.notify(t("已复制", "Copied"))
  }
  const send = (item) => run(async () => {
    const lines = [t("先阅读 Excalidraw 的画图技能。", "Read the Excalidraw drawing skill first.")]
    if (item) lines.push(item.path ? `${t("模板", "Template")}: ${filePath(item)}` :
      `${t("读取内置模板", "Read the built-in template")}: berth tools call excalidraw private/library.js --input '${JSON.stringify({ action: "get", id: item.id })}'`)
    for (const asset of selected) {
      const label = labels.find(([id]) => id === asset.kind)?.[zh ? 1 : 2] ?? asset.kind
      lines.push(`${label} · ${asset.title}: ${asset.colors?.join(", ") || filePath(asset)}`)
    }
    await berth.agent.attach({ label: item?.title ?? t("画图素材", "Drawing materials"), text: lines.join("\n") })
  })

  function card(item) {
    const palette = item.colors?.filter((color) => /^#[0-9A-F]{6}$/i.test(color)) ?? []
    return h("li", { className: "card material-card", key: item.id },
      item.thumbAsset && h("img", { className: "thumb", src: item.thumbAsset, alt: "", loading: "lazy" }),
      kind === "reference" && h(ReferencePreview, { item }),
      h("strong", null, item.title),
      palette.length > 0 && h("div", { className: "material-swatches" }, palette.map((color) =>
        h("button", { type: "button", key: color, title: color, "aria-label": `${t("复制", "Copy")} ${color}`,
          style: { backgroundColor: color }, onClick: () => run(() => toClipboard(color)) }))),
      item.excerpt && h("p", { className: "excerpt" }, item.excerpt),
      expanded?.id === item.id && h("pre", { className: "material-text" }, expanded.prompt),
      kind !== "template" && h("label", { className: "material-pick" },
        h("input", { type: "checkbox", checked: extras.has(item.id), disabled: busy, onChange: () => toggle(item) }),
        t("用于下次画图", "Use for the next drawing")),
      h("div", { className: "actions" },
        kind === "template" && button(t("新建画板", "New drawing"), () => run(async () => {
          const { path } = await call({ action: "create", id: item.id }); await berth.files.open(path)
        }), "action"),
        kind === "template" && button(t("按这个画", "Draw like this"), () => send(item)),
        palette.length > 0 && button(t("复制色值", "Copy colors"), () => run(() => toClipboard(palette.join(", ")))),
        item.hasPrompt && button(expanded?.id === item.id ? t("收起", "Close") : t("查看全文", "Read"), () =>
          expanded?.id === item.id ? setExpanded(null) : run(async () => setExpanded(await call({ action: "get", id: item.id })))),
        item.hasPrompt && button(t("复制", "Copy"), () => run(async () => toClipboard((await call({ action: "get", id: item.id })).prompt ?? ""))),
        item.path && kind !== "palette" && button(t("打开文件", "Open file"), () => run(() => berth.files.open(filePath(item)))),
        button(t("移除", "Remove"), () => update("remove", item))))
  }

  const canWrite = ["prompt", "palette", "style"].includes(kind)
  const title = labels.find(([id]) => id === kind)?.[zh ? 1 : 2]
  const dragHint = kind === "reference" ? t("把图片从文件树拖到这里，即可添加参考图。", "Drag an image from the file tree to add a reference.") :
    kind === "template" ? t("可把 .excalidraw 文件从文件树拖进来作为模板。", "Drag an .excalidraw file from the file tree to add a template.") :
    ["prompt", "style"].includes(kind) ? t("也可以从文件树拖入 .md 或 .txt。", "You can also drag a .md or .txt file from the file tree.") : ""
  return h("section", { className: "materials" },
    h("nav", { className: "material-groups", "aria-label": t("素材分类", "Material categories") }, labels.map(([id, cn, en]) =>
      h("button", { key: id, type: "button", "aria-pressed": kind === id, disabled: busy, onClick: () => selectKind(id) }, t(cn, en)))),
    kind === "shapes" ? shapes : h(React.Fragment, null,
      h("h2", null, title),
      error && h("p", { className: "berth-error-text", role: "alert" }, error),
      dragHint && h("p", { className: "berth-muted" }, dragHint),
      selected.length > 0 && button(t(`把已选素材交给 Agent（${selected.length}）`, `Send selected materials (${selected.length})`), () => send(null)),
      canWrite && !form && button(t(`添加${title}`, `Add ${title.toLowerCase()}`), () => setForm({ title: "", value: "" }), "action"),
      canWrite && form && h("form", { className: "material-form", onSubmit: (event) => {
        event.preventDefault()
        void run(async () => {
          await call(kind === "palette" ? { action: "addPalette", title: form.title, colors: form.value } :
            { action: "addText", kind, title: form.title, text: form.value })
          await reload(); setForm(null); setQuery("")
        })
      } },
      h("input", { required: true, className: "field", placeholder: t("名称", "Name"), "aria-label": t("名称", "Name"), value: form.title, onChange: (event) => setForm({ ...form, title: event.target.value }) }),
      h("textarea", { required: true, rows: 4, className: "field", value: form.value,
        "aria-label": kind === "palette" ? t("色值", "Hex colors") : t("正文", "Text"),
        placeholder: kind === "palette" ? "#1864AB, #FFD166, #F1F3F5" : t("输入正文…", "Enter text…"), onChange: (event) => setForm({ ...form, value: event.target.value }) }),
      h("div", { className: "actions" }, h("button", { type: "submit", className: "action", disabled: busy }, t("保存", "Save")),
        button(t("取消", "Cancel"), () => setForm(null)))),
      h("input", { type: "search", className: "search material-search", value: query, placeholder: t("搜索当前分类", "Search this category"),
        "aria-label": t("搜索当前分类", "Search this category"), onChange: (event) => setQuery(event.target.value) }),
      data && !items.length && h("p", { className: "berth-muted" }, term ? t("没有匹配的素材。", "No matching materials.") : t("这个分类还没有素材。", "Nothing in this category yet.")),
      h("ul", null, items.map(card)),
      removed.length > 0 && h("details", null, h("summary", null, t("已移除", "Removed")),
        h("ul", null, removed.map((item) => h("li", { className: "removed-row", key: item.id },
          h("span", { className: "grow" }, item.title), button(t("恢复", "Restore"), () => update("restore", item))))))))
}
