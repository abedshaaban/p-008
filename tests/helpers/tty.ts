export function setWritableValue<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): () => void {
  const original = Object.getOwnPropertyDescriptor(target, key)

  Object.defineProperty(target, key, {
    configurable: true,
    writable: true,
    value
  })

  return () => {
    if (original) {
      Object.defineProperty(target, key, original)
      return
    }

    delete (target as Record<PropertyKey, unknown>)[key as PropertyKey]
  }
}
