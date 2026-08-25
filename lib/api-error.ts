export function toApiErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('FOREIGN KEY constraint failed')) return 'Référence invalide (client ou magasin introuvable).'
  if (message.includes('UNIQUE constraint failed')) return 'Cette valeur existe déjà (référence en doublon).'
  return message || 'Erreur inconnue.'
}
