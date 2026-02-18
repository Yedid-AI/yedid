// Unipile API helper — centralized interface for WhatsApp integration
import { getSetting } from './settings.js'

function getConfig() {
  const dsnUrl = (getSetting('UNIPILE_DSN_URL') || '').trim().replace(/\/+$/, '')
  const apiKey = (getSetting('UNIPILE_API_KEY') || '').trim()
  if (!dsnUrl || !apiKey) {
    throw new Error('Unipile non configure. Ajoutez UNIPILE_DSN_URL et UNIPILE_API_KEY dans Environnement.')
  }
  return { dsnUrl, apiKey }
}

async function unipileApi(path, method = 'GET', body = null) {
  const { dsnUrl, apiKey } = getConfig()
  const opts = {
    method,
    headers: {
      'X-API-KEY': apiKey,
      'accept': 'application/json',
    },
  }
  if (body) {
    opts.headers['content-type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const url = `${dsnUrl}${path}`
  console.log(`[unipile] ${method} ${url} (key: ${apiKey.slice(0, 4)}...${apiKey.slice(-4)}, len=${apiKey.length})`)
  const res = await fetch(url, opts)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Unipile (${res.status}): ${text}`)
  }
  return res.json()
}

// Generate a hosted auth link for WhatsApp QR code connection
export async function createHostedAuthLink({ callbackUrl, notifyUrl, name, expiresOn, reconnectAccountId }) {
  const { dsnUrl } = getConfig()
  const body = {
    type: reconnectAccountId ? 'reconnect' : 'create',
    providers: ['WHATSAPP'],
    api_url: dsnUrl,
    expiresOn: expiresOn || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  }
  if (reconnectAccountId) body.reconnect_account_id = reconnectAccountId
  if (callbackUrl) body.callback_url = callbackUrl
  if (notifyUrl) body.notify_url = notifyUrl
  if (name) body.name = String(name)

  const result = await unipileApi('/api/v1/hosted/accounts/link', 'POST', body)
  return result
}

// Get account details (phone number, type, status)
export async function getAccount(accountId) {
  return unipileApi(`/api/v1/accounts/${accountId}`)
}

// Send a text message via WhatsApp
export async function sendMessage(accountId, phoneNumber, text) {
  const phone = phoneNumber.replace('+', '')
  return unipileApi('/api/v1/chats', 'POST', {
    account_id: accountId,
    attendees_ids: [`${phone}@s.whatsapp.net`],
    text,
  })
}

// Send a message with attachment via Unipile (multipart)
export async function sendMessageWithAttachment(accountId, phoneNumber, text, fileBuffer, fileName, mimeType) {
  const { dsnUrl, apiKey } = getConfig()
  const phone = phoneNumber.replace('+', '')

  const formData = new FormData()
  formData.append('account_id', accountId)
  formData.append('attendees_ids', `${phone}@s.whatsapp.net`)
  if (text) formData.append('text', text)
  formData.append('attachments', new Blob([fileBuffer], { type: mimeType }), fileName)

  const res = await fetch(`${dsnUrl}/api/v1/chats`, {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey },
    body: formData,
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Unipile send attachment (${res.status}): ${errText}`)
  }
  return res.json()
}

// Download an attachment from a URL
export async function downloadAttachment(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') || 'application/octet-stream'
  return { buffer, contentType }
}

// Register a webhook for incoming messages (idempotent — checks existing first)
export async function registerWebhook(url) {
  try {
    // List existing webhooks
    const existing = await unipileApi('/api/v1/webhooks')
    const hooks = existing?.items || existing || []
    if (Array.isArray(hooks)) {
      const alreadyExists = hooks.some((h) => h.url === url || h.request_url === url)
      if (alreadyExists) {
        console.log('[unipile] Webhook already registered:', url)
        return
      }
    }
  } catch (e) {
    console.log('[unipile] Could not list webhooks:', e.message)
  }

  await unipileApi('/api/v1/webhooks', 'POST', {
    request_url: url,
    events: ['message_received'],
    source: 'messaging',
    name: 'Yedid AI',
    headers: [
      { key: 'Content-Type', value: 'application/json' },
    ],
    data: [
      { key: 'account_id', name: 'account_id' },
      { key: 'account_type', name: 'account_type' },
      { key: 'sender', name: 'sender' },
      { key: 'message', name: 'message' },
      { key: 'message_id', name: 'message_id' },
      { key: 'timestamp', name: 'timestamp' },
      { key: 'attachments', name: 'attachments' },
      { key: 'is_sender', name: 'is_sender' },
      { key: 'quoted', name: 'quoted' },
      { key: 'chat_id', name: 'chat_id' },
      { key: 'attendees', name: 'attendees' },
      { key: 'is_group', name: 'is_group' },
    ],
  })
  console.log('[unipile] Webhook registered:', url)
}
