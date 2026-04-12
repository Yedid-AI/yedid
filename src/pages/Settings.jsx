import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { usePageTitle } from '../lib/page-header'
import { useHeartbeat } from '../hooks/queries'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Monitor, Smartphone, Globe, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr as frLocale } from 'date-fns/locale/fr'
import { enUS } from 'date-fns/locale/en-US'
import { he as heLocale } from 'date-fns/locale/he'

const dateLocales = { fr: frLocale, en: enUS, he: heLocale }

function parseBrowser(ua) {
  if (!ua) return { name: 'Unknown', icon: Globe }
  if (/Mobile|Android|iPhone/i.test(ua)) return { name: 'Mobile', icon: Smartphone }
  if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) return { name: 'Chrome', icon: Monitor }
  if (/Edg/i.test(ua)) return { name: 'Edge', icon: Monitor }
  if (/Firefox/i.test(ua)) return { name: 'Firefox', icon: Monitor }
  if (/Safari/i.test(ua)) return { name: 'Safari', icon: Monitor }
  return { name: 'Browser', icon: Monitor }
}

export default function Settings() {
  const { user } = useAuth()
  const { t, locale } = useI18n()
  const { sessions, sessionId } = useHeartbeat()
  usePageTitle(t('settings.title'))

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground mt-1">{t('settings.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.profile')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">{t('common.email')}</span>
              <p className="font-medium mt-0.5">{user?.email}</p>
            </div>
            <div>
              <span className="text-muted-foreground">{t('users.role')}</span>
              <p className="mt-0.5"><Badge variant="secondary">{user?.role}</Badge></p>
            </div>
            <div>
              <span className="text-muted-foreground">{t('users.firstName')}</span>
              <p className="font-medium mt-0.5">{user?.first_name || '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">{t('users.lastName')}</span>
              <p className="font-medium mt-0.5">{user?.last_name || '-'}</p>
            </div>
          </div>
          {user?.chatwoot_website_token && (
            <>
              <Separator />
              <div>
                <span className="text-sm text-muted-foreground">{t('settings.chatwootWidget')}</span>
                <pre className="mt-2 p-3 bg-muted rounded-md text-xs font-mono overflow-x-auto">
{`<script>
  (function(d,t) {
    var BASE_URL="https://chat.yedid.io";
    var g=d.createElement(t),s=d.getElementsByTagName(t)[0];
    g.src=BASE_URL+"/packs/js/sdk.js";
    g.defer = true;
    g.async = true;
    s.parentNode.insertBefore(g,s);
    g.onload=function(){
      window.chatwootSDK.run({
        websiteToken: '${user.chatwoot_website_token}',
        baseUrl: BASE_URL
      })
    }
  })(document,"script");
</script>`}
                </pre>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Monitor size={16} />
            {t('settings.activeSessions')}
            <Badge variant="outline" className="ms-auto">{sessions.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('settings.noSessions')}</p>
          ) : (
            <div className="space-y-3">
              {sessions.map((s) => {
                const isMe = s.id === sessionId
                const browser = parseBrowser(s.user_agent)
                const BrowserIcon = browser.icon
                return (
                  <div key={s.id} className={`flex items-center gap-3 p-3 rounded-lg border ${isMe ? 'bg-primary/5 border-primary/20' : 'bg-muted/30'}`}>
                    <BrowserIcon size={18} className={isMe ? 'text-primary' : 'text-muted-foreground'} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{browser.name}</span>
                        {isMe && <Badge variant="default" className="text-[10px] px-1.5 py-0">{t('settings.you')}</Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        {s.ip_address && <span>{s.ip_address}</span>}
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          {formatDistanceToNow(new Date(s.last_seen), { addSuffix: true, locale: dateLocales[locale] || enUS })}
                        </span>
                      </div>
                    </div>
                    {isMe && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
