import { getJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = getJob(id);
  if (!job) {
    return Response.json({ error: "Job not found." }, { status: 404 });
  }
  return Response.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    filename: job.filename,
    error: job.error,
    title: job.title,
    frameCount: job.frameCount,
  });
}
