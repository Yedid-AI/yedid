-- Migration 035: Shira V4 hotfix
--
-- Three production issues from migration 034 that need immediate cleanup:
--
--   1. The configured templates use {time_ago}/{source}/{topic} placeholders.
--      The follow-up cron only expands them in the redeployed code; if the live
--      cron is still running pre-redeploy, the placeholders go out literally.
--      Defensive workaround: store templates that read fine without expansion.
--      The redeployed cron's expandTemplate also leaves them untouched (no
--      placeholders to replace) so the contract still holds.
--
--   2. The association name was too short ("עמותת בבית"). The stakeholder asked
--      for the full identity: "עמותת בבית שירותי סיעוד לקשיש".
--
--   3. enqueueSecondAttempts in 034's cron had no upper bound on parent age, so
--      this morning it queued 2nd attempts for 1st-attempts from 33-35 DAYS
--      ago — five of the six already had a lead. The code is being patched in
--      the same commit; here we cancel any stragglers still pending and
--      mark the ones that already shipped so they're easy to find later.

-- 1. Templates — full association name + no placeholders for defense in depth.
UPDATE followup_config
SET
  message_template = E'היי 👋 אני שירה, העוזרת הדיגיטלית של עמותת בבית — שירותי סיעוד לקשיש.\nראיתי שהתקשרת אלינו ולא הצלחנו לענות.\n\nאוכל לאסוף ממך כאן בקצרה את פרטי הפנייה, כך שהנציג המתאים בסניף יחזור אלייך עם מענה מדויק — בלי שתצטרכ/י להתקשר שוב.\n\nאיך אוכל לעזור?',
  message_template_second = E'היי 🙂 פניתי אלייך אתמול מטעם עמותת בבית — שירותי סיעוד לקשיש, כי החמצנו את השיחה.\nאם זה עדיין רלוונטי — אספר את הפרטים בקצרה ואני אדאג שהנציג המתאים יחזור אלייך.\nאם לא רלוונטי — אין לחץ, אפשר פשוט לכתוב "לא רלוונטי" ואסגור.',
  updated_at = NOW();

-- 2. Cancel stragglers — pending 2nd attempts whose parent 1st attempt is more
--    than 7 days old should NOT go out under the new contract.
UPDATE followup_queue child
SET status = 'cancelled',
    result = 'Cancelled — parent 1st attempt older than 7 days (035 hotfix)',
    processed_at = NOW()
FROM followup_queue parent
WHERE child.parent_id = parent.id
  AND child.attempt_number >= 2
  AND child.status = 'pending'
  AND parent.processed_at < NOW() - INTERVAL '7 days';

-- 3. Cancel stragglers — pending 2nd attempts where the phone already has a
--    lead. We re-skip them rather than send a redundant relance.
UPDATE followup_queue fq
SET status = 'cancelled',
    result = 'Cancelled — lead already exists for phone (035 hotfix)',
    processed_at = NOW()
WHERE fq.attempt_number >= 2
  AND fq.status = 'pending'
  AND EXISTS (
    SELECT 1 FROM leads l WHERE l.phone = fq.phone
  );

-- 4. Tag the 6 already-sent bad 2nd attempts so they're easy to audit.
UPDATE followup_queue child
SET result = COALESCE(child.result, '') || ' [035: parent age was ' || EXTRACT(DAY FROM child.processed_at - parent.processed_at) || ' days]'
FROM followup_queue parent
WHERE child.parent_id = parent.id
  AND child.attempt_number >= 2
  AND child.status = 'sent'
  AND parent.processed_at < NOW() - INTERVAL '7 days';
