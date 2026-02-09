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

function formatPokemonText(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    const selection = textEditor.selection;
    const text = textEditor.document.getText(selection);
    
    // If nothing is selected, do default tab behavior
    if (text.length === 0) {
        vscode.commands.executeCommand('tab');
        return;
    }

    // Get the indentation of the first line for consistent formatting
    const firstLineRange = new vscode.Range(
        new vscode.Position(selection.start.line, 0),
        selection.start
    );
    const indent = textEditor.document.getText(firstLineRange);

    // Check if this includes a msgbox/format/message call
    const msgboxMatch = text.match(/^(\s*)(msgbox|format|message)\s*\(\s*"([^]*?)"\s*\)\s*$/);
    
    let contentToFormat: string;
    let prefix = '';
    let suffix = '';
    
    if (msgboxMatch) {
        // Extract the function call and content
        const functionIndent = msgboxMatch[1];
        const functionName = msgboxMatch[2];
        contentToFormat = msgboxMatch[3];
        prefix = `${functionIndent}${functionName}(`;
        suffix = ')';
    } else {
        // Just format the selected text as-is
        contentToFormat = text;
    }

    // Split by lines and process
    const lines = contentToFormat.split(/\r?\n/);
    const resultLines: string[] = [];
    let isFirstLineInBlock = true; // First line in a block gets \n, rest get \l
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip empty lines at the start
        if (line.length === 0 && resultLines.length === 0) {
            continue;
        }
        
        // Process non-empty lines
        if (line.length > 0) {
            // Determine what comes after this line
            let escapeCode = '';
            let addBlankLine = false;
            
            if (i < lines.length - 1) {
                const nextLine = lines[i + 1].trim();
                
                // If next line is empty, it's a paragraph break (\p)
                if (nextLine.length === 0) {
                    escapeCode = '\\p';
                    addBlankLine = true;
                    // Skip the empty line
                    i++;
                    // Reset for next text block
                    isFirstLineInBlock = true;
                } else {
                    // First line gets \n, subsequent lines get \l
                    escapeCode = isFirstLineInBlock ? '\\n' : '\\l';
                    isFirstLineInBlock = false;
                }
            }
            
            resultLines.push(`"${line}${escapeCode}"`);
            
            // Add blank line after \p
            if (addBlankLine) {
                resultLines.push('');
            }
        }
    }
    
    // Build the final result
    let result: string;
    if (msgboxMatch) {
        // Format as msgbox call with proper indentation
        const contentIndent = indent + '    '; // Add 4 spaces for content
        const formattedLines = resultLines.map((line, idx) => {
            if (line === '') return ''; // Keep blank lines
            return idx === 0 ? line : contentIndent + line;
        }).join('\n');
        
        result = `${prefix}${formattedLines}${suffix}`;
    } else {
        // Just return the formatted strings
        result = resultLines.join('\n' + indent);
    }
    
    edit.replace(selection, result);
}

function unformatPokemonText(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    const selection = textEditor.selection;
    const text = textEditor.document.getText(selection);
    
    // If nothing is selected, do nothing
    if (text.length === 0) {
        return;
    }

    // Check if this includes a msgbox/format/message call with multiple quoted strings
    const msgboxMatch = text.match(/^(\s*)(msgbox|format|message)\s*\(([^]*)\)\s*$/);
    
    let contentToUnformat: string;
    let prefix = '';
    let suffix = '';
    let contentIndent = '';
    
    if (msgboxMatch) {
        // Extract the function call and content
        const functionIndent = msgboxMatch[1];
        const functionName = msgboxMatch[2];
        const innerContent = msgboxMatch[3];
        prefix = `${functionIndent}${functionName}(`;
        suffix = ')';
        
        // Content lines should use the same indentation as the msgbox line
        contentIndent = functionIndent;
        
        // Extract all quoted strings and join them
        const stringRegex = /"([^"]*)"/g;
        const strings: string[] = [];
        let match;
        
        while ((match = stringRegex.exec(innerContent)) !== null) {
            strings.push(match[1]);
        }
        
        contentToUnformat = strings.join('');
    } else {
        // Just unformat the selected text as-is
        // Remove quotes if present
        contentToUnformat = text.replace(/"([^"]*)"/g, '$1');
    }

    // Replace escape codes with actual newlines
    let unformatted = contentToUnformat
        .replace(/\\n/g, '\n')
        .replace(/\\l/g, '\n')
        .replace(/\\p/g, '\n\n');

    // Build result
    let result: string;
    if (msgboxMatch) {
        // Add indentation to each line
        const lines = unformatted.split('\n');
        const indentedLines = lines.map((line, idx) => {
            if (idx === 0) return line; // First line has no indent (right after opening quote)
            if (line === '') return ''; // Keep blank lines empty
            return contentIndent + line;
        });
        result = `${prefix}"${indentedLines.join('\n')}"${suffix}`;
    } else {
        result = unformatted;
    }
    
    edit.replace(selection, result);
}
