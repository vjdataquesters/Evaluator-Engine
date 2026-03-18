import { VertexAI, GenerativeModel } from "@google-cloud/vertexai";
import { config } from "./config";

interface ThinkingGenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  thinkingConfig: {
    thinkingBudget: number; 
    includeThoughts: boolean; 
  };
}

function createVertexAI(): VertexAI {
  return new VertexAI({
    project:     config.projectId,
    location:    config.vertexLocation,
    apiEndpoint: config.vertexApiEndpoint,
    googleAuthOptions: {
      credentials: {
        client_email: config.clientEmail,
        private_key:  config.privateKey,
      },
    },
  });
}

const thinkingConfig: ThinkingGenerationConfig["thinkingConfig"] = {
  thinkingBudget:  8192,
  includeThoughts: false,
};

// Agent 2 — evaluate design, JSON output
export function getLlm(): GenerativeModel {
  return createVertexAI().getGenerativeModel({
    model: config.geminiModel,
    generationConfig: {
      temperature:      0.6,
      maxOutputTokens:  16384,
      responseMimeType: "application/json",
      thinkingConfig,
    } as unknown as Parameters<VertexAI["getGenerativeModel"]>[0]["generationConfig"],
  });
}

// Agent 3 — MCQ generation, needs large output budget; thinking budget kept low
export function getMcqLlm(): GenerativeModel {
  return createVertexAI().getGenerativeModel({
    model: config.geminiModel,
    generationConfig: {
      temperature:      0.6,
      maxOutputTokens:  24576,
      responseMimeType: "application/json",
      thinkingConfig: {
        thinkingBudget:  2048,
        includeThoughts: false,
      },
    } as unknown as Parameters<VertexAI["getGenerativeModel"]>[0]["generationConfig"],
  });
}

// Agent 1 — multimodal (vision), free-form text output
export function getMultimodalLlm(): GenerativeModel {
  return createVertexAI().getGenerativeModel({
    model: config.geminiModel,
    generationConfig: {
      temperature:     0.6,
      maxOutputTokens: 16384,
      thinkingConfig,
    } as unknown as Parameters<VertexAI["getGenerativeModel"]>[0]["generationConfig"],
  });
}
