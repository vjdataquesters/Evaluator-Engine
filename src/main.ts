import http from "http";
import {
  initializeFirebase,
  getPendingSubmissions,
  updateSubmissionStatus,
  getProblemContent,
  saveEvaluationResults,
} from "./firebaseUtils";
import { runEvalPipeline } from "./graph";

async function run() {
  console.log(`[worker] starting — ${new Date().toISOString()}`);

  const db = initializeFirebase();
  const pending = await getPendingSubmissions(db);

  if (pending.length === 0) {
    console.log("[worker] no pending submissions, exiting");
    return;
  }

  const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 5);
  console.log(`[worker] found ${pending.length} pending submission(s) — running up to ${CONCURRENCY} in parallel`);

  async function processOne(submission: typeof pending[number]) {
    const { rollno, imageKey, imageMimeType, ps } = submission;
    console.log(`[worker] processing rollno=${rollno} ps=${ps}`);

    try {
      if (!imageKey) throw new Error("imageKey is missing");
      if (!ps)       throw new Error("ps (problem number) is missing");

      const sd_problem = await getProblemContent(db, ps);

      const result = await runEvalPipeline({
        rollno,
        ps,
        image_key:          imageKey,
        image_mime_type:    imageMimeType,
        sd_problem,
        extracted_design:   "",
        score_80:           0,
        evaluator_feedback: "",
        edge_cases:         [],
        mcqs:               [],
      });

      await saveEvaluationResults(db, rollno, {
        score_80:           result.score_80,
        evaluator_feedback: result.evaluator_feedback,
        edge_cases:         result.edge_cases,
        mcqs:               result.mcqs,
      });

      console.log(`[worker] done rollno=${rollno} score=${result.score_80} mcqs=${result.mcqs.length}`);
    } catch (err) {
      console.error(`[worker] failed rollno=${rollno}:`, err);
      await updateSubmissionStatus(db, rollno, "failed").catch(() => {});
    }
  }

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(processOne));
  }

  console.log("[worker] all done");
}

let running = false;

function startServer() {
  const port = Number(process.env.PORT ?? 3000);

  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/run") {
      if (running) {
        console.log("[server] run already in progress — skipping");
        res.writeHead(202).end("Already running");
        return;
      }

      res.writeHead(202).end("Run triggered");
      running = true;
      run().finally(() => { running = false; });
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200).end(JSON.stringify({ status: "ok", running }));
      return;
    }

    res.writeHead(404).end("Not found");
  });

  server.listen(port, () => {
    console.log(`[server] listening on port ${port}`);
  });
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    startServer();
  } else {
    const intervalMs = 5_000;
    console.log(`[worker] local mode — polling every ${intervalMs / 1000}s`);
    while (true) {
      await run();
      await new Promise((res) => setTimeout(res, intervalMs));
    }
  }
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
