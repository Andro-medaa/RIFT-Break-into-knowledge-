export interface BookCitation {
  alias: string;
  chunk_id: string;
  page_no: number;
  snippet: string;
}

export interface WebCitation {
  title: string;
  url: string;
  snippet: string;
}

export interface QaMessage {
  id: string;
  role: 'user' | 'teacher';
  text: string;
  timestamp: string;
  isStreaming?: boolean;
  book_citations?: BookCitation[];
  web_citations?: WebCitation[];
}

export interface AskRequestPayload {
  question: string;
  active_chunk_id?: string | null;
  history?: Array<{ role: string; text: string }>;
}

export interface AskResponseData {
  session_id: string;
  question: string;
  answer: string;
  book_citations: BookCitation[];
  web_citations: WebCitation[];
}
