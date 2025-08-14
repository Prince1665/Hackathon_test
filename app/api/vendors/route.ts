export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/server/mongo"
import { listVendors } from "@/lib/server/data-mongo"

export async function GET() {
  const rows = await listVendors()
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const db = await getDb()
    if (!body.id || !Array.isArray(body.availability)) {
      return NextResponse.json({ error: "id and availability[] required" }, { status: 400 })
    }
    await db.collection("vendors").updateOne({ _id: body.id }, { $set: { availability: body.availability } }, { upsert: false })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update" }, { status: 400 })
  }
}
