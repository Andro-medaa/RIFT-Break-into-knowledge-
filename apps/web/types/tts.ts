import { MoveType } from './lesson';

export interface TTSRequest {
  text: string;
  move: MoveType;
  voice?: string;
  speed?: number;
}

export interface TTSResponseMeta {
  cache_key: string;
  duration_ms: number;
  move: MoveType;
  exaggeration: number;
  speed: number;
  format: string;
  audio_base64?: string;
}
