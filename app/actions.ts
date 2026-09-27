"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getCurrentUser, getLead, getWorkspace } from "@/lib/data";
import { triggerWorkflow } from "@/lib/n8n/client";
import { parseLeadForm, type LeadFormField } from "@/lib/lead-form";
import { LEAD_STATUSES, NOTE_MAX_LENGTH, type LeadStatus } from "@/lib/types";

const PUBLIC_FORM_WORKSPACE_ID = "ws_studio_nova";

export type SubmitLeadState =
  | { status: "idle" }
  | { status: "invalid"; errors: Partial<Record<LeadFormField, string>> }
  | { status: "ok" };

export async function submitLead(
  _prevState: SubmitLeadState,
  formData: FormData,
): Promise<SubmitLeadState> {
  const parsed = parseLeadForm(formData);
  if (!parsed.ok) {
    return { status: "invalid", errors: parsed.errors };
  }

  const requestHeaders = await headers();
  const ipAddress = requestHeaders.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
  const userAgent = requestHeaders.get("user-agent") ?? "";

  const lead = await db.insertLead({
    ...parsed.data,
    workspaceId: PUBLIC_FORM_WORKSPACE_ID,
    jobTitle: "",
    city: "",
    country: "",
    source: "website",
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    ipAddress,
    userAgent,
    rawPayload: {
      form: { id: "contact-main", version: "2026-07", fields: parsed.data },
      request: {
        ip: ipAddress,
        userAgent,
        acceptLanguage: requestHeaders.get("accept-language"),
        receivedAt: new Date().toISOString(),
      },
    },
  });

  after(async () => {
    await triggerWorkflow({
      event: "lead-created",
      data: { leadId: lead.id, company: lead.company, budget: lead.budget, source: lead.source },
      idempotencyKey: `lead-created:${lead.id}`,
      correlationId: randomUUID(),
      async: false,
    });
    await logAudit("lead.created", lead.id);
  });

  return { status: "ok" };
}

async function requireLeadInUserWorkspace(id: string) {
  const user = await getCurrentUser();
  const [workspace, lead] = await Promise.all([getWorkspace(user.workspaceSlug), getLead(id)]);
  if (!lead || lead.workspaceId !== workspace.id) {
    throw new Error("Lead not found");
  }
}

export async function updateLeadStatus(id: string, status: LeadStatus) {
  if (!LEAD_STATUSES.some((value) => value === status)) {
    throw new Error("Unknown lead status");
  }
  await requireLeadInUserWorkspace(id);
  await db.updateLeadStatus(id, status);
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${id}`);
}

export type AddNoteState =
  | { status: "idle" | "ok" }
  | { status: "invalid"; errors: { text?: string }; values: { text: string } };

export async function addNote(
  _prevState: AddNoteState,
  formData: FormData,
): Promise<AddNoteState> {
  const rawId = formData.get("leadId");
  const id = typeof rawId === "string" ? rawId : "";
  await requireLeadInUserWorkspace(id);

  const raw = formData.get("text");
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text.length === 0 || text.length > NOTE_MAX_LENGTH) {
    return {
      status: "invalid",
      errors: { text: `Від 1 до ${NOTE_MAX_LENGTH} символів` },
      values: { text: text.slice(0, NOTE_MAX_LENGTH) },
    };
  }

  await db.appendNote(id, text);
  revalidatePath(`/dashboard/leads/${id}`);
  after(() => logAudit("lead.note_added", id));
  return { status: "ok" };
}

export async function deleteLead(id: string) {
  await requireLeadInUserWorkspace(id);
  await db.deleteLead(id);
  revalidatePath("/dashboard");
}
