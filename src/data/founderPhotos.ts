// Liste des photos officielles du créateur Tchoumi Chilic Vitrice
// Vous pouvez ajouter autant de photos que vous le souhaitez dans le dossier /public/images/tchoumi/
export interface FounderPhoto {
  id: string;
  url: string;
  title: string;
  description: string;
}

export const TCHOUMI_FOUNDER_PHOTOS: FounderPhoto[] = [
  {
    id: "tchoumi-1",
    url: "/images/tchoumi/tchoumi_1.jpg",
    title: "Tchoumi Chilic Vitrice",
    description: "Fondateur & PDG de Vitronix Life, Créateur de Tchoumi IA"
  },
  {
    id: "tchoumi-2",
    url: "/images/tchoumi/tchoumi_2.jpg",
    title: "Tchoumi Chilic Vitrice - Ingénieur & Visionnaire",
    description: "Concepteur et développeur de solutions technologiques avancées"
  },
  {
    id: "tchoumi-3",
    url: "/images/tchoumi/tchoumi_3.jpg",
    title: "Tchoumi Chilic Vitrice - Leader Tech Africain",
    description: "Pionnier de l'Intelligence Artificielle en Afrique"
  },
  {
    id: "tchoumi-4",
    url: "/images/tchoumi/tchoumi_4.jpg",
    title: "Tchoumi Chilic Vitrice - Innovation & Leadership",
    description: "Bâtisseur de l'écosystème technologique Vitronix Life"
  },
  {
    id: "tchoumi-5",
    url: "/images/tchoumi/tchoumi_5.jpg",
    title: "Tchoumi Chilic Vitrice - Conférence & Entrepreneuriat",
    description: "Promoteur de l'excellence et de la souveraineté numérique"
  }
];

// Fonction utilitaire pour obtenir une photo de Tchoumi Vitrice
// Sélectionne une photo aléatoire ou différente à chaque requête
let lastPhotoIndex = -1;

export function getRandomFounderPhoto(): FounderPhoto {
  if (TCHOUMI_FOUNDER_PHOTOS.length <= 1) {
    return TCHOUMI_FOUNDER_PHOTOS[0];
  }
  let newIndex = Math.floor(Math.random() * TCHOUMI_FOUNDER_PHOTOS.length);
  // Éviter de renvoyer deux fois de suite la même photo si plusieurs photos sont configurées
  if (newIndex === lastPhotoIndex) {
    newIndex = (newIndex + 1) % TCHOUMI_FOUNDER_PHOTOS.length;
  }
  lastPhotoIndex = newIndex;
  return TCHOUMI_FOUNDER_PHOTOS[newIndex];
}
