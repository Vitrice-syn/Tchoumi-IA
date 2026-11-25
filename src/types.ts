export type Role = 'user' | 'assistant' | 'system';

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface Attachment {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  base64?: string;
  mimeType?: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  thoughts?: string;
  timestamp: number;
  attachments?: Attachment[];
  imageUrl?: string;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

export interface ApiKeys {
  gemini?: string;
}

export type ModelProvider = 'gemini';

export type UserPlan = 'free' | 'pro';

export type Language = 'fr' | 'en';

export interface ConnectedApp {
  id: string;
  name: string;
  category: 'productivity' | 'communication' | 'storage' | 'medical';
  description: string;
  connected: boolean;
  account?: string;
  apiKey?: string;
  status: 'active' | 'inactive' | 'pending';
  lastSync?: string;
  permissions: string[];
}

export interface MedicalImagingSettings {
  mriBrainAnalysis: boolean; // Analyse IRM Cérébrale & Neuro-imagerie
  t1t2flairDetection: boolean; // Reconnaissance automatique T1/T2/FLAIR
  lesionSegmentation: boolean; // Segmentation et détection des anomalies cérébrales
  volumetricCortex: boolean; // Analyse volumétrique corticale & ventriculaire
  dicomParsing: boolean; // Support des métadonnées DICOM / NIfTI
  reportType: 'clinical' | 'research' | 'educational';
}

export interface DataAnalyticsSettings {
  autoGenerateCharts: boolean; // Génération automatique de courbes et graphiques
  detectOutliers: boolean; // Détection automatique des anomalies statistiques
  trendAnalysis: boolean; // Analyse des tendances & régression
  statPrecision: number; // Nombre de décimales pour les calculs (1 - 4)
  defaultChartType: 'area' | 'bar' | 'line' | 'pie';
}

export interface AppSettings {
  plan?: UserPlan;
  apiKeys: ApiKeys;
  selectedProvider: ModelProvider;
  selectedModel: string;
  language: Language;
  customInstructions?: string;
  responseStyle?: 'balanced' | 'scientific' | 'concise' | 'creative';
  dataAnalytics?: DataAnalyticsSettings;
  medicalImaging?: MedicalImagingSettings;
  connectedApps?: Record<string, ConnectedApp>;
}
