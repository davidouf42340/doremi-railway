// ============================================================
// Dorémi — Parsing paroles par sections
// Utilitaire partagé (admin, client, pages)
// ============================================================

const SECTION_PATTERN = /^(Couplet\s*\d*|Refrain|Dernier refrain|Pont|Outro|Intro|Pre-refrain|Pré-refrain|Bridge)$/i;

/**
 * Parse un texte de paroles en sections structurées.
 * @param {string} text — paroles en texte brut
 * @returns {Array<{label: string|null, lines: string[]}>}
 */
function parseLyricsIntoSections(text) {
  if (!text || !text.trim()) return [{ label: null, lines: [] }];

  const rawLines = text.split('\n');
  const sections = [];
  let current = null;

  for (const line of rawLines) {
    const trimmed = line.trim();

    if (SECTION_PATTERN.test(trimmed)) {
      // Nouvelle section détectée
      if (current) sections.push(current);
      current = { label: trimmed, lines: [] };
    } else if (current) {
      // Ligne dans une section existante
      // Ignorer les lignes vides juste après le label (séparateur label/contenu)
      if (current.lines.length === 0 && trimmed === '') continue;
      current.lines.push(line);
    } else {
      // Contenu avant le premier label
      if (trimmed === '' && sections.length === 0 && !current) continue; // ignorer les lignes vides initiales
      current = { label: null, lines: [line] };
    }
  }

  if (current) sections.push(current);

  // Nettoyer les lignes vides en fin de chaque section
  for (const section of sections) {
    while (section.lines.length > 0 && section.lines[section.lines.length - 1].trim() === '') {
      section.lines.pop();
    }
  }

  // Si aucune section trouvée, retourner tout dans une section sans label
  if (sections.length === 0) {
    return [{ label: null, lines: rawLines.filter(l => l.trim() !== '') }];
  }

  return sections;
}

/**
 * Réassemble un tableau de sections en texte brut.
 * @param {Array<{label: string|null, lines: string[]}>} sections
 * @returns {string}
 */
function reassembleSections(sections) {
  return sections.map(section => {
    if (section.label) {
      return section.label + '\n\n' + section.lines.join('\n');
    }
    return section.lines.join('\n');
  }).join('\n\n');
}

module.exports = { SECTION_PATTERN, parseLyricsIntoSections, reassembleSections };
