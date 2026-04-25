# 🔄 CycleScan

> **Dashboard AltSeason & Fear/Greed en temps réel sur les perpétuels Binance Futures**

CycleScan est un dashboard gratuit et open-source qui suit le cycle du marché crypto en temps réel à partir de **~520 paires perpétuelles Binance Futures**. Il calcule deux indices propriétaires — un **indice Fear & Greed** et un **indice AltSeason** — mis à jour automatiquement toutes les heures via GitHub Actions.

🌐 **Dashboard en ligne** → `https://[votre-pseudo].github.io/cyclescan/cyclescan.html`

---

## 📊 Ce que CycleScan mesure

### Indice Fear & Greed (0 → 100)

Contrairement aux indices Fear & Greed classiques qui se concentrent uniquement sur Bitcoin, CycleScan calcule le sentiment sur **l'ensemble des perpétuels Binance Futures actifs** à partir de 7 composantes :

| Composante | Poids | Ce qu'elle mesure |
|---|---|---|
| **Funding Rate** | 20% | Moyenne pondérée du funding sur toutes les paires. Très positif = Greed (les longs paient une prime). Très négatif = Fear |
| **Taker Ratio** | 20% | Médiane du ratio achat/vente des takers. >1 = acheteurs agressifs dominants |
| **OI Delta** | 15% | % de paires avec un Open Interest en hausse. OI qui monte = nouveau capital entrant |
| **Breadth 24h** | 15% | % de paires en hausse sur 24h. Breadth large = achat généralisé |
| **Volatilité** | 15% | Variation absolue médiane des prix. Forte volatilité baissière = Fear |
| **Ratio Long/Short** | 10% | LSR médian sur toutes les paires. >1.5 = trop de longs = Greed |
| **Momentum Alts** | 5% | % d'alts surperformant BTC. Alts > BTC = Greed |

**Interprétation du score :**

| Score | Label | État du marché |
|---|---|---|
| 0 – 15 | 🔴 Greed Extrême | Euphorie — précède historiquement les corrections |
| 15 – 35 | 🟠 Greed | Sentiment haussier, risque élevé |
| 35 – 45 | 🟡 Greed Modéré | Légèrement haussier, prudence conseillée |
| 45 – 55 | ⚪ Neutre | Marché équilibré |
| 55 – 65 | 🔵 Fear Modéré | Légèrement baissier, opportunité potentielle |
| 65 – 85 | 🔵 Fear | Sentiment baissier, zone d'achat possible |
| 85 – 100 | 🟣 Fear Extrême | Panique — historiquement bon point d'entrée long terme |

> **Note importante :** L'indice est inversé par rapport à l'intuition. Greed Extrême (0-15) signale le danger — trop de longs à levier qui paient un funding insoutenable. Fear Extrême (85-100) signale une opportunité — les shorts paient les longs, le marché est survendu.

---

### Indice AltSeason (0 → 100)

L'indice AltSeason mesure **jusqu'où le capital a tourné de Bitcoin vers les altcoins**, réparti sur 3 tiers de capitalisation :

| Tier | Couverture | Description |
|---|---|---|
| **Tier 1** | Top 50 par volume | Larges caps (ETH, SOL, BNB...) |
| **Tier 2** | Positions 51–150 | Mid caps |
| **Tier 3** | Positions 151+ | Small caps et spéculatif |

**Formule de calcul :**
```
Score AltSeason = (Breadth Global × 50%) + (Breadth Pondéré Tiers × 50%)

Breadth = % d'alts surperformant BTC sur 24h
Breadth Pondéré = Tier1 × 35% + Tier2 × 35% + Tier3 × 30%
```

**Les 5 phases du cycle de marché :**

| Score | Phase | Ce qui se passe |
|---|---|---|
| 0 – 25 | 🔵 **Phase 0 — Dominance BTC** | Capital concentré sur Bitcoin. Les alts perdent du terrain en valeur BTC. Phase de nettoyage ou de consolidation |
| 25 – 40 | 🌊 **Phase 1 — Éveil ETH/L1** | Rotation précoce vers ETH et les larges caps. Capital prudent vers les actifs les plus liquides |
| 40 – 55 | 🟡 **Phase 2 — Rotation Mid Caps** | Capital débordant vers les mid caps avec des narratifs forts. Le Tier 2 commence à surperformer |
| 55 – 70 | 🟢 **Phase 3 — AltSaison** | Majorité des alts surperformant BTC. Capital déployé librement. Momentum fort sur tous les tiers |
| 70 – 100 | 🔴 **Phase 4 — Euphorie** | Tier 3 qui explose. Meme coins en hausse. Sentiment extrême. Réduire les positions — retournement probable |

**Le signal clé à surveiller :** Quand le **breadth du Tier 3 dépasse celui du Tier 1** (les small caps surperforment les larges caps), c'est historiquement le signe de la fin du cycle altsaison.

---

## 📈 Graphiques historiques

CycleScan stocke les données automatiquement et les affiche sur 5 horizons temporels :

| Période | Résolution des données |
|---|---|
| 90 jours | 1 point par heure |
| 180 jours | 1 point par 4 heures |
| 270 jours | 1 point par 8 heures |
| 365 jours | 1 point par jour |
| 548 jours | 1 point par 2 jours |

Cela permet d'avoir jusqu'à **18 mois d'historique de cycle de marché** avec un fichier de moins de 1 Mo.

---

## ⚙️ Comment ça fonctionne

```
GitHub Actions (toutes les heures, 24h/24)
        ↓
collect.js appelle l'API Binance Futures
  ├── /fapi/v1/ticker/24hr       → toutes les paires, prix, volumes
  ├── /fapi/v1/premiumIndex      → funding rates (1 seul appel global)
  └── Top 50 paires individuellement :
      ├── globalLongShortAccountRatio → ratio Long/Short
      ├── openInterestHist            → variation OI
      └── takerlongshortRatio         → ratio taker
        ↓
Calcule Fear & Greed + AltSeason
        ↓
Met à jour data/history.json avec compression automatique
        ↓
Commit automatique dans le repo
        ↓
cyclescan.html lit history.json au chargement
→ Affiche le dashboard en temps réel + graphiques historiques
```

**Utilisation de l'API :** Uniquement les endpoints publics de Binance Futures. Aucune clé API requise. Aucun compte nécessaire.

---

## 🗂️ Structure du repo

```
cyclescan/
├── cyclescan.html              ← Dashboard principal (ouvrir dans le navigateur)
├── collect.js                  ← Collecteur de données horaire (Node.js)
├── data/
│   └── history.json            ← Données historiques (mis à jour toutes les heures)
└── .github/
    └── workflows/
        └── collect.yml         ← Automatisation GitHub Actions
```

---

## 🚀 Installation (fork ce repo)

1. **Forker** ce repo
2. Aller dans **Settings → Pages** → Source : branche `main` → `/ (root)`
3. GitHub Actions se déclenchera automatiquement toutes les heures
4. Le dashboard sera disponible à :
   `https://[votre-pseudo].github.io/cyclescan/cyclescan.html`

> GitHub Actions est **entièrement gratuit** pour les repos publics, sans limite de temps.

---

## 📋 Tableau Top Performers

Le dashboard inclut également un tableau trié de toutes les ~520 paires avec :

- **24h%** — Variation de prix sur les dernières 24 heures
- **vs BTC** — Performance relative à Bitcoin (positif = surperforme BTC)
- **Volume** — Volume de trading sur 24h en USDT
- **Funding** — Taux de funding actuel
- **L/S Ratio** — Ratio Long/Short des comptes
- **OI Δ%** — Variation de l'Open Interest sur la dernière heure
- **Signal** — STRONG / BULL / BEAR / NEUTRE basé sur les métriques combinées

Filtrable par Tier 1 / Tier 2 / Tier 3 ou par recherche de symbole.

---

## ⚠️ Avertissement

CycleScan est un **outil d'information uniquement**. Rien ici ne constitue un conseil financier. Les marchés crypto sont très volatils et les patterns de sentiment passés ne garantissent pas les mouvements de prix futurs. Faites toujours vos propres recherches avant de prendre des décisions de trading.

---

## 📄 Licence

MIT — libre d'utilisation, de fork et de modification.

---

*Construit avec ❤️ en utilisant l'API publique Binance Futures · Aucune clé API requise · 100% côté client*
