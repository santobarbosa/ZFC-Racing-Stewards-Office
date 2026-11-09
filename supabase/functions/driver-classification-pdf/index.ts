import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const bucket = "zfc-driver-classification-reports";

function text(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}

async function buildReport(snapshot: Record<string, any>): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const red = rgb(0.82, 0.06, 0.16);
  const dark = rgb(0.08, 0.1, 0.13);
  const muted = rgb(0.35, 0.39, 0.43);
  const pageSize: [number, number] = [595.28, 841.89];
  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - 48;

  const newPage = () => {
    page = pdf.addPage(pageSize);
    y = pageSize[1] - 48;
    page.drawRectangle({ x: 0, y: pageSize[1] - 9, width: pageSize[0], height: 9, color: red });
  };
  const ensureSpace = (height: number) => {
    if (y - height < 48) newPage();
  };
  const line = (value: string, options: { size?: number; font?: typeof regular; color?: ReturnType<typeof rgb>; indent?: number } = {}) => {
    const size = options.size ?? 10;
    const font = options.font ?? regular;
    const color = options.color ?? dark;
    const indent = options.indent ?? 0;
    const maxWidth = pageSize[0] - 96 - indent;
    const words = value.split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        ensureSpace(size + 6);
        page.drawText(current, { x: 48 + indent, y, size, font, color });
        y -= size + 5;
        current = word;
      } else current = candidate;
    }
    if (current) {
      ensureSpace(size + 6);
      page.drawText(current, { x: 48 + indent, y, size, font, color });
      y -= size + 5;
    }
  };
  const heading = (value: string) => {
    ensureSpace(28);
    y -= 10;
    line(value.toUpperCase(), { size: 12, font: bold, color: red });
    page.drawLine({ start: { x: 48, y: y + 1 }, end: { x: pageSize[0] - 48, y: y + 1 }, thickness: 0.6, color: rgb(0.84, 0.86, 0.88) });
    y -= 8;
  };
  const pair = (label: string, value: unknown) => line(`${label}: ${text(value)}`);

  page.drawRectangle({ x: 0, y: pageSize[1] - 9, width: pageSize[0], height: 9, color: red });
  page.drawText("ZFC", { x: 48, y, size: 26, font: bold, color: red });
  page.drawText("RACING  /  STEWARDS OFFICE", { x: 105, y: y + 7, size: 10, font: bold, color: dark });
  page.drawText("OFFICIAL DRIVER CLASSIFICATION REPORT", { x: 105, y: y - 9, size: 8, font: regular, color: muted });
  y -= 38;
  line("ZFC DRIVER CLASSIFICATION REPORT", { size: 19, font: bold });
  pair("Dokumentennummer", snapshot.documentNumber);
  pair("Bewerbungsnummer", snapshot.applicationNumber);
  pair("Freigabestatus", snapshot.status);

  const driver = snapshot.driver || {};
  heading("Fahrerdaten");
  pair("Fahrername", driver.name);
  pair("EA-ID", driver.eaId);
  pair("Discord-ID", driver.discordId);
  pair("E-Mail", driver.email);
  pair("Plattform", driver.platform);
  pair("Weitere Stammdaten", driver.extra);

  const tests = snapshot.tests || {};
  const config = snapshot.referenceConfig || {};
  const calculation = snapshot.calculation || {};
  heading("Time-Trial-Ergebnisse und Referenzzeiten");
  for (const track of config.tracks || []) {
    const trial = Number(tests.timeTrials?.[track.id]);
    const reference = Number(track.referenceSeconds);
    const deviation = Number.isFinite(trial) && reference > 0 ? ((trial - reference) / reference) * 100 : null;
    pair(track.name, `Fahrer ${Number.isFinite(trial) ? `${trial.toFixed(3)} s` : "—"} · Referenz ${reference > 0 ? `${reference.toFixed(3)} s` : "—"} · Abweichung ${deviation === null ? "—" : `${deviation >= 0 ? "+" : ""}${deviation.toFixed(3)} %`}`);
  }
  heading("Bewertung");
  pair("Time-Trial-Score", calculation.categoryScores?.timeTrial);
  pair("Race Pace", tests.racePace);
  pair("Konstanz", tests.consistency);
  pair("Safety Rating", tests.safetyRating);
  pair("Gesamt-Performance-Rating", `${text(calculation.rating)} / 1.000`);
  pair("Divisionsvorschlag", snapshot.suggestedDivision);
  pair("Gewichtungen", JSON.stringify(config.weights || {}));
  pair("Tester-Notizen", tests.notes);

  heading("Entscheidung");
  pair("Genehmigte Division", snapshot.approvedDivision);
  pair("Begründung", snapshot.decisionReason);
  pair("Verantwortlicher Mitarbeiter", snapshot.reviewer?.name);
  pair("Freigabedatum", snapshot.decidedAt);
  pair("Status", snapshot.status);

  const pages = pdf.getPages();
  pages.forEach((current, index) => {
    current.drawText(`ZFC RACING · VERTRAULICH · ${index + 1}/${pages.length}`, {
      x: 48, y: 27, size: 8, font: regular, color: muted,
    });
  });
  return await pdf.save();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return Response.json({ error: "Authentication required" }, { status: 401, headers: corsHeaders });
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) throw new Error("Supabase function environment is incomplete.");

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: userResult, error: authError } = await userClient.auth.getUser();
    if (authError || !userResult.user) return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: profile, error: profileError } = await admin.from("zfc_user_profiles")
      .select("access_tier").eq("id", userResult.user.id).single();
    if (profileError) throw profileError;
    if (Number(profile.access_tier) < 3) return Response.json({ error: "Tier 3 access required" }, { status: 403, headers: corsHeaders });

    const body = await request.json();
    if (!body?.reportId) return Response.json({ error: "reportId is required" }, { status: 400, headers: corsHeaders });
    const { data: report, error: reportError } = await admin.from("zfc_driver_classification_reports")
      .select("id,application_id,document_number,snapshot").eq("id", body.reportId).single();
    if (reportError) throw reportError;
    if (report.snapshot?.status !== "Approved") throw new Error("Only approved reports can be generated.");

    const { data: existingFile, error: fileReadError } = await admin.from("zfc_driver_classification_report_files")
      .select("pdf_path").eq("report_id", report.id).maybeSingle();
    if (fileReadError) throw fileReadError;
    let path = existingFile?.pdf_path;
    if (!path) {
      path = `${report.application_id}/${report.document_number}.pdf`;
      const pdf = await buildReport(report.snapshot);
      const { error: uploadError } = await admin.storage.from(bucket).upload(path, new Blob([pdf], { type: "application/pdf" }), {
        contentType: "application/pdf", upsert: true,
      });
      if (uploadError) throw uploadError;
      const { error: fileWriteError } = await admin.from("zfc_driver_classification_report_files")
        .upsert({ report_id: report.id, pdf_path: path, generated_at: new Date().toISOString() });
      if (fileWriteError) throw fileWriteError;
    }
    const { data: signed, error: signedError } = await admin.storage.from(bucket).createSignedUrl(path, 3600);
    if (signedError) throw signedError;
    return Response.json({ signedUrl: signed.signedUrl, documentNumber: report.document_number }, { headers: corsHeaders });
  } catch (error) {
    console.error("Driver classification PDF operation failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "PDF operation failed" }, { status: 500, headers: corsHeaders });
  }
});
