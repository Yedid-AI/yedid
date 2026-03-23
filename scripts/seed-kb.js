/**
 * Seed script: Populate the Knowledge Base with kolzchut.org.il articles.
 *
 * Usage:
 *   node scripts/seed-kb.js --user-id=<USER_ID>
 *
 * Requires .env with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
 * (or OPENAI_API_KEY stored in the settings table).
 *
 * No Firecrawl needed — uses fetch + @mozilla/readability for scraping.
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import { loadSettings } from '../server/settings.js'
import { chunkText, embedAndStore } from '../server/ingestion.js'

// ─── URLs to seed ────────────────────────────────────────
const URLS = [
  // === Page 1: גמלת סיעוד ===
  'https://www.kolzchut.org.il/he/%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%AA%D7%A0%D7%90%D7%99_%D7%96%D7%9B%D7%90%D7%95%D7%AA_%D7%9C%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%91%D7%97%D7%9F_%D7%94%D7%9B%D7%A0%D7%A1%D7%95%D7%AA_%D7%9C%D7%A6%D7%95%D7%A8%D7%9A_%D7%A7%D7%91%D7%9C%D7%AA_%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%A7%D7%91%D7%99%D7%A2%D7%AA_%D7%94%D7%94%D7%A8%D7%9B%D7%91_%D7%A9%D7%9C_%D7%A9%D7%99%D7%A8%D7%95%D7%AA%D7%99_%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%96%D7%9E%D7%A0%D7%99%D7%AA',
  'https://www.kolzchut.org.il/he/%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%91%D7%96%D7%9E%D7%9F_%D7%90%D7%A9%D7%A4%D7%95%D7%96_%D7%91%D7%91%D7%99%D7%AA_%D7%97%D7%95%D7%9C%D7%99%D7%9D',
  'https://www.kolzchut.org.il/he/%D7%A7%D7%91%D7%9C%D7%AA_%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%91%D7%9B%D7%A1%D7%A3',
  'https://www.kolzchut.org.il/he/%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%91%D7%9B%D7%A1%D7%A3_%D7%9C%D7%A6%D7%95%D7%A8%D7%9A_%D7%94%D7%A2%D7%A1%D7%A7%D7%AA_%D7%9E%D7%98%D7%A4%D7%9C_%D7%A6%D7%9E%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%A2%D7%93%D7%9B%D7%95%D7%A0%D7%99%D7%9D_%D7%91%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_-_%D7%A0%D7%95%D7%91%D7%9E%D7%91%D7%A8_2018',
  'https://www.kolzchut.org.il/he/%D7%94%D7%92%D7%A9%D7%AA_%D7%AA%D7%91%D7%99%D7%A2%D7%94_%D7%9C%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%97%D7%99%D7%A9%D7%95%D7%91_%D7%A0%D7%99%D7%A7%D7%95%D7%93_%D7%A2%D7%91%D7%95%D7%A8_%D7%96%D7%9B%D7%90%D7%95%D7%AA_%D7%9C%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%91%D7%93%D7%99%D7%A7%D7%94_%D7%9E%D7%97%D7%93%D7%A9_%D7%A9%D7%9C_%D7%96%D7%9B%D7%90%D7%99_%D7%9C%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%A2%D7%A7%D7%91_%D7%94%D7%97%D7%9E%D7%A8%D7%94',
  'https://www.kolzchut.org.il/he/%D7%A2%D7%A8%D7%A2%D7%95%D7%A8_%D7%A2%D7%9C_%D7%94%D7%97%D7%9C%D7%98%D7%AA_%D7%94%D7%9E%D7%95%D7%A1%D7%93_%D7%9C%D7%91%D7%99%D7%98%D7%95%D7%97_%D7%9C%D7%90%D7%95%D7%9E%D7%99_%D7%91%D7%A0%D7%95%D7%92%D7%A2_%D7%9C%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%97%D7%99%D7%93%D7%95%D7%A9_%D7%96%D7%9B%D7%90%D7%95%D7%AA_%D7%9C%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%9C%D7%90%D7%97%D7%A8_%D7%A9%D7%97%D7%A8%D7%95%D7%A8_%D7%9E%D7%91%D7%99%D7%AA_%D7%97%D7%95%D7%9C%D7%99%D7%9D_%D7%90%D7%95_%D7%9E%D7%95%D7%A1%D7%93_%D7%A1%D7%99%D7%A2%D7%95%D7%93%D7%99',
  'https://www.kolzchut.org.il/he/%D7%A9%D7%99%D7%A8%D7%95%D7%AA%D7%99_%22%D7%98%D7%A8%D7%95%D7%9D_%D7%A1%D7%99%D7%A2%D7%95%D7%93%22_%D7%91%D7%AA%D7%91%D7%99%D7%A2%D7%94_%D7%9C%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%91%D7%93%D7%99%D7%A7%D7%AA_%D7%AA%D7%A4%D7%A7%D7%95%D7%93_%D7%9C%D7%A6%D7%95%D7%A8%D7%9A_%D7%A7%D7%91%D7%99%D7%A2%D7%AA_%D7%96%D7%9B%D7%90%D7%95%D7%AA_%D7%9C%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%28%D7%9E%D7%91%D7%97%D7%9F_%D7%AA%D7%9C%D7%95%D7%AA_ADL%29',
  'https://www.kolzchut.org.il/he/%D7%91%D7%93%D7%99%D7%A7%D7%AA_%D7%AA%D7%A4%D7%A7%D7%95%D7%93_%D7%A2%D7%9C_%D7%99%D7%93%D7%99_%D7%A8%D7%95%D7%A4%D7%90_%D7%92%D7%A8%D7%99%D7%90%D7%98%D7%A8_%D7%9C%D7%A7%D7%91%D7%99%D7%A2%D7%AA_%D7%96%D7%9B%D7%90%D7%95%D7%AA_%D7%9C%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%9C%D7%91%D7%A0%D7%99_90_%D7%95%D7%9E%D7%A2%D7%9C%D7%94',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%A1%D7%9C%D7%95%D7%9C_%D7%9E%D7%94%D7%99%D7%A8_%D7%9C%D7%9C%D7%90_%D7%91%D7%93%D7%99%D7%A7%D7%AA_%D7%AA%D7%9C%D7%95%D7%AA_%28ADL%29_%D7%91%D7%AA%D7%91%D7%99%D7%A2%D7%94_%D7%9C%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%91%D7%97%D7%9F_%D7%AA%D7%9C%D7%95%D7%AA_%28ADL%29_%D7%9C%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%9C%D7%97%D7%95%D7%9C%D7%99_%D7%90%D7%9C%D7%A6%D7%94%D7%99%D7%99%D7%9E%D7%A8',
  'https://www.kolzchut.org.il/he/%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%A8%D7%9E%D7%94_1',
  'https://www.kolzchut.org.il/he/%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%A8%D7%9E%D7%94_2',
  'https://www.kolzchut.org.il/he/%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%A8%D7%9E%D7%94_3',
  'https://www.kolzchut.org.il/he/%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%A8%D7%9E%D7%94_4',
  'https://www.kolzchut.org.il/he/%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%A8%D7%9E%D7%94_5',
  'https://www.kolzchut.org.il/he/%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%A8%D7%9E%D7%94_6',
  'https://www.kolzchut.org.il/he/%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%A8%D7%9E%D7%94_%D7%90%27',
  'https://www.kolzchut.org.il/he/%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%A8%D7%9E%D7%94_%D7%91%27',
  'https://www.kolzchut.org.il/he/%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%A8%D7%9E%D7%94_%D7%92%27',
  'https://www.kolzchut.org.il/he/%D7%AA%D7%95%D7%A1%D7%A4%D7%AA_%D7%A9%D7%A2%D7%95%D7%AA_%D7%98%D7%99%D7%A4%D7%95%D7%9C_%D7%90%D7%99%D7%A9%D7%99_%D7%9C%D7%9E%D7%A7%D7%91%D7%9C%D7%99_%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%94%D7%9E%D7%A2%D7%A1%D7%99%D7%A7%D7%99%D7%9D_%D7%9E%D7%98%D7%A4%D7%9C_%D7%99%D7%A9%D7%A8%D7%90%D7%9C%D7%99',
  'https://www.kolzchut.org.il/he/%D7%A2%D7%96%D7%A8%D7%94_%D7%A1%D7%99%D7%A2%D7%95%D7%93%D7%99%D7%AA_%D7%9C%D7%98%D7%95%D7%95%D7%97_%D7%90%D7%A8%D7%95%D7%9A_%D7%9C%D7%A0%D7%99%D7%A6%D7%95%D7%9C%D7%99_%D7%A9%D7%95%D7%90%D7%94',
  'https://www.kolzchut.org.il/he/%D7%96%D7%9B%D7%90%D7%95%D7%AA_%D7%9C%D7%94%D7%A2%D7%A1%D7%A7%D7%AA_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%94%D7%A0%D7%97%D7%94_%D7%91%D7%90%D7%A8%D7%A0%D7%95%D7%A0%D7%94_%D7%9C%D7%9E%D7%A7%D7%91%D7%9C%D7%99_%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%94%D7%98%D7%91%D7%94_%D7%91%D7%97%D7%A9%D7%91%D7%95%D7%9F_%D7%94%D7%9E%D7%99%D7%9D_%D7%9C%D7%9E%D7%A7%D7%91%D7%9C%D7%99_%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%28%D7%94%D7%A0%D7%97%D7%94_%D7%91%D7%AA%D7%A2%D7%A8%D7%99%D7%A3_%D7%94%D7%92%D7%91%D7%95%D7%94%29',
  'https://www.kolzchut.org.il/he/%D7%94%D7%A0%D7%97%D7%94_%D7%91%D7%97%D7%A9%D7%91%D7%95%D7%9F_%D7%97%D7%A9%D7%9E%D7%9C_%D7%9C%D7%9E%D7%A7%D7%91%D7%9C%D7%99_%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%A4%D7%98%D7%95%D7%A8_%D7%9E%D7%AA%D7%A9%D7%9C%D7%95%D7%9D_%D7%91%D7%9B%D7%A0%D7%99%D7%A1%D7%94_%D7%9C%D7%9E%D7%A7%D7%95%D7%9D_%D7%A6%D7%99%D7%91%D7%95%D7%A8%D7%99_%D7%9C%D7%9E%D7%9C%D7%95%D7%95%D7%94_%D7%A9%D7%9C_%D7%9E%D7%A7%D7%91%D7%9C%D7%99_%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%A4%D7%98%D7%95%D7%A8_%D7%9E%D7%94%D7%9E%D7%AA%D7%A0%D7%94_%D7%91%D7%AA%D7%95%D7%A8_%D7%9C%D7%9E%D7%A7%D7%91%D7%9C%D7%99_%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%94%D7%A2%D7%A1%D7%A7%D7%AA_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%A2%D7%9C-%D7%99%D7%93%D7%99_%D7%94%D7%9E%D7%98%D7%95%D7%A4%D7%9C_%D7%91%D7%9E%D7%A7%D7%91%D7%99%D7%9C_%D7%9C%D7%94%D7%A2%D7%A1%D7%A7%D7%AA%D7%95_%D7%A2%D7%9C-%D7%99%D7%93%D7%99_%D7%97%D7%91%D7%A8%D7%AA_%D7%94%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%93%D7%A8%D7%99%D7%9A_%D7%A1%D7%99%D7%95%D7%A2_%D7%9C%D7%9E%D7%91%D7%95%D7%92%D7%A8_%D7%A9%D7%94%D7%A4%D7%9A_%D7%9C%D7%A1%D7%99%D7%A2%D7%95%D7%93%D7%99_%D7%95%D7%9C%D7%91%D7%A0%D7%99_%D7%9E%D7%A9%D7%A4%D7%97%D7%AA%D7%95',
  'https://www.kolzchut.org.il/he/%D7%96%D7%9B%D7%95%D7%AA%D7%95%D7%9F_%D7%91%D7%A0%D7%99_%D7%9E%D7%A9%D7%A4%D7%97%D7%94_%D7%94%D7%9E%D7%98%D7%A4%D7%9C%D7%99%D7%9D_%D7%91%D7%A7%D7%A9%D7%99%D7%A9_%D7%90%D7%95_%D7%91%D7%90%D7%93%D7%9D_%D7%A2%D7%9D_%D7%9E%D7%95%D7%92%D7%91%D7%9C%D7%95%D7%AA_%D7%90%D7%95_%D7%9E%D7%97%D7%9C%D7%94',
  'https://www.kolzchut.org.il/he/%D7%94%D7%A2%D7%A1%D7%A7%D7%AA_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%90%D7%97%D7%93_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%A2%D7%91%D7%95%D7%A8_%D7%A9%D7%A0%D7%99_%D7%91%D7%A0%D7%99_%D7%9E%D7%A9%D7%A4%D7%97%D7%94',
  'https://www.kolzchut.org.il/he/%D7%94%D7%A2%D7%A1%D7%A7%D7%AA_%D7%A2%D7%95%D7%91%D7%93_%D7%99%D7%A9%D7%A8%D7%90%D7%9C%D7%99_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%97%D7%95%D7%9C%D7%94_%D7%A1%D7%99%D7%A2%D7%95%D7%93%D7%99',
  'https://www.kolzchut.org.il/he/%D7%96%D7%99%D7%A7%D7%A0%D7%94_%D7%95%D7%94%D7%96%D7%93%D7%A7%D7%A0%D7%95%D7%AA',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%93%D7%A8%D7%99%D7%9A_%D7%9E%D7%99%D7%A6%D7%95%D7%99_%D7%96%D7%9B%D7%95%D7%99%D7%95%D7%AA_%D7%9C%D7%90%D7%96%D7%A8%D7%97%D7%99%D7%9D_%D7%95%D7%AA%D7%99%D7%A7%D7%99%D7%9D',
  'https://www.kolzchut.org.il/he/%D7%90%D7%A0%D7%A9%D7%99%D7%9D_%D7%91%D7%9E%D7%A6%D7%91_%D7%A1%D7%99%D7%A2%D7%95%D7%93%D7%99',
  'https://www.kolzchut.org.il/he/%D7%A1%D7%99%D7%95%D7%A2_%D7%9E%D7%A9%D7%A4%D7%98%D7%99_%D7%91%D7%A0%D7%95%D7%A9%D7%90%D7%99_%D7%94%D7%91%D7%99%D7%98%D7%95%D7%97_%D7%94%D7%9C%D7%90%D7%95%D7%9E%D7%99_%D7%9E%D7%98%D7%A2%D7%9D_%D7%9E%D7%A9%D7%A8%D7%93_%D7%94%D7%9E%D7%A9%D7%A4%D7%98%D7%99%D7%9D',
  'https://www.kolzchut.org.il/he/%D7%94%D7%9E%D7%95%D7%A1%D7%93_%D7%9C%D7%91%D7%99%D7%98%D7%95%D7%97_%D7%9C%D7%90%D7%95%D7%9E%D7%99',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%A9%D7%A8%D7%93_%D7%94%D7%A8%D7%95%D7%95%D7%97%D7%94_%D7%95%D7%94%D7%91%D7%99%D7%98%D7%97%D7%95%D7%9F_%D7%94%D7%97%D7%91%D7%A8%D7%AA%D7%99',
  'https://www.kolzchut.org.il/he/%D7%A9%D7%99%D7%A8%D7%95%D7%AA%D7%99_%D7%99%D7%A2%D7%95%D7%A5_%D7%9C%D7%A7%D7%A9%D7%99%D7%A9_-_%D7%94%D7%9E%D7%95%D7%A1%D7%93_%D7%9C%D7%91%D7%99%D7%98%D7%95%D7%97_%D7%9C%D7%90%D7%95%D7%9E%D7%99',
  'https://www.kolzchut.org.il/he/%D7%A8%D7%A9%D7%99%D7%9E%D7%AA_%D7%90%D7%A8%D7%92%D7%95%D7%A0%D7%99_%D7%A1%D7%99%D7%95%D7%A2_%D7%9E%D7%A2%D7%A1%D7%9B%D7%95%D7%9F_%D7%94%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%99%D7%97%D7%99%D7%93%D7%AA_%D7%A1%D7%92%D7%95%D7%9C%D7%94_-_%D7%9E%D7%95%D7%A7%D7%93_%D7%9E%D7%99%D7%A6%D7%95%D7%99_%D7%96%D7%9B%D7%95%D7%99%D7%95%D7%AA_%D7%9C%D7%90%D7%96%D7%A8%D7%97%D7%99%D7%9D_%D7%95%D7%AA%D7%99%D7%A7%D7%99%D7%9D_%D7%91%D7%91%D7%AA%D7%99_%D7%97%D7%95%D7%9C%D7%99%D7%9D',
  'https://www.kolzchut.org.il/he/%D7%A1%D7%99%D7%95%D7%A2_%D7%97%D7%99%D7%A0%D7%9D_%D7%9E%D7%98%D7%A2%D7%9D_%D7%94%D7%9E%D7%95%D7%A1%D7%93_%D7%9C%D7%91%D7%99%D7%98%D7%95%D7%97_%D7%9C%D7%90%D7%95%D7%9E%D7%99_%D7%91%D7%94%D7%92%D7%A9%D7%AA_%D7%AA%D7%91%D7%99%D7%A2%D7%95%D7%AA_%D7%A0%D7%9B%D7%95%D7%AA_%D7%9C%D7%9E%D7%90%D7%95%D7%A9%D7%A4%D7%96%D7%99%D7%9D_%D7%91%D7%91%D7%99%D7%AA_%D7%97%D7%95%D7%9C%D7%99%D7%9D_%28%22%D7%9E%D7%97%D7%9C%D7%A7%D7%94_%D7%A8%D7%90%D7%A9%D7%95%D7%A0%D7%94%22%29',
  'https://www.kolzchut.org.il/he/%D7%91%D7%A8%D7%99%D7%90%D7%95%D7%AA_%D7%95%D7%9E%D7%97%D7%9C%D7%95%D7%AA/%D7%90%D7%A8%D7%92%D7%95%D7%A0%D7%99_%D7%A1%D7%99%D7%95%D7%A2',
  'https://www.kolzchut.org.il/he/%D7%96%D7%99%D7%A7%D7%A0%D7%94_%D7%95%D7%94%D7%96%D7%93%D7%A7%D7%A0%D7%95%D7%AA/%D7%90%D7%A8%D7%92%D7%95%D7%A0%D7%99_%D7%A1%D7%99%D7%95%D7%A2',
  'https://www.kolzchut.org.il/he/%D7%90%D7%A0%D7%A9%D7%99%D7%9D_%D7%A2%D7%9D_%D7%9E%D7%95%D7%92%D7%91%D7%9C%D7%95%D7%99%D7%95%D7%AA/%D7%90%D7%A8%D7%92%D7%95%D7%A0%D7%99_%D7%A1%D7%99%D7%95%D7%A2',
  'https://www.kolzchut.org.il/he/%D7%90%D7%91%D7%99%D7%91_%D7%9C%D7%92%D7%99%D7%9C_%D7%94%D7%A9%D7%9C%D7%99%D7%A9%D7%99',
  'https://www.kolzchut.org.il/he/%D7%99%D7%A9_%D7%9C%D7%94%D7%A7%D7%99%D7%9D_%D7%95%D7%A2%D7%93%D7%95%D7%AA_%D7%A2%D7%A8%D7%A8_%D7%A2%D7%9C_%D7%94%D7%97%D7%9C%D7%98%D7%95%D7%AA_%D7%9C%D7%93%D7%97%D7%99%D7%99%D7%AA_%D7%AA%D7%91%D7%99%D7%A2%D7%95%D7%AA_%D7%9C%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%92%D7%95%D7%A8%D7%99%D7%9D_%D7%91%D7%91%D7%99%D7%AA_%D7%90%D7%91%D7%95%D7%AA_%D7%90%D7%99%D7%A0%D7%9D_%D7%A4%D7%95%D7%92%D7%A2%D7%99%D7%9D_%D7%9B%D7%A9%D7%9C%D7%A2%D7%A6%D7%9E%D7%9D_%D7%91%D7%96%D7%9B%D7%90%D7%95%D7%AA_%D7%9C%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%A9%D7%99%D7%A8%D7%95%D7%AA_%D7%94%D7%99%D7%99%D7%A2%D7%95%D7%A5_%D7%9C%D7%90%D7%96%D7%A8%D7%97_%D7%94%D7%95%D7%95%D7%AA%D7%99%D7%A7_%D7%95%D7%9E%D7%A9%D7%A4%D7%97%D7%AA%D7%95_%D7%9E%D7%98%D7%A2%D7%9D_%D7%94%D7%9E%D7%95%D7%A1%D7%93_%D7%9C%D7%91%D7%99%D7%98%D7%95%D7%97_%D7%9C%D7%90%D7%95%D7%9E%D7%99',
  'https://www.kolzchut.org.il/he/%D7%94%D7%9E%D7%95%D7%A7%D7%93_%D7%94%D7%98%D7%9C%D7%A4%D7%95%D7%A0%D7%99_%D7%A9%D7%9C_%D7%A9%D7%99%D7%A8%D7%95%D7%AA_%D7%94%D7%99%D7%99%D7%A2%D7%95%D7%A5_%D7%9C%D7%90%D7%96%D7%A8%D7%97_%D7%94%D7%95%D7%95%D7%AA%D7%99%D7%A7_%D7%9E%D7%98%D7%A2%D7%9D_%D7%94%D7%9E%D7%95%D7%A1%D7%93_%D7%9C%D7%91%D7%99%D7%98%D7%95%D7%97_%D7%9C%D7%90%D7%95%D7%9E%D7%99',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%95%D7%A7%D7%93_8840*_%D7%A9%D7%9C_%D7%90%D7%92%D7%A3_%D7%91%D7%9B%D7%99%D7%A8_%D7%90%D7%96%D7%A8%D7%97%D7%99%D7%9D_%D7%95%D7%AA%D7%99%D7%A7%D7%99%D7%9D',
  'https://www.kolzchut.org.il/he/%D7%A1%D7%99%D7%93%D7%95%D7%A8_%D7%9E%D7%95%D7%A1%D7%93%D7%99_%D7%9C%D7%91%D7%A0%D7%99_%D7%94%D7%92%D7%99%D7%9C_%D7%94%D7%A9%D7%9C%D7%99%D7%A9%D7%99_%28%D7%91%D7%99%D7%AA_%D7%90%D7%91%D7%95%D7%AA%29',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%A9%D7%A8%D7%93_%D7%94%D7%91%D7%A8%D7%99%D7%90%D7%95%D7%AA',
  'https://www.kolzchut.org.il/he/%D7%A7%D7%95%D7%9C_%D7%94%D7%91%D7%A8%D7%99%D7%90%D7%95%D7%AA_-_%D7%9E%D7%95%D7%A7%D7%93_%D7%94%D7%A9%D7%99%D7%A8%D7%95%D7%AA_%D7%94%D7%98%D7%9C%D7%A4%D7%95%D7%A0%D7%99_%D7%A9%D7%9C_%D7%9E%D7%A9%D7%A8%D7%93_%D7%94%D7%91%D7%A8%D7%99%D7%90%D7%95%D7%AA_5400*',
  'https://www.kolzchut.org.il/he/%D7%91%D7%99%D7%98%D7%95%D7%97_%D7%91%D7%A8%D7%99%D7%90%D7%95%D7%AA',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%A9%D7%A8%D7%93_%D7%94%D7%91%D7%99%D7%A0%D7%95%D7%99_%D7%95%D7%94%D7%A9%D7%99%D7%9B%D7%95%D7%9F',
  'https://www.kolzchut.org.il/he/%D7%93%D7%99%D7%95%D7%A8_%D7%91%D7%92%D7%99%D7%9C_%D7%94%D7%A9%D7%9C%D7%99%D7%A9%D7%99',
  'https://www.kolzchut.org.il/he/%D7%AA%D7%A2%D7%A1%D7%95%D7%A7%D7%94_%D7%95%D7%96%D7%9B%D7%95%D7%99%D7%95%D7%AA_%D7%A2%D7%95%D7%91%D7%93%D7%99%D7%9D',
  'https://www.kolzchut.org.il/he/%D7%A4%D7%A0%D7%A1%D7%99%D7%94_%D7%95%D7%97%D7%99%D7%A1%D7%9B%D7%95%D7%9F_%D7%90%D7%A8%D7%95%D7%9A_%D7%98%D7%95%D7%95%D7%97',
  'https://www.kolzchut.org.il/he/%D7%90%D7%A0%D7%A9%D7%99%D7%9D_%D7%A2%D7%9D_%D7%9E%D7%95%D7%92%D7%91%D7%9C%D7%95%D7%99%D7%95%D7%AA',
  'https://www.kolzchut.org.il/he/%D7%96%D7%9B%D7%95%D7%99%D7%95%D7%AA_%D7%A0%D7%A9%D7%99%D7%9D',
  'https://www.kolzchut.org.il/he/%D7%94%D7%9B%D7%A0%D7%A1%D7%94_%D7%A0%D7%9E%D7%95%D7%9B%D7%94_%D7%95%D7%A7%D7%A9%D7%99%D7%99%D7%9D_%D7%9B%D7%9C%D7%9B%D7%9C%D7%99%D7%99%D7%9D',
  'https://www.kolzchut.org.il/he/%D7%91%D7%A8%D7%99%D7%90%D7%95%D7%AA_%D7%95%D7%9E%D7%97%D7%9C%D7%95%D7%AA',
  'https://www.kolzchut.org.il/he/%D7%97%D7%99%D7%A0%D7%95%D7%9A',
  'https://www.kolzchut.org.il/he/%D7%A2%D7%9E%D7%95%D7%93_%D7%A8%D7%90%D7%A9%D7%99',
  // === Page 2: העסקת עובד זר בסיעוד ===
  'https://www.kolzchut.org.il/he/%D7%94%D7%A2%D7%A1%D7%A7%D7%AA_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%99%D7%93%D7%A2_%D7%9B%D7%9C%D7%9C%D7%99_%D7%A2%D7%9C_%D7%94%D7%A2%D7%A1%D7%A7%D7%AA_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%96%D7%9B%D7%90%D7%95%D7%AA_%D7%9C%D7%94%D7%A2%D7%A1%D7%A7%D7%AA_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%93%D7%A8%D7%99%D7%9A_%D7%9C%D7%92%D7%99%D7%95%D7%A1_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%94%D7%A2%D7%A1%D7%A7%D7%AA_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%9C%D7%90%D7%97%D7%A8_%D7%A9%D7%97%D7%A8%D7%95%D7%A8_%D7%9E%D7%91%D7%99%D7%AA_%D7%97%D7%95%D7%9C%D7%99%D7%9D_%D7%90%D7%95_%D7%9E%D7%9E%D7%95%D7%A1%D7%93_%D7%A1%D7%99%D7%A2%D7%95%D7%93%D7%99',
  'https://www.kolzchut.org.il/he/%D7%94%D7%A2%D7%A1%D7%A7%D7%AA_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%9C%D7%98%D7%99%D7%A4%D7%95%D7%9C_%D7%91%D7%99%D7%9C%D7%93_%D7%A0%D7%9B%D7%94',
  'https://www.kolzchut.org.il/he/%D7%94%D7%A2%D7%A1%D7%A7%D7%AA_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%90%D7%97%D7%93_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%A2%D7%91%D7%95%D7%A8_%D7%A9%D7%A0%D7%99_%D7%91%D7%A0%D7%99_%D7%9E%D7%A9%D7%A4%D7%97%D7%94',
  'https://www.kolzchut.org.il/he/%D7%94%D7%A2%D7%A1%D7%A7%D7%AA_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%A9%D7%A0%D7%99_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%92%D7%91%D7%9C%D7%95%D7%AA_%D7%A2%D7%9C_%D7%94%D7%97%D7%9C%D7%A4%D7%AA_%D7%9E%D7%A7%D7%95%D7%9D_%D7%A2%D7%91%D7%95%D7%93%D7%94_%D7%9C%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%A1%D7%99%D7%A2%D7%95%D7%93%D7%99',
  'https://www.kolzchut.org.il/he/%D7%A7%D7%91%D7%9C%D7%AA_%D7%94%D7%99%D7%AA%D7%A8_%D7%9C%D7%94%D7%A2%D7%A1%D7%A7%D7%AA_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%95%D7%A2%D7%93%D7%94_%D7%9E%D7%A7%D7%A6%D7%95%D7%A2%D7%99%D7%AA_%D7%9E%D7%99%D7%99%D7%A2%D7%A6%D7%AA_%D7%9C%D7%9E%D7%AA%D7%9F_%D7%94%D7%99%D7%AA%D7%A8%D7%99%D7%9D_%D7%9C%D7%94%D7%A2%D7%A1%D7%A7%D7%AA_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%91%D7%93%D7%99%D7%A7%D7%94_%D7%9C%D7%94%D7%A2%D7%A8%D7%9B%D7%AA_%D7%AA%D7%9C%D7%95%D7%AA_%D7%9C%D7%90%D7%93%D7%9D_%D7%A1%D7%99%D7%A2%D7%95%D7%93%D7%99',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%91%D7%97%D7%9F_%D7%AA%D7%9C%D7%95%D7%AA_%D7%9C%D7%A6%D7%95%D7%A8%D7%9A_%D7%94%D7%A2%D7%A1%D7%A7%D7%AA_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%9C%D7%9E%D7%99_%D7%A9%D7%90%D7%99%D7%A0%D7%95_%D7%96%D7%9B%D7%90%D7%99_%D7%9C%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%91%D7%A9%D7%9C_%D7%92%D7%95%D7%91%D7%94_%D7%94%D7%9B%D7%A0%D7%A1%D7%95%D7%AA%D7%99%D7%95',
  'https://www.kolzchut.org.il/he/%D7%92%D7%99%D7%95%D7%A1_%D7%95%D7%9C%D7%99%D7%95%D7%95%D7%99_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%A2%D7%9C_%D7%99%D7%93%D7%99_%D7%94%D7%9C%D7%A9%D7%9B%D7%95%D7%AA_%D7%94%D7%9E%D7%95%D7%A8%D7%A9%D7%95%D7%AA',
  'https://www.kolzchut.org.il/he/%D7%94%D7%90%D7%A8%D7%9B%D7%AA_%D7%94%D7%99%D7%AA%D7%A8_%D7%9C%D7%94%D7%A2%D7%A1%D7%A7%D7%AA_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%91%D7%A7%D7%A9%D7%94_%D7%9C%D7%94%D7%9E%D7%A9%D7%9A_%D7%94%D7%A2%D7%A1%D7%A7%D7%94_%D7%A9%D7%9C_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%9E%D7%98%D7%A2%D7%9E%D7%99%D7%9D_%D7%94%D7%95%D7%9E%D7%A0%D7%99%D7%98%D7%A8%D7%99%D7%99%D7%9D',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%93%D7%A8%D7%99%D7%9A_%D7%9C%D7%94%D7%A2%D7%A1%D7%A7%D7%AA_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%AA%D7%A0%D7%90%D7%99_%D7%94%D7%A2%D7%A1%D7%A7%D7%94_%D7%A9%D7%9C_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%94%D7%9E%D7%95%D7%A2%D7%A1%D7%A7_%D7%91%D7%91%D7%99%D7%AA_%D7%94%D7%9E%D7%98%D7%95%D7%A4%D7%9C',
  'https://www.kolzchut.org.il/he/%D7%AA%D7%A0%D7%90%D7%99_%D7%94%D7%A2%D7%A1%D7%A7%D7%94_%D7%A9%D7%9C_%D7%A2%D7%95%D7%91%D7%93%D7%99%D7%9D_%D7%96%D7%A8%D7%99%D7%9D_%D7%94%D7%9E%D7%95%D7%A2%D7%A1%D7%A7%D7%99%D7%9D_%D7%91%D7%9E%D7%95%D7%A1%D7%93%D7%95%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%94%D7%A2%D7%A1%D7%A7%D7%AA_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%A2%D7%9C-%D7%99%D7%93%D7%99_%D7%94%D7%9E%D7%98%D7%95%D7%A4%D7%9C_%D7%91%D7%9E%D7%A7%D7%91%D7%99%D7%9C_%D7%9C%D7%94%D7%A2%D7%A1%D7%A7%D7%AA%D7%95_%D7%A2%D7%9C-%D7%99%D7%93%D7%99_%D7%97%D7%91%D7%A8%D7%AA_%D7%94%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%97%D7%95%D7%96%D7%94_%D7%A2%D7%91%D7%95%D7%93%D7%94_%D7%9C%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8',
  'https://www.kolzchut.org.il/he/%D7%94%D7%97%D7%96%D7%A7%D7%AA_%D7%9E%D7%A1%D7%9E%D7%9B%D7%99_%D7%94%D7%94%D7%A2%D7%A1%D7%A7%D7%94_%D7%A9%D7%9C_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%A0%D7%95%D7%97%D7%94_%D7%A9%D7%91%D7%95%D7%A2%D7%99%D7%AA_%D7%9C%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%AA%D7%A9%D7%9C%D7%95%D7%9D_%D7%A2%D7%91%D7%95%D7%A8_%D7%99%D7%9E%D7%99_%D7%97%D7%92_%D7%9C%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%92%D7%95%D7%A8%D7%99%D7%9D_%D7%94%D7%95%D7%9C%D7%9E%D7%99%D7%9D_%D7%9C%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8',
  'https://www.kolzchut.org.il/he/%D7%91%D7%99%D7%98%D7%95%D7%97_%D7%91%D7%A8%D7%99%D7%90%D7%95%D7%AA_%D7%9C%D7%A2%D7%95%D7%91%D7%93%D7%99%D7%9D_%D7%96%D7%A8%D7%99%D7%9D',
  'https://www.kolzchut.org.il/he/%D7%94%D7%92%D7%A9%D7%AA_%D7%AA%D7%9C%D7%95%D7%A0%D7%94_%D7%9C%D7%9E%D7%9E%D7%95%D7%A0%D7%94_%D7%A2%D7%9C_%D7%96%D7%9B%D7%95%D7%99%D7%95%D7%AA_%D7%A2%D7%95%D7%91%D7%93%D7%99%D7%9D_%D7%96%D7%A8%D7%99%D7%9D_%D7%91%D7%A2%D7%91%D7%95%D7%93%D7%94',
  'https://www.kolzchut.org.il/he/%D7%94%D7%A4%D7%A7%D7%93%D7%AA_%D7%A4%D7%99%D7%A7%D7%93%D7%95%D7%9F_%D7%97%D7%95%D7%93%D7%A9%D7%99_%D7%A2%D7%91%D7%95%D7%A8_%D7%A2%D7%95%D7%91%D7%93%D7%99%D7%9D_%D7%96%D7%A8%D7%99%D7%9D',
  'https://www.kolzchut.org.il/he/%D7%AA%D7%A9%D7%9C%D7%95%D7%9E%D7%99%D7%9D_%D7%91%D7%9E%D7%A7%D7%95%D7%9D_%D7%91%D7%99%D7%98%D7%95%D7%97_%D7%A4%D7%A0%D7%A1%D7%99%D7%95%D7%A0%D7%99_%D7%9C%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%A9%D7%9E%D7%95%D7%A2%D7%A1%D7%A7_%D7%91%D7%91%D7%99%D7%AA_%D7%94%D7%9E%D7%98%D7%95%D7%A4%D7%9C',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%A9%D7%99%D7%9B%D7%AA_%D7%9B%D7%A1%D7%A4%D7%99_%D7%94%D7%A4%D7%99%D7%A7%D7%93%D7%95%D7%9F_%D7%A2%D7%9C_%D7%99%D7%93%D7%99_%D7%A2%D7%95%D7%91%D7%93%D7%99%D7%9D_%D7%96%D7%A8%D7%99%D7%9D',
  'https://www.kolzchut.org.il/he/%D7%94%D7%97%D7%96%D7%A8_%D7%94%D7%95%D7%A6%D7%90%D7%95%D7%AA_%D7%A2%D7%91%D7%95%D7%A8_%D7%98%D7%99%D7%A1%D7%AA_%D7%94%D7%A2%D7%95%D7%91%D7%93_%D7%94%D7%96%D7%A8',
  'https://www.kolzchut.org.il/he/%D7%A0%D7%99%D7%9B%D7%95%D7%99%D7%99%D7%9D_%D7%9E%D7%95%D7%AA%D7%A8%D7%99%D7%9D_%D7%9E%D7%A9%D7%9B%D7%A8_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8',
  'https://www.kolzchut.org.il/he/%D7%A0%D7%99%D7%9B%D7%95%D7%99_%D7%94%D7%95%D7%A6%D7%90%D7%95%D7%AA_%D7%9E%D7%92%D7%95%D7%A8%D7%99%D7%9D_%D7%9C%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8',
  'https://www.kolzchut.org.il/he/%D7%94%D7%92%D7%91%D7%9C%D7%AA_%D7%A1%D7%9B%D7%95%D7%9D_%D7%93%D7%9E%D7%99_%D7%94%D7%AA%D7%99%D7%95%D7%95%D7%9A_%D7%A9%D7%A0%D7%99%D7%AA%D7%9F_%D7%9C%D7%92%D7%91%D7%95%D7%AA_%D7%9E%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%94%D7%9E%D7%95%D7%A2%D7%A1%D7%A7_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%91%D7%91%D7%99%D7%AA_%D7%94%D7%9E%D7%98%D7%95%D7%A4%D7%9C',
  'https://www.kolzchut.org.il/he/%D7%93%D7%99%D7%95%D7%95%D7%97_%D7%95%D7%AA%D7%A9%D7%9C%D7%95%D7%9D_%D7%93%D7%9E%D7%99_%D7%91%D7%99%D7%98%D7%95%D7%97_%D7%9C%D7%90%D7%95%D7%9E%D7%99_%D7%A2%D7%91%D7%95%D7%A8_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%A0%D7%A7%D7%95%D7%93%D7%95%D7%AA_%D7%96%D7%99%D7%9B%D7%95%D7%99_%D7%9E%D7%9E%D7%A1_%D7%94%D7%9B%D7%A0%D7%A1%D7%94_%D7%9C%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8',
  'https://www.kolzchut.org.il/he/%D7%96%D7%9B%D7%95%D7%AA%D7%95%D7%9F_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%A9%D7%A4%D7%95%D7%98%D7%A8_%D7%90%D7%95_%D7%A9%D7%9E%D7%A2%D7%A1%D7%99%D7%A7%D7%95_%D7%A0%D7%A4%D7%98%D7%A8',
  'https://www.kolzchut.org.il/he/%D7%96%D7%9B%D7%95%D7%AA%D7%95%D7%9F_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%A9%D7%9E%D7%A2%D7%A1%D7%99%D7%A7%D7%95_%D7%90%D7%95%D7%A9%D7%A4%D7%96_%D7%90%D7%95_%D7%A2%D7%91%D7%A8_%D7%9C%D7%91%D7%99%D7%AA_%D7%90%D7%91%D7%95%D7%AA',
  'https://www.kolzchut.org.il/he/%D7%96%D7%9B%D7%95%D7%AA%D7%95%D7%9F_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%A9%D7%94%D7%AA%D7%A4%D7%98%D7%A8_%D7%9E%D7%A2%D7%91%D7%95%D7%93%D7%AA%D7%95',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%AA%D7%9F_%D7%94%D7%95%D7%93%D7%A2%D7%94_%D7%9E%D7%A8%D7%90%D7%A9_%D7%9C%D7%A4%D7%A0%D7%99_%D7%94%D7%AA%D7%A4%D7%98%D7%A8%D7%95%D7%AA_%D7%A9%D7%9C_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%94%D7%92%D7%A9%D7%AA_%D7%AA%D7%91%D7%99%D7%A2%D7%94_%D7%9C%D7%AA%D7%A9%D7%9C%D7%95%D7%9D_%D7%A9%D7%9B%D7%A8_%D7%A2%D7%91%D7%95%D7%93%D7%94,_%D7%A4%D7%99%D7%A6%D7%95%D7%99%D7%99_%D7%A4%D7%99%D7%98%D7%95%D7%A8%D7%99%D7%9D_%D7%90%D7%95_%D7%96%D7%9B%D7%95%D7%99%D7%95%D7%AA_%D7%A1%D7%95%D7%A6%D7%99%D7%90%D7%9C%D7%99%D7%95%D7%AA_%D7%90%D7%97%D7%A8%D7%95%D7%AA_%D7%91%D7%91%D7%99%D7%AA_%D7%94%D7%93%D7%99%D7%9F_%D7%94%D7%90%D7%96%D7%95%D7%A8%D7%99_%D7%9C%D7%A2%D7%91%D7%95%D7%93%D7%94',
  'https://www.kolzchut.org.il/he/%D7%AA%D7%A8%D7%92%D7%95%D7%9D_%D7%91%D7%9E%D7%A1%D7%92%D7%A8%D7%AA_%D7%93%D7%99%D7%95%D7%9F_%D7%91%D7%94%D7%9C%D7%99%D7%9A_%D7%90%D7%96%D7%A8%D7%97%D7%99_%D7%91%D7%91%D7%99%D7%AA_%D7%94%D7%9E%D7%A9%D7%A4%D7%98',
  'https://www.kolzchut.org.il/he/%D7%96%D7%9B%D7%95%D7%AA%D7%95%D7%9F_%D7%A2%D7%95%D7%91%D7%93%D7%95%D7%AA_%D7%96%D7%A8%D7%95%D7%AA_%D7%91%D7%94%D7%A8%D7%99%D7%95%D7%9F_%D7%95%D7%9C%D7%90%D7%97%D7%A8_%D7%9C%D7%99%D7%93%D7%94',
  'https://www.kolzchut.org.il/he/%D7%96%D7%9B%D7%95%D7%AA%D7%95%D7%9F_%D7%91%D7%A0%D7%99_%D7%9E%D7%A9%D7%A4%D7%97%D7%94_%D7%94%D7%9E%D7%98%D7%A4%D7%9C%D7%99%D7%9D_%D7%91%D7%A7%D7%A9%D7%99%D7%A9_%D7%90%D7%95_%D7%91%D7%90%D7%93%D7%9D_%D7%A2%D7%9D_%D7%9E%D7%95%D7%92%D7%91%D7%9C%D7%95%D7%AA_%D7%90%D7%95_%D7%9E%D7%97%D7%9C%D7%94',
  'https://www.kolzchut.org.il/he/%D7%90%D7%A0%D7%A9%D7%99%D7%9D_%D7%91%D7%9E%D7%A6%D7%91_%D7%A1%D7%99%D7%A2%D7%95%D7%93%D7%99',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%93%D7%A8%D7%99%D7%9A_%D7%A1%D7%99%D7%95%D7%A2_%D7%9C%D7%9E%D7%91%D7%95%D7%92%D7%A8_%D7%A9%D7%94%D7%A4%D7%9A_%D7%9C%D7%A1%D7%99%D7%A2%D7%95%D7%93%D7%99_%D7%95%D7%9C%D7%91%D7%A0%D7%99_%D7%9E%D7%A9%D7%A4%D7%97%D7%AA%D7%95',
  'https://www.kolzchut.org.il/he/%D7%90%D7%A0%D7%A9%D7%99%D7%9D_%D7%A2%D7%9D_%D7%9E%D7%95%D7%92%D7%91%D7%9C%D7%95%D7%99%D7%95%D7%AA',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%93%D7%A8%D7%99%D7%9A_%D7%9E%D7%99%D7%A6%D7%95%D7%99_%D7%96%D7%9B%D7%95%D7%99%D7%95%D7%AA_%D7%9C%D7%90%D7%96%D7%A8%D7%97%D7%99%D7%9D_%D7%95%D7%AA%D7%99%D7%A7%D7%99%D7%9D',
  'https://www.kolzchut.org.il/he/%D7%A8%D7%A9%D7%95%D7%AA_%D7%94%D7%90%D7%95%D7%9B%D7%9C%D7%95%D7%A1%D7%99%D7%9F_%D7%95%D7%94%D7%94%D7%92%D7%99%D7%A8%D7%94',
  'https://www.kolzchut.org.il/he/%D7%94%D7%9E%D7%9E%D7%95%D7%A0%D7%94_%D7%A2%D7%9C_%D7%96%D7%9B%D7%95%D7%99%D7%95%D7%AA_%D7%A2%D7%95%D7%91%D7%93%D7%99%D7%9D_%D7%96%D7%A8%D7%99%D7%9D_%D7%91%D7%A2%D7%91%D7%95%D7%93%D7%94',
  'https://www.kolzchut.org.il/he/%D7%A9%D7%99%22%D7%9C_-_%D7%A9%D7%99%D7%A8%D7%95%D7%AA_%D7%99%D7%99%D7%A2%D7%95%D7%A5_%D7%9C%D7%90%D7%96%D7%A8%D7%97',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%99%D7%A0%D7%94%D7%9C_%D7%94%D7%A1%D7%93%D7%A8%D7%94_%D7%95%D7%90%D7%9B%D7%99%D7%A4%D7%AA_%D7%97%D7%95%D7%A7%D7%99_%D7%A2%D7%91%D7%95%D7%93%D7%94',
  'https://www.kolzchut.org.il/he/%D7%92%D7%9E%D7%9C%D7%AA_%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%93%D7%9E%D7%99_%D7%91%D7%99%D7%98%D7%95%D7%97_%D7%9C%D7%90%D7%95%D7%9E%D7%99_%D7%9C%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8',
  'https://www.kolzchut.org.il/he/%D7%94%D7%9E%D7%95%D7%A7%D7%93_%D7%94%D7%98%D7%9C%D7%A4%D7%95%D7%A0%D7%99_%D7%A9%D7%9C_%D7%A9%D7%99%D7%A8%D7%95%D7%AA_%D7%94%D7%99%D7%99%D7%A2%D7%95%D7%A5_%D7%9C%D7%90%D7%96%D7%A8%D7%97_%D7%94%D7%95%D7%95%D7%AA%D7%99%D7%A7_%D7%9E%D7%98%D7%A2%D7%9D_%D7%94%D7%9E%D7%95%D7%A1%D7%93_%D7%9C%D7%91%D7%99%D7%98%D7%95%D7%97_%D7%9C%D7%90%D7%95%D7%9E%D7%99',
  'https://www.kolzchut.org.il/he/%D7%A9%D7%99%D7%A8%D7%95%D7%AA%D7%99_%D7%99%D7%A2%D7%95%D7%A5_%D7%9C%D7%A7%D7%A9%D7%99%D7%A9_-_%D7%94%D7%9E%D7%95%D7%A1%D7%93_%D7%9C%D7%91%D7%99%D7%98%D7%95%D7%97_%D7%9C%D7%90%D7%95%D7%9E%D7%99',
  'https://www.kolzchut.org.il/he/%D7%96%D7%99%D7%A7%D7%A0%D7%94_%D7%95%D7%94%D7%96%D7%93%D7%A7%D7%A0%D7%95%D7%AA/%D7%90%D7%A8%D7%92%D7%95%D7%A0%D7%99_%D7%A1%D7%99%D7%95%D7%A2',
  'https://www.kolzchut.org.il/he/%D7%90%D7%A0%D7%A9%D7%99%D7%9D_%D7%A2%D7%9D_%D7%9E%D7%95%D7%92%D7%91%D7%9C%D7%95%D7%99%D7%95%D7%AA/%D7%90%D7%A8%D7%92%D7%95%D7%A0%D7%99_%D7%A1%D7%99%D7%95%D7%A2',
  'https://www.kolzchut.org.il/he/%D7%A7%D7%95_%D7%A1%D7%99%D7%95%D7%A2_%D7%90%D7%99%D7%A0%D7%98%D7%A8%D7%A0%D7%98%D7%99_%D7%9C%D7%9E%D7%A2%D7%A1%D7%99%D7%A7%D7%99%D7%9D_%D7%A9%D7%9C_%D7%A2%D7%95%D7%91%D7%93%D7%99%D7%9D_%D7%96%D7%A8%D7%99%D7%9D_%D7%91%D7%AA%D7%97%D7%95%D7%9D_%D7%94%D7%A1%D7%99%D7%A2%D7%95%D7%93',
  'https://www.kolzchut.org.il/he/%D7%99%D7%93_%D7%A8%D7%99%D7%91%D7%94_-_%D7%A1%D7%99%D7%95%D7%A2_%D7%9E%D7%A9%D7%A4%D7%98%D7%99_%D7%9C%D7%A7%D7%A9%D7%99%D7%A9',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%98%D7%91',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%A8%D7%9B%D7%96_%D7%94%D7%A4%D7%A0%D7%99%D7%95%D7%AA_%D7%9C%D7%A2%D7%95%D7%91%D7%93%D7%99%D7%9D_%D7%96%D7%A8%D7%99%D7%9D_%D7%90%D7%A9%D7%A8_%D7%94%D7%92%D7%99%D7%A2%D7%95_%D7%9C%D7%A2%D7%91%D7%95%D7%93_%D7%91%D7%99%D7%A9%D7%A8%D7%90%D7%9C_%D7%91%D7%9E%D7%A1%D7%92%D7%A8%D7%AA_%D7%94%D7%A1%D7%9B%D7%9E%D7%99%D7%9D_%D7%91%D7%99%D7%9C%D7%98%D7%A8%D7%9C%D7%99%D7%99%D7%9D',
  'https://www.kolzchut.org.il/he/%D7%A2%D7%95%D7%91%D7%93%D7%99%D7%9D_%D7%96%D7%A8%D7%99%D7%9D/%D7%A4%D7%A1%D7%A7%D7%99_%D7%93%D7%99%D7%9F',
  'https://www.kolzchut.org.il/he/%D7%97%D7%95%D7%A7_%D7%A2%D7%95%D7%91%D7%93%D7%99%D7%9D_%D7%96%D7%A8%D7%99%D7%9D',
  'https://www.kolzchut.org.il/he/%D7%9E%D7%AA%D7%99_%D7%A7%D7%A8%D7%95%D7%91_%D7%9E%D7%A9%D7%A4%D7%97%D7%94_%D7%A9%D7%9C_%D7%9E%D7%98%D7%95%D7%A4%D7%9C_%D7%A1%D7%99%D7%A2%D7%95%D7%93%D7%99_%D7%A0%D7%97%D7%A9%D7%91_%D7%9C%D7%9E%D7%A2%D7%A1%D7%99%D7%A7_%D7%91%D7%A4%D7%95%D7%A2%D7%9C_%D7%A9%D7%9C_%D7%94%D7%9E%D7%98%D7%A4%D7%9C_%D7%94%D7%A1%D7%99%D7%A2%D7%95%D7%93%D7%99%3F',
  'https://www.kolzchut.org.il/he/%D7%A2%D7%95%D7%91%D7%93%D7%99_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%94%D7%9E%D7%AA%D7%92%D7%95%D7%A8%D7%A8%D7%99%D7%9D_%D7%91%D7%91%D7%99%D7%AA_%D7%9E%D7%98%D7%95%D7%A4%D7%9C%D7%99%D7%94%D7%9D_%D7%96%D7%9B%D7%90%D7%99%D7%9D_%D7%9C%D7%9E%D7%A0%D7%95%D7%97%D7%94_%D7%A9%D7%91%D7%95%D7%A2%D7%99%D7%AA_%D7%A9%D7%9C_25_%D7%A9%D7%A2%D7%95%D7%AA',
  'https://www.kolzchut.org.il/he/%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%A9%D7%9E%D7%A0%D7%95%D7%97%D7%AA%D7%95_%D7%94%D7%A9%D7%91%D7%95%D7%A2%D7%99%D7%AA_%D7%94%D7%99%D7%AA%D7%94_%D7%A7%D7%A6%D7%A8%D7%94_%D7%9E-25_%D7%A9%D7%A2%D7%95%D7%AA,_%D7%96%D7%9B%D7%90%D7%99_%D7%9C%D7%AA%D7%A9%D7%9C%D7%95%D7%9D_%D7%A2%D7%91%D7%95%D7%A8_%D7%A9%D7%A2%D7%95%D7%AA_%D7%94%D7%9E%D7%A0%D7%95%D7%97%D7%94_%D7%A9%D7%9C%D7%90_%D7%A0%D7%99%D7%A6%D7%9C',
  'https://www.kolzchut.org.il/he/%D7%A2%D7%95%D7%91%D7%93%D7%99%D7%9D_%D7%96%D7%A8%D7%99%D7%9D_%D7%91%D7%A2%D7%A0%D7%A3_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%90%D7%99%D7%A0%D7%9D_%D7%96%D7%9B%D7%90%D7%99%D7%9D_%D7%9C%D7%AA%D7%A9%D7%9C%D7%95%D7%9D_%D7%92%D7%9E%D7%95%D7%9C_%D7%A2%D7%91%D7%95%D7%A8_%D7%A9%D7%A2%D7%95%D7%AA_%D7%A0%D7%95%D7%A1%D7%A4%D7%95%D7%AA',
  'https://www.kolzchut.org.il/he/%D7%A4%D7%99%D7%A6%D7%95%D7%99_%D7%9C%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%AA%D7%97%D7%95%D7%9D_%D7%94%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%91%D7%92%D7%99%D7%9F_%D7%A2%D7%91%D7%95%D7%93%D7%94_%D7%91%D7%99%D7%95%D7%9D_%D7%94%D7%9E%D7%A0%D7%95%D7%97%D7%94_%D7%94%D7%A9%D7%91%D7%95%D7%A2%D7%99',
  'https://www.kolzchut.org.il/he/%D7%A2%D7%95%D7%91%D7%93_%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%96%D7%9B%D7%90%D7%99_%D7%9C%D7%A9%D7%9B%D7%A8_%D7%A2%D7%91%D7%95%D7%A8_%D7%96%D7%9E%D7%9F_%D7%94%D7%A0%D7%A1%D7%99%D7%A2%D7%94_%D7%91%D7%99%D7%9F_%D7%9E%D7%98%D7%95%D7%A4%D7%9C_%D7%9C%D7%9E%D7%98%D7%95%D7%A4%D7%9C,_%D7%91%D7%AA%D7%A0%D7%90%D7%99_%D7%A9%D7%96%D7%9E%D7%9F_%D7%96%D7%94_%D7%A7%D7%A6%D7%A8_%D7%95%D7%90%D7%99%D7%A0%D7%95_%D7%9E%D7%90%D7%A4%D7%A9%D7%A8_%D7%9C%D7%95_%D7%9C%D7%94%D7%AA%D7%A4%D7%A0%D7%95%D7%AA_%D7%9C%D7%A2%D7%A0%D7%99%D7%99%D7%A0%D7%99%D7%95',
  'https://www.kolzchut.org.il/he/%D7%A2%D7%95%D7%91%D7%93_%D7%A9%D7%9E%D7%A2%D7%A1%D7%99%D7%A7%D7%95_%D7%A0%D7%A4%D7%98%D7%A8_%D7%96%D7%9B%D7%90%D7%99_%D7%9C%D7%AA%D7%A9%D7%9C%D7%95%D7%9D_%D7%AA%D7%9E%D7%95%D7%A8%D7%AA_%D7%94%D7%95%D7%93%D7%A2%D7%94_%D7%9E%D7%95%D7%A7%D7%93%D7%9E%D7%AA,_%D7%92%D7%9D_%D7%90%D7%9D_%D7%94%D7%A2%D7%95%D7%91%D7%93_%D7%90%D7%99%D7%A0%D7%95_%D7%9E%D7%97%D7%A4%D7%A9_%D7%A2%D7%91%D7%95%D7%93%D7%94_%D7%97%D7%93%D7%A9%D7%94',
  'https://www.kolzchut.org.il/he/%D7%91%D7%A7%D7%A9%D7%94_%D7%9C%D7%94%D7%9E%D7%A9%D7%9A_%D7%94%D7%A2%D7%A1%D7%A7%D7%AA_%D7%A2%D7%95%D7%91%D7%93_%D7%96%D7%A8_%D7%91%D7%A1%D7%99%D7%A2%D7%95%D7%93_%D7%9E%D7%98%D7%A2%D7%9E%D7%99%D7%9D_%D7%94%D7%95%D7%9E%D7%A0%D7%99%D7%98%D7%A8%D7%99%D7%99%D7%9D_%D7%9C%D7%90_%D7%AA%D7%99%D7%93%D7%97%D7%94_%D7%91%D7%90%D7%95%D7%A4%D7%9F_%D7%90%D7%95%D7%98%D7%95%D7%9E%D7%98%D7%99_%D7%91%D7%92%D7%9C%D7%9C_%D7%A9%D7%99%D7%A7%D7%95%D7%9C%D7%99%D7%9D_%D7%92%D7%99%D7%90%D7%95%D7%92%D7%A8%D7%A4%D7%99%D7%99%D7%9D',
]

// ─── Parse CLI args ──────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map(a => { const [k, v] = a.replace('--', '').split('='); return [k, v] })
)
let userId = args['user-id']

// ─── Supabase client ─────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Resolve user_id: auto-detect super_admin if no --user-id given
if (!userId || userId === 'super_admin') {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'super_admin')
    .limit(1)
    .single()
  if (error || !data) {
    console.error('Could not find super_admin user:', error?.message)
    process.exit(1)
  }
  userId = String(data.id)
  console.log(`Resolved super_admin → user_id=${userId}`)
}

// ─── Scrape a URL using fetch + Readability ─────────────
async function scrapeUrl(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YedidBot/1.0)' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  const { document } = parseHTML(html)
  const reader = new Readability(document)
  const article = reader.parse()
  if (!article || !article.textContent?.trim()) {
    throw new Error('Readability extracted no content')
  }
  return article.textContent.trim()
}

// ─── Main ────────────────────────────────────────────────
async function main() {
  // Load settings from DB (for OPENAI_API_KEY, etc.)
  await loadSettings(supabase)

  // Deduplicate URLs
  const uniqueUrls = [...new Set(URLS)]
  console.log(`\nSeeding KB with ${uniqueUrls.length} unique URLs for user_id=${userId}\n`)

  let success = 0
  let errors = 0

  for (let i = 0; i < uniqueUrls.length; i++) {
    const url = uniqueUrls[i]
    const pathPart = decodeURIComponent(new URL(url).pathname.replace('/he/', ''))
    const name = pathPart.replace(/_/g, ' ')

    console.log(`[${i + 1}/${uniqueUrls.length}] ${name}`)

    try {
      // Check if source already exists for this user+url
      const { data: existing } = await supabase
        .from('sources')
        .select('id')
        .eq('user_id', userId)
        .eq('url', url)
        .maybeSingle()

      if (existing) {
        console.log(`  skip (id=${existing.id})`)
        continue
      }

      // Insert source record
      const { data: source, error: insertError } = await supabase
        .from('sources')
        .insert({ user_id: userId, type: 'webpage', name, url, status: 'processing' })
        .select()
        .single()

      if (insertError) throw insertError

      // Scrape with Readability
      const text = await scrapeUrl(url)
      const chunks = chunkText(text)
      const chunkCount = await embedAndStore(
        chunks,
        { source_id: source.id, user_id: userId, source_name: name },
        supabase
      )

      await supabase
        .from('sources')
        .update({ status: 'complete', chunk_count: chunkCount })
        .eq('id', source.id)

      console.log(`  OK  ${chunkCount} chunks`)
      success++
    } catch (err) {
      console.error(`  ERR ${err.message}`)
      // Update source status if it was created
      await supabase
        .from('sources')
        .update({ status: 'error', error_message: err.message })
        .match({ user_id: userId, url })
      errors++
    }

    // Small delay between requests
    if (i < uniqueUrls.length - 1) {
      await new Promise(r => setTimeout(r, 500))
    }
  }

  console.log(`\nDone! ${success} succeeded, ${errors} failed out of ${uniqueUrls.length} URLs`)
}

main().catch(err => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
