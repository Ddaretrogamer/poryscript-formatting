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

        const config = vscode.workspace.getConfiguration('pokemonTextValidator');
        const validColor = config.get<string>('validColor', '#0072B2');
        const warningColor = config.get<string>('warningColor', '#E69F00');

        this.decorationTypes.set('valid', vscode.window.createTextEditorDecorationType({
            backgroundColor: validColor + '30', // 30 = ~20% opacity
            border: `1px solid ${validColor}`
        }));

        this.decorationTypes.set('warning', vscode.window.createTextEditorDecorationType({
            backgroundColor: warningColor + '30',
            border: `1px solid ${warningColor}`
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

        // Find all msgbox/format/message calls
        const functionRegex = /(?:msgbox|format|message)\s*\([^)]*\)/gs;
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
                
                const lineStart = document.positionAt(contentStart);
                const lineEnd = document.positionAt(contentEnd);
                const range = new vscode.Range(lineStart, lineEnd);

                const pixelWidth = this.calculateLineWidth(trimmedLine);
                if (pixelWidth > maxLineLength) {
                    warningRanges.push(range);
                } else {
                    validRanges.push(range);
                }
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
                const pixelWidth = this.calculateLineWidth(segment);
                const segmentStart = document.positionAt(startPos + offset);
                const segmentEnd = document.positionAt(startPos + offset + segment.length);
                const range = new vscode.Range(segmentStart, segmentEnd);

                if (pixelWidth > maxLineLength) {
                    warningRanges.push(range);
                } else {
                    validRanges.push(range);
                }
            }
            
            // Move offset past this segment
            offset += segment.length;
            
            // If not the last segment, account for the escape code (\n, \l, or \p = 2 chars)
            if (i < segments.length - 1) {
                offset += 2;
            }
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
