"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextValidator = void 0;
const vscode = __importStar(require("vscode"));
const fontWidths_1 = require("./fontWidths");
class TextValidator {
    decorationTypes = new Map();
    constructor() {
        this.updateDecorationTypes();
    }
    updateDecorationTypes() {
        // Clear old decorations
        this.decorationTypes.forEach(dec => dec.dispose());
        this.decorationTypes.clear();
        const config = vscode.workspace.getConfiguration('pokemonTextValidator');
        const validColor = config.get('validColor', '#0072B2');
        const warningColor = config.get('warningColor', '#E69F00');
        this.decorationTypes.set('valid', vscode.window.createTextEditorDecorationType({
            backgroundColor: validColor + '30', // 30 = ~20% opacity
            border: `1px solid ${validColor}`
        }));
        this.decorationTypes.set('warning', vscode.window.createTextEditorDecorationType({
            backgroundColor: warningColor + '30',
            border: `1px solid ${warningColor}`
        }));
    }
    validateDocument(editor) {
        const config = vscode.workspace.getConfiguration('pokemonTextValidator');
        const enabled = config.get('enabled', true);
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
        const validRanges = [];
        const warningRanges = [];
        const maxLineLength = config.get('maxLineLength', 208);
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
                }
                else if (stringContent.length > 0) {
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
    validateRawText(stringContent, startPos, document, maxLineLength, validRanges, warningRanges) {
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
                }
                else {
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
    validateFormattedText(stringContent, startPos, document, maxLineLength, validRanges, warningRanges) {
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
                }
                else {
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
    calculateLineWidth(text) {
        let totalWidth = 0;
        let i = 0;
        while (i < text.length) {
            // Handle escape sequences like {PLAYER}, {RIVAL}, etc.
            if (text[i] === '{') {
                const endBrace = text.indexOf('}', i);
                if (endBrace !== -1) {
                    const placeholder = text.substring(i, endBrace + 1);
                    totalWidth += (0, fontWidths_1.getCharacterWidth)(placeholder);
                    i = endBrace + 1;
                    continue;
                }
            }
            totalWidth += (0, fontWidths_1.getCharacterWidth)(text[i]);
            i++;
        }
        return totalWidth;
    }
    clearDecorations(editor) {
        const validDecoration = this.decorationTypes.get('valid');
        const warningDecoration = this.decorationTypes.get('warning');
        if (validDecoration) {
            editor.setDecorations(validDecoration, []);
        }
        if (warningDecoration) {
            editor.setDecorations(warningDecoration, []);
        }
    }
    dispose() {
        this.decorationTypes.forEach(dec => dec.dispose());
        this.decorationTypes.clear();
    }
}
exports.TextValidator = TextValidator;
//# sourceMappingURL=textValidator.js.map