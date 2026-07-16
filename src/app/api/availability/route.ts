import { NextRequest, NextResponse } from "next/server";
import { getAvailability } from "@/lib/availability";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const leaveAtParam = request.nextUrl.searchParams.get("leaveAt");
    const includeTomorrow =
      request.nextUrl.searchParams.get("includeTomorrow") === "1" ||
      request.nextUrl.searchParams.get("includeTomorrow") === "true";

    let leaveAt: Date | undefined;
    if (leaveAtParam) {
      const parsed = new Date(leaveAtParam);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: "Invalid leaveAt datetime" },
          { status: 400 },
        );
      }
      leaveAt = parsed;
    }

    const data = await getAvailability({ leaveAt, includeTomorrow });
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Availability lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
