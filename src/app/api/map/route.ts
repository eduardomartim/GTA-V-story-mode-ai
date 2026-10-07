import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { ensureReady } from "@/lib/kb/bootstrap";
import { loadCoastline } from "@/lib/kb/datasets";
import { DATASET_NOTICES } from "@/lib/map/attribution";
import { getMarkers } from "@/lib/map/markers";
import { authorize, enforceRateLimit, errorResponse } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only map layer data (markers with explicit position precision). No user input reaches SQL. */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    authorize(req);
    enforceRateLimit(req, "map");
    await ensureReady().catch(() => {
      throw new AppError("database_unavailable");
    });
    const markers = await getMarkers(await getDb());
    // GPL-3.0 coastline: read from its dataset at request time (never bundled); null when the dataset is absent.
    const coastline = loadCoastline();
    return NextResponse.json({ markers, coastline, attribution: DATASET_NOTICES }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
