/**
 * Standard API Response envelope matching FastAPI backend ApiResponse[T]
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string | null;
  message?: string | null;
}

export interface PingData {
  status: string;
  service: string;
  timestamp: string;
}

export interface HealthData {
  status: string;
  service: string;
  version: string;
}
