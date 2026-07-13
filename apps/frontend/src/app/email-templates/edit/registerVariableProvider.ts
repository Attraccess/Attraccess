import type { Monaco } from '@monaco-editor/react';

const VARIABLE_PROVIDER_FLAG = '__attraccessVariableProvider';

export function registerVariableProvider(
  monaco: Monaco,
  getVariables: () => string[],
  getDetailLabel: () => string,
) {
  const monacoWithFlag = monaco as Monaco & { [VARIABLE_PROVIDER_FLAG]?: boolean };
  if (monacoWithFlag[VARIABLE_PROVIDER_FLAG]) {
    return;
  }
  monacoWithFlag[VARIABLE_PROVIDER_FLAG] = true;
  if (!monaco.languages.getLanguages().some((lang) => lang.id === 'mjml')) {
    monaco.languages.register({ id: 'mjml', extensions: ['.mjml'], aliases: ['MJML', 'mjml'] });
  }
  monaco.languages.registerCompletionItemProvider('mjml', {
    triggerCharacters: ['{'],
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const lineContent = model.getLineContent(position.lineNumber);
      let startColumn = word.startColumn;
      while (startColumn > 1 && lineContent[startColumn - 2] === '{') {
        startColumn -= 1;
      }
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn,
        endColumn: word.endColumn,
      };
      const detail = getDetailLabel();
      return {
        suggestions: getVariables().map((name) => ({
          label: name,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: `{{${name}}}`,
          detail,
          range,
        })),
      };
    },
  });
}
