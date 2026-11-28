/* eslint-disable unicorn/consistent-boolean-name -- Save operations return success so rejected edits keep the screen open. */
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

/**
 * Reloads before each scoped write so nested saves preserve unrelated configuration changes.
 */
export async function saveNetworkRule(ctx: ExtensionCommandContext, target: NetworkScope, destination: string, rule: NetworkRule | undefined): Promise<boolean> {
  let {config} = target.store;
  try {
    config = await target.store.load();
    const network = (config.sandbox?.network ?? []).filter(entry => entry.destination !== destination);
    if (rule !== undefined) {
      network.push(rule);
    }

    target.store.config = {...config, sandbox: {...config.sandbox, network}};
    await target.store.save();
    ctx.ui.notify(`${rule === undefined ? 'Removed from' : 'Saved to'} ${target.source}. Changes apply after /reload or restarting Pi.`, 'info');
    return true;
  } catch (error) {
    target.store.config = config;
    ctx.ui.notify(`Could not save network settings: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return false;
  }
}
