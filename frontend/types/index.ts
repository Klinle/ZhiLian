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
export interface KnowledgeNode {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string;
  pagerank_weight: number;
  is_lighted: boolean;
  proficiency: number;
  study_duration: number;
}

export interface RecommendedNode {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string;
  pagerank: number;
  proficiency: number;
  reason: string;
}

export interface ProfileStats {
  lighted_nodes: number;
  total_nodes: number;
  pass_rate: number;
  passed_labs: number;
  total_submissions: number;
  study_duration_hours: number;
  memory_count: number;
}
