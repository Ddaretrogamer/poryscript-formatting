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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const textValidator_1 = require("./textValidator");
let validator;
function activate(context) {
    console.log('Pokemon Text Validator is now active');
    validator = new textValidator_1.TextValidator();
    // Register format command
    const formatCommand = vscode.commands.registerTextEditorCommand('pokemonTextValidator.formatText', (textEditor, edit) => {
        formatPokemonText(textEditor, edit);
    });
    context.subscriptions.push(formatCommand);
    // Register unformat command
    const unformatCommand = vscode.commands.registerTextEditorCommand('pokemonTextValidator.unformatText', (textEditor, edit) => {
        unformatPokemonText(textEditor, edit);
    });
    context.subscriptions.push(unformatCommand);
    // Register for document changes
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            validator?.validateDocument(editor);
        }
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document) {
            validator?.validateDocument(editor);
        }
    }));
    // Listen for configuration changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('pokemonTextValidator')) {
            // Re-validate current document when settings change
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                validator?.validateDocument(editor);
            }
        }
    }));
    // Validate current document
    if (vscode.window.activeTextEditor) {
        validator.validateDocument(vscode.window.activeTextEditor);
    }
}
function deactivate() {
    validator?.dispose();
}
function formatPokemonText(textEditor, edit) {
    const document = textEditor.document;
    const text = document.getText();
    // Find all fmsgbox() calls in the document
    // Use [ \t]* to capture only horizontal whitespace (spaces/tabs), not newlines
    const fmsgboxRegex = /([ \t]*)(fmsgbox)\s*\(\s*"([^]*?)"\s*\)/g;
    let match;
    const replacements = [];
    while ((match = fmsgboxRegex.exec(text)) !== null) {
        const fullMatch = match[0];
        const functionIndent = match[1];
        const contentToFormat = match[3];
        // Split by lines and process
        const lines = contentToFormat.split(/\r?\n/);
        const resultLines = [];
        let isFirstLineInBlock = true;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            // Skip empty lines at the start
            if (line.length === 0 && resultLines.length === 0) {
                continue;
            }
            // Process non-empty lines
            if (line.length > 0) {
                let escapeCode = '';
                if (i < lines.length - 1) {
                    const nextLine = lines[i + 1].trim();
                    if (nextLine.length === 0) {
                        escapeCode = '\\p';
                        i++;
                        isFirstLineInBlock = true;
                    }
                    else {
                        escapeCode = isFirstLineInBlock ? '\\n' : '\\l';
                        isFirstLineInBlock = false;
                    }
                }
                const quotedLine = '"' + line + escapeCode + '"';
                resultLines.push(quotedLine);
            }
        }
        // Build the formatted msgbox call - construct each line separately
        const contentIndent = functionIndent + '    ';
        const resultParts = [functionIndent + 'msgbox(' + resultLines[0]];
        for (let i = 1; i < resultLines.length; i++) {
            resultParts.push(contentIndent + resultLines[i]);
        }
        resultParts[resultParts.length - 1] += ')';
        // Use the document's line ending
        const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
        const result = resultParts.join(eol);
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + fullMatch.length);
        replacements.push({ range: new vscode.Range(startPos, endPos), text: result });
    }
    // Apply all replacements in reverse order to maintain positions
    for (let i = replacements.length - 1; i >= 0; i--) {
        edit.replace(replacements[i].range, replacements[i].text);
    }
    if (replacements.length === 0) {
        vscode.window.showInformationMessage('No fmsgbox() calls found to format.');
    }
    else {
        vscode.window.showInformationMessage(`Formatted ${replacements.length} fmsgbox() call(s).`);
    }
}
function unformatPokemonText(textEditor, edit) {
    const document = textEditor.document;
    const text = document.getText();
    // Find all msgbox() calls with multiple quoted strings (formatted)
    // Use [ \t]* to capture only horizontal whitespace (spaces/tabs), not newlines
    const msgboxRegex = /([ \t]*)(msgbox)\s*\(([^]*?)\)/g;
    let match;
    const replacements = [];
    while ((match = msgboxRegex.exec(text)) !== null) {
        const fullMatch = match[0];
        const functionIndent = match[1];
        const innerContent = match[3];
        // Check if this is a formatted msgbox (has multiple quoted strings or escape codes)
        const hasMultipleStrings = (innerContent.match(/"/g) || []).length > 2;
        const hasEscapeCodes = /\\[nlp]/.test(innerContent);
        if (!hasMultipleStrings && !hasEscapeCodes) {
            // Skip single-line msgbox calls that aren't formatted
            continue;
        }
        // Extract all quoted strings and join them
        const stringRegex = /"([^"]*)"/g;
        const strings = [];
        let stringMatch;
        while ((stringMatch = stringRegex.exec(innerContent)) !== null) {
            strings.push(stringMatch[1]);
        }
        const contentToUnformat = strings.join('');
        // Replace escape codes with actual newlines
        let unformatted = contentToUnformat
            .replace(/\\n/g, '\n')
            .replace(/\\l/g, '\n')
            .replace(/\\p/g, '\n\n');
        // Build result with proper indentation
        const lines = unformatted.split('\n');
        const indentedLines = lines.map((line, idx) => {
            if (idx === 0)
                return line;
            if (line === '')
                return '';
            return functionIndent + line;
        });
        const result = `${functionIndent}fmsgbox("${indentedLines.join('\n')}")`;
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + fullMatch.length);
        replacements.push({ range: new vscode.Range(startPos, endPos), text: result });
    }
    // Apply all replacements in reverse order to maintain positions
    for (let i = replacements.length - 1; i >= 0; i--) {
        edit.replace(replacements[i].range, replacements[i].text);
    }
    if (replacements.length === 0) {
        vscode.window.showInformationMessage('No formatted msgbox() calls found to unformat.');
    }
    else {
        vscode.window.showInformationMessage(`Unformatted ${replacements.length} msgbox() call(s) to fmsgbox().`);
    }
}
//# sourceMappingURL=extension.js.map