export type ChatEventType = 'text-delta' | 'tool-call' | 'tool-result' | 'done' | 'error';

export interface TextDeltaEvent {
  type: 'text-delta';
  content: string;
}

export interface ToolCallEvent {
  type: 'tool-call';
  id: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolResultEvent {
  type: 'tool-result';
  id: string;
  result: unknown;
}

export interface DoneEvent {
  type: 'done';
}

export interface ErrorEvent {
  type: 'error';
  message: string;
}

export type ChatEvent = TextDeltaEvent | ToolCallEvent | ToolResultEvent | DoneEvent | ErrorEvent;
