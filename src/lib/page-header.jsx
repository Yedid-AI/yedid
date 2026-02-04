import { createContext, useContext, useState, useEffect } from 'react'

const PageHeaderContext = createContext({
  title: '',
  setTitle: () => {},
  actionsContainer: null,
  setActionsContainer: () => {},
})

export function PageHeaderProvider({ children }) {
  const [title, setTitle] = useState('')
  const [actionsContainer, setActionsContainer] = useState(null)
  return (
    <PageHeaderContext.Provider value={{ title, setTitle, actionsContainer, setActionsContainer }}>
      {children}
    </PageHeaderContext.Provider>
  )
}

export function usePageTitle(title) {
  const { setTitle } = useContext(PageHeaderContext)
  useEffect(() => {
    setTitle(title)
    return () => setTitle('')
  }, [title, setTitle])
}

export function usePageHeader() {
  return useContext(PageHeaderContext)
}
