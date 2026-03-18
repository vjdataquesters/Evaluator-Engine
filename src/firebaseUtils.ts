import admin from "firebase-admin";
import { config } from "./config";
import type { SSDProblem, SSDSubmission } from "./types";


export function initializeFirebase(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebaseProjectId,
        clientEmail: config.firebaseClientEmail,
        privateKey: config.firebasePrivateKey,
      }),
      storageBucket: config.storageBucket,
    });
  }
  return admin.firestore();
}


async function claimSubmission(
  db: admin.firestore.Firestore,
  docId: string,
): Promise<SSDSubmission | null> {
  const ref = db.collection(config.submissionsCollection).doc(docId);

  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;

      const d = snap.data()!;
      if (d.status !== "pending") return null; // already claimed by another worker

      tx.update(ref, { status: "processing", updatedAt: Date.now() });

      return {
        rollno: d.rollno ?? snap.id,
        imageKey: d.imageKey ?? "",
        imageMimeType: d.imageMimeType ?? "image/jpeg",
        ps: d.ps ?? null,
        status: "pending" as const,
        updatedAt: d.updatedAt ?? 0,
      };
    });
  } catch {
    return null;
  }
}

export async function getPendingSubmissions(
  db: admin.firestore.Firestore
): Promise<SSDSubmission[]> {
  const snap = await db
    .collection(config.submissionsCollection)
    .where("status", "==", "pending")
    .get();

  const results = await Promise.all(
    snap.docs.map((doc) => claimSubmission(db, doc.id))
  );

  return results.filter((s): s is SSDSubmission => s !== null);
}

export async function updateSubmissionStatus(
  db: admin.firestore.Firestore,
  rollno: string,
  status: string
): Promise<void> {
  await db.collection(config.submissionsCollection).doc(rollno).update({
    status,
    updatedAt: Date.now(),
  });
}

export async function getProblemContent(
  db: admin.firestore.Firestore,
  ps: number | null
): Promise<string> {
  const snap = await db.collection(config.problemsCollection).doc(String(ps)).get();
  if (!snap.exists) throw new Error(`Problem ${ps} not found in ${config.problemsCollection}`);

  const data = snap.data() as SSDProblem;
  const lines: string[] = [];
  if (data.title) lines.push(`Title: ${data.title}`);
  if (data.content) lines.push(...data.content);
  return lines.join("\n");
}

export async function saveEvaluationResults(
  db: admin.firestore.Firestore,
  rollno: string,
  results: {
    score_80: number;
    evaluator_feedback: string;
    edge_cases: string[];
    mcqs: object[];
  }
): Promise<void> {
  await db.collection(config.submissionsCollection).doc(rollno).update({
    status: "mcqs-pending",
    score_80: results.score_80,
    evaluator_feedback: results.evaluator_feedback,
    edge_cases: results.edge_cases,
    questions: results.mcqs,
    updatedAt: Date.now(),
  });
}
