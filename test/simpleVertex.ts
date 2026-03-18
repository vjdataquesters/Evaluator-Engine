import { VertexAI } from '@google-cloud/vertexai';
import dotenv from "dotenv";
dotenv.config();

function getEnv(key: string): string {
    const val = process.env[key];
    if (!val) throw new Error(`Missing env var: ${key}`);
    return val;
}

let vertexAI: VertexAI;
let keysInitialized = false;

const initializeVertexAI = async () => {
    if (keysInitialized && vertexAI) return;

    vertexAI = new VertexAI({
        project: getEnv("GOOGLE_CLOUD_PROJECT_ID"),
        location: getEnv("VERTEX_LOCATION"),
        apiEndpoint: getEnv("VERTEX_API_ENDPOINT"),
        googleAuthOptions: {
            credentials: {
                client_email: getEnv("GOOGLE_CLOUD_CLIENT_EMAIL"),
                private_key: getEnv("GOOGLE_CLOUD_PRIVATE_KEY").replace(/\\n/g, "\n"),
            },
        },
    });

    keysInitialized = true;
    console.log('Vertex AI initialized successfully');
};

export const generateResponse = async (prompt: string): Promise<string> => {
    await initializeVertexAI();

    const model = vertexAI.getGenerativeModel({
        model: getEnv("GEMINI_MODEL"),
        generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 8192,
        },
    });

    const imageUri = "gs://vnrvjdq.firebasestorage.app/submissions/zoro.jpg";
    const result = await model.generateContent({
        contents: [
            {
                role: 'user',
                parts: [
                    { text: "Can you see this image? Please describe exactly what is in it to prove you have access." },
                    { fileData: { mimeType: 'image/jpg', fileUri: imageUri } },
                ],
            },
        ],
    });

    const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
        throw new Error('No response text generated.');
    }
    return responseText;
};

async function run() {
    try {
        console.log('Sending request to Gemini...');
        const start = Date.now();
        const response = await generateResponse("Hello, Gemini! Tell me a quick joke.");
        console.log(`time taken: ${Date.now() - start}ms`);
        console.log("\n--- Model Response ---");
        console.log(response);
        console.log("----------------------\n");
    } catch (error) {
        console.error("Execution failed:", error);
    }
}

run();
