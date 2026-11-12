// Team logins for Business companies: /api/team/invite, /list and /remove (a verified owner's own access
// token), and /join (the person who opened a team invitation link, logged in). Up to TEAM_MAX people can
// manage a Business company's page. Each link works once and for TEAM_DAYS days.
import type { APIRoute } from "astro";
import { json, memberFrom } from "../../../lib/pay";
import { businessCompany, get, update, insert, query, sha256, TEAM_MAX, TEAM_DAYS, teamExpiry, ORIGIN } from "../../../lib/business";

const randomToken = () => [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, "0")).join("");

export const POST: APIRoute = async ({ params, request }) => {
  try {
    const me = await memberFrom(request);
    if (!me) return json({ error: "Please log in again." }, 401);
    const body = await request.json().catch(() => ({}));

    if (params.action === "join") {
      const token = String(body.token || "");
      if (!/^[a-f0-9]{48}$/.test(token)) return json({ error: "That team link isn’t complete. Ask for a new one." }, 400);
      const inv: any = (await query("TeamInvites").eq("tokenHash", await sha256(token)).limit(1).find()).items[0];
      if (!inv || inv.usedBy || new Date(inv.expires).getTime() < Date.now()) return json({ error: `That team link has been used or has expired. Links work once, for ${TEAM_DAYS} days. Ask for a new one.` }, 410);
      const c: any = await get("Companies", inv.company).catch(() => null);
      if (!c || c.plan !== "business" || c.claimStatus !== "verified") return json({ error: "This company’s plan no longer includes team logins." }, 403);
      const owners: string[] = c.ownerMemberIds || [];
      if (owners.includes(me.id)) return json({ ok: true, company: c._id, already: true });
      if (owners.length >= TEAM_MAX) return json({ error: `This company already has ${TEAM_MAX} team logins. Ask an owner to remove someone first.` }, 409);
      const reviews = (await query("Reviews").eq("_owner", me.id).limit(1).find().catch(() => ({ items: [] as any[] }))).items;
      if (reviews.length) return json({ error: "This account has written reviews, and reviewer and company accounts are kept apart. Log in with your work account instead." }, 409);
      await update("Companies", { ...c, ownerMemberIds: [...owners, me.id] });
      await update("TeamInvites", { ...inv, usedBy: me.id, usedName: me.name || me.email || "", usedAt: new Date() });
      return json({ ok: true, company: c._id });
    }

    const company = await businessCompany(me.id, String(body.company || ""));
    if (!company) return json({ error: "Team logins come with the Business plan, for the company's verified owners." }, 403);
    const owners: string[] = company.ownerMemberIds || [];

    if (params.action === "invite") {
      if (owners.length >= TEAM_MAX) return json({ error: `You already have ${TEAM_MAX} team logins. Remove someone to invite another person.` }, 409);
      const token = randomToken();
      await insert("TeamInvites", { company: company._id, tokenHash: await sha256(token), createdBy: me.id, expires: teamExpiry() });
      return json({ ok: true, link: `${ORIGIN}/#join-team-${token}`, days: TEAM_DAYS });
    }

    if (params.action === "list") {
      const used = (await query("TeamInvites").eq("company", company._id).limit(100).find()).items.filter((i: any) => i.usedBy);
      const nameOf = (id: string) => (used.find((i: any) => i.usedBy === id) || {}).usedName || "";
      return json({ max: TEAM_MAX, members: owners.map(id => ({ id, name: id === me.id ? (me.name || me.email || "You") : nameOf(id), you: id === me.id })) });
    }

    if (params.action === "remove") {
      const member = String(body.member || "");
      if (!owners.includes(member)) return json({ error: "That person isn’t on this company’s team." }, 404);
      if (member === me.id) return json({ error: "You can’t remove yourself. Ask another owner to do it." }, 400);
      await update("Companies", { ...company, ownerMemberIds: owners.filter(id => id !== member) });
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, 404);
  } catch (e: any) {
    return json({ error: "That didn’t work this time. Please try again." }, 500);
  }
};
