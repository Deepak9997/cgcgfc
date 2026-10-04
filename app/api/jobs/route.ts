import { createJob, getTools, getVideoInfo } from "@/lib/jobs";
import type { JobKind } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const tools = await getTools();
  return Response.json(tools);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    url?: string;
    action?: "info" | "start";
    kind?: JobKind;
  };

  try {
    if (body.action === "info") {
      if (!body.url) {
        return Response.json({ error: "A YouTube URL is required." }, { status: 400 });
      }
      const info = await getVideoInfo(body.url);
      return Response.json(info);
    }

    if (body.action === "start") {
      if (!body.url || !body.kind) {
        return Response.json(
          { error: "A YouTube URL and a download type are required." },
          { status: 400 },
        );
      }
      if (!["video", "audio", "frames"].includes(body.kind)) {
        return Response.json({ error: "Unknown download type." }, { status: 400 });
      }
      const job = createJob(body.url, body.kind);
      return Response.json({ id: job.id });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
