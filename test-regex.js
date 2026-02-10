const testInput = `fmsgbox("this is a test of the new fmsbox
    function. it should be able to be
    converted to a normal msgbox when you
    press the alt + t command.
    This will work for every fmsgbox all
    at once.

    alt + shift + t will revert msgboxes
    to fmsgboxes.")`;

const fmsgboxRegex = /(\s*)(fmsgbox)\s*\(\s*"([^]*?)"\s*\)/g;
const match = fmsgboxRegex.exec(testInput);

if (match) {
    const functionIndent = match[1];
    const contentToFormat = match[3];
    
    const lines = contentToFormat.split(/\r?\n/);
    const resultLines = [];
    let isFirstLineInBlock = true;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.length === 0 && resultLines.length === 0) {
            continue;
        }
        
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
            
            resultLines.push('"' + line + escapeCode + '"');
        }
    }
    
    console.log('Result lines array:');
    resultLines.forEach((line, i) => console.log(`  ${i}: ${JSON.stringify(line)}`));
    console.log('\n--- Building final output: ---');
    
    const contentIndent = functionIndent + '    ';
    const formattedContent = resultLines.map((line, idx) => {
        return idx === 0 ? line : contentIndent + line;
    }).join('\n');
    
    const result = functionIndent + 'msgbox(' + formattedContent + ')';
    
    console.log('Final result:');
    console.log(result);
    console.log('\n--- Character by character around first join: ---');
    const first50 = result.substring(0, 100);
    for (let i = 0; i < first50.length; i++) {
        const char = first50[i];
        const code = first50.charCodeAt(i);
        if (char === '\n') {
            console.log(`${i}: [NEWLINE] (${code})`);
        } else if (char === '\r') {
            console.log(`${i}: [CR] (${code})`);
        } else {
            console.log(`${i}: '${char}' (${code})`);
        }
    }
}
