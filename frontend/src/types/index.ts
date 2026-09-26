export type PinCategory = "strike" | "movement" | "nuclear" | "naval" | "air" | "info";

export interface Article {
  id: number;
  guid: string;
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source: string;
  category: string;
  /** Set when the gazetteer placed the story in the monitored region. */
  lat?: number | null;
  lng?: number | null;
  aiSummary?: string;
  reliabilityScore?: number;
  confidenceLabel?: 'Düşük' | 'Orta' | 'Yüksek';
  reliabilitySignals?: string[];
  insufficientData?: boolean;
}

export interface Pin {
  id: number;
  lat: number;
  lng: number;
  title: string;
  description: string;
  category: PinCategory;
  createdAt: string;
  updatedAt: string;
}

export interface Event {
  id: number;
  type: string;
  title: string;
  description: string;
  severity: string;
  source: string;
  lat?: number;
  lng?: number;
  createdAt: string;
}

export interface ThreatLevel {
  level: 1 | 2 | 3 | 4 | 5;
  label: string;
  color: string;
}

export interface Workspace {
  id: string;
  name: string;
  center: [number, number];
  zoom: number;
}
