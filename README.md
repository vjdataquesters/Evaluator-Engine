# 🏗️ System Design Evaluation Engine

Welcome! Thank you for participating in our **System Design Workshop**. As requested, here is the open-source repository for the **Automatic Evaluation Engine** used to assess, evaluate, and score the system designs you built!

This application uses a multi-agent AI framework to simulate a "panel of expert judges". It looks at system architecture decisions, data flows, and infrastructure scaling to automatically provide feedback.

---

## 📂 Two Flavors: TypeScript & Python

To make it accessible for everyone, this repository contains the evaluation engine in two different programming languages! 

*   **TypeScript / Node.js** (Root Directory)
    *   `src/graph.ts` - The core AI routing and evaluation logic.
    *   `src/llmConfig.ts` - **👉 AI Prompt Templates!** Check here to see how the AI is instructed.
    *   `src/firebaseUtils.ts` - Database operations for saving scores.
*   **Python Version** (`MAEE - Python/` Directory)
    *   A complete Python implementation using the exact same logic.
    *   *Head inside that folder to find its own dedicated README and setup guide.*

---

## 🚀 Quick Setup (TypeScript Version)

If you'd like to test the TypeScript engine on your own machine:

### 1. Install Dependencies
Make sure you have [Node.js](https://nodejs.org/) installed, then run:
```bash
npm install
```

### 2. Configure Environment Secrets
We need to provide the AI API keys. Copy the example file:
```bash
cp .env.example .env
```
Open the `.env` file and add your `OPENAI_API_KEY` (and Firebase credentials if you wish to record the data).

> **🔍 Want to see the AI's thought process? (LangSmith)**  
> This project uses **LangChain Tracing**. If you add your `LANGCHAIN_API_KEY` and set `LANGCHAIN_TRACING_V2=true` in your `.env` file, you can use the LangSmith web dashboard to visually debug, inspect, and monitor the exact prompts going in and out of the LLM in real-time!

### 3. Run the Engine
Execute the main entry point:
```bash
npx ts-node src/main.ts
```

---

## 🧠 Tweak the AI Prompts!

The most fun part of this project is playing with the prompts. If you want to make the AI judge more strict, more lenient, or look for specific System Design patterns (like caching strategies or load balancers), you can edit the prompt templates directly here:

*   **TypeScript:** `src/llmConfig.ts`
*   **Python:** `MAEE - Python/src/llm_config.py`

Feel free to fork this codebase, build upon it, and use it to auto-evaluate your own prep for tech interviews or system architecture practices! Let's keep building!
