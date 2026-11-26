import { Language, UserPlan } from '../types';

export interface TchoumiModelDef {
  id: string;
  name: string;
  tagline: Record<Language, string>;
  description: Record<Language, string>;
  badge: Record<Language, string>;
  requiredPlan: UserPlan;
  backendModel: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
  thinking: boolean;
  accent: 'sky' | 'indigo' | 'pink' | 'emerald' | 'amber' | 'violet';
  systemFocus: string;
}

export interface SubscriptionPlanDef {
  id: UserPlan;
  name: string;
  emoji: string;
  priceFcfa: number;
  priceLabel: Record<Language, string>;
  monthlyHint: Record<Language, string>;
  subtitle: Record<Language, string>;
  badge?: Record<Language, string>;
  popular?: boolean;
  videoIncluded: boolean;
  modelsIncluded: string[];
  features: Record<Language, string[]>;
}

export const PLAN_RANK: Record<UserPlan, number> = {
  free: 0,
  plus: 1,
  pro: 2,
  ultra: 3,
};

export function hasPlanAccess(currentPlan: UserPlan | undefined, requiredPlan: UserPlan): boolean {
  const rank = PLAN_RANK[currentPlan || 'free'] ?? 0;
  const reqRank = PLAN_RANK[requiredPlan] ?? 0;
  return rank >= reqRank;
}

export const TCHOUMI_MODELS: TchoumiModelDef[] = [
  {
    id: 'tchoumi-spark',
    name: 'Tchoumi Spark',
    tagline: {
      fr: 'Éclair & Instantané',
      en: 'Instant & Ultra-Light',
    },
    description: {
      fr: 'Modèle ultra-rapide conçu pour les réponses immédiates, résumés courts et tâches quotidiennes.',
      en: 'Ultra-fast model built for instant answers, quick summaries, and everyday tasks.',
    },
    badge: {
      fr: 'Rapide',
      en: 'Fast',
    },
    requiredPlan: 'free',
    backendModel: 'gemini-3.1-flash-lite',
    thinking: false,
    accent: 'sky',
    systemFocus:
      '[MODÈLE ACTIF : Tchoumi Spark] Privilégie des réponses vives, claires, directes et efficaces sans détour inutile.',
  },
  {
    id: 'tchoumi-pulse',
    name: 'Tchoumi Pulse',
    tagline: {
      fr: 'Polyvalent & Équilibré',
      en: 'Balanced & Multimodal',
    },
    description: {
      fr: 'Le cœur de Tchoumi IA : équilibre idéal entre rapidité, programmation, vision et dialogue naturel.',
      en: 'Core Tchoumi AI engine: balanced speed, coding, vision analysis, and natural conversation.',
    },
    badge: {
      fr: 'Standard',
      en: 'Default',
    },
    requiredPlan: 'free',
    backendModel: 'gemini-4-hydrogen',
    thinking: true,
    accent: 'indigo',
    systemFocus:
      '[MODÈLE ACTIF : Tchoumi Pulse] Offre un équilibre optimal entre clarté pédagogique, précision technique et polyvalence multimodale.',
  },
  {
    id: 'tchoumi-fable',
    name: 'Tchoumi Fable',
    tagline: {
      fr: 'Créatif & Narration',
      en: 'Creative & Storytelling',
    },
    description: {
      fr: 'Inspiré pour l’écriture créative, scénarios, copywriting, communication et idées originales.',
      en: 'Crafted for creative writing, scripts, copywriting, branding, and original ideation.',
    },
    badge: {
      fr: 'Plus',
      en: 'Plus',
    },
    requiredPlan: 'plus',
    backendModel: 'gemini-4-hydrogen',
    thinking: true,
    accent: 'pink',
    systemFocus:
      '[MODÈLE ACTIF : Tchoumi Fable] Adopte une plume expressive, structurée, imaginative et percutante tout en restant fidèle aux faits demandés.',
  },
  {
    id: 'tchoumi-nova',
    name: 'Tchoumi Nova',
    tagline: {
      fr: 'Raisonnement & DataEngine',
      en: 'Reasoning & DataEngine',
    },
    description: {
      fr: 'Spécialisé en mathématiques, logique rigoureuse, algorithmes et analyses statistiques DataEngine.',
      en: 'Specialized in mathematics, rigorous logic, algorithms, and DataEngine statistical analysis.',
    },
    badge: {
      fr: 'Plus',
      en: 'Plus',
    },
    requiredPlan: 'plus',
    backendModel: 'gemini-4-hydrogen',
    thinking: true,
    accent: 'emerald',
    systemFocus:
      '[MODÈLE ACTIF : Tchoumi Nova] Décompose chaque problème étape par étape avec rigueur mathématique, formules LaTeX propres et vérifications chiffrées.',
  },
  {
    id: 'tchoumi-titan',
    name: 'Tchoumi Titan',
    tagline: {
      fr: 'Vision, IRM & Studio Vidéo Pro',
      en: 'Vision, MRI & Pro Video Studio',
    },
    description: {
      fr: 'Puissance Pro pour architecture logicielle, neuro-imagerie IRM/DICOM et scénarisation vidéo IA.',
      en: 'Pro-grade power for software architecture, MRI/DICOM neuroimaging, and AI video studio.',
    },
    badge: {
      fr: 'Pro',
      en: 'Pro',
    },
    requiredPlan: 'pro',
    backendModel: 'gemini-4-hydrogen',
    thinking: true,
    accent: 'amber',
    systemFocus:
      '[MODÈLE ACTIF : Tchoumi Titan (Pro)] Fournis des analyses expertes de niveau production (architecture complète, précision biomédicale/IRM, direction artistique vidéo).',
  },
  {
    id: 'tchoumi-sovereign',
    name: 'Tchoumi Sovereign',
    tagline: {
      fr: 'Recherche Profonde & Stratégie',
      en: 'Deep Research & Strategy',
    },
    description: {
      fr: 'Notre modèle phare Ultra : raisonnement profond multi-étapes, audits critiques et stratégie avancée.',
      en: 'Our flagship Ultra model: multi-step deep reasoning, critical audits, and executive strategy.',
    },
    badge: {
      fr: 'Ultra',
      en: 'Ultra',
    },
    requiredPlan: 'ultra',
    backendModel: 'gemini-4-hydrogen',
    thinking: true,
    accent: 'violet',
    systemFocus:
      '[MODÈLE ACTIF : Tchoumi Sovereign (Ultra)] Effectue une analyse exhaustive et stratégique multi-angles, anticipe les cas limites et livre des recommandations de très haut niveau.',
  },
];

export const TCHOUMI_PLANS: SubscriptionPlanDef[] = [
  {
    id: 'free',
    name: 'Plan Free',
    emoji: '✨',
    priceFcfa: 0,
    priceLabel: {
      fr: '0 FCFA',
      en: '0 FCFA',
    },
    monthlyHint: {
      fr: 'Gratuit à vie',
      en: 'Free forever',
    },
    subtitle: {
      fr: 'Idéal pour découvrir Tchoumi IA',
      en: 'Ideal to explore Tchoumi AI',
    },
    videoIncluded: false,
    modelsIncluded: ['Tchoumi Spark', 'Tchoumi Pulse'],
    features: {
      fr: [
        'Accès à Tchoumi Spark & Tchoumi Pulse',
        'Analyse de documents & code',
        'Création d’images standard',
        'Tchoumi Voice & historique sauvegardé',
        'Génération de vidéo réservée au Plan Pro',
      ],
      en: [
        'Access to Tchoumi Spark & Tchoumi Pulse',
        'Document & code analysis',
        'Standard image generation',
        'Tchoumi Voice & saved chat history',
        'Video generation reserved for Pro Plan',
      ],
    },
  },
  {
    id: 'plus',
    name: 'Plan Plus',
    emoji: '⚡',
    priceFcfa: 5900,
    priceLabel: {
      fr: '5 900 FCFA / an',
      en: '5,900 FCFA / year',
    },
    monthlyHint: {
      fr: 'Soit ~490 FCFA / mois',
      en: 'Approx. 490 FCFA / month',
    },
    subtitle: {
      fr: 'Pour étudiants, créateurs & développeurs',
      en: 'For students, creators & developers',
    },
    badge: {
      fr: 'PLUS',
      en: 'PLUS',
    },
    videoIncluded: false,
    modelsIncluded: ['Tchoumi Spark', 'Tchoumi Pulse', 'Tchoumi Fable', 'Tchoumi Nova'],
    features: {
      fr: [
        'Débloque Tchoumi Fable & Tchoumi Nova',
        'Raisonnement mathématique & code avancé',
        'Analyse DataEngine & graphiques étendus',
        'Génération d’images haute netteté',
        'Génération de vidéo réservée au Plan Pro',
      ],
      en: [
        'Unlocks Tchoumi Fable & Tchoumi Nova',
        'Advanced math reasoning & coding',
        'Extended DataEngine analytics & charts',
        'Sharp high-detail image generation',
        'Video generation reserved for Pro Plan',
      ],
    },
  },
  {
    id: 'pro',
    name: 'Plan Pro',
    emoji: '🚀',
    priceFcfa: 12559,
    priceLabel: {
      fr: '12 559 FCFA / an',
      en: '12,559 FCFA / year',
    },
    monthlyHint: {
      fr: 'Soit ~1 045 FCFA / mois',
      en: 'Approx. 1,045 FCFA / month',
    },
    subtitle: {
      fr: 'Puissance maximale & Studio Vidéo IA',
      en: 'Maximum power & AI Video Studio',
    },
    badge: {
      fr: 'POPULAIRE • PRO',
      en: 'POPULAR • PRO',
    },
    popular: true,
    videoIncluded: true,
    modelsIncluded: ['Tchoumi Titan', 'Tchoumi Fable', 'Tchoumi Nova', 'Tchoumi Pulse', 'Tchoumi Spark'],
    features: {
      fr: [
        'Génération de Vidéo IA (Exclusivité Pro+)',
        'Débloque Tchoumi Titan (Vision & Architecture)',
        'Analyse DataEngine illimitée & exports',
        'Neuro-imagerie & DICOM haute résolution',
        'Support direct avec le Fondateur',
      ],
      en: [
        'AI Video Generation (Pro+ Exclusive)',
        'Unlocks Tchoumi Titan (Vision & Architecture)',
        'Unlimited DataEngine analytics & exports',
        'High-resolution Neuroimaging & DICOM',
        'Direct support from the Founder',
      ],
    },
  },
  {
    id: 'ultra',
    name: 'Plan Ultra',
    emoji: '👑',
    priceFcfa: 29900,
    priceLabel: {
      fr: '29 900 FCFA / an',
      en: '29,900 FCFA / year',
    },
    monthlyHint: {
      fr: 'Soit ~2 490 FCFA / mois',
      en: 'Approx. 2,490 FCFA / month',
    },
    subtitle: {
      fr: 'Souveraineté IA pour entreprises & cliniques',
      en: 'AI sovereignty for teams, labs & clinics',
    },
    badge: {
      fr: 'ULTRA VIP',
      en: 'ULTRA VIP',
    },
    videoIncluded: true,
    modelsIncluded: [
      'Tchoumi Sovereign',
      'Tchoumi Titan',
      'Tchoumi Fable',
      'Tchoumi Nova',
      'Tchoumi Pulse',
      'Tchoumi Spark',
    ],
    features: {
      fr: [
        'Accès exclusif à Tchoumi Sovereign',
        'Génération de Vidéo IA HD prioritaire',
        'Capacité maximale DataEngine & IRM multi-séries',
        'Audits stratégiques & recherche approfondie',
        'Accompagnement VIP dédié par le Fondateur',
      ],
      en: [
        'Exclusive access to Tchoumi Sovereign',
        'Priority HD AI Video Generation',
        'Maximum DataEngine & multi-series MRI capacity',
        'Strategic audits & deep research mode',
        'Dedicated VIP support from the Founder',
      ],
    },
  },
];

export function getModelById(modelId?: string): TchoumiModelDef {
  return (
    TCHOUMI_MODELS.find((m) => m.id === modelId) ||
    TCHOUMI_MODELS.find((m) => m.id === 'tchoumi-pulse')!
  );
}

export function getPlanById(planId?: UserPlan): SubscriptionPlanDef {
  return TCHOUMI_PLANS.find((p) => p.id === planId) || TCHOUMI_PLANS[0];
}
