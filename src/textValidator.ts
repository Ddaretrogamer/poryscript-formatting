import * as vscode from 'vscode';
import { getCharacterWidth, DEFAULT_CHAR_WIDTH } from './fontWidths';

export class TextValidator {
    private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();

    constructor() {
        this.updateDecorationTypes();
    }

    private updateDecorationTypes() {
        // Clear old decorations
        this.decorationTypes.forEach(dec => dec.dispose());
        this.decorationTypes.clear();

        // Blue for characters within the limit, orange for characters exceeding it
        this.decorationTypes.set('valid', vscode.window.createTextEditorDecorationType({
            backgroundColor: '#0072B230', // 30 = ~20% opacity
            border: '1px solid #0072B2'
        }));

        this.decorationTypes.set('warning', vscode.window.createTextEditorDecorationType({
            backgroundColor: '#E69F0030',
            border: '1px solid #E69F00'
        }));
    }

    public validateDocument(editor: vscode.TextEditor) {
        const config = vscode.workspace.getConfiguration('pokemonTextValidator');
        const enabled = config.get<boolean>('enabled', true);
        
        // If disabled, clear all decorations and return
        if (!enabled) {
            this.clearDecorations(editor);
            return;
        }

        const document = editor.document;
        const fileName = document.fileName.toLowerCase();

        // Only process .pory files
        if (!fileName.endsWith('.pory')) {
            return;
        }

        const text = document.getText();
        const validRanges: vscode.Range[] = [];
        const warningRanges: vscode.Range[] = [];

        const maxLineLength = config.get<number>('maxLineLength', 208);

        // Find all msgbox/fmsgbox/format/message calls
        const functionRegex = /(?:fmsgbox|msgbox|format|message)\s*\([^)]*\)/gs;
        let functionMatch;

        while ((functionMatch = functionRegex.exec(text)) !== null) {
            const functionCall = functionMatch[0];
            const functionStart = functionMatch.index;

            // Find all quoted strings within this function call
            const stringRegex = /"([^"]*)"/g;
            let stringMatch;

            while ((stringMatch = stringRegex.exec(functionCall)) !== null) {
                const stringContent = stringMatch[1];
                const stringStartInFunction = stringMatch.index + 1; // +1 to skip opening quote
                const absoluteStartPos = functionStart + stringStartInFunction;

                // Check if this is raw text (contains actual newlines) or formatted text (contains escape codes)
                const hasRawNewlines = /\r?\n/.test(stringContent);
                const hasEscapeCodes = /\\[nlp]/.test(stringContent);

                if (hasRawNewlines && !hasEscapeCodes) {
                    // This is raw text that will be formatted - simulate the formatted version
                    this.validateRawText(stringContent, absoluteStartPos, document, maxLineLength, validRanges, warningRanges);
                } else if (stringContent.length > 0) {
                    // This is already formatted text or single line - validate as-is
                    this.validateFormattedText(stringContent, absoluteStartPos, document, maxLineLength, validRanges, warningRanges);
                }
            }
        }

        // Apply decorations
        const validDecoration = this.decorationTypes.get('valid');
        const warningDecoration = this.decorationTypes.get('warning');

        if (validDecoration) {
            editor.setDecorations(validDecoration, validRanges);
        }
        if (warningDecoration) {
            editor.setDecorations(warningDecoration, warningRanges);
        }
    }

    private validateRawText(
        stringContent: string,
        startPos: number,
        document: vscode.TextDocument,
        maxLineLength: number,
        validRanges: vscode.Range[],
        warningRanges: vscode.Range[]
    ) {
        // Split by actual newlines but keep track of original positions
        const lines = stringContent.split(/\r?\n/);
        let offset = 0; // offset within stringContent
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            if (trimmedLine.length > 0) {
                // Find where the trimmed content starts in the original line
                const trimStart = line.indexOf(trimmedLine);
                const contentStart = startPos + offset + trimStart;
                const contentEnd = contentStart + trimmedLine.length;
                
                // Validate character by character for this line
                this.validateSegmentCharByChar(trimmedLine, contentStart, document, maxLineLength, validRanges, warningRanges);
            }
            
            // Move offset past this line and the newline character(s)
            offset += line.length;
            if (i < lines.length - 1) {
                // Add newline length (check if \r\n or just \n in original)
                const newlineMatch = stringContent.substring(offset).match(/^(\r?\n)/);
                if (newlineMatch) {
                    offset += newlineMatch[1].length;
                }
            }
        }
    }

    private validateFormattedText(
        stringContent: string,
        startPos: number,
        document: vscode.TextDocument,
        maxLineLength: number,
        validRanges: vscode.Range[],
        warningRanges: vscode.Range[]
    ) {
        // Split by escape codes to validate each line segment
        const segments = stringContent.split(/\\[nlp]/);
        let offset = 0;
        
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            
            if (segment.length > 0) {
                this.validateSegmentCharByChar(segment, startPos + offset, document, maxLineLength, validRanges, warningRanges);
            }
            
            // Move offset past this segment
            offset += segment.length;
            
            // If not the last segment, account for the escape code (\n, \l, or \p = 2 chars)
            if (i < segments.length - 1) {
                offset += 2;
            }
        }
    }

    private validateSegmentCharByChar(
        text: string,
        startPos: number,
        document: vscode.TextDocument,
        maxLineLength: number,
        validRanges: vscode.Range[],
        warningRanges: vscode.Range[]
    ) {
        let currentWidth = 0;
        let i = 0;
        let validStart = -1;
        let warningStart = -1;
        let exceedsLimit = false;

        while (i < text.length) {
            const charStart = i;
            let charWidth = 0;
            let charEnd = i + 1;

            // Handle escape sequences like {PLAYER}, {RIVAL}, etc.
            if (text[i] === '{') {
                const endBrace = text.indexOf('}', i);
                if (endBrace !== -1) {
                    const placeholder = text.substring(i, endBrace + 1);
                    charWidth = getCharacterWidth(placeholder);
                    charEnd = endBrace + 1;
                } else {
                    charWidth = getCharacterWidth(text[i]);
                }
            } else {
                charWidth = getCharacterWidth(text[i]);
            }

            currentWidth += charWidth;

            // Check if we've exceeded the limit
            if (currentWidth > maxLineLength && !exceedsLimit) {
                // We just exceeded the limit
                exceedsLimit = true;
                
                // Add the valid range up to this point
                if (validStart !== -1) {
                    const rangeStart = document.positionAt(startPos + validStart);
                    const rangeEnd = document.positionAt(startPos + charStart);
                    validRanges.push(new vscode.Range(rangeStart, rangeEnd));
                }
                
                // Start warning range
                warningStart = charStart;
            } else if (currentWidth <= maxLineLength && exceedsLimit) {
                // We're back within the limit (shouldn't happen normally, but handle it)
                exceedsLimit = false;
                
                // Add the warning range
                if (warningStart !== -1) {
                    const rangeStart = document.positionAt(startPos + warningStart);
                    const rangeEnd = document.positionAt(startPos + charStart);
                    warningRanges.push(new vscode.Range(rangeStart, rangeEnd));
                }
                
                // Start valid range
                validStart = charStart;
            } else if (!exceedsLimit && validStart === -1) {
                // Initialize valid range at the start
                validStart = charStart;
            } else if (exceedsLimit && warningStart === -1) {
                // Initialize warning range
                warningStart = charStart;
            }

            i = charEnd;
        }

        // Add the final range
        if (validStart !== -1 && !exceedsLimit) {
            const rangeStart = document.positionAt(startPos + validStart);
            const rangeEnd = document.positionAt(startPos + text.length);
            validRanges.push(new vscode.Range(rangeStart, rangeEnd));
        } else if (warningStart !== -1 && exceedsLimit) {
            const rangeStart = document.positionAt(startPos + warningStart);
            const rangeEnd = document.positionAt(startPos + text.length);
            warningRanges.push(new vscode.Range(rangeStart, rangeEnd));
        }
    }

    private calculateLineWidth(text: string): number {
        let totalWidth = 0;
        let i = 0;

        while (i < text.length) {
            // Handle escape sequences like {PLAYER}, {RIVAL}, etc.
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

    private clearDecorations(editor: vscode.TextEditor) {
        const validDecoration = this.decorationTypes.get('valid');
        const warningDecoration = this.decorationTypes.get('warning');
        
        if (validDecoration) {
            editor.setDecorations(validDecoration, []);
        }
        if (warningDecoration) {
            editor.setDecorations(warningDecoration, []);
        }
    }

    public dispose() {
        this.decorationTypes.forEach(dec => dec.dispose());
        this.decorationTypes.clear();
    }
}
