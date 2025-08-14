export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { listItemEvents, logItemEvent } from "@/lib/server/data-mongo"

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const rows = await listItemEvents(params.id)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const ev = await logItemEvent(params.id, { type: String(body.type || "event"), data: body.data })
    return NextResponse.json(ev)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to create event" }, { status: 400 })
  }
}