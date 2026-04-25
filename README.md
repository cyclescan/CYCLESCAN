# 🔄 CycleScan

> **Dashboard AltSeason & Fear/Greed en temps réel — données CoinGecko & Binance Futures**

CycleScan est un dashboard gratuit et open-source qui suit le cycle du marché crypto en temps réel. Il calcule deux indices propriétaires — un **indice Fear & Greed** et un **indice AltSeason** — mis à jour automatiquement toutes les heures via GitHub Actions, et stocke jusqu'à **18 mois d'historique**.

🌐 **Dashboard en ligne** → `https://[votre-pseudo].github.io/CYCLESCAN/cyclescan.html`

---

## 📊 Ce que CycleScan mesure

### Indice Fear & Greed (0 → 100)

Calculé toutes les heures à partir de **5 composantes** issues de CoinGecko :

| Composante | Poids | Ce qu'elle mesure |
|---|---|---|
| **Breadth alts vs BTC** | 25% | % d'altcoins surperformant Bitcoin sur 24h. Large breadth = Greed |
| **Dominance BTC** | 25% | Part de Bitcoin dans la market cap totale. Dominance élevée = Fear (capital concentré sur BTC) |
| **Variation market cap 24h** | 20% | Hausse ou baisse de la capitalisation totale du marché sur 24h |
| **Volatilité médiane** | 15% | Amplitude médiane des variations de prix. Forte volatilité baissière = Fear |
| **Performance alts** | 15% | Score de performance des altcoins vs Bitcoin |

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

> **Note :** L'indice est inversé par rapport à l'intuition. Greed Extrême signale le danger — trop de capital spéculatif concentré. Fear Extrême signale une opportunité — le marché est survendu.

---

### Indice AltSeason (0 → 100)

Mesure **jusqu'où le capital a tourné de Bitcoin vers les altcoins**, sur 3 tiers de capitalisation issus du top 200 CoinGecko :

| Tier | Couverture | Description |
|---|---|---|
| **Tier 1** | Top 50 par market cap | Larges caps (ETH, SOL, BNB...) |
| **Tier 2** | Positions 51–150 | Mid caps |
| **Tier 3** | Positions 151–200 | Small caps |

**Formule :**
```
Score AltSeason = (Breadth Global × 50%) + (Breadth Pondéré Tiers × 50%)

Breadth = % d'alts surperformant BTC sur 24h
Breadth Pondéré = Tier1 × 35% + Tier2 × 35% + Tier3 × 30%
```

**Les 5 phases du cycle :**

| Score | Phase | Ce qui se passe |
|---|---|---|
| 0 – 25 | 🔵 **Phase 0 — Dominance BTC** | Capital concentré sur Bitcoin. Alts perdant du terrain en valeur BTC |
| 25 – 40 | 🌊 **Phase 1 — Éveil ETH/L1** | Rotation précoce vers ETH et larges caps |
| 40 – 55 | 🟡 **Phase 2 — Rotation Mid Caps** | Capital débordant vers les mid caps avec narratifs forts |
| 55 – 70 | 🟢 **Phase 3 — AltSaison** | Majorité des alts surperformant BTC. Momentum fort |
| 70 – 100 | 🔴 **Phase 4 — Euphorie** | Tier 3 explose. Sentiment extrême. Retournement probable |

---

## 📈 Graphiques historiques

CycleScan stocke les données automatiquement avec **compression par résolution** :

| Période | Résolution | Points max |
|---|---|---|
| 0 – 90 jours | 1 point / heure | ~2 160 |
| 90 – 180 jours | 1 point / 4 heures | ~540 |
| 180 – 270 jours | 1 point / 8 heures | ~270 |
| 270 – 365 jours | 1 point / jour | ~95 |
| 365 – 548 jours | 1 point / 2 jours | ~91 |

**Total : ~3 200 points max · moins de 1 Mo · charge en moins de 200ms**

---

## ⚙️ Architecture

```
GitHub Actions (toutes les heures, 24h/24, 7j/7)
        ↓
collect.js — appelle CoinGecko API
  ├── /api/v3/global          → dominance BTC, market cap totale
  └── /api/v3/coins/markets   → top 200 coins, prix, variations
        ↓
Calcule Fear & Greed + AltSeason
        ↓
Met à jour data/history.json avec compression
        ↓
Commit automatique dans le repo GitHub
        ↓
cyclescan.html charge history.json au démarrage
→ Affiche dashboard + graphiques historiques (90J/180J/270J/365J/548J)
```

**Tableau Top Performers** → lit directement **Binance Futures** depuis ton navigateur (pas de restriction géographique côté client).

**Pourquoi CoinGecko pour le collecteur ?**
Les grandes exchanges (Binance, Bybit, OKX) bloquent les serveurs GitHub Actions via des restrictions CloudFront/géographiques. CoinGecko n'a pas cette limitation et propose des données complètes gratuitement.

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
   `https://[votre-pseudo].github.io/[nom-repo]/cyclescan.html`

> GitHub Actions est **entièrement gratuit** pour les repos publics.

---

## 📋 Tableau Top Performers

Toutes les ~520 paires perpétuelles Binance Futures avec :

| Colonne | Source | Description |
|---|---|---|
| 24h% | Binance | Variation de prix sur 24h |
| vs BTC | Calculé | Performance relative à Bitcoin |
| Volume | Binance | Volume de trading 24h en USDT |
| Funding | Binance | Taux de funding actuel |
| L/S Ratio | Binance | Ratio Long/Short des comptes |
| OI Δ% | Binance | Variation Open Interest (1h) |
| Signal | Calculé | STRONG / BULL / BEAR / NEUTRE |

Filtrable par Tier 1 / Tier 2 / Tier 3 ou par recherche de symbole.

---

## ⚠️ Avertissement

CycleScan est un **outil d'information uniquement**. Rien ici ne constitue un conseil financier. Les marchés crypto sont très volatils et les patterns de sentiment passés ne garantissent pas les mouvements de prix futurs. Faites toujours vos propres recherches avant de prendre des décisions de trading.

---

## 📄 Licence

MIT — libre d'utilisation, de fork et de modification.

---

*Données : CoinGecko API (collecteur) · Binance Futures API (dashboard temps réel) · Aucune clé API requise*
