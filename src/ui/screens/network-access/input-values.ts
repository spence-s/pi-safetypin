import {ExtensionInputComponent, type ExtensionCommandContext} from '@earendil-works/pi-coding-agent';

/**
 * Keeps existing exact values editable on one line, quoting literal commas and preserving rejected input for retry.
 */
export async function inputValues({ui}: ExtensionCommandContext, title: string, values: string[]): Promise<string[] | undefined> {
  let text = values.map(value => /[",]|^\s|\s$/v.test(value) ? JSON.stringify(value) : value).join(', ');
  while (true) {
    const initialValue = text;
    const submitted = await ui.custom<string | undefined>((_tui, _theme, _keybindings, done) => new ExtensionInputComponent(
      title,
      undefined,
      done,
      () => {
        done(undefined);
      },
      {initialValue, description: 'Comma-separated values · Quote literal commas: "a,b", c'},
    ));
    if (submitted === undefined) {
      return;
    }

    text = submitted;
    try {
      const parsed: string[] = [];
      let start = 0;
      let isQuoted = false;
      let isEscaped = false;
      for (let index = 0; index <= text.length; index++) {
        const character = text[index];
        if (character === undefined || (character === ',' && !isQuoted)) {
          const value = text.slice(start, index).trim();
          if (value.startsWith('"')) {
            const decoded: unknown = JSON.parse(value);
            if (typeof decoded !== 'string') {
              throw new TypeError('Expected a quoted string.');
            }

            parsed.push(decoded);
          } else {
            if (value.includes('"')) {
              throw new Error('Quotes must surround the whole value.');
            }

            parsed.push(value);
          }

          start = index + 1;
        } else if (isEscaped) {
          isEscaped = false;
        } else if (character === '\\' && isQuoted) {
          isEscaped = true;
        } else if (character === '"') {
          isQuoted = !isQuoted;
        }
      }

      return parsed;
    } catch {
      ui.notify('Use comma-separated values. Wrap literal commas in double quotes; quoted values use JSON string escaping.', 'warning');
    }
  }
}
