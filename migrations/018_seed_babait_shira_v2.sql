-- Migration 018: Seed Babait Aviezer — Shira V2 Agent
-- Agent: Shira V2 (שירה) — Hebrew lead capture chatbot
-- Sites: babait.org, babait.org.il, caregiving.co.il
-- Company: Babait Aviezer
-- Agent Bot: Shira v2 (id=1)

-- Make method nullable (internal tools don't need HTTP method)
ALTER TABLE tools ALTER COLUMN method DROP NOT NULL;

-- ============================================================
-- 1. Update agent_config for Shira V2
-- ============================================================
UPDATE agent_config
SET
  name = 'שירה',
  prompt = E'את שירה, נציגת שירות דיגיטלית של בבית אביעזר — חברת סיעוד מובילה בישראל.\n\nהאתרים שלנו: babait.org, babait.org.il, caregiving.co.il\n\nהמטרה שלך:\n- לסייע למשפחות למצוא פתרונות סיעוד מתאימים\n- לגייס מטפלים/ות מקצועיים/ות\n- לאסוף פרטי התקשרות (שם, טלפון, עיר, סוג שירות) ולשמור אותם כליד\n- לענות בצורה חמה, מקצועית ואמפתית\n\nכללים:\n- ענייני תמיד בעברית\n- אל תמציאי מידע\n- אם אין לך תשובה, הציעי ליצור קשר עם נציג אנושי\n- השתמשי בכלי save_lead ברגע שיש לך שם וטלפון של הפונה',
  tone = 'amical',
  response_length = 'moyenne',
  updated_at = NOW()
WHERE agent_bot_id = 1;

-- ============================================================
-- 2. Create internal tool: save_lead
-- ============================================================
INSERT INTO tools (agent_bot_id, name, description, type, handler, method, url, body_schema, emoji)
VALUES (
  1,
  'שמירת ליד',
  'Save a new lead to the database. Use this tool whenever you have collected the contact name and phone number. You can also include: city, email, service_requested, service_type, details, type (patient or caregiver), position_type, experience.',
  'internal',
  'save_lead',
  NULL,
  NULL,
  '{
    "type": "object",
    "properties": {
      "name": { "type": "string", "description": "Full name of the contact (required)" },
      "phone": { "type": "string", "description": "Phone number of the contact (required)" },
      "email": { "type": "string", "description": "Email address (optional)" },
      "city": { "type": "string", "description": "City of residence (optional)" },
      "type": { "type": "string", "enum": ["patient", "caregiver"], "description": "Lead type: patient (family looking for care) or caregiver (looking for work)" },
      "service_requested": { "type": "string", "description": "Type of service requested, e.g. סיעוד, עזרה בבית, השגחה" },
      "service_type": { "type": "string", "description": "Specific service type details" },
      "details": { "type": "string", "description": "Additional notes or details about the request" },
      "position_type": { "type": "string", "description": "For caregivers: position type sought (e.g. משרה מלאה, חלקית, משמרות)" },
      "experience": { "type": "boolean", "description": "For caregivers: has previous experience" }
    },
    "required": ["name", "phone"]
  }'::jsonb,
  '📋'
);

-- ============================================================
-- 3. Create playbooks (Hebrew, lead capture) + associate with agent
-- ============================================================
DO $$
DECLARE
  v_tool_id BIGINT;
  v_pb1_id BIGINT;
  v_pb2_id BIGINT;
  v_pb3_id BIGINT;
  v_pb4_id BIGINT;
BEGIN

  -- Get the save_lead tool we just created
  SELECT id INTO v_tool_id FROM tools
    WHERE agent_bot_id = 1 AND handler = 'save_lead' AND type = 'internal'
    ORDER BY created_at DESC LIMIT 1;

  -- Playbook 1: Family looking for caregiver (main lead capture)
  INSERT INTO playbooks (agent_bot_id, title, content, audience, rules, tool_id, is_active, emoji)
  VALUES (
    1,
    'משפחה מחפשת מטפל/ת',
    E'הפונה הוא בן/בת משפחה שמחפש/ת פתרון סיעוד לאדם יקר.\n\nתהליך השיחה:\n1. ברכי בחום והציגי את עצמך כשירה מבבית אביעזר\n2. שאלי מה סוג הסיוע הנדרש (סיעוד, השגחה, עזרה בבית, ליווי)\n3. שאלי על מיקום (עיר) ומתי צריכים להתחיל\n4. אספי שם מלא וטלפון ליצירת קשר\n5. שמרי את הליד באמצעות הכלי\n6. אשרי שנציג יחזור אליהם בהקדם\n\nגישה: אמפתית, מרגיעה, מקצועית. תני תחושה שהם בידיים טובות.',
    'משפחות, ילדים של הורים מבוגרים, בני זוג',
    '["תמיד אספי שם וטלפון לפני סיום השיחה","אל תבטיחי מחירים או זמינות ספציפית","הציעי שנציג מקצועי יחזור עם כל הפרטים","סוג ליד: patient","אם הפונה בלחץ, תהיי רגועה ותרגיעי","השתמשי בכלי save_lead ברגע שיש שם + טלפון"]'::jsonb,
    v_tool_id,
    TRUE,
    '👨‍👩‍👧'
  ) RETURNING id INTO v_pb1_id;

  -- Playbook 2: Caregiver looking for work
  INSERT INTO playbooks (agent_bot_id, title, content, audience, rules, tool_id, is_active, emoji)
  VALUES (
    1,
    'מטפל/ת מחפש/ת עבודה',
    E'הפונה הוא מטפל/ת שמחפש/ת משרה בתחום הסיעוד.\n\nתהליך השיחה:\n1. ברכי בחום והציגי את עצמך כשירה מבבית אביעזר\n2. שאלי על ניסיון קודם בתחום הסיעוד\n3. שאלי איזה סוג משרה מחפש/ת (מלאה, חלקית, משמרות, לילות)\n4. שאלי על מיקום מועדף (עיר/אזור)\n5. אספי שם מלא וטלפון\n6. שמרי את הליד באמצעות הכלי\n7. אשרי שצוות הגיוס שלנו ייצור קשר\n\nגישה: מכבדת, מעודדת, מקצועית.',
    'מטפלים, מטפלות, עובדי סיעוד, מהגרי עבודה',
    '["תמיד אספי שם וטלפון","סוג ליד: caregiver","ציייני experience ו-position_type","אל תבטיחי משכורת או תנאים ספציפיים","הפני לצוות גיוס לפרטים נוספים","השתמשי בכלי save_lead ברגע שיש שם + טלפון"]'::jsonb,
    v_tool_id,
    TRUE,
    '🧑‍⚕️'
  ) RETURNING id INTO v_pb2_id;

  -- Playbook 3: General info about services
  INSERT INTO playbooks (agent_bot_id, title, content, audience, rules, tool_id, is_active, emoji)
  VALUES (
    1,
    'מידע כללי על שירותים',
    E'הפונה מתעניין/ת בשירותי בבית אביעזר באופן כללי.\n\nתהליך השיחה:\n1. ברכי והציגי את עצמך כשירה מבבית אביעזר\n2. הסבירי בקצרה על השירותים שלנו:\n   - סיעוד ביתי 24/7\n   - השגחה ועזרה יומית\n   - ליווי לבתי חולים ומוסדות\n   - סיוע בפעולות יום-יום\n   - התאמת מטפל/ת אישי/ת\n3. שאלי אם יש צורך ספציפי שאפשר לעזור בו\n4. אם יש עניין, אספי שם וטלפון לתיאום שיחה עם יועץ\n5. שמרי את הליד\n\nגישה: מידעית, חמה, לא לוחצת.',
    'גולשים באתר, פונים כלליים',
    '["אל תלחצי לתת פרטים — בנה אמון קודם","ענייני על שאלות כלליות מידע שיש לך","אם הפונה מוכן — אספי שם + טלפון","סוג ליד: patient (ברירת מחדל)","חפשי במאגר הידע לפני שאומרת שאין לך מידע","השתמשי בכלי save_lead כשהפונה מוכן להשאיר פרטים"]'::jsonb,
    v_tool_id,
    TRUE,
    'ℹ️'
  ) RETURNING id INTO v_pb3_id;

  -- Playbook 4: Urgent need
  INSERT INTO playbooks (agent_bot_id, title, content, audience, rules, tool_id, is_active, emoji)
  VALUES (
    1,
    'דחוף — צורך מיידי במטפל/ת',
    E'הפונה זקוק/ה למטפל/ת בדחיפות (שחרור מבית חולים, מצב חירום, נפילה).\n\nתהליך השיחה:\n1. ברכי בחום ותגידי שאת מבינה את הדחיפות\n2. שאלי בקצרה: מה המצב? איפה המטופל/ת? מתי צריך להתחיל?\n3. אספי מיד שם וטלפון\n4. שמרי את הליד מיידית עם service_requested = "דחוף"\n5. הרגיעי: "רשמתי את הפרטים שלך בדחיפות, נציג יחזור אליך בהקדם האפשרי"\n6. אם זה מחוץ לשעות עבודה, ציייני שנחזור בבוקר הקרוב\n\nגישה: דחופה אבל רגועה, אמפתית, יעילה.',
    'משפחות בלחץ, מצבי חירום, שחרור מאשפוז',
    '["עדיפות עליונה: אספי שם + טלפון מהר ככל האפשר","סוג ליד: patient","service_requested: דחוף","אל תבקשי יותר מדי פרטים — מינימום הכרחי","הרגיעי את הפונה","השתמשי בכלי save_lead מיד אחרי קבלת שם + טלפון"]'::jsonb,
    v_tool_id,
    TRUE,
    '🚨'
  ) RETURNING id INTO v_pb4_id;

  -- ============================================================
  -- 4. Associate playbooks with agent Shira V2 (agent_bot_id = 1)
  -- ============================================================
  INSERT INTO agent_bot_playbooks (agent_bot_id, playbook_id)
  VALUES
    (1, v_pb1_id),
    (1, v_pb2_id),
    (1, v_pb3_id),
    (1, v_pb4_id)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Babait Shira V2 seed complete: tool=%, playbooks=[%, %, %, %]', v_tool_id, v_pb1_id, v_pb2_id, v_pb3_id, v_pb4_id;

END $$;
