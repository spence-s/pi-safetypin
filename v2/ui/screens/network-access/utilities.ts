import {getSettingsListTheme, type ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {
  Container,
  SettingsList,
  Text,
  type SettingItem,
} from '@earendil-works/pi-tui';
import type {ConfigStore, NetworkRule} from '../../../config/index.ts';

export type Scope = 'Local' | 'Global';
export type ScopedRule = {scope: Scope; rule: NetworkRule};
export type NetworkScope = {source: Scope; label: string; store: ConfigStore};

/**
 * Keeps network editing consistent with the filesystem screen's presentation.
 */
export async function showNetworkPage(
  {ui}: ExtensionCommandContext,
  {title, subtitle}: {title: string; subtitle: string},
  items: SettingItem[],
  selectedId?: string,
): Promise<string | undefined> {
  return ui.custom<string | undefined>((tui, theme, _keybindings, done) => {
    const container = new Container();
    const heading = theme.fg('accent', theme.bold(title));
    container.addChild(new Text(heading, 0, 0));
    container.addChild(new Text(theme.fg('muted', subtitle), 0, 1));
    const list = new SettingsList(items, 15, getSettingsListTheme(), done, () => {
      done(undefined);
    });
    if (selectedId !== undefined) {
      list.selectItem(selectedId);
    }

    container.addChild(list);
    return Object.assign(container, {
      /**
       * Keeps the shared list responsible for keyboard navigation and search.
       */
      handleInput(data: string) {
        list.handleInput(data);
        tui.requestRender();
      },
    });
  });
}

