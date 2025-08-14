export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { getItem, updateItem, logItemEvent } from "@/lib/server/data-mongo"

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const item = await getItem(params.id)
  if (!item) return new NextResponse("Not found", { status: 404 })
  return NextResponse.json(item)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const changes = await req.json()
  const updated = await updateItem(params.id, changes)
  if (!updated) return new NextResponse("Not found", { status: 404 })
  try {
    const types: string[] = []
    if (typeof changes.status === "string") types.push("status_changed")
    if (typeof changes.disposition === "string") types.push("disposition_set")
    for (const t of types) {
      await logItemEvent(params.id, { type: t, data: changes })
    }
  } catch {}
  return NextResponse.json(updated)
}
