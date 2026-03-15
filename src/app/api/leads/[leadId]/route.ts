import { NextResponse } from "next/server";
import { NotFoundError, getLeadById } from "@/lib/campaigns/service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    leadId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { leadId } = await context.params;

  try {
    const lead = await getLeadById(leadId);

    return NextResponse.json({
      lead,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status: 404,
        }
      );
    }

    throw error;
  }
}
