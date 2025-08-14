export type NotificationTarget = "vendor" | "department"

export type NotificationInput = {
  target: NotificationTarget
  vendor_id?: string
  department_id?: number
  message: string
}

async function sendEmailStub(to: string, subject: string, body: string): Promise<void> {
  // Stubbed email sender; replace with nodemailer integration if needed
  console.log(`[email] to=${to} subject=${subject} body=${body}`)
}

async function sendSmsStub(to: string, body: string): Promise<void> {
  // Stubbed SMS sender; replace with Twilio integration if needed
  console.log(`[sms] to=${to} body=${body}`)
}

export async function sendNotificationViaIntegrations(input: NotificationInput): Promise<void> {
  // In a real app, look up recipient contact by vendor_id/department_id
  // For now, we just log stubs with synthetic recipients
  const recipient = input.target === "vendor" ? `vendor:${input.vendor_id || "unknown"}` : `department:${input.department_id ?? "unknown"}`
  const subject = "SMART E-Waste Notification"
  const body = input.message
  await Promise.all([
    sendEmailStub(recipient, subject, body),
    sendSmsStub(recipient, body),
  ])
}