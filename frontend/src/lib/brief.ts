/**
 * Who wrote the situation brief, in words an operator can act on. The panel
 * used to show the raw provider id ("RULE", "OLLAMA"), which left open whether
 * a paragraph was model output or a count-based fallback.
 */
export function describeBriefSource(model: string, modelName?: string): string {
  switch (model) {
    case 'ollama':
      return modelName ? `Yerel model · ${modelName}` : 'Yerel model';
    case 'gemini':
      return modelName ? `Gemini · ${modelName}` : 'Gemini';
    case 'rule':
      return 'Model kapalı · sayımlardan';
    case 'none':
      return 'Veri yok';
    case 'error':
      return 'Alınamadı';
    default:
      return model || '—';
  }
}
