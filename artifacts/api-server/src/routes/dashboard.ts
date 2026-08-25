import { Router, type IRouter } from "express";
import { db, instructorsTable } from "@workspace/db";

const router: IRouter = Router();
router.get("/dashboard", async (_req, res) => {
  const rows = await db.select().from(instructorsTable);
  const effective = (r: typeof rows[number]) => r.manualStatus ?? r.computedStatus;
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const inMonth = (value: string | null) => value && new Date(value).getMonth() === month && new Date(value).getFullYear() === year;
  const active = rows.filter((r) => effective(r) === "active");
  const joiners = rows.filter((r) => inMonth(r.dateOfJoining));
  const exits = rows.filter((r) => effective(r) === "exited" && inMonth(r.exitDate));
  const grouped = (key: "subDepartment" | "designation") => Object.entries(rows.reduce<Record<string, number>>((acc, row) => { const label = row[key] ?? "Unassigned"; acc[label] = (acc[label] ?? 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, count: value })).sort((a, b) => b.count - a.count);
  const trend = Array.from({ length: 15 }, (_, index) => {
    const date = new Date(year, month - 14 + index, 1);
    const label = date.toLocaleString("en", { month: "short" });
    return { month: label, joiners: rows.filter((r) => r.dateOfJoining && new Date(r.dateOfJoining).getMonth() === date.getMonth() && new Date(r.dateOfJoining).getFullYear() === date.getFullYear()).length, exits: rows.filter((r) => r.exitDate && new Date(r.exitDate).getMonth() === date.getMonth() && new Date(r.exitDate).getFullYear() === date.getFullYear()).length };
  });
  const needsReview = rows.filter((r) => effective(r) === "needs_review").length;
  res.json({ kpis: { total_instructors: rows.length, active: active.length, exceptions: needsReview, exits: exits.length, joiners_this_month: joiners.length, exits_this_month: exits.length, net_change: joiners.length - exits.length, attrition_rate: rows.length ? Math.round((exits.length / rows.length) * 1000) / 10 : 0, pending_deployment: rows.filter((r) => effective(r) === "pending_deployment").length, needs_review: needsReview, converted_university: rows.filter((r) => effective(r) === "converted_university").length, total_exited: rows.filter((r) => effective(r) === "exited").length }, monthly_trend: trend, sub_departments: grouped("subDepartment"), designations: grouped("designation") });
});
export default router;