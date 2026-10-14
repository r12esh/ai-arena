// ============================================================
// Core domain types for AI Arena
// ============================================================

export type VoteChoice = "left" | "right" | "tie" | "both_bad";

export type BattleStatus = "pending" | "streaming" | "completed" | "error";

export type ResponseStatus = "pending" | "streaming" | "completed" | "error";

/** A single model response within a battle */
export interface ModelResponse {
  /** Which side of the comparison this response is on */
  side: "left" | "right";
  /** Provider identifier (e.g. "openai", "groq") */
  provider: string;
  /** Model identifier (e.g. "gpt-4o", "llama-3.1-70b-versatile") */
  model: string;
  /** The full response text */
  text: string;
  /** Current status of this response */
  status: ResponseStatus;
  /** Error message if status is "error" */
  error?: string;
  /** Time-to-first-token in ms */
  ttft?: number;
  /** Total generation time in ms */
  totalTime?: number;
}

/** A battle comparing two model responses */
export interface Battle {
  id: string;
  prompt: string;
  responses: [ModelResponse, ModelResponse];
  vote?: VoteChoice;
  /** Whether model identities have been revealed */
  revealed: boolean;
  status: BattleStatus;
  createdAt: string; // ISO 8601
  votedAt?: string; // ISO 8601
}

/** A model configuration entry */
export interface ModelConfig {
  id: string;
  provider: string;
  model: string;
  displayName: string;
  enabled: boolean;
}

/** Provider configuration (server-side only) */
export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
  /** Whether this provider has a valid API key configured */
  configured: boolean;
}

/** What the client sees about configured providers (no secrets) */
export interface ProviderInfo {
  id: string;
  name: string;
  models: { id: string; displayName: string }[];
  configured: boolean;
}

/** Request to start a new battle */
export interface CreateBattleRequest {
  prompt: string;
  leftModel?: { provider: string; model: string };
  rightModel?: { provider: string; model: string };
}

/** Request to vote on a battle */
export interface VoteRequest {
  battleId: string;
  vote: VoteChoice;
}

/** Battle summary for history list */
export interface BattleSummary {
  id: string;
  prompt: string;
  status: BattleStatus;
  vote?: VoteChoice;
  leftModel?: string;
  rightModel?: string;
  createdAt: string;
}
