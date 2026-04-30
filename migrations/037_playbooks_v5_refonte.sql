-- Migration 037: Playbooks V5 — full refonte for both bots (Babait + Aviezer)
--
-- Goals:
--   1. 4 playbooks per bot, identical structure: welcome / lead / branch / info
--   2. 1 escalation rule per bot (frustration / incompréhension)
--   3. Each bot has exactly 2 internal tools: save_lead + list_branches
--   4. Lead playbook only allows services from service_config for the bot's enterprise
--   5. Branch playbook actually works — list_branches and save_lead now use
--      agent_bots.enterprise → users.enterprise to look up branches in the
--      correct tenant (was always returning admin's empty list before).
--   6. Concise prompts, hard rule on message length, no inapplicable rules.
--
-- Impacted tables:
--   agent_bots (+ enterprise column)
--   agent_config (prompts refreshed for bot 1 + bot 2)
--   playbooks, agent_bot_playbooks (cleared + reseeded for bots 1 + 2)
--   tools (cleared + reseeded for bots 1 + 2 — was carrying 4 duplicate save_lead rows)
--   escalation_rules, agent_bot_escalation_rules (cleared + reseeded for bots 1 + 2)

-- ============================================================
-- 1. agent_bots.enterprise — link bot → tenant for branch/service scoping
-- ============================================================
ALTER TABLE agent_bots
  ADD COLUMN IF NOT EXISTS enterprise TEXT
  CHECK (enterprise IS NULL OR enterprise IN ('babait','aviezer'));

UPDATE agent_bots SET enterprise = 'babait'  WHERE id = 1;
UPDATE agent_bots SET enterprise = 'aviezer' WHERE id = 2;

-- ============================================================
-- 2. Wipe existing playbooks/tools/escalations for both bots
-- ============================================================
DELETE FROM agent_bot_playbooks         WHERE agent_bot_id IN (1, 2);
DELETE FROM agent_bot_escalation_rules  WHERE agent_bot_id IN (1, 2);
DELETE FROM playbooks                   WHERE agent_bot_id IN (1, 2);
DELETE FROM escalation_rules            WHERE agent_bot_id IN (1, 2);
DELETE FROM tools                       WHERE agent_bot_id IN (1, 2);

-- ============================================================
-- 3. Refresh agent_config prompts (concise, enterprise-specific)
-- ============================================================
UPDATE agent_config SET
  name = 'שירה',
  llm_model = 'gpt-4.1',
  llm_provider = 'openai',
  tone = 'amical',
  response_length = 'courte',
  prompt = E'את שירה, נציגת שירות דיגיטלית של עמותת בבית — שירותי סיעוד לקשיש.\n\nהשירותים המוצעים (ענייני אך ורק על אלה — אסור להציע שירות שלא ברשימה):\n• מטפל/ת — מטפל ישראלי לבית\n• יעוץ — מידע וייעוץ בסיעוד וזכויות\n• שירות פרטי — סיעוד פרטי גמיש לפי שעות/ימים\n• השגחה בבית חולים — ליווי צמוד באשפוז\n• אחות פרטית — טיפול רפואי בבית/אשפוז\n• שירות אמבולנס — הסעות רפואיות\n• מחפש עבודה — גיוס מטפלים/ות\n\n# חוקי ברזל\n1. עברית בלבד.\n2. הודעות קצרות — 1-2 משפטים. אל תכתבי הודעות ארוכות אלא אם הפונה ביקש פירוט מפורש.\n3. אל תמציאי שירותים, מספרים, סניפים או מידע. אם אין במאגר — אמרי שאין לך, והציעי לחבר לנציג.\n4. שדות חובה לשמירת ליד: שם, טלפון, עיר, סוג שירות. סוג השירות חייב להיות מהרשימה למעלה.\n5. אסור להבטיח מחירים, זמני תגובה, תוצאות.\n\n# Disclaimer חובה כשמדובר ב:\nמחירים/סכומים, זכאות חוקית, מצבים רפואיים, פרוצדורות מול ביטוח לאומי.\nהוסיפי באותה הודעה: "(מידע כללי בלבד — אמתי מול נציג מקצועי)".\n\n# הקשר רלאנס (follow-up)\nאם בקונטקסט מצוין שזה רלאנס/החזרת שיחה — אל תפתחי ב"שלום, איך אפשר לעזור". פתחי ישירות בהמשך אישי קצר על השיחה הקודמת.\n\nהפעלי תמיד את הפלייבוק הפעיל. אל תמציאי כללים מעבר לפלייבוק.',
  updated_at = NOW()
WHERE agent_bot_id = 1;

UPDATE agent_config SET
  name = 'שירה',
  llm_model = 'gpt-4.1',
  llm_provider = 'openai',
  tone = 'amical',
  response_length = 'courte',
  prompt = E'את שירה, נציגת שירות דיגיטלית של אביעזר בבית — השמת עובדים זרים לסיעוד.\n\nהשירותים המוצעים (ענייני אך ורק על אלה — אסור להציע שירות שלא ברשימה):\n• עובד זר — השמת מטפל/ת זר/ה 24/7 בבית המטופל\n\nאם הפונה מתעניין/ת בשירות אחר (סיעוד ישראלי, ייעוץ, אחות פרטית וכו\') — הסבירי שאצלנו מתמחים בהשמת עובדים זרים, והציעי להשאיר פרטים כדי שנפנה אותו/ה לעמותת בבית.\n\n# חוקי ברזל\n1. עברית בלבד.\n2. הודעות קצרות — 1-2 משפטים. אל תכתבי הודעות ארוכות אלא אם הפונה ביקש פירוט מפורש.\n3. אל תמציאי שירותים, מספרים, סניפים או מידע. אם אין במאגר — אמרי שאין לך, והציעי לחבר לנציג.\n4. שדות חובה לשמירת ליד: שם, טלפון, עיר, סוג שירות. סוג השירות חייב להיות מהרשימה למעלה.\n5. אסור להבטיח מחירים, זמני תגובה, תוצאות.\n\n# Disclaimer חובה כשמדובר ב:\nמחירים/סכומים, זכאות חוקית, מצבים רפואיים, פרוצדורות מול משרד הפנים/רשות האוכלוסין.\nהוסיפי באותה הודעה: "(מידע כללי בלבד — אמתי מול נציג מקצועי)".\n\n# הקשר רלאנס (follow-up)\nאם בקונטקסט מצוין שזה רלאנס/החזרת שיחה — אל תפתחי ב"שלום, איך אפשר לעזור". פתחי ישירות בהמשך אישי קצר על השיחה הקודמת.\n\nהפעלי תמיד את הפלייבוק הפעיל. אל תמציאי כללים מעבר לפלייבוק.',
  updated_at = NOW()
WHERE agent_bot_id = 2;

-- ============================================================
-- 4. Tools: save_lead + list_branches per bot
-- ============================================================
DO $$
DECLARE
  v_bot RECORD;
  v_save_lead_id BIGINT;
  v_list_branches_id BIGINT;
  v_pb_welcome BIGINT;
  v_pb_lead BIGINT;
  v_pb_branch BIGINT;
  v_pb_info BIGINT;
  v_esc_id BIGINT;
  v_services_text TEXT;
  v_company TEXT;
BEGIN

FOR v_bot IN SELECT id, enterprise FROM agent_bots WHERE id IN (1, 2) ORDER BY id LOOP
  v_company := v_bot.enterprise;

  -- Build a fresh service list string from service_config for prompts
  SELECT string_agg('• ' || name, E'\n' ORDER BY display_order)
    INTO v_services_text
    FROM service_config
    WHERE company = v_company AND is_active = TRUE;

  IF v_services_text IS NULL THEN
    v_services_text := '(אין שירותים מוגדרים — בדוק עמוד הגדרות)';
  END IF;

  -- ─── save_lead ──────────────────────────────────────
  INSERT INTO tools (agent_bot_id, name, description, type, handler, body_schema, emoji)
  VALUES (
    v_bot.id,
    'שמירת ליד',
    'Persist or enrich a lead. REQUIRED: name, phone, city, service_requested. service_requested MUST be one of the configured services for this enterprise (see playbook). Any other field (email, details) enriches the lead.',
    'internal',
    'save_lead',
    '{
      "type": "object",
      "properties": {
        "name":              { "type": "string", "description": "Full name of the contact" },
        "phone":             { "type": "string", "description": "Phone number" },
        "city":              { "type": "string", "description": "City of residence (used to route to branch)" },
        "service_requested": { "type": "string", "description": "Service from the configured list — the bot MUST NOT invent services" },
        "email":             { "type": "string" },
        "details":           { "type": "string", "description": "Any extra context (urgency, situation)" },
        "type":              { "type": "string", "enum": ["patient","caregiver"] }
      },
      "required": ["name","phone","city","service_requested"]
    }'::jsonb,
    '📋'
  )
  RETURNING id INTO v_save_lead_id;

  -- ─── list_branches ──────────────────────────────────
  INSERT INTO tools (agent_bot_id, name, description, type, handler, body_schema, emoji)
  VALUES (
    v_bot.id,
    'רשימת סניפים',
    'List active branches with name, address, phone, contact, and the cities they serve. Use to answer "do you have a branch in X" or to give address/phone for a branch.',
    'internal',
    'list_branches',
    '{ "type": "object", "properties": {} }'::jsonb,
    '📍'
  )
  RETURNING id INTO v_list_branches_id;

  -- ============================================================
  -- 5. Playbooks (4 per bot)
  -- ============================================================

  -- ─── Playbook 1: Welcoming ──────────────────────────
  INSERT INTO playbooks (agent_bot_id, title, content, audience, rules, tool_id, is_active, emoji)
  VALUES (
    v_bot.id,
    'קבלת פנים',
    E'הודעה ראשונה / ברכה כללית בלי בקשה ספציפית.\n\nתפקיד:\n1. ברכי קצר וחם בשם בבית/אביעזר.\n2. שאלי שאלה פתוחה אחת: "איך אפשר לעזור?"\n3. אל תאספי פרטים. אל תפרסמי שירותים. הקשיבי קודם.\n\nאחרי שהפונה עונה — הפלייבוק הבא ייקח את השיחה.',
    'הודעה ראשונה, ברכה, "שלום", "היי" בלי בקשה ספציפית.',
    '["1-2 משפטים בלבד","אל תרשמי רשימת שירותים","אל תבקשי שם/טלפון/עיר עדיין","ענייני בעברית"]'::jsonb,
    NULL,
    TRUE,
    '👋'
  ) RETURNING id INTO v_pb_welcome;

  -- ─── Playbook 2: Lead capture ───────────────────────
  INSERT INTO playbooks (agent_bot_id, title, content, audience, rules, tool_id, is_active, emoji)
  VALUES (
    v_bot.id,
    'זיהוי צורך ויצירת ליד',
    E'הפונה מתאר/ת צורך ספציפי או רוצה שירות.\n\nהשירותים המוגדרים (חובה לבחור מתוך הרשימה — אסור להמציא):\n' || v_services_text || E'\n\nתהליך — שדה אחד בכל פעם, בלי לבלבל את הפונה:\n1. הביני את הצורך וקבעי איזה שירות מהרשימה הוא מתאים. אם לא מתאים אף אחד — הסבירי בקצרה ועברי לפלייבוק "מידע וייעוץ" או הציעי שלא נמשיך.\n2. שאלי שם פרטי + משפחה.\n3. שאלי באיזו עיר.\n4. אישור הצורך/שירות בקצרה (בלי הרצאה).\n5. שאלי טלפון.\n6. ברגע שיש שם+עיר+שירות+טלפון → קראי מיד ל-save_lead.\n7. אחרי success=true: אישור קצר ב-1 משפט. שאלה אחרונה אופציונלית: "יש משהו ספציפי שכדאי שהנציג ידע?"\n\nאם save_lead מחזיר success=false — קראי את השדה instruction ופעלי לפיו. אסור לומר "שמרתי" לפני success=true.',
    'פונה שיודע מה הוא רוצה / מתאר צורך סיעודי / מבקש שירות.',
    '[
      "סוג שירות חייב להיות מהרשימה — אסור להמציא",
      "הודעות 1-2 משפטים, ללא bullet/רשימות",
      "שדה אחד בכל פעם — לא לבקש 3 פרטים בבת אחת",
      "אסור לכתוב מספר טלפון בשדה name",
      "אסור placeholder כמו ''המספר שלך''",
      "אסור להבטיח שמירה לפני success=true מ-save_lead"
    ]'::jsonb,
    v_save_lead_id,
    TRUE,
    '🎯'
  ) RETURNING id INTO v_pb_lead;

  -- ─── Playbook 3: Branch finder ──────────────────────
  INSERT INTO playbooks (agent_bot_id, title, content, audience, rules, tool_id, is_active, emoji)
  VALUES (
    v_bot.id,
    'איתור סניף',
    E'הפונה רוצה למצוא סניף, כתובת או טלפון של סניף מסוים.\n\nתהליך:\n1. אם לא ציין עיר — שאלי באיזו עיר.\n2. קראי ל-list_branches וחפשי התאמה לפי שם הסניף או הערים שהוא מכסה.\n3. ענייני בקצרה: שם הסניף + כתובת + טלפון. בלי הוספות.\n4. אם לא נמצא סניף לעיר — אמרי זאת בכנות והציעי להשאיר פרטים כדי שנציג ארצי יחזור.\n5. בסוף: "יש משהו נוסף שאוכל לעזור בו?" אם הפונה רוצה שירות → עברי לפלייבוק יצירת ליד.',
    'בקשת מיקום סניף, כתובת, טלפון של סניף, "איפה הסניף הקרוב".',
    '[
      "השתמשי ב-list_branches — אל תמציאי כתובות/טלפונים",
      "הודעת תשובה קצרה: שם + כתובת + טלפון בלבד",
      "אם אין סניף בעיר — אמרי שאין, אל תמציאי"
    ]'::jsonb,
    v_list_branches_id,
    TRUE,
    '📍'
  ) RETURNING id INTO v_pb_branch;

  -- ─── Playbook 4: Info / KB ──────────────────────────
  INSERT INTO playbooks (agent_bot_id, title, content, audience, rules, tool_id, is_active, emoji)
  VALUES (
    v_bot.id,
    'מידע וייעוץ',
    E'הפונה מבקש/ת מידע כללי (זכאות, תהליכים, רמות סיעוד, מחירים, וכו\').\n\nתהליך:\n1. חפשי במאגר הידע (search_knowledge_base) לפני כל תשובה עובדתית.\n2. ענייני בקצרה — 1-2 משפטים. אם דרוש פירוט נוסף, הציעי "להרחיב?" במקום להציף את הפונה.\n3. אם המידע נוגע למחיר/זכאות/רפואה/פרוצדורה מול ביטוח לאומי — הוסיפי באותה הודעה: "(מידע כללי בלבד — אמתי מול נציג מקצועי)".\n4. אם אין מידע במאגר — אמרי שאין לך, והציעי לחבר לנציג.\n5. אחרי המענה — הציעי בעדינות שירות מהרשימה (' || v_services_text || E'). אם הפונה מעוניין/ת — עברי לפלייבוק "זיהוי צורך ויצירת ליד".',
    'בקשת מידע, ייעוץ, שאלות על זכויות, תהליכים, רמות סיעוד.',
    '[
      "חיפוש במאגר הידע לפני מענה עובדתי",
      "תשובה ב-1-2 משפטים — להציע ''להרחיב?'' במקום הודעה ארוכה",
      "Disclaimer חובה במידע על מחיר/זכאות/רפואה/ביטוח לאומי",
      "הצעת שירות בסוף — רק שירות מהרשימה המוגדרת",
      "אסור להמציא מספרים/תנאים/סכומים"
    ]'::jsonb,
    NULL,
    TRUE,
    'ℹ️'
  ) RETURNING id INTO v_pb_info;

  -- ============================================================
  -- 6. Escalation rule (single one per bot)
  -- ============================================================
  INSERT INTO escalation_rules (agent_bot_id, title, audience, trigger_description, rules, is_active, emoji)
  VALUES (
    v_bot.id,
    'תסכול / אי-הבנה',
    'פונה מתוסכל/ת, חוזר/ת על אותה שאלה, מבקש/ת בנאדם, מעיר/ה שהבוט לא מבין/ה.',
    'Triggered when (a) the user explicitly asks for a human ("תני לי בנאדם","אני רוצה לדבר עם נציג"), OR (b) repeats the same question 2+ times without progress, OR (c) shows clear frustration ("את לא מבינה","זה לא עוזר","שטויות"). Do not over-trigger on neutral requests — only when frustration or stuck-loop is evident.',
    '[
      "ענייני בקצרה ובהתנצלות אנושית: ''אני מבינה — אעביר את הפנייה לנציג מהצוות שיחזור אליך/ך.''",
      "אסור להבטיח זמן ספציפי לחזרה",
      "אם בשיחה נאסף שם וטלפון — אזכרי שהפרטים מועברים לנציג (השמירה מתבצעת אוטומטית בסגירת הסשן)",
      "אם לא נאסף עדיין שם או טלפון — בקשי בקצרה את שניהם בהודעה אחת (''רק שם וטלפון כדי שנחזיר אליך''), כדי שלנציג תהיה דרך ליצור קשר"
    ]'::jsonb,
    TRUE,
    '🆘'
  ) RETURNING id INTO v_esc_id;

  -- ============================================================
  -- 7. Associations
  -- ============================================================
  INSERT INTO agent_bot_playbooks (agent_bot_id, playbook_id) VALUES
    (v_bot.id, v_pb_welcome),
    (v_bot.id, v_pb_lead),
    (v_bot.id, v_pb_branch),
    (v_bot.id, v_pb_info);

  INSERT INTO agent_bot_escalation_rules (agent_bot_id, escalation_rule_id) VALUES
    (v_bot.id, v_esc_id);

  RAISE NOTICE 'V5 seeded for bot % (%): tools save_lead=%, list_branches=%; playbooks welcome=%, lead=%, branch=%, info=%; esc=%',
    v_bot.id, v_company, v_save_lead_id, v_list_branches_id, v_pb_welcome, v_pb_lead, v_pb_branch, v_pb_info, v_esc_id;

END LOOP;

END $$;
