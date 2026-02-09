// Character widths based on Pokemon Emerald font system
// Default font: 1_latin_rse with maxLineLength: 208 pixels

export const DEFAULT_CHAR_WIDTH = 6;

const characterWidths: { [key: string]: number } = {
    // Space
    " ": 3,
    
    // Special characters with defined widths
    "À": 6, "Á": 6, "Â": 6, "Ç": 6, "È": 6, "É": 6, "Ê": 6, "Ë": 6,
    "Ì": 6, "Î": 6, "Ï": 6, "Ò": 6, "Ó": 6, "Ô": 6, "Ù": 6, "Ú": 6,
    "Û": 6, "Ñ": 6, "ß": 6, "à": 6, "á": 6, "ç": 6, "è": 6, "é": 6,
    "ê": 6, "ë": 6, "ì": 6, "î": 6, "ï": 6, "ò": 6, "ó": 6, "ô": 6,
    "ù": 6, "ú": 6, "û": 6, "ñ": 6, "º": 6, "ª": 6,
    
    // Wide characters
    "Œ": 8, "œ": 8,
    
    // Game placeholders (estimated widths - adjust based on actual game)
    "{PLAYER}": 48,
    "{RIVAL}": 42,
    "{STR_VAR_1}": 60,
    "{STR_VAR_2}": 60,
    "{STR_VAR_3}": 60,
    "{PKMN}": 30,
    "{POKEMON}": 48,
    "{LV}": 12,
    
    // Common single-width characters (most ASCII)
    // All other characters default to 6 pixels
};

export function getCharacterWidth(char: string): number {
    // Check if it's a known placeholder or character
    if (characterWidths[char] !== undefined) {
        return characterWidths[char];
    }
    
    // Default width for unknown characters
    return DEFAULT_CHAR_WIDTH;
}

export function calculateTextWidth(text: string): number {
    let totalWidth = 0;
    let i = 0;

    while (i < text.length) {
        // Handle placeholders like {PLAYER}, {RIVAL}, etc.
        if (text[i] === '{') {
            const endBrace = text.indexOf('}', i);
            if (endBrace !== -1) {
                const placeholder = text.substring(i, endBrace + 1);
                totalWidth += getCharacterWidth(placeholder);
                i = endBrace + 1;
                continue;
            }
        }

        totalWidth += getCharacterWidth(text[i]);
        i++;
    }

    return totalWidth;
}
