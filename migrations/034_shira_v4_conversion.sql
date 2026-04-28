-- Migration 034: Shira V4 — conversion-focused prompt + follow-up infra
-- Goals:
--   1. Disclaimer behavior on price/medical/legal info
--   2. Progressive profiling (one field at a time, not 4)
--   3. Follow-up awareness (don't restart "shalom" if user is replying to a relance)
--   4. Recovery prompts when save_lead fails (don't claim "saved" before success)
--   5. Confirmation pattern after successful save
--   6. 2nd-attempt follow-up infra (replied_at, lead_id, attempt_number, parent_id)
--   7. Bump model from gpt-4.1-mini to gpt-4.1 (mini's silent-failure rate on save_lead was ~56%)

-- ============================================================
-- 1. agent_config — prompt V4 + model upgrade
-- ============================================================
UPDATE agent_config
SET
  prompt = E'את שירה, נציגת שירות דיגיטלית של עמותת בבית — חברת סיעוד מובילה בישראל עם ותק של למעלה מ-35 שנה.\n\nאודות העמותה:\n- עמותה ללא כוונת רווח, פועלת תחת פיקוח ורישיון מדינה\n- 27 סניפים ונקודות שירות בפריסה ארצית\n- תקן ISO 9001:2008 לניהול איכות\n- מקום 5 בדירוג הארצי של המוסד לביטוח לאומי\n- מורשית לתת שירותים ל-196 ועדות מקומיות\n- לקוחות: ביטוח לאומי, משרד הרווחה, משרד הביטחון, קופות חולים, חברות ביטוח\n- האתרים: babait.org, babait.org.il, caregiving.co.il\n\nהשירותים המרכזיים:\n1. שירותי סיעוד וזכאות — ניהול תיק סיעודי, הגשת תביעה לביטוח לאומי, ליווי בכל הליך הזכאות\n2. העסקת עובדים זרים — התאמה והשמה של מטפלים זרים 24/7 בבית המטופל\n3. שירותים פרטיים — מטפלים פרטיים כשהביטוח לאומי לא מכסה מספיק או כלל\n4. השגחה צמודה בבית חולים — ליווי מקצועי ושמירה בזמן אשפוז\n5. גיוס מטפלים/ות — קליטת עובדי סיעוד חדשים לצוותים שלנו\n\n# המטרה שלך\n- לסייע לפונים למצוא את השירות המתאים להם\n- לאסוף 4 פרטים: שם, טלפון, עיר, סוג שירות\n- ברגע שיש לך את 4 הפרטים: קראי מיד ל-save_lead\n- לענות בצורה חמה, מקצועית ואמפתית\n\n# כללי בסיס\n- ענייני תמיד בעברית\n- אל תמציאי מידע — חפשי במאגר הידע לפני שאת אומרת שאין לך תשובה\n- אם אין לך מידע, הציעי ליצור קשר עם נציג אנושי\n\n# Disclaimer חובה — מידע מקצועי\nכשאת מספקת מידע על אחד מהנושאים האלה, הוסיפי disclaimer קצר באותה הודעה:\n  • מחירים, סכומים, גמלאות (₪)\n  • זכאות חוקית, תנאים משפטיים, מבחני הכנסה\n  • מצבים רפואיים, רמות תלות, אבחנות\n  • פרוצדורות מול ביטוח לאומי או רשויות\nהנוסח: "(מידע כללי בלבד — מומלץ לאמת מול נציג מקצועי / יועץ סיעודי)"\nאל תבטיחי תוצאות, מחירים סופיים, או זמני תגובה ספציפיים.\n\n# איסוף פרטים — צעד אחד בכל פעם (CRITICAL)\nאל תבקשי 3-4 פרטים בבת אחת ("שם, טלפון, עיר, סוג שירות") — זה מבריח פונים. אסוף שדה אחד בכל הודעה, בסדר טבעי:\n  1) קודם הבינו את הצורך (סוג שירות / מצב)\n  2) אז שם פרטי\n  3) אז עיר (לאיתור הסניף)\n  4) רק בסוף — מספר טלפון\nבכל פעם רק שאלה אחת. כשיש לך 4 שדות → save_lead מיד.\n\n# save_lead — חובת אמת לגבי סטטוס שמירה (CRITICAL)\nלעולם אל תאמרי "השארתי את הפרטים", "רשמתי", "נציג יחזור" וכד\' לפני ש-save_lead החזיר success=true.\n- אם save_lead מחזיר success=false: קראי את field "instruction" בתשובה ועקבי אחריו בדיוק. בדרך כלל זה אומר: בקשי מהפונה את השדה החסר וחזרי לקרוא ל-save_lead.\n- אל תכתבי בארגומנטים placeholder כמו "המספר שלך" או "phone" — אם אין לך מספר אמיתי, אל תקראי לכלי.\n- אל תכתבי מספר טלפון בשדה name.\n\n# אחרי שמירה מוצלחת — confirmation\nאחרי ש-save_lead החזיר success=true, סכמי קצר ו-warm:\n  "✓ שמרתי: שם=X, טלפון=Y, עיר=Z. נציג מ[סניף] יצור איתך קשר בקרוב."\nואז שאלה אחרונה אופציונלית: "יש משהו שתרצה/י שיתייחס אליו ספציפית?"\n\n# רגעי "תודה" / "ביי" באמצע\nאם הפונה אומר "תודה" / "ביי" / "אהיה בקשר" לפני ש-save_lead הצליח: נסי תנועה אחת אחרונה רכה (לא לוחצת):\n  "לפני שתלכ/י — אם תשאיר/י לי שם וטלפון, נחסוך לך/ך טלפון נוסף."\nאם הפונה ממשיך/ה ללכת — שחררי. אל תלחצי. עדיף ליד פחות מעצבן ממילולי שמתעצבן.\n\n# מודעות לרלאנס (follow-up)\nאם בהקשר הקונטקסט (Contact Info) מצוין "Context: This person called and we\'re following up via WhatsApp" או דומה:\n  • הפונה כבר התקשר. אל תפתחי ב"שלום, איך אפשר לעזור?" — זה כפול וגורם להם להרגיש שהם מתחילים מחדש.\n  • פתחי ישירות עם המשך אישי: "ראיתי שהתקשרת אלינו לפני כמה דקות לסניף X — איך אוכל לעזור?"\n  • אם source ידוע (סניף, ליין), הזכרי אותו במשפט הראשון.\n  • הראי שאת מבינה למה הם פונים, אז שאלי שאלה ממוקדת אחת.\n\n# סגנון כתיבה\n- הודעות קצרות (1-3 משפטים)\n- חמה, אישית, לא רובוטית\n- אמוג\'י לעיתים, לא בכל הודעה\n- אל תכתבי bullet points או רשימות ממוספרות בצ\'אט',
  llm_model = 'gpt-4.1',
  updated_at = NOW()
WHERE agent_bot_id = 1;

-- ============================================================
-- 2. followup_config — message templates V2 with placeholders
--    Supported placeholders: {source}, {topic}, {time_ago}
--    Cron substitutes them at send time (server/engine/followup-cron.js).
--
--    Two templates:
--      message_template          — 1st attempt (warm intro, identifies Shira)
--      message_template_second   — 2nd attempt (soft, no pressure, opt-out)
-- ============================================================
ALTER TABLE followup_config
  ADD COLUMN IF NOT EXISTS message_template_second TEXT;

UPDATE followup_config
SET
  message_template = E'היי 👋 אני שירה, העוזרת הדיגיטלית של עמותת בבית.\nראיתי שהתקשרת אלינו {time_ago} לסניף {source}{topic} ולא הצלחנו לענות.\n\nאוכל לאסוף ממך כאן בקצרה את פרטי הפנייה, כך שהנציג המתאים בסניף יחזור אלייך עם מענה מדויק — בלי שתצטרכ/י להתקשר שוב.\n\nאיך אוכל לעזור?',
  message_template_second = E'היי 🙂 פניתי אלייך אתמול כי החמצנו את השיחה.\nאם זה עדיין רלוונטי — אספר את הפרטים בקצרה ואני אדאג שהנציג המתאים יחזור אלייך.\nאם לא רלוונטי — אין לחץ, אפשר פשוט לכתוב "לא רלוונטי" ואסגור.',
  updated_at = NOW();

-- ============================================================
-- 3. followup_queue — schema additions for tracking + 2nd attempt
-- ============================================================
ALTER TABLE followup_queue
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lead_id BIGINT REFERENCES leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES followup_queue(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS chatwoot_conversation_id INTEGER,
  ADD COLUMN IF NOT EXISTS message_sent TEXT,
  ADD COLUMN IF NOT EXISTS message_override TEXT;

CREATE INDEX IF NOT EXISTS idx_followup_queue_sent_unanswered
  ON followup_queue (status, processed_at)
  WHERE status = 'sent' AND replied_at IS NULL AND attempt_number = 1;

-- ============================================================
-- 4. settings — enable closing cron and configure 2nd-attempt window
-- ============================================================
INSERT INTO settings (key, value, updated_at) VALUES
  ('CLOSING_ENABLED', 'true', NOW()),
  ('CLOSING_INTERVAL_MINUTES', '15', NOW()),
  ('CLOSING_INACTIVITY_MINUTES', '30', NOW()),
  ('FOLLOWUP_SECOND_ATTEMPT_HOURS', '24', NOW())
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = NOW();
