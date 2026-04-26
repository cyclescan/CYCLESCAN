# 🔄 CycleScan

> **Dashboard AltSeason & Fear/Greed en temps réel — CoinGecko & Binance Futures**

CycleScan est un dashboard gratuit et open-source qui suit le cycle du marché crypto en temps réel. Il calcule deux indices propriétaires mis à jour automatiquement **toutes les heures** via GitHub Actions, avec jusqu'à **18 mois d'historique**.

🌐 **Dashboard en ligne** → `https://[votre-pseudo].github.io/CYCLESCAN/cyclescan.html`

---

## 📊 Indice Fear & Greed (0 → 100)

```
0          15         35         55         65         85        100
|__________|__________|__________|__________|__________|__________|
  Fear       Fear       Fear      Neutre     Greed      Greed      Greed
  Extrême              Modéré               Modéré                 Extrême
  🟣          🔵         🔵         ⚪         🟡         🟠          🔴
```

**Convention standard :**
- **0 = Fear Extrême** — panique généralisée, historiquement bon point d'entrée
- **50 = Neutre** — marché équilibré
- **100 = Greed Extrême** — euphorie, historiquement précède les corrections

Calculé toutes les heures à partir de **5 composantes CoinGecko** :

| Composante | Poids | Greed (score élevé) | Fear (score bas) |
|---|---|---|---|
| **Breadth alts vs BTC** | 25% | >75% alts surperf. BTC | <25% alts surperf. BTC |
| **Dominance BTC** | 25% | BTC dom. basse (<40%) | BTC dom. haute (>60%) |
| **Variation market cap 24h** | 20% | Market cap en forte hausse | Market cap en forte baisse |
| **Volatilité médiane** | 15% | Forte hausse volatile | Forte baisse volatile |
| **Performance alts** | 15% | Alts surperforment largement | Alts sous-performent |

> **Pourquoi CoinGecko ?** Les grandes exchanges (Binance, Bybit) bloquent les serveurs GitHub Actions via des restrictions géographiques CloudFront. CoinGecko n'a pas cette limitation et fournit des données complètes gratuitement.

---

## 🌊 Indice AltSeason (0 → 100)

Mesure jusqu'où le capital a tourné de Bitcoin vers les altcoins, sur **3 tiers** du top 200 CoinGecko :

| Tier | Couverture | Exemples |
|---|---|---|
| **Tier 1** | Top 50 market cap | ETH, SOL, BNB, XRP... |
| **Tier 2** | Positions 51–150 | Mid caps |
| **Tier 3** | Positions 151–200 | Small caps |

**Formule :**
```
Score = (Breadth Global × 50%) + (Breadth Pondéré × 50%)

Breadth = % d'alts surperformant BTC sur 24h
Breadth Pondéré = Tier1 × 35% + Tier2 × 35% + Tier3 × 30%
```

**Les 5 phases du cycle :**

| Score | Phase | Ce qui se passe |
|---|---|---|
| 0 – 25 | 🔵 **Phase 0 — Dominance BTC** | Capital concentré sur Bitcoin. Alts perdent du terrain en valeur BTC |
| 25 – 40 | 🌊 **Phase 1 — Éveil ETH/L1** | Rotation précoce vers ETH et larges caps. Capital prudent |
| 40 – 55 | 🟡 **Phase 2 — Rotation Mid Caps** | Capital déborde vers les mid caps avec narratifs forts |
| 55 – 70 | 🟢 **Phase 3 — AltSaison** | Majorité des alts surperforment BTC. Momentum fort sur tous les tiers |
| 70 – 100 | 🔴 **Phase 4 — Euphorie** | Tier 3 explose. Meme coins en hausse. Retournement probable |

**Signal clé :** quand le breadth Tier 3 dépasse le breadth Tier 1 (small caps > larges caps), c'est historiquement le signe de fin de cycle altsaison.

---

## 📈 Graphiques historiques

Stockage automatique avec **compression par résolution** — jusqu'à 18 mois d'historique pour moins de 1 Mo :

| Période | Résolution | Points |
|---|---|---|
| 0 – 90 jours | 1 point / heure | ~2 160 |
| 90 – 180 jours | 1 point / 4 heures | ~540 |
| 180 – 270 jours | 1 point / 8 heures | ~270 |
| 270 – 365 jours | 1 point / jour | ~95 |
| 365 – 548 jours | 1 point / 2 jours | ~91 |

Sélecteur de période : **90J / 180J / 270J / 365J / 548J**

---

## ⚙️ Architecture

```
GitHub Actions (toutes les heures, 24h/24, 7j/7)
        ↓
collect.js — CoinGecko API (aucune restriction géographique)
  ├── /api/v3/global          → dominance BTC, market cap totale, variation 24h
  └── /api/v3/coins/markets   → top 200 coins, prix, variations 24h
        ↓
Calcule Fear & Greed (5 composantes) + AltSeason (3 tiers)
        ↓
Compresse et met à jour data/history.json
        ↓
Commit automatique dans le repo
        ↓
cyclescan.html lit history.json au chargement
→ Dashboard en temps réel + courbes historiques
```

**Dashboard temps réel** (tableau Top Performers) → **Binance Futures** directement depuis le navigateur — aucune restriction côté client.

---

## 📋 Tableau Top Performers

Toutes les ~520 paires perpétuelles Binance Futures, actualisées à chaque chargement :

| Colonne | Source | Description |
|---|---|---|
| **24h%** | Binance | Variation de prix sur 24h |
| **vs BTC** | Calculé | Performance relative à Bitcoin |
| **Volume** | Binance | Volume de trading 24h en USDT |
| **Funding** | Binance | Taux de funding actuel (prochain paiement) |
| **L/S Ratio** | Binance | Ratio Long/Short des comptes (snapshot 1h) |
| **OI Δ%** | Binance | Variation Open Interest sur 1h |
| **Signal** | Calculé | STRONG / BULL / BEAR / NEUTRE |

Filtrable par **Tier 1 / Tier 2 / Tier 3** ou par recherche de symbole. Tri par colonne au clic.

---

## 🗂️ Structure du repo

```
CYCLESCAN/
├── cyclescan.html              ← Dashboard principal
├── collect.js                  ← Collecteur horaire (Node.js, CoinGecko)
├── data/
│   └── history.json            ← Historique auto-mis à jour toutes les heures
├── .github/
│   └── workflows/
│       └── collect.yml         ← GitHub Actions (cron horaire)
├── .gitignore
├── LICENSE                     ← MIT
└── README.md
```

---

## 🚀 Déploiement (fork)

1. **Forker** ce repo
2. **Settings → Pages** → Source : branche `main` → `/ (root)`
3. GitHub Actions se déclenche automatiquement toutes les heures
4. Dashboard disponible à :
   `https://[votre-pseudo].github.io/CYCLESCAN/cyclescan.html`

> GitHub Actions est **entièrement gratuit** pour les repos publics, sans limite de temps ni de runs.

---

## ⚠️ Avertissement

CycleScan est un **outil d'information uniquement**. Rien ici ne constitue un conseil financier. Les marchés crypto sont très volatils et les patterns de sentiment passés ne garantissent pas les mouvements de prix futurs. Faites toujours vos propres recherches avant toute décision de trading.

---

## 📄 Licence

MIT — libre d'utilisation, de fork et de modification.

---

*Données collecteur : CoinGecko API · Données dashboard : Binance Futures API · Aucune clé API requise · 100% open source*
