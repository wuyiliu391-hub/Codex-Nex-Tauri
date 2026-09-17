/**
 * Pets tab — catalog grid, selection and action preview.
 *
 * The catalog and animation names come from src/js/pets-data.js, which is
 * transcribed from the shipped Codex bundle. Selection is a preference, so it
 * writes to `save_preferences` rather than shell settings. Live pet state
 * (mood, customs) is owned by the Rust shell store and read via list_pets.
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../../../src/js/i18n.js";
import {
  OFFICIAL_PETS,
  PET_ACTION_NAMES,
  PET_COLUMNS,
  petSheetUrl,
  spriteRowCount,
} from "../../../../src/js/pets-data.js";
import { Block, BlockCustom, PageHead, SettingsButton } from "../primitives";
import { PetOverlay } from "@/pet/PetOverlay";

interface PetPreferences {
  active?: string;
  selected?: string;
  asleep?: boolean;
  size?: number;
}

/** Shell-store pet shape (src-tauri/src/state.rs Pet). */
interface BackendPet {
  id: string;
  name: string;
  kind: string;
  sprite?: string;
  mood?: string;
  custom?: boolean;
}

interface CatalogPet {
  id: string;
  displayName: string;
  description: string;
  spriteVersionNumber?: number;
  assetRef?: string;
  sheet?: string;
  /** Live mood from the backend store, when a matching pet exists. */
  mood?: string;
  custom?: boolean;
}

function label(key: string, fallback: string): string {
  return String(t(key, fallback));
}

function asBackendPets(raw: unknown): BackendPet[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const rec = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    return {
      id: typeof rec["id"] === "string" ? rec["id"] : "",
      name: typeof rec["name"] === "string" ? rec["name"] : "",
      kind: typeof rec["kind"] === "string" ? rec["kind"] : "",
      sprite: typeof rec["sprite"] === "string" ? rec["sprite"] : "",
      mood: typeof rec["mood"] === "string" ? rec["mood"] : "",
      custom: rec["custom"] === true,
    };
  }).filter((p) => p.id !== "");
}

/** Official catalog first, then backend customs that are not already listed. */
function mergeCatalog(backend: BackendPet[]): CatalogPet[] {
  const byId = new Map(backend.map((p) => [p.id, p]));
  const official: CatalogPet[] = OFFICIAL_PETS.map((pet: Record<string, unknown>) => {
    const live = byId.get(String(pet["id"] ?? ""));
    return {
      id: String(pet["id"] ?? ""),
      displayName: String(pet["displayName"] ?? pet["id"] ?? ""),
      description: String(pet["description"] ?? ""),
      spriteVersionNumber: Number(pet["spriteVersionNumber"] ?? 2),
      assetRef: typeof pet["assetRef"] === "string" ? pet["assetRef"] : undefined,
      sheet: typeof pet["sheet"] === "string" ? pet["sheet"] : undefined,
      mood: live?.mood,
      custom: live?.custom,
    };
  });
  const officialIds = new Set(official.map((p) => p.id));
  const customs: CatalogPet[] = backend
    .filter((p) => p.custom === true || !officialIds.has(p.id))
    .map((p) => ({
      id: p.id,
      displayName: p.name || p.id,
      description: p.kind || "",
      spriteVersionNumber: 2,
      mood: p.mood,
      custom: true,
      sheet: p.sprite || undefined,
    }));
  return [...official, ...customs];
}

export function PetsTab() {
  const [prefs, setPrefs] = useState<PetPreferences>({});
  const [previewAction, setPreviewAction] = useState<string | null>(null);
  const [backendPets, setBackendPets] = useState<BackendPet[]>([]);
  const [busy, setBusy] = useState(false);

  const refreshPets = useCallback(async (): Promise<BackendPet[]> => {
    try {
      const raw = await invoke<unknown>("list_pets");
      const list = asBackendPets(raw);
      setBackendPets(list);
      return list;
    } catch (err) {
      console.warn("[pets] list_pets failed", err);
      setBackendPets([]);
      return [];
    }
  }, []);

  // Load preferences + live pet store once.
  useEffect(() => {
    void invoke<Record<string, unknown>>("get_preferences")
      .then((raw) => {
        const pets = (raw?.["pets"] ?? {}) as PetPreferences;
        setPrefs(pets);
      })
      .catch(() => {
        /* preferences are optional; defaults apply */
      });
    void refreshPets();
  }, [refreshPets]);

  const save = useCallback(async (patch: PetPreferences) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      const raw = await invoke<Record<string, unknown>>("get_preferences");
      await invoke("save_preferences", { preferences: { ...raw, pets: next } });
    } catch (err) {
      console.error("[settings] save pet preferences failed", err);
    }
  }, [prefs]);

  const selectedId = prefs.active ?? prefs.selected ?? OFFICIAL_PETS[0]?.id ?? "";
  const catalog = mergeCatalog(backendPets);

  async function wakeSelected(id: string): Promise<void> {
    setBusy(true);
    try {
      await save({ active: id, selected: id, asleep: false });
      try {
        await invoke("wake_pet", { id });
      } catch (err) {
        // Official catalog pets may not exist in the shell store yet.
        console.warn("[pets] wake_pet failed (pet not in store?)", err);
      }
      await refreshPets();
    } finally {
      setBusy(false);
    }
  }

  async function tuckSelected(): Promise<void> {
    setBusy(true);
    try {
      await save({ asleep: true });
      try {
        await invoke("tuck_pet", { id: selectedId });
      } catch (err) {
        console.warn("[pets] tuck_pet failed", err);
      }
      await refreshPets();
    } finally {
      setBusy(false);
    }
  }

  async function createCustomPet(): Promise<void> {
    const name = window.prompt(label("pets.create", "Create pet"), label("pets.custom", "Custom"));
    if (!name) return;
    setBusy(true);
    try {
      const created = await invoke<{ id?: string }>("create_custom_pet", {
        name,
        kind: "custom",
      });
      const id = typeof created?.id === "string" ? created.id : "";
      if (id) await save({ active: id, selected: id, asleep: false });
      await refreshPets();
    } catch (err) {
      console.error("[pets] create_custom_pet failed", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead
        title={label("pets.title", "Pets")}
        desc={label("pets.desc", "Virtual pets give you quick access to ChatGPT.")}
      />

      <BlockCustom title="">
        <div className="pet-top-row">
          <SettingsButton
            label={label("pets.show", "Show virtual pet")}
            kind="primary"
            action="show-pet"
            disabled={busy}
            onClick={() => void wakeSelected(selectedId)}
          />
          <SettingsButton
            label={label("pets.tuck", "Tuck away")}
            action="tuck-pet"
            disabled={busy}
            onClick={() => void tuckSelected()}
          />
        </div>
      </BlockCustom>

      <BlockCustom
        title={label("pets.mine", "My pets")}
        extra={
          <div className="pet-actions-row">
            <SettingsButton
              label={label("pets.refresh", "Refresh")}
              action="pets-refresh"
              disabled={busy}
              onClick={() => void refreshPets()}
            />
            <SettingsButton
              label={label("pets.create", "Create pet")}
              action="pet-create"
              disabled={busy}
              onClick={() => void createCustomPet()}
            />
          </div>
        }
      >
        <div className="pet-grid">
          {catalog.map((pet) => {
            const isActive = pet.id === selectedId;
            const rows = spriteRowCount(pet.spriteVersionNumber);
            return (
              <button
                type="button"
                className={`pet-card${isActive ? " is-active" : ""}`}
                key={pet.id}
                data-pet={pet.id}
                aria-pressed={isActive}
                title={pet.description}
                disabled={busy}
                onClick={() => void wakeSelected(pet.id)}
              >
                <span
                  className="pet-thumb"
                  style={{
                    backgroundImage: petSheetUrl(pet as never)
                      ? `url("${petSheetUrl(pet as never)}")`
                      : undefined,
                    backgroundSize: `${PET_COLUMNS * 100}% ${rows * 100}%`,
                  }}
                />
                <span className="pet-name">{pet.displayName}</span>
                <span className="pet-desc">
                  {pet.description}
                  {pet.mood ? ` · ${pet.mood}` : ""}
                </span>
              </button>
            );
          })}
        </div>
      </BlockCustom>

      <Block title={label("pets.actions", "Actions & expressions")}>
        <div className="pet-action-grid">
          {PET_ACTION_NAMES.map((name) => (
            <button
              type="button"
              className="pet-action-btn"
              key={name}
              data-pet-action={name}
              onClick={() => setPreviewAction(name)}
            >
              {label(`pets.action.${name}`, name)}
            </button>
          ))}
        </div>
      </Block>

      {/* Live preview of the selected pet, driven by the same component the
          shell uses so the preview cannot drift from the real overlay. */}
      {!prefs.asleep && selectedId ? (
        <PetOverlay preferences={{ ...prefs, active: selectedId }} action={previewAction} />
      ) : null}
    </>
  );
}
