import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { cleanupJob, getJob } from "@/lib/jobs";

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
  if (job.status !== "done" || !job.filePath || !job.filename) {
    return Response.json({ error: "File is not ready yet." }, { status: 409 });
  }

  const nodeStream = createReadStream(job.filePath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  const filename = job.filename.replace(/"/g, "");

  setTimeout(() => {
    void cleanupJob(id);
  }, 60_000);

  return new Response(webStream, {
    headers: {
      "Content-Type": job.mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
