export interface MCQQuestion {
  question: string;
  options: string[];
  correct_answer: string;
  explanation: string;
}

export type SSDMCQQuestion = MCQQuestion;

export interface EvaluationState {
  rollno: string;
  ps: number | null;
  image_key: string; 
  image_mime_type: string;
  sd_problem: string;
  extracted_design: string;
  score_80: number; 
  evaluator_feedback: string;
  edge_cases: string[];
  mcqs: MCQQuestion[]; 
}

export interface SSDProblem {
  title: string;
  content: string[];
}


export interface SSDSubmission {
  rollno: string;
  imageKey: string;
  imageMimeType: string;
  ps: number | null;
  status: "pending" | "mcqs-pending" | "mcqs-attempting" | "completed";
  updatedAt: number;
  // agent-populated fields
  questions?: SSDMCQQuestion[];
  edge_cases?: string[];
  score_80?: number;
  evaluator_feedback?: string;
  // mcq attempt fields
  mcqStartedAt?: number;
  userAnswers?: { question: string; selected: string }[];
  mcqScore?: number;
}
