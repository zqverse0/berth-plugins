// Import local curated packs by name without replacing the user's existing shapes.
const packs = ["network-topology", "network-elements", "racks-and-servers", "lucide-security", "tabler-security", "agent-llm-safety"]

export default async function shapeAdmin(input) {
  const stored = await berth.storage.get("shape-library")
  if (stored != null && !Array.isArray(stored.libraryItems)) throw new Error("Unexpected existing shape library format")
  const items = stored?.libraryItems ?? []
  if (input?.action !== "install") return { count: items.length, curated: items.filter((item) => item.id?.startsWith("paper-pack-")).map(({ name }) => name) }
  if (input.pack && !packs.includes(input.pack)) throw new Error("Unknown curated pack")
  const seen = new Set(items.map((item) => item.id))
  const added = []
  const counts = {}
  for (const pack of input.pack ? [input.pack] : packs) {
    const data = JSON.parse(await berth.fs.readText(`${berth.storage.dir}/library/component-packs/${pack}.excalidrawlib`))
    if (data.type !== "excalidrawlib" || !Array.isArray(data.libraryItems)) throw new Error(`Invalid pack: ${pack}`)
    counts[pack] = 0
    for (const item of data.libraryItems) {
      if (!Array.isArray(item.elements) || !item.elements.length || item.elements.some(({ type }) => ["image", "iframe", "embeddable"].includes(type)))
        throw new Error(`Unsupported item in ${pack}`)
      if (!item.id?.startsWith(`paper-pack-${pack}-`)) throw new Error(`Unexpected item ID in ${pack}`)
      if (!seen.has(item.id)) { seen.add(item.id); added.push(item); counts[pack]++ }
    }
  }
  if (added.length) await berth.storage.set("shape-library", { ...stored, libraryItems: [...added, ...items] })
  return { before: items.length, added: added.length, total: items.length + added.length, packs: counts }
}
