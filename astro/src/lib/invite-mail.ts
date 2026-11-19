// Review invitations sent through Wix (Email Transmissions API), one email per person so each carries its
// own opt-out link.
//
// The privacy promise: we keep only a scrambled code of each invited address, never the address itself.
// Wix creates a contact for every address it emails, so the daily job (/api/pay/reminders) cleans up:
//   - Before sending, we check whether the address is already a contact. Existing contacts (members,
//     customers) are never touched.
//   - For each email we keep only Wix's transmission ID in the team-only InviteCleanup collection.
//   - Once Wix has finished with a transmission, cleanupInvites() permanently deletes the contact it created
//     (only if it isn't a member and was created after the email was sent) and then Wix's record of the
//     email, which holds the address.
import { auth } from "@wix/essentials";
import { items } from "@wix/data";
import { emailTransmissions } from "@wix/email-transmissions";
import { contacts } from "@wix/crm";
import { inviteEmail } from "./business";

const insert = auth.elevate(items.insert);
const remove = auth.elevate(items.remove);
const query = auth.elevate(items.query);
const send = auth.elevate(emailTransmissions.sendEmailTransmission);
const getTx = auth.elevate(emailTransmissions.getEmailTransmission);
const deleteTx = auth.elevate(emailTransmissions.deleteEmailTransmission);
const findContacts = auth.elevate(contacts.queryContacts);
const deleteContact = auth.elevate(contacts.deleteContact);

const DAY = 86_400_000;
const GIVE_UP_DAYS = 14;

async function contactsFor(email: string): Promise<any[]> {
  const res: any = await findContacts({ filter: { "primaryInfo.email": { $eq: email } }, paging: { limit: 10 } } as any);
  return res?.contacts || [];
}

export class QuotaError extends Error {}

/* Sends one email per address. Returns the addresses that went out; stops at Wix's monthly limit. */
export async function sendBatch(company: any, kind: "customer" | "employee", link: string, to: { email: string; optout: string }[]): Promise<string[]> {
  const sent: string[] = [];
  for (const t of to) {
    const existed = (await contactsFor(t.email).catch(() => [{}])).length > 0; /* unsure? treat as existing: never delete */
    const mail = inviteEmail(company, kind, link, t.optout);
    let tx: any;
    try {
      tx = await send(
        { emailSubject: mail.subject, emailHtmlContent: mail.html, senderName: "Know The Company", toRecipients: [{ emailAddress: t.email }], type: "TRANSACTIONAL" as any, metadata: { kind: "review-invite" } },
        {},
      );
    } catch (e: any) {
      if (/OUT_OF_QUOTA/.test(String(e?.message || e?.details?.applicationError?.code || ""))) {
        if (sent.length) break;
        throw new QuotaError("quota");
      }
      if (sent.length) break;
      throw e;
    }
    const id = tx?.emailTransmission?._id || tx?.emailTransmission?.id || tx?._id;
    if (id) await insert("InviteCleanup", { transmission: id, newContact: !existed, sentAt: new Date() }).catch(() => null);
    sent.push(t.email);
  }
  return sent;
}

/* Daily: delete the contacts and email records Wix kept for finished invitations. Counts only. */
export async function cleanupInvites(now = Date.now()) {
  const res = { pending: 0, contactsDeleted: 0, recordsDeleted: 0, waiting: 0, failed: 0 };
  const rows = (await query("InviteCleanup").limit(1000).find()).items;
  for (const row of rows) {
    res.pending++;
    try {
      const tx: any = await getTx(row.transmission).catch((e: any) => (/NOT_FOUND|404/.test(String(e?.message || "")) ? null : Promise.reject(e)));
      if (tx && !["PROCESSED", "REJECTED", "ABORTED"].includes(tx.status)) {
        if (now - new Date(row.sentAt).getTime() < GIVE_UP_DAYS * DAY) { res.waiting++; continue; }
      }
      if (tx && row.newContact) {
        const sentAt = new Date(row.sentAt).getTime();
        for (const r of tx.toRecipients || []) {
          if (!r.emailAddress) continue;
          for (const c of await contactsFor(r.emailAddress)) {
            const made = new Date(c._createdDate || c.createdDate || 0).getTime();
            if (c.memberInfo || !(made >= sentAt - 60_000)) continue; /* a member, or a contact that was there before */
            await deleteContact(c._id || c.id);
            res.contactsDeleted++;
          }
        }
      }
      if (tx) { await deleteTx(row.transmission).catch(() => null); res.recordsDeleted++; }
      await remove("InviteCleanup", row._id);
    } catch {
      res.failed++;
    }
  }
  return res;
}
