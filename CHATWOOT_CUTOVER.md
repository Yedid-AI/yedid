# Chatwoot → Native Chat Cutover Plan

## Phases (déjà déployées)

- **Phase 0** (commit `3323873`): chat natif coexiste avec Chatwoot, 100% additif
- **Phase 1** (commit `65c77ab`): kill-switch `NATIVE_CHAT_ENABLED` (default: false)
- **Phase 2** (commit `eda538e`): relance peut passer en natif quand kill-switch ON
- **Phase 3** (commit `72cd3f3`): dispatch peut passer en natif quand kill-switch ON
- **Phase 4** (this PR): migration de cleanup `040_drop_chatwoot.sql` créée mais NON appliquée

## Comment activer le natif (sans rien supprimer)

Sur Railway, ajouter les env vars:

```
NATIVE_CHAT_ENABLED=true
NATIVE_CHAT_INBOXES=     # vide = tous, ou whitelist CSV pour staged rollout
```

Redémarrer le service. À partir de là:
- Webhook Unipile entrant → routé en natif si `chat_inbox` matche le `unipile_account_id`
- Relance → écrit dans `chat_messages` au lieu de Chatwoot
- Dispatch → écrit dans `chat_messages` au lieu d'envoyer en fire-and-forget

**Rollback**: passer `NATIVE_CHAT_ENABLED=false` et redémarrer. Retour Chatwoot immédiat.

## Rollout progressif recommandé

1. **Jour 1**: `NATIVE_CHAT_INBOXES=U5mv4NpYSv6KZifdtfkOmg` (1 numéro, "Relance 972503806079") — valider que les messages arrivent dans `/chat`, que Shira répond, que les replies sont trackées
2. **Jour 3**: ajouter le 2e numéro à la whitelist
3. **Jour 5**: vider `NATIVE_CHAT_INBOXES` (= tous)
4. **Jour 7+**: validation OK → exécuter Phase 4 (DROP Chatwoot)

## Phase 4 — exécution finale (DESTRUCTIVE)

Quand prêt:

```bash
# 1. Backup la base via Supabase dashboard
# 2. Vérifier qu'aucune relance Chatwoot active:
node -e "
import('@supabase/supabase-js').then(({createClient}) => {
  const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  s.from('followup_queue').select('count').not('chatwoot_conversation_id','is',null).gte('processed_at', new Date(Date.now()-7*86400000).toISOString()).then(r=>console.log(r))
})
"

# 3. Appliquer la migration
node scripts/apply-040-drop-chatwoot.js --confirm

# 4. Pull le commit qui retire le code Chatwoot (à venir)
# 5. Redéployer
```

## Code à retirer après migration 040

- `server/chatwoot.js`
- `server/engine/chatwoot-messaging.js`
- Routes `/api/webhook/chatwoot`, `/api/webhook/chatwoot-channel` dans `server/routes/whatsapp.js` et `server/routes/agent.js`
- `server/routes/inboxes.js` (utilisée pour /api/inboxes Chatwoot — remplacée par chat-inboxes.js)
- Branche `else if (chatwootAccountId && ...)` dans `followup-cron.js` `processQueue`
- Fallback `unipile.sendMessage` dans `leads.js` `dispatchLead`
- `handleWebhook` dans `server/engine/index.js` (Chatwoot path) — garder seulement `handleNativeMessage`
- `loadAgentConfig` dans `server/engine/index.js` (utilise `inboxes`) — remplacer par `loadNativeAgentConfig`
- `clearConfigCache` exports + appels
- Imports de `chatwoot-messaging.js`
- Pages `Inboxes.jsx`, `InboxDetail.jsx` (UI Chatwoot) — remplacer par UI sur `chat_inboxes`
- Settings `CHATWOOT_PLATFORM_URL`, `CHATWOOT_PLATFORM_TOKEN`, `CHATWOOT_ADMIN_TOKEN` (env + dashboard)

## Sécurité

- Le kill-switch lit `process.env.NATIVE_CHAT_ENABLED` à chaque requête (pas de cache) → flip instantané
- Chatwoot et natif coexistent jusqu'à la phase 4 — aucune perte de fonctionnalité pendant la transition
- Le natif réutilise les mêmes `agent_bots` (Shira v2, shira-aviezer) — comportement AI identique
