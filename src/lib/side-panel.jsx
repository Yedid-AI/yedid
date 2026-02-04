import { createContext, useContext, useState, useEffect } from 'react'

const SidePanelContext = createContext({
  isOpen: false,
  setIsOpen: () => {},
  panelContainer: null,
  setPanelContainer: () => {},
})

export function SidePanelProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false)
  const [panelContainer, setPanelContainer] = useState(null)
  return (
    <SidePanelContext.Provider value={{ isOpen, setIsOpen, panelContainer, setPanelContainer }}>
      {children}
    </SidePanelContext.Provider>
  )
}

export function useSidePanel(open) {
  const ctx = useContext(SidePanelContext)
  useEffect(() => {
    if (open !== undefined) ctx.setIsOpen(open)
  }, [open, ctx.setIsOpen])
  useEffect(() => () => ctx.setIsOpen(false), [ctx.setIsOpen])
  return ctx
}
