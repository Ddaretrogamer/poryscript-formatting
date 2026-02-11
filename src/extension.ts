import * as vscode from 'vscode';
import { TextValidator } from './textValidator';

let validator: TextValidator | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Pokemon Text Validator is now active');

    validator = new TextValidator();

    // Register format command
    const formatCommand = vscode.commands.registerTextEditorCommand(
        'pokemonTextValidator.formatText',
        (textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) => {
            formatPokemonText(textEditor, edit);
        }
    );
    context.subscriptions.push(formatCommand);

    // Register unformat command
    const unformatCommand = vscode.commands.registerTextEditorCommand(
        'pokemonTextValidator.unformatText',
        (textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) => {
            unformatPokemonText(textEditor, edit);
        }
    );
    context.subscriptions.push(unformatCommand);

    // Register for document changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                validator?.validateDocument(editor);
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            const editor = vscode.window.activeTextEditor;
            if (editor && event.document === editor.document) {
                validator?.validateDocument(editor);
            }
        })
    );

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('pokemonTextValidator')) {
                // Re-validate current document when settings change
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    validator?.validateDocument(editor);
                }
            }
        })
    );

    // Validate current document
    if (vscode.window.activeTextEditor) {
        validator.validateDocument(vscode.window.activeTextEditor);
    }
}

export function deactivate() {
    validator?.dispose();
}

function applyTextReplacements(text: string): string {
    // Replace $ with ¥
    text = text.replace(/\$/g, '¥');
    
    // Replace \e with é
    text = text.replace(/\\e/g, 'é');
    
    // Replace \. with ellipsis
    text = text.replace(/\\\./g, '…');
    
    // Replace arrow escape codes
    text = text.replace(/\\au/g, '{UP_ARROW}');
    text = text.replace(/\\ad/g, '{DOWN_ARROW}');
    text = text.replace(/\\ar/g, '{RIGHT_ARROW}');
    text = text.replace(/\\al/g, '{LEFT_ARROW}');
    
    // Replace \m and \f with ♂ and ♀
    text = text.replace(/\\m/g, '♂');
    text = text.replace(/\\f/g, '♀');

    // Replace \qo and \qc with opening and closing quotation marks
    text = text.replace(/\\qo/g, '“');
    text = text.replace(/\\qc/g, '”');

    // replace \h30 with {PAUSE_30}, or any \h followed by digits with {PAUSE_X}
    text = text.replace(/\\h(\d+)/g, (match, p1) => `{PAUSE_${p1}}`);

    return text;
}

function formatPokemonText(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    const document = textEditor.document;
    const text = document.getText();
    
    // Find all fmsgbox() calls in the document
    // Use [ \t]* to capture only horizontal whitespace (spaces/tabs), not newlines
    // Capture optional additional parameters after the string (e.g., MSGBOX_AUTOCLOSE)
    const fmsgboxRegex = /([ \t]*)(fmsgbox)\s*\(\s*"([^]*?)"\s*(,\s*[^)]*)?\)/g;
    let match;
    const replacements: { range: vscode.Range; text: string }[] = [];
    
    while ((match = fmsgboxRegex.exec(text)) !== null) {
        const fullMatch = match[0];
        const functionIndent = match[1];
        let contentToFormat = match[3];
        const additionalParams = match[4] || '';
        
        // Apply text replacements before formatting
        contentToFormat = applyTextReplacements(contentToFormat);
        
        // Split by lines and process
        const lines = contentToFormat.split(/\r?\n/);
        const resultLines: string[] = [];
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
                    } else {
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
        const resultParts: string[] = [functionIndent + 'msgbox(' + resultLines[0]];
        
        for (let i = 1; i < resultLines.length; i++) {
            resultParts.push(contentIndent + resultLines[i]);
        }
        
        resultParts[resultParts.length - 1] += additionalParams + ')';
        
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
    } else {
        vscode.window.showInformationMessage(`Formatted ${replacements.length} fmsgbox() call(s).`);
    }
}

function unformatPokemonText(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    const document = textEditor.document;
    const text = document.getText();
    
    // Find all msgbox() calls with multiple quoted strings (formatted)
    // Use [ \t]* to capture only horizontal whitespace (spaces/tabs), not newlines
    const msgboxRegex = /([ \t]*)(msgbox)\s*\(([^]*?)\)/g;
    let match;
    const replacements: { range: vscode.Range; text: string }[] = [];
    
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
        
        // Extract all quoted strings and any additional parameters
        const stringRegex = /"([^"]*)"/g;
        const strings: string[] = [];
        let stringMatch;
        
        while ((stringMatch = stringRegex.exec(innerContent)) !== null) {
            strings.push(stringMatch[1]);
        }
        
        // Extract additional parameters (e.g., MSGBOX_AUTOCLOSE) after the last string
        const additionalParamsMatch = innerContent.match(/"[^"]*"\s*(,\s*[^)]*)\s*$/);
        const additionalParams = additionalParamsMatch ? additionalParamsMatch[1] : '';
        
        const contentToUnformat = strings.join('');
        
        // Replace escape codes with actual newlines
        let unformatted = contentToUnformat
            .replace(/\\n/g, '\n')
            .replace(/\\l/g, '\n')
            .replace(/\\p/g, '\n\n');
        
        // Build result with proper indentation
        const lines = unformatted.split('\n');
        const indentedLines = lines.map((line, idx) => {
            if (idx === 0) return line;
            if (line === '') return '';
            return functionIndent + line;
        });
        
        const result = `${functionIndent}fmsgbox("${indentedLines.join('\n')}"${additionalParams})`;
        
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
    } else {
        vscode.window.showInformationMessage(`Unformatted ${replacements.length} msgbox() call(s) to fmsgbox().`);
    }
}
