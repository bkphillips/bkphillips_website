import { orgJson } from "@/lib/org/server";

export async function GET() {
  return new Response(await orgJson(), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control":
        process.env.NODE_ENV === "production" ? "public, max-age=3600" : "no-store",
    },
  });
}
