// ============================================================
// Dorémi — Parsing paroles par sections
// Utilitaire partagé (admin, client, pages)
// ============================================================

const SECTION_PATTERN = /^\(?(Couplet\s*\d*|Refrain|Dernier refrain|Pont|Outro|Intro|Pre-refrain|Pré-refrain|Bridge)\)?$/i;

/**
 * Parse un texte de paroles en sections structurées.
 * Détecte les labels de section et sépare les strophes.
 * Si un Refrain/Pont/Bridge absorbe des strophes supplémentaires
 * (couplets sans label), elles sont extraites en "Couplet N".
 *
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
      // Nouvelle section détectée — nettoyer les parenthèses éventuelles
      if (current) sections.push(current);
      const cleanLabel = trimmed.replace(/^\(/, '').replace(/\)$/, '');
      current = { label: cleanLabel, lines: [] };
    } else if (current) {
      // Ligne dans une section existante
      // Ignorer les lignes vides juste après le label (séparateur label/contenu)
      if (current.lines.length === 0 && trimmed === '') continue;
      current.lines.push(line);
    } else {
      // Contenu avant le premier label
      if (trimmed === '' && sections.length === 0 && !current) continue;
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

  // ── Post-traitement : séparer les strophes absorbées ──
  // Si un Refrain/Pont/Bridge/Intro/Outro contient plusieurs strophes,
  // on ne garde que la 1ère et on extrait les suivantes en "Couplet N"
  const SINGLE_STROPHE_LABELS = /^(refrain|dernier refrain|pont|bridge|outro|pre-refrain|pré-refrain)$/i;
  const result = [];
  let coupletCounter = 0;

  // D'abord, compter les couplets explicites pour ne pas créer de doublons
  for (const section of sections) {
    if (section.label && /^couplet\s*(\d+)$/i.test(section.label)) {
      const num = parseInt(section.label.match(/\d+/)?.[0] || '0', 10);
      if (num > coupletCounter) coupletCounter = num;
    }
  }

  for (const section of sections) {
    // Séparer en strophes (groupes de lignes non-vides séparés par des lignes vides)
    const strophes = splitIntoStrophes(section.lines);

    if (strophes.length <= 1 || !section.label || !SINGLE_STROPHE_LABELS.test(section.label)) {
      // Section normale ou Couplet (peut avoir plusieurs strophes) → garder tel quel
      result.push(section);
      continue;
    }

    // Section de type Refrain/Pont avec plusieurs strophes
    // 1ère strophe = le vrai Refrain
    result.push({ label: section.label, lines: strophes[0] });

    // Strophes suivantes = couplets auto-détectés
    for (let i = 1; i < strophes.length; i++) {
      coupletCounter++;
      result.push({ label: 'Couplet ' + coupletCounter, lines: strophes[i] });
    }
  }

  return result;
}

/**
 * Sépare un tableau de lignes en strophes (groupes séparés par des lignes vides).
 * @param {string[]} lines
 * @returns {string[][]}
 */
function splitIntoStrophes(lines) {
  const strophes = [];
  let current = [];

  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length > 0) {
        strophes.push(current);
        current = [];
      }
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    strophes.push(current);
  }

  return strophes;
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
