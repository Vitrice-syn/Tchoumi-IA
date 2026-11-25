# 📸 GUIDE DES IMAGES - TCV TECHNOLOGIES & IA LABS
### PORTAIL OFFICIEL DE TCHOUMI CHILIC VITRICE

Déposez simplement vos photos réelles dans ce dossier (`public/images/`).
Voici la liste des noms de fichiers recommandés et leur emplacement d'affichage sur le site :

---

### 1. Photo de Profil & Portraits Principaux
- **`portrait-vitrice.jpg`** (ou `.png`, `.webp`)
  - *Usage* : Photo de profil officielle (Menu latéral, En-tête, Page À Propos, Carte d'identité).
  - *Format recommandé* : Format carré ou vertical (ex: 800x1000px ou 800x800px).

### 2. Photos du Laboratoire IA & R&D
- **`lab-ia.jpg`**
  - *Usage* : Laboratoire de recherche, entraînement des modèles Tchoumi IA & Aura IA, GPU & serveurs.

### 3. Cérémonie & Prix BTS 2024 (Banque CCA)
- **`ceremonie-cca.jpg`**
  - *Usage* : Remise du Prix Major National BTS Génie Logiciel 2024 par la Banque CCA Cameroun.

### 4. Cybersécurité & SOC (Orion X Technologies)
- **`soc-orion.jpg`**
  - *Usage* : Salle de supervision SOC, cybersécurité, défense réseau.

### 5. Conférences & Keynotes
- **`keynote-douala.jpg`**
  - *Usage* : Interventions en public, conférences tech, séminaires à Douala et à l'international.

### 6. Cursus Académique & Remise de Diplôme (AIMT)
- **`diplome-aimt.jpg`**
  - *Usage* : Promotion Licence Génie Logiciel de l'African Institute of Management & Technology.

### 7. Logo Institutionnel
- **`logo-tcv.png`**
  - *Usage* : Logo officiel de TCV Technologies & IA Labs.

---

### 💡 Comment activer une photo locale dans le code ?
Dans le fichier `src/constants/data.ts` (ou dans `FounderPhotoGallery.tsx`), remplacez simplement les liens `https://images.unsplash.com/...` par le chemin local direct :
```typescript
image: '/images/portrait-vitrice.jpg'
```
ou
```typescript
image: '/images/ceremonie-cca.jpg'
```

*Le serveur Vite servira automatiquement toutes les images présentes dans le dossier `public/images/` à l'adresse `/images/...`.*
