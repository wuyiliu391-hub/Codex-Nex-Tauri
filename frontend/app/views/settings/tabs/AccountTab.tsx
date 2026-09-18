/**
 * Account tab — provider list, active-provider selector, add/edit and probe.
 *
 * Providers come from the engine (`list_providers` → config/read). Setting the
 * active provider writes through saveSettings(), which syncs `model_provider`
 * to config.toml. Add/edit uses save_provider; connectivity uses probe_provider.
 */

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../../../src/js/i18n.js";
import { refreshAppState, saveSettings, useAppState, type SettingsState } from "@/state/appStore";
import { Dropdown } from "@/shell/Dropdown";
import {
  Block,
  BlockCustom,
  PageHead,
  Row,
  SettingsButton,
  TextInput,
} from "../primitives";

function label(key: string, fallback: string): string {
  return String(t(key, fallback));
}

interface ProviderForm {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  protocol: string;
  defaultModel: string;
}

function emptyForm(): ProviderForm {
  return {
    id: "",
    name: "",
    baseUrl: "",
    apiKey: "",
    protocol: "openai_chat",
    defaultModel: "",
  };
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `provider-${Date.now()}`;
}

export function AccountTab() {
  const { providers, settings } = useAppState();
  const [form, setForm] = useState<ProviderForm | null>(null);
  const [probeMsg, setProbeMsg] = useState("");
  const [busy, setBusy] = useState(false);

  function update(patch: Partial<SettingsState>): void {
    void saveSettings(patch);
  }

  const active = providers.find((p) => p.id === settings.activeProviderId) ?? providers[0] ?? null;

  function openEditor(existing?: {
    id: string;
    name: string;
    baseUrl?: string;
    protocol?: string;
  }): void {
    setProbeMsg("");
    setForm({
      ...emptyForm(),
      id: existing?.id ?? "",
      name: existing?.name ?? "",
      baseUrl: existing?.baseUrl ?? "",
      protocol: existing?.protocol ?? "openai_chat",
    });
  }

  function patchForm(patch: Partial<ProviderForm>): void {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function saveProvider(): Promise<void> {
    if (!form) return;
    const id = form.id.trim() || slugify(form.name || "provider");
    setBusy(true);
    try {
      await invoke("save_provider", {
        provider: {
          id,
          name: form.name.trim() || id,
          baseUrl: form.baseUrl.trim(),
          apiKey: form.apiKey,
          protocol: form.protocol,
          defaultModel: form.defaultModel.trim(),
        },
      });
      await refreshAppState();
      setForm(null);
    } catch (err) {
      console.error("[account] save_provider failed", err);
      setProbeMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function probeProvider(): Promise<void> {
    if (!form) return;
    setBusy(true);
    setProbeMsg(label("account.probing", "Probing…"));
    try {
      const result = await invoke<{
        ok?: boolean;
        error?: string;
        modelCount?: number;
        models?: string[];
        modelFound?: boolean;
      }>("probe_provider", {
        providerId: form.id.trim() || undefined,
        baseUrl: form.baseUrl.trim(),
        protocol: form.protocol,
        apiKey: form.apiKey,
        model: form.defaultModel.trim() || undefined,
      });
      if (result?.ok) {
        const n = result.modelCount ?? (result.models?.length ?? 0);
        const parts = [`${label("account.probeOk", "OK")} · ${n}`];
        if (result.modelFound === false) {
          parts.push(label("account.probeModelMissing", "default model not in list"));
        }
        setProbeMsg(parts.join(" · "));
      } else {
        setProbeMsg(result?.error || label("account.checksFailed", "Probe failed"));
      }
    } catch (err) {
      setProbeMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

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
          <div className="provider-row-actions">
            <SettingsButton
              label={label("account.add", "Add provider")}
              kind="primary"
              action="add-provider"
              onClick={() => openEditor()}
            />
            <SettingsButton
              label={label("pets.refresh", "Refresh")}
              action="refresh-providers"
              onClick={() => void refreshAppState()}
            />
          </div>
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
                      label={label("action.edit", "Edit")}
                      onClick={() =>
                        openEditor({
                          id: provider.id,
                          name: provider.name,
                          baseUrl: provider.baseUrl,
                          protocol: provider.protocol,
                        })
                      }
                    />
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

        {form ? (
          <div className="settings-card">
            <Row
              label={label("account.name", "Name")}
              control={
                <TextInput
                  name="name"
                  value={form.name}
                  onChange={(v) => patchForm({ name: v })}
                />
              }
            />
            <Row
              label={label("account.baseUrl", "Base URL")}
              control={
                <TextInput
                  name="baseUrl"
                  value={form.baseUrl}
                  placeholder="https://…"
                  onChange={(v) => patchForm({ baseUrl: v })}
                />
              }
            />
            <Row
              label={label("account.apiKey", "API key")}
              control={
                <TextInput
                  name="apiKey"
                  type="password"
                  value={form.apiKey}
                  onChange={(v) => patchForm({ apiKey: v })}
                />
              }
            />
            <Row
              label={label("account.protocol", "Protocol")}
              control={
                <Dropdown
                  value={form.protocol}
                  items={[
                    { value: "openai_chat", label: "openai_chat" },
                    { value: "openai_responses", label: "openai_responses" },
                    { value: "anthropic", label: "anthropic" },
                    { value: "ollama", label: "ollama" },
                  ]}
                  onChange={(v) => patchForm({ protocol: v })}
                />
              }
            />
            <Row
              label={label("account.defaultModel", "Default model")}
              control={
                <TextInput
                  name="defaultModel"
                  value={form.defaultModel}
                  onChange={(v) => patchForm({ defaultModel: v })}
                />
              }
            />
            <div className="provider-row-actions">
              <SettingsButton
                label={label("account.runChecks", "Probe")}
                disabled={busy || !form.baseUrl.trim()}
                onClick={() => void probeProvider()}
              />
              <SettingsButton
                label={label("action.save", "Save")}
                kind="primary"
                disabled={busy}
                onClick={() => void saveProvider()}
              />
              <SettingsButton
                label={label("action.cancel", "Cancel")}
                onClick={() => {
                  setForm(null);
                  setProbeMsg("");
                }}
              />
            </div>
            {probeMsg ? <div className="settings-card site-empty">{probeMsg}</div> : null}
          </div>
        ) : null}
      </BlockCustom>
    </>
  );
}
