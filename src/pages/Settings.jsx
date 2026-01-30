import { useAuth } from '../lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

export default function Settings() {
  const { user } = useAuth()

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configuration du compte</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Email</span>
              <p className="font-medium mt-0.5">{user?.email}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Role</span>
              <p className="mt-0.5"><Badge variant="secondary">{user?.role}</Badge></p>
            </div>
            <div>
              <span className="text-muted-foreground">Prenom</span>
              <p className="font-medium mt-0.5">{user?.first_name || '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Nom</span>
              <p className="font-medium mt-0.5">{user?.last_name || '-'}</p>
            </div>
          </div>
          {user?.chatwoot_website_token && (
            <>
              <Separator />
              <div>
                <span className="text-sm text-muted-foreground">Widget Chatwoot</span>
                <pre className="mt-2 p-3 bg-muted rounded-md text-xs font-mono overflow-x-auto">
{`<script>
  (function(d,t) {
    var BASE_URL="https://chat.cardynal.io";
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
    </div>
  )
}
