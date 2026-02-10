# Poryscript Text Validator

A Visual Studio Code extension that provides real-time visual feedback for Pokemon ROM hack text length validation when using poryscript.

## Features

- **Real-time text validation**: Highlights text strings in `.pory` files
- **Visual color coding**: 
  - Blue/acceptable color for lines within the pixel limit
  - Orange/warning color for lines that exceed the limit and need line breaks
- **Pixel-accurate**: Calculates text width based on Pokemon Emerald's variable-width font system
- **Supports placeholders**: Handles `{PLAYER}`, `{RIVAL}`, `{STR_VAR_1}`, etc.

## Usage

1. Open any `.pory` file
2. Write text inside `fmsgbox("")` functions
3. The extension will automatically highlight text segments:
   - Text within 208 pixels → Green background
   - Text exceeding 208 pixels → orange background
4. It will also automatically format text for you, just press ALT + T to format all ``fmsgbox()`` functions to ``msgbox()``
   - Press enter to signify \n or \l
   - Press enter 2x to add a line space between paragraphs for \p to be added

## Configuration

- `pokemonTextValidator.maxLineLength`: Maximum line length in pixels (default: 208)
- `pokemonTextValidator.validColor`: Color for valid text (default: #0072B2)
- `pokemonTextValidator.warningColor`: Color for text exceeding limit (default: #E69F00)

## Example

```poryscript
fmsgbox("This is a short line.
This is another line that might be too long and will show orange highlighting!")
```

## Development

### Prerequisites
- Node.js and npm installed
- Visual Studio Code

### Building
```bash
npm install
npm run compile
```

### Running
Press F5 in VS Code to launch the Extension Development Host

## Acknowledgment
I'd like to acknowledge **Celia Dawn** for helping in conceptualization and providing feedback.

## License

MIT
