import { randomUUID } from "crypto"
import { getDb } from "./mongo"

export type Role = "student" | "coordinator" | "admin" | "vendor"
export type ItemCategory = "Laptop" | "Monitor" | "Battery" | "Other"
export type ItemStatus = "Reported" | "Awaiting Pickup" | "Scheduled" | "Collected" | "Recycled" | "Refurbished" | "Safely Disposed"
export type Disposition = "Recyclable" | "Reusable" | "Hazardous" | null

export type Department = { id: number; name: string; location: string }
export type Vendor = { id: string; company_name: string; contact_person: string; email: string; cpcb_registration_no: string; availability?: string[] }
export type EwasteItem = {
  id: string
  name: string
  description?: string
  category: ItemCategory
  status: ItemStatus
  department_id: number
  reported_by: string
  reported_date: string
  disposed_date?: string | null
  disposition: Disposition
  qr_code_url: string
}
export type Pickup = { id: string; vendor_id: string; admin_id: string; scheduled_date: string; status: "Scheduled" | "Completed" }
export type Campaign = { id: string; title: string; date: string; description?: string }

export type ItemEvent = {
  id: string
  item_id: string
  type: string
  at: string
  actor_role?: Role | null
  actor_id?: string | null
  data?: any
}

export type Notification = {
  id: string
  target: "vendor" | "department"
  vendor_id?: string
  department_id?: number
  message: string
  at: string
  read?: boolean
}

function mapId<T extends Record<string, any>>(doc: any, extra?: Partial<T>): T {
  if (!doc) return doc
  const { _id, ...rest } = doc
  return { id: String(_id), ...(rest as any), ...(extra || {}) }
}

// Simple rules-based disposition classifier
function classifyDisposition(input: { name: string; description?: string; category: ItemCategory }): Disposition {
  const desc = (input.description || "").toLowerCase()
  if (input.category === "Battery") return "Hazardous"
  if (/(leak|acid|damag|broken|crack|smok|bulg)/.test(desc)) return "Hazardous"
  if (input.category === "Monitor") return "Recyclable"
  if (input.category === "Laptop") {
    if (/(working|good|functional|refurb)/.test(desc)) return "Reusable"
    return "Recyclable"
  }
  return "Recyclable"
}

// Departments
export async function listDepartments(): Promise<Department[]> {
  const db = await getDb()
  const rows = await db.collection("departments").find({}).project({ _id: 1, name: 1, location: 1 }).toArray()
  return rows.map((d: any) => ({ id: typeof d._id === "number" ? d._id : Number(d._id), name: d.name, location: d.location }))
}

// Vendors
export async function listVendors(): Promise<Vendor[]> {
  const db = await getDb()
  const rows = await db.collection("vendors").find({}).project({ _id: 1, company_name: 1, contact_person: 1, email: 1, cpcb_registration_no: 1, availability: 1 }).toArray()
  return rows.map((v: any) => ({ id: String(v._id), company_name: v.company_name, contact_person: v.contact_person, email: v.email, cpcb_registration_no: v.cpcb_registration_no, availability: Array.isArray(v.availability) ? v.availability : undefined }))
}

// Items
export async function createItem(input: { name: string; description?: string; category: ItemCategory; department_id: number; reported_by: string; origin: string }): Promise<EwasteItem> {
  const db = await getDb()
  const id = randomUUID()
  const now = new Date().toISOString()
  const qrUrl = `${input.origin}/item/${id}`
  const disposition = classifyDisposition({ name: input.name, description: input.description, category: input.category })
  const doc = {
    _id: id,
    name: input.name,
    description: input.description || null,
    category: input.category,
    status: "Reported" as ItemStatus,
    department_id: input.department_id,
    reported_by: input.reported_by,
    reported_date: now,
    disposed_date: null,
    disposition,
    qr_code_url: qrUrl,
  }
  await db.collection("items").insertOne(doc)
  await logItemEvent(id, { type: "created", data: { category: doc.category, department_id: doc.department_id } })
  return mapId<EwasteItem>(doc)
}

export async function listItems(filter?: { status?: ItemStatus; department_id?: number; category?: ItemCategory }): Promise<EwasteItem[]> {
  const db = await getDb()
  const q: any = {}
  if (filter?.status) q.status = filter.status
  if (filter?.department_id) q.department_id = filter.department_id
  if (filter?.category) q.category = filter.category
  const rows = await db.collection("items").find(q).sort({ reported_date: -1 }).toArray()
  return rows.map((d: any) => mapId<EwasteItem>(d))
}

export async function getItem(id: string): Promise<EwasteItem | null> {
  const db = await getDb()
  const d = await db.collection("items").findOne({ _id: id })
  return d ? mapId<EwasteItem>(d) : null
}

export async function updateItem(id: string, changes: Partial<Pick<EwasteItem, "status" | "description" | "category" | "disposed_date" | "disposition">>): Promise<EwasteItem | null> {
  const db = await getDb()
  await db.collection("items").updateOne({ _id: id }, { $set: changes })
  const d = await db.collection("items").findOne({ _id: id })
  return d ? mapId<EwasteItem>(d) : null
}

export async function logItemEvent(item_id: string, event: { type: string; actor_role?: Role; actor_id?: string; data?: any }): Promise<ItemEvent> {
  const db = await getDb()
  const id = randomUUID()
  const at = new Date().toISOString()
  const rec = { _id: id, item_id, type: event.type, at, actor_role: event.actor_role || null, actor_id: event.actor_id || null, data: event.data || null }
  await db.collection("item_events").insertOne(rec)
  return { id, item_id, type: event.type, at, actor_role: event.actor_role || null, actor_id: event.actor_id || null, data: event.data || null }
}

export async function listItemEvents(item_id: string): Promise<ItemEvent[]> {
  const db = await getDb()
  const rows = await db.collection("item_events").find({ item_id }).sort({ at: -1 }).toArray()
  return rows.map((r: any) => ({ id: String(r._id), item_id: r.item_id, type: r.type, at: r.at, actor_role: r.actor_role || null, actor_id: r.actor_id || null, data: r.data || null }))
}

export async function createNotification(input: { target: "vendor" | "department"; vendor_id?: string; department_id?: number; message: string }): Promise<Notification> {
  const db = await getDb()
  const id = randomUUID()
  const at = new Date().toISOString()
  const rec = { _id: id, target: input.target, vendor_id: input.vendor_id, department_id: input.department_id, message: input.message, at, read: false }
  await db.collection("notifications").insertOne(rec)
  return { id, target: input.target, vendor_id: input.vendor_id, department_id: input.department_id, message: input.message, at, read: false }
}

export async function listNotifications(filter: { target?: "vendor" | "department"; vendor_id?: string; department_id?: number } = {}): Promise<Notification[]> {
  const db = await getDb()
  const q: any = {}
  if (filter.target) q.target = filter.target
  if (filter.vendor_id) q.vendor_id = filter.vendor_id
  if (typeof filter.department_id === "number") q.department_id = filter.department_id
  const rows = await db.collection("notifications").find(q).sort({ at: -1 }).toArray()
  return rows.map((r: any) => ({ id: String(r._id), target: r.target, vendor_id: r.vendor_id, department_id: r.department_id, message: r.message, at: r.at, read: r.read }))
}

// Pickups
export async function schedulePickup(input: { admin_id: string; vendor_id: string; scheduled_date: string; item_ids: string[] }): Promise<Pickup> {
  const db = await getDb()
  const id = randomUUID()
  const pick: Pickup = { id, admin_id: input.admin_id, vendor_id: input.vendor_id, scheduled_date: input.scheduled_date, status: "Scheduled" }
  await db.collection("pickups").insertOne({ _id: id, ...pick })
  if (input.item_ids?.length) {
    const ops = input.item_ids.map((item_id) => ({ _id: randomUUID(), pickup_id: id, item_id }))
    if (ops.length) await db.collection("pickup_items").insertMany(ops)
    await db.collection("items").updateMany({ _id: { $in: input.item_ids } }, { $set: { status: "Scheduled" } })
    const items = await db.collection("items").find({ _id: { $in: input.item_ids } }).project({ _id: 1, department_id: 1 }).toArray()
    for (const it of items) {
      await logItemEvent(String(it._id), { type: "scheduled", actor_role: "admin", actor_id: input.admin_id, data: { vendor_id: input.vendor_id, scheduled_date: input.scheduled_date } })
      await createNotification({ target: "department", department_id: typeof it.department_id === "number" ? it.department_id : Number(it.department_id), message: `Pickup scheduled on ${input.scheduled_date} for item ${String(it._id)}` })
    }
    await createNotification({ target: "vendor", vendor_id: input.vendor_id, message: `Pickup scheduled: ${input.item_ids.length} item(s) on ${input.scheduled_date}` })
  }
  return pick
}

// Campaigns
export async function listCampaigns(): Promise<Campaign[]> {
  const db = await getDb()
  const rows = await db.collection("campaigns").find({}).sort({ date: -1 }).toArray()
  return rows.map((d: any) => mapId<Campaign>(d))
}

export async function createCampaign(input: { title: string; date: string; description?: string }): Promise<Campaign> {
  const db = await getDb()
  const id = randomUUID()
  const doc = { _id: id, title: input.title, date: input.date, description: input.description || null }
  await db.collection("campaigns").insertOne(doc)
  return mapId<Campaign>(doc)
}

// Analytics
export async function analyticsVolumeTrends(): Promise<{ month: string; count: number }[]> {
  const items = await listItems()
  const map = new Map<string, number>()
  for (const it of items) {
    const m = it.reported_date.slice(0, 7)
    map.set(m, (map.get(m) || 0) + 1)
  }
  return Array.from(map.entries()).sort((a, b) => (a[0] > b[0] ? 1 : -1)).map(([month, count]) => ({ month, count }))
}

export async function analyticsCategoryDistribution(): Promise<{ category: ItemCategory; count: number }[]> {
  const items = await listItems()
  const map = new Map<ItemCategory, number>()
  for (const it of items) map.set(it.category, (map.get(it.category) || 0) + 1)
  return Array.from(map.entries()).map(([category, count]) => ({ category, count }))
}

export async function analyticsRecoveryRate(): Promise<{ rate: number; recycled: number; disposed: number }> {
  const items = await listItems()
  const recycled = items.filter((i) => i.status === "Recycled").length
  const disposed = items.filter((i) => ["Recycled", "Refurbished", "Safely Disposed"].includes(i.status)).length
  const total = items.length
  const rate = total ? Math.round(((recycled / total) * 100 + Number.EPSILON) * 100) / 100 : 0
  return { rate, recycled, disposed }
}

