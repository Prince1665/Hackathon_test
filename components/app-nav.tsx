"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type Role = "student" | "coordinator" | "admin" | "vendor"

export function AppNav({ className }: { className?: string }) {
  const router = useRouter()
  const [role, setRole] = useState<Role | null>(null)
  const [showBlocked, setShowBlocked] = useState(false)

  useEffect(() => {
    fetch("/api/auth/session").then(async (r) => {
      const s = await r.json()
      setRole(s?.user?.role ?? null)
    })
  }, [])

  function canAccess(path: string): boolean {
    // Everyone can access the public homepage
    if (path === "/") return true
    if (role === "admin") return true
    if (role === "vendor") return path.startsWith("/vendor")
    if (role === "student" || role === "coordinator") return path.startsWith("/report")
    return false
  }

  function go(path: string) {
    if (canAccess(path)) router.push(path)
    else setShowBlocked(true)
  }

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" })
    if (typeof window !== "undefined") window.location.href = "/"
  }

  return (
    <header className={cn("w-full border-b bg-background", className)}>
      <div className="container flex h-14 items-center justify-center gap-4 relative">
        <a onClick={() => go("/")} className="font-semibold cursor-pointer">
          SMART E WASTE MANAGEMENT SYSTEM
        </a>
        <div className="absolute right-0 flex items-center gap-2">
          <ThemeToggle />
          {role ? (
            <Button size="sm" variant="ghost" onClick={onLogout}>
              Logout
            </Button>
          ) : (
            <Button asChild size="sm" className="bg-[#ff6b35] hover:bg-[#e55a2b] text-white">
              <a href="/login">Login</a>
            </Button>
          )}
        </div>
      </div>

      <Dialog open={showBlocked} onOpenChange={setShowBlocked}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Feature unavailable</DialogTitle>
            <DialogDescription>
              You don’t have access to this feature with your current role.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </header>
  )
}
