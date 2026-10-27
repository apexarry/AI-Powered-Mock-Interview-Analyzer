export interface User {
  user_id: number;
  name: string;
  email: string;
}

export interface Options {
  roles: string[];
  difficulties: string[];
  questions_per_interview: number;
}

export interface Question {
  question_id: number;
  category: string;
  question_text: string;
  answered: boolean;
}

export type InterviewStatus = "created" | "ready" | "in_progress" | "completed" | "abandoned";

export interface Interview {
  interview_id: number;
  role: string;
  difficulty: string;
  status: InterviewStatus;
  start_time: string | null;
  end_time: string | null;
  questions: Question[];
}

export interface InterviewSummary {
  interview_id: number;
  role: string;
  difficulty: string;
  status: InterviewStatus;
  created_at: string;
  end_time: string | null;
  overall_score: number | null;
}

export interface DeviceCheck {
  ok: boolean;
  face_count: number;
  message: string;
}

export interface FrameResult {
  face_count: number;
  attentive: boolean;
  event_logged: string | null;
}

export type BrowserEvent = "tab_switch" | "fullscreen_exit" | "camera_interrupted" | "mic_interrupted";

export interface Answer {
  question_id: number;
  transcript: string;
  speaking_rate: number;
  filler_count: number;
  duration_sec: number;
  answer_score: number;
  relevance: number;
  completeness: number;
  structure: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
}

export interface QuestionResult extends Omit<Answer, "question_id"> {
  question_text: string;
  category: string;
}

export interface ReportEvent {
  event_type: string;
  severity: string;
  timestamp: string;
}

export interface Report {
  interview_id: number;
  role: string;
  difficulty: string;
  start_time: string | null;
  end_time: string | null;
  answer_quality: number;
  speech_fluency: number;
  response_structure: number;
  gaze_attention: number | null;
  overall_score: number;
  integrity: {
    event_count: number;
    indicator: string;
    points: number;
    by_type: Record<string, number>;
    by_severity: Record<string, number>;
  };
  events: ReportEvent[];
  strengths: string[];
  improvements: string[];
  questions: QuestionResult[];
}
