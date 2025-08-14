"use client"

import { useEffect, useRef, useState } from "react"
import { AppNav } from "@/components/app-nav"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
// Import with error handling for browser environment
import { BrowserQRCodeReader } from "@zxing/browser"

type Item = {
  id: string
  name: string
  status: string
  category: string
}

export default function VendorScanPage() {
  const [cameraReady, setCameraReady] = useState(false)
  const [result, setResult] = useState<string>("")
  const [item, setItem] = useState<Item | null>(null)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment")
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const codeReaderRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    // Initialize QR code reader only on client side
    if (typeof window !== 'undefined') {
      try {
        codeReaderRef.current = new BrowserQRCodeReader()
      } catch (error) {
        console.error('Failed to initialize QR code reader:', error)
      }
    }

    return () => {
      stopCamera()
      codeReaderRef.current = null
    }
  }, [])

  function stopCamera() {
    const v = videoRef.current
    const s = streamRef.current || ((v?.srcObject as MediaStream | null) ?? null)
    if (s) {
      s.getTracks().forEach((t) => t.stop())
    }
    if (v) v.srcObject = null
    streamRef.current = null
    try { codeReaderRef.current?.stopContinuousDecode?.() } catch {}
  }

  async function startScan() {
    setItem(null)
    setResult("")
    setCameraReady(true)
    try {
      // Ask for camera permission up front
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } })
      streamRef.current = stream
      const v = videoRef.current
      if (v) v.srcObject = stream

      // Ensure reader exists
      if (!codeReaderRef.current) {
        try {
          codeReaderRef.current = new BrowserQRCodeReader()
        } catch (error) {
          throw new Error("QR Code reader not available")
        }
      }
    } catch (e: any) {
      if (e?.name === "NotAllowedError") {
        alert("Camera permission denied. Please allow camera access to scan QR codes.")
      } else {
        alert(e?.message || "Failed to access camera")
      }
      setCameraReady(false)
    }
  }

  async function scanQRCode() {
    if (!cameraReady || !videoRef.current || !codeReaderRef.current) return

    const reader = codeReaderRef.current
    const video = videoRef.current

    try {
      await new Promise<void>((resolve, reject) => {
        const onResult = async (res: any, err: any, controls?: { stop: () => void }) => {
          if (res) {
            try {
              let text = ''
              if (typeof res.getText === "function") text = res.getText()
              else if (typeof res.text === "string") text = res.text
              else if (typeof res === "string") text = res
              else text = JSON.stringify(res)

              setResult(text)
              await handleDecoded(text)
              resolve()
            } catch (innerErr) {
              reject(innerErr)
            } finally {
              try { controls?.stop?.() } catch {}
              try { reader.stopContinuousDecode?.() } catch {}
            }
          } else if (err && err.name && err.name !== "NotFoundException") {
            try { controls?.stop?.() } catch {}
            try { reader.stopContinuousDecode?.() } catch {}
            reject(err)
          }
        }

        if (typeof reader.decodeFromVideoElement === 'function') {
          reader.decodeFromVideoElement(video, onResult)
        } else if (typeof reader.decodeFromVideoDevice === 'function') {
          reader.decodeFromVideoDevice(undefined, video, onResult)
        } else {
          reject(new Error("QR code reader not fully initialized"))
        }
      })
    } catch (e: any) {
      if (e?.name !== "NotFoundException") {
        console.error("QR Scan error:", e)
        alert(e?.message || "Failed to scan QR code")
      }
    }
  }
  
  function toggleCamera() {
    const newMode = facingMode === "environment" ? "user" : "environment"
    setFacingMode(newMode)
    
    // Restart camera with new facing mode
    if (cameraReady) {
      stopCamera()
      setTimeout(() => startScan(), 300)
    }
  }

  async function handleDecoded(text: string) {
    // Expect URL like https://host/item/{id}
    try {
      const url = new URL(text)
      const parts = url.pathname.split("/")
      const id = parts[parts.length - 1]
      const res = await fetch(`/api/items/${id}`)
      if (res.ok) {
        const data = await res.json()
        setItem(data)
      } else {
        setItem(null)
        alert("Item not found")
      }
    } catch {
      // Maybe direct ID
      const id = text.trim()
      const res = await fetch(`/api/items/${id}`)
      if (res.ok) setItem(await res.json())
    }
  }

  async function confirmCollection() {
    if (!item) return
    const res = await fetch(`/api/items/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "Collected" }) })
    if (res.ok) {
      const updated = await res.json()
      setItem(updated)
    } else {
      alert("Failed to update status")
    }
  }

  return (
    <main>
      <AppNav />
      <section className="container py-8 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Vendor QR Scan</CardTitle>
            <CardDescription>Use device camera to scan item QR and update status.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
              <div className="grid gap-2">
                <Label htmlFor="manual">Manual item ID or QR URL (fallback)</Label>
                <Input id="manual" placeholder="Paste QR URL or Item ID" onChange={(e) => setResult(e.target.value)} value={result} />
              </div>
              <Button onClick={() => handleDecoded(result)} disabled={!result}>Lookup</Button>
            </div>
            <div className="grid gap-3">
              <div className="relative rounded border overflow-hidden bg-black/80 aspect-video">
                <video ref={videoRef} className="w-full h-full object-cover" muted autoPlay playsInline />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {!cameraReady ? (
                  <>
                    <Button onClick={startScan}>Start Camera</Button>
                  </>
                ) : (
                  <>
                    <Button onClick={scanQRCode}>Scan QR</Button>
                    <Button variant="outline" onClick={toggleCamera}>
                      Switch Camera ({facingMode === "environment" ? "Back" : "Front"})
                    </Button>
                    <Button variant="outline" onClick={stopCamera}>Stop</Button>
                  </>
                )}
              </div>
              <div className="text-xs text-muted-foreground">Note: Allow camera access when prompted. Use the Scan QR button to capture the current frame.</div>
            </div>
            {item ? (
              <div className="rounded border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.id}</div>
                  </div>
                  <Badge>{item.status}</Badge>
                </div>
                <div className="mt-3">
                  <Button onClick={confirmCollection} disabled={item.status === "Collected"}>Confirm Collection</Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
