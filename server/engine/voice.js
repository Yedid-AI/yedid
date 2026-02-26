import { toFile } from 'openai'
import { getOpenAIClient } from './llm.js'

/**
 * Extract the first audio attachment from a Chatwoot webhook message.
 * @param {Object} message - webhookBody.conversation.messages[0]
 * @returns {{ dataUrl: string } | null}
 */
export function extractAudioAttachment(message) {
  const attachments = message?.attachments
  if (!Array.isArray(attachments) || attachments.length === 0) return null
  console.log(`[Voice] Attachments found:`, JSON.stringify(attachments.map(a => ({ file_type: a.file_type, content_type: a.content_type, data_url: !!a.data_url }))))
  const audio = attachments.find(a => a.file_type === 'audio' || a.content_type?.startsWith('audio/'))
  if (!audio?.data_url) return null
  return { dataUrl: audio.data_url }
}

/**
 * Download audio from URL and transcribe using OpenAI Whisper.
 * @param {string} audioUrl
 * @returns {Promise<{ transcription: string }>}
 */
export async function transcribeAudio(audioUrl) {
  // Download audio
  const res = await fetch(audioUrl)
  if (!res.ok) throw new Error(`Failed to download audio (${res.status})`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') || 'audio/ogg'

  // Transcribe with Whisper
  const openai = getOpenAIClient()
  const file = await toFile(buffer, 'audio.ogg', { type: contentType })
  const result = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file,
  })

  return { transcription: result.text }
}

/**
 * Generate speech audio from text using OpenAI TTS.
 * @param {string} text
 * @returns {Promise<{ audioBuffer: Buffer, contentType: string, fileName: string }>}
 */
export async function generateTTS(text) {
  const openai = getOpenAIClient()
  // TTS limit is 4096 chars
  const input = text.length > 4096 ? text.slice(0, 4093) + '...' : text

  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'nova',
    input,
    response_format: 'opus',
  })

  const arrayBuffer = await response.arrayBuffer()
  return {
    audioBuffer: Buffer.from(arrayBuffer),
    contentType: 'audio/ogg',
    fileName: 'response.ogg',
  }
}
