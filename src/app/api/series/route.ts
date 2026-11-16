import { isSourceId, loadSeries, validId } from "@/lib/inflection/sources";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const source = params.get("source") ?? "";
  const id = (params.get("id") ?? "").trim();

  if (!isSourceId(source) || !validId(source, id)) {
    return Response.json({ error: "Unknown source or name." }, { status: 400 });
  }

  try {
    const series = await loadSeries(source, id);
    if (!series) {
      return Response.json({ error: "No data found for that name." }, { status: 404 });
    }
    return Response.json(series);
  } catch {
    return Response.json(
      { error: "The data provider could not be reached. Try again in a moment." },
      { status: 502 },
    );
  }
}
