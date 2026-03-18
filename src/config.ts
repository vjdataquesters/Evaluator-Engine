import dotenv from "dotenv";
dotenv.config();

function getEnv(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

export const config = {
  // Vertex AI 
  projectId: getEnv("GOOGLE_CLOUD_PROJECT_ID"),
  clientEmail: getEnv("GOOGLE_CLOUD_CLIENT_EMAIL"),
  privateKey: getEnv("GOOGLE_CLOUD_PRIVATE_KEY").replace(/\\n/g, "\n"),

  //  Firebase Admin SDK 
  firebaseProjectId: getEnv("FIREBASE_PROJECT_ID"),
  firebaseClientEmail: getEnv("FIREBASE_CLIENT_EMAIL"),
  firebasePrivateKey: getEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),

  // Firebase Storage 
  storageBucket: getEnv("STORAGE_BUCKET"),

  // Vertex AI 
  geminiModel: getEnv("GEMINI_MODEL", "gemini-2.5-flash"),
  vertexLocation: getEnv("VERTEX_LOCATION", "global"),
  vertexApiEndpoint: getEnv("VERTEX_API_ENDPOINT", "aiplatform.googleapis.com"),

  // Firestore collections 
  submissionsCollection: getEnv("SSD_SUBMISSIONS_COLLECTION", "ssd-submissions"),
  problemsCollection: getEnv("SSD_PROBLEMS_COLLECTION", "ssd-problems"),
} as const;
