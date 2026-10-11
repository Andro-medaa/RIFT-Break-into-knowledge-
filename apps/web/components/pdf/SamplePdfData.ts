import { HighlightItem } from "@/types/pdf";

export interface MockPageContent {
  pageNo: number;
  title: string;
  subtitle: string;
  paragraphs: string[];
}

export const SAMPLE_PAGES: MockPageContent[] = [
  {
    pageNo: 1,
    title: "Chapter 1: The Geometry of Deep Learning",
    subtitle: "1.1 Introduction to Normalized Feature Spaces",
    paragraphs: [
      "In modern machine learning architectures, high-dimensional representations are routinely projected onto compact manifolds. When analyzing neural networks, spatial normalization ensures invariance under scale transformations.",
      "The fundamental theorem of representation geometry states that continuous activations can be bounded within normalized coordinate simplices. By anchoring coordinates within fractional bounds (0.0 to 1.0), visual grounding systems decouple document rendering from physical device pixels.",
      "Consider a bounding box defined by [x0, y0, x1, y1]. As long as these coordinates remain dimensionless fractions of the total canvas dimension, zoom factors from 50% to 200% preserve zero pixel drift across any viewport aspect ratio.",
    ],
  },
  {
    pageNo: 2,
    title: "Chapter 1.2: Attention Weights & Alignment",
    subtitle: "Mathematical Formulation of Cross-Attention",
    paragraphs: [
      "Cross-attention matrices dynamically align auditory speech tokens with physical document tokens. When a student pauses to ask a question, the attention map highlights the precise semantic region under discussion.",
      "Dual-source grounding requires verifying both local textbook anchors and real-time search context. If a theorem cited in sentence 3 references external evidence, the system renders multi-chromatic highlights: cyan for local book context and amber for external search chips.",
      "Empirical evaluations demonstrate that visual bounding indicators reduce student cognitive load by 42% compared to unanchored auditory narration alone.",
    ],
  },
  {
    pageNo: 3,
    title: "Chapter 1.3: Real-Time Barge-In & State Resumption",
    subtitle: "Sub-300ms Interruption and Pedagogical Bridge",
    paragraphs: [
      "Human-to-human tutoring relies heavily on natural conversational interruptions. Traditional speech pipelines incur high latency due to sequential round-trip server calls for voice activity detection.",
      "By placing voice activity detection on the client edge using Silero ONNX models, the audio playback graph is muted in under 50 milliseconds upon speech detection. The backend concurrently computes pedagogical resumption vectors.",
      "Once the student query is resolved, the narrator delivers a natural conversational bridge line before resuming playback at the exact sentence cursor without losing context.",
    ],
  },
];

export const SAMPLE_HIGHLIGHTS: HighlightItem[] = [
  // Page 1 Highlights
  {
    id: "h1-title",
    pageNo: 1,
    color: "cyan",
    label: "Section Title",
    text: "Chapter 1: The Geometry of Deep Learning",
    rects: [
      { x0: 0.08, y0: 0.08, x1: 0.85, y1: 0.16 },
    ],
    isActive: true,
  },
  {
    id: "h1-p1",
    pageNo: 1,
    color: "purple",
    label: "Definition",
    text: "Spatial normalization ensures invariance under scale transformations.",
    rects: [
      { x0: 0.08, y0: 0.28, x1: 0.92, y1: 0.40 },
    ],
  },
  {
    id: "h1-formula",
    pageNo: 1,
    color: "amber",
    label: "Coordinate Contract",
    text: "Bounding box defined by [x0, y0, x1, y1] with zero pixel drift.",
    rects: [
      { x0: 0.08, y0: 0.65, x1: 0.92, y1: 0.82 },
    ],
  },

  // Page 2 Highlights
  {
    id: "h2-heading",
    pageNo: 2,
    color: "cyan",
    label: "Attention Heading",
    text: "Mathematical Formulation of Cross-Attention",
    rects: [
      { x0: 0.08, y0: 0.14, x1: 0.78, y1: 0.22 },
    ],
  },
  {
    id: "h2-dual-grounding",
    pageNo: 2,
    color: "amber",
    label: "Dual-Source Grounding",
    text: "Dual-source grounding requires verifying both local textbook anchors and search context.",
    rects: [
      { x0: 0.08, y0: 0.42, x1: 0.92, y1: 0.58 },
    ],
  },
  {
    id: "h2-metric",
    pageNo: 2,
    color: "emerald",
    label: "Empirical Result",
    text: "Reduces student cognitive load by 42%.",
    rects: [
      { x0: 0.08, y0: 0.66, x1: 0.92, y1: 0.78 },
    ],
  },

  // Page 3 Highlights
  {
    id: "h3-barge-in",
    pageNo: 3,
    color: "cyan",
    label: "Sub-300ms Barge-In",
    text: "Client edge using Silero ONNX models muted in under 50 milliseconds.",
    rects: [
      { x0: 0.08, y0: 0.38, x1: 0.92, y1: 0.54 },
    ],
  },
  {
    id: "h3-resumption",
    pageNo: 3,
    color: "purple",
    label: "Resumption Vector",
    text: "Resuming playback at the exact sentence cursor without losing context.",
    rects: [
      { x0: 0.08, y0: 0.62, x1: 0.92, y1: 0.78 },
    ],
  },
];
