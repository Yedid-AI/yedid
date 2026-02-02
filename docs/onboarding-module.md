# Module d'Onboarding — Reflexion architecturale

## Principe central

Un **pipeline d'analyse intelligente** : a partir d'une URL de site web, on scrape, on analyse via LLM, et on propose un plan d'agent pre-rempli que l'utilisateur valide/ajuste avant creation.

---

## Trigger 1 — Creation de compte (nouveau client)

**Contexte actuel** : Le super_admin cree un user puis clique "Activer Chat". Tout est vide ensuite — l'admin doit tout configurer manuellement (agent, playbooks, escalation, KB).

**Flow onboarding propose** :

```
1. Super admin cree le user avec { email, enterprise, website_url }
   (ou plus tard : self-registration avec ces memes champs)

2. POST /api/provision-chat declenche le provisioning Chatwoot
   + lance l'onboarding async :

   a) Scrape du site web (Firecrawl — deja integre)
      → pages principales (accueil, FAQ, tarifs, contact, CGV...)
      → max ~10 pages, filtre par domaine

   b) Analyse LLM du contenu scrape
      → prompt structure qui demande au LLM d'extraire :
        - Secteur d'activite, produits/services
        - Ton de communication detecte
        - Questions frequentes probables
        - Scenarios de support client typiques
        - Cas d'escalation probables
      → output JSON structure (structured output OpenAI/Anthropic)

   c) Generation d'un "plan d'onboarding" :
      - 1 agent_config pre-rempli (nom, prompt systeme, ton, provider)
      - 3-5 playbooks suggeres (titre, contenu, audience, rules)
      - 2-3 escalation_rules suggerees (trigger, rules, audience)
      - Sources KB a ingerer (les pages scrapees)

   d) Stockage du plan dans une table `onboarding_plans`
      { user_id, status: 'ready', plan: JSONB, website_analysis: JSONB }
```

**Frontend** : Quand l'admin se connecte pour la premiere fois, on detecte le plan d'onboarding en attente → **wizard en etapes** :

```
Etape 1 — "Votre entreprise" (resume de l'analyse, l'admin confirme/corrige)
Etape 2 — "Votre agent" (config pre-remplie, editable)
Etape 3 — "Scenarios" (playbooks suggeres, toggle on/off, editable)
Etape 4 — "Escalations" (regles suggerees, toggle on/off, editable)
Etape 5 — "Base de connaissances" (pages detectees, toggle on/off pour ingestion)
Etape 6 — "Votre inbox" (nom, URL widget)
→ Bouton "Lancer la configuration" → cree tout en batch
```

**Ce qui est cree automatiquement au clic final** :
- 1 agent_bot + agent_config
- N playbooks
- N escalation_rules
- 1 inbox + assignation agent
- N sources + ingestion async des pages cochees

---

## Trigger 2 — Creation d'un nouvel agent

**Contexte actuel** : L'admin entre un nom, l'agent est cree vide, il faut tout configurer tab par tab.

**Flow onboarding propose** :

```
Dialog de creation enrichi :
  - Nom de l'agent
  - Objectif / cas d'usage (texte libre ou select : "Support client",
    "Avant-vente", "FAQ technique", "Prise de RDV", "Custom")
  - URL de reference (optionnel, pre-rempli avec le website du compte)

→ Si URL fournie ou objectif selectionne :
  - Analyse rapide (LLM uniquement, pas de re-scrape si KB existe deja)
  - Genere : prompt systeme, ton, playbooks, escalations adaptes a l'objectif
  - L'admin arrive sur AgentDetail avec les tabs deja pre-remplies
  - Bandeau "Configuration suggeree — verifiez et ajustez"

→ Si aucun contexte : flow actuel (creation vide)
```

Plus leger que le trigger 1 — on reutilise l'analyse existante du compte et on genere des suggestions contextuelles a l'objectif de l'agent.

---

## Trigger 3 — A definir

Possibilites envisagees :

**Option A — Ajout d'une nouvelle source KB** : quand on ingere un nouveau document/site, on propose d'auto-generer ou mettre a jour les playbooks lies (ex: nouveau PDF de tarifs → suggestion de playbook "Questions sur les tarifs").

**Option B — Premiere conversation recue** : apres que l'agent ait traite ses premieres vraies conversations, analyse des patterns et suggestion d'ameliorations (nouveaux playbooks, ajustement du prompt, nouvelles escalations).

**Option C — Connexion d'une inbox** : au moment d'assigner un agent a une inbox, proposition de playbooks adaptes au canal (widget web vs API vs autre).

---

## Architecture technique

### Nouvelle table

```sql
onboarding_plans (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  agent_bot_id INT REFERENCES agent_bots(id),  -- nullable (trigger 1 = pas encore d'agent)
  trigger_type TEXT,  -- 'account_creation' | 'agent_creation' | ...
  status TEXT,        -- 'analyzing' | 'ready' | 'applied' | 'dismissed'
  website_url TEXT,
  website_analysis JSONB,  -- resultat du scrape + analyse LLM
  suggested_plan JSONB,    -- { agent_config, playbooks[], escalations[], sources[] }
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
)
```

### Nouveaux endpoints

```
POST /api/onboarding/analyze    — lance l'analyse (scrape + LLM)
GET  /api/onboarding/plan       — recupere le plan en attente
PUT  /api/onboarding/plan       — modifie le plan avant application
POST /api/onboarding/apply      — applique le plan (cree les entites)
POST /api/onboarding/dismiss    — ignore le plan
```

### Nouveau module serveur

```
server/engine/onboarding.js     — scrapeWebsite(), analyzeContent(), generatePlan()
```

Ce module reutilise les briques existantes :
- `server/ingestion.js` → `extractText` pour le scrape (Firecrawl deja integre)
- `server/engine/llm.js` → `createCompletion` pour l'analyse (structured output)
- Les routes CRUD existantes pour la creation batch des entites
