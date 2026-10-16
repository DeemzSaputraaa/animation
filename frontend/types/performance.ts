export type PlayerState = 'idle' | 'generating' | 'ready' | 'playing' | 'paused' | 'finished' | 'error';
export type SpeechStyle = 'normal' | 'relaxed' | 'conversational';
export type Emotion = 'neutral' | 'friendly' | 'happy' | 'serious' | 'thinking' | 'excited' | 'concerned';
export interface MotionEvent {
  start: number; duration: number; animation: string; weight: number; speed: number;
  fade_in?: number; fade_out?: number;
}
export interface EmotionEvent { start: number; end: number; emotion: Emotion; energy: number }
export interface VisemeEvent { time: number; end: number; viseme: string; weight: number }
export interface Word { text: string; time: number; duration: number; char_index: number }
export interface Sentence extends EmotionEvent { text: string; char_start: number; char_end: number; emphasis: string[] }
export interface PerformanceTimeline {
  version: 1; duration: number; audio: string; text: string; language: string;
  timing_source: string; analysis_source: string; warnings: string[];
  words: Word[]; sentences: Sentence[]; emotion: EmotionEvent[];
  gestures: MotionEvent[]; head: MotionEvent[]; visemes: VisemeEvent[];
}
export interface PerformanceJob {
  id: string; status: 'generating' | 'ready' | 'error' | 'cancelled'; stage: string;
  audio_url: string; timeline_url: string; status_url: string; error: string | null;
}
