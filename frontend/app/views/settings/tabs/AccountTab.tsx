/**
 * Account tab — provider list and the active-provider selector.
 *
 * Providers come from the engine (`list_providers` → config/read). Setting the
 * active provider writes through saveSettings(), which syncs `model_provider`
 * to config.toml.
 *
 * The full provider editor (create / edit / probe) is still in the vanilla
 * layer; this tab covers the list and the active selection.
 */

import { t } from "../../../../src/js/i18n.js";
import { refreshAppState, saveSettings, useAppState, type SettingsState } from "@/state/appStore";
import { Dropdown } from "@/shell/Dropdown";
import { Block, BlockCustom, PageHead, Row, SettingsButton } from "../primitives";

function label(key: string, fallback: string): string {
  return String(t(key, fallback));
}

export function AccountTab() {
  const { providers, settings } = useAppState();

  function update(patch: Partial<SettingsState>): void {
    void saveSettings(patch);
  }

  const active = providers.find((p) => p.id === settings.activeProviderId) ?? providers[0] ?? null;

  return (
    <>
      <PageHead
        title={label("settings.account", "Account")}
        desc={label("account.desc", "Model providers used by the agent.")}
      />

      <Block title={label("account.active", "Active provider")}>
        <Row
          label={label("account.active", "Active provider")}
          desc={active ? active.name : label("account.none", "None configured")}
          control={
            <Dropdown
              value={active?.id ?? ""}
              items={
                providers.length
                  ? providers.map((p) => ({
                      value: p.id,
                      label: `${p.name}${p.hasApiKey ? " · key saved" : ""}`,
                    }))
                  : [{ value: "", label: label("account.none", "None configured") }]
              }
              onChange={(value) => update({ activeProviderId: value })}
              disabled={providers.length === 0}
            />
          }
        />
      </Block>

      <BlockCustom
        title={label("account.providers", "Providers")}
        extra={
          <SettingsButton
            label={label("pets.refresh", "Refresh")}
            action="refresh-providers"
            onClick={() => void refreshAppState()}
          />
        }
      >
        <div className="provider-list">
          {providers.length === 0 ? (
            <div className="settings-card site-empty">
              {label("account.empty", "No providers configured yet.")}
            </div>
          ) : (
            providers.map((provider) => {
              const isActive = provider.id === active?.id;
              return (
                <div className={`provider-row${isActive ? " is-active" : ""}`} key={provider.id}>
                  <div className="provider-row-meta">
                    <div className="provider-row-name">
                      {provider.name}
                      {isActive ? (
                        <span className="provider-pill">
                          {label("account.activePill", "Active")}
                        </span>
                      ) : null}
                    </div>
                    <div className="provider-row-desc">
                      {provider.models.length
                        ? `${provider.models.length} model${provider.models.length === 1 ? "" : "s"}`
                        : label("account.noModels", "No models discovered")}
                    </div>
                  </div>
                  <div className="provider-row-actions">
                    <SettingsButton
                      label={
                        isActive
                          ? label("account.activePill", "Active")
                          : label("account.setActive", "Use")
                      }
                      action="set-active"
                      disabled={isActive}
                      onClick={() => update({ activeProviderId: provider.id })}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </BlockCustom>
    </>
  );
}
