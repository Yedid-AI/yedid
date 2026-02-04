import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const EMOJI_CATEGORIES = [
  {
    label: 'Business',
    emojis: ['📋', '📝', '📊', '📈', '💼', '🎯', '💡', '🔑', '📌', '⭐', '🏷️', '📁', '📎', '✅', '🔔'],
  },
  {
    label: 'Communication',
    emojis: ['💬', '📞', '📧', '🤝', '👋', '👍', '🙋', '💁', '🗣️', '📢', '🔗', '💌', '📲', '🌐', '📡'],
  },
  {
    label: 'Tech',
    emojis: ['⚡', '🔧', '🚀', '🔍', '🛠️', '⚙️', '🤖', '🧩', '💻', '🔒', '🛡️', '📦', '🧪', '🔬', '💾'],
  },
  {
    label: 'Emotions',
    emojis: ['😊', '🎉', '❤️', '🔥', '✨', '💪', '🙏', '😎', '🤔', '⚠️', '🚨', '💰', '🎁', '🏆', '🌟'],
  },
]

export function EmojiPicker({ value, onChange, className }) {
  const [open, setOpen] = useState(false)

  const handleSelect = (emoji) => {
    onChange(emoji)
    setOpen(false)
  }

  const handleRemove = (e) => {
    e.stopPropagation()
    onChange('')
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center justify-center rounded-md text-2xl transition-colors hover:bg-accent',
            value ? 'size-9' : 'size-9 border border-dashed border-muted-foreground/30 text-muted-foreground/50 text-sm hover:border-muted-foreground/50',
            className
          )}
        >
          {value || '+'}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-2" align="start">
        {value && (
          <button
            type="button"
            onClick={handleRemove}
            className="w-full text-left text-xs text-muted-foreground hover:text-destructive px-2 py-1.5 rounded-md hover:bg-accent transition-colors mb-1"
          >
            Supprimer
          </button>
        )}
        {EMOJI_CATEGORIES.map((cat) => (
          <div key={cat.label} className="mb-2 last:mb-0">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-1">{cat.label}</p>
            <div className="grid grid-cols-8 gap-0.5">
              {cat.emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleSelect(emoji)}
                  className={cn(
                    'flex items-center justify-center size-8 rounded-md text-lg hover:bg-accent transition-colors',
                    value === emoji && 'bg-accent ring-1 ring-ring'
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}
