// Mirrors src/lib/leads/types.ts's LeadAdapter shape on purpose — same
// "interface + one adapter behind it" pattern used for lead-capture, so
// adding a second provider later (or swapping Resend out) means writing one
// new file, not touching the route that calls it.
export interface EmailMessage {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  name: string;
  send(message: EmailMessage): Promise<{ ok: true }>;
}
