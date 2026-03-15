import { NextResponse } from "next/server";
import { getDashboardSnapshot } from "@/lib/dashboard/service";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const snapshot = await getDashboardSnapshot();

  return NextResponse.json(snapshot);
}
