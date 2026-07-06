export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  openaiApiKey: string;
  model: string;
}

// Lab types
export interface Lab {
  id: string;
  title: string;
  description?: string;
  starter_code?: string;
  test_cases?: Record<string, unknown>;
  difficulty?: string;
  lab_type?: string;
  node_id?: string;
}

export interface Submission {
  id: string;
  submitted_code: string;
  status: string;
  score: number;
  evaluation_result?: Record<string, unknown>;
  ai_feedback?: string;
  created_at: string;
}
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  openaiApiKey: string;
  model: string;
}
