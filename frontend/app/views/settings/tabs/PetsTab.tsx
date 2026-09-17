/**
 * Pets tab — catalog grid, selection and action preview.
 *
 * The catalog and animation names come from src/js/pets-data.js, which is
 * transcribed from the shipped Codex bundle. Selection is a preference, so it
 * writes to `save_preferences` rather than shell settings.
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

function label(key: string, fallback: string): string {
  return String(t(key, fallback));
}

export function PetsTab() {
  const [prefs, setPrefs] = useState<PetPreferences>({});
  const [previewAction, setPreviewAction] = useState<string | null>(null);

  // Load the current pet preferences once.
  useEffect(() => {
    void invoke<Record<string, unknown>>("get_preferences")
      .then((raw) => {
        const pets = (raw?.["pets"] ?? {}) as PetPreferences;
        setPrefs(pets);
      })
      .catch(() => {
        /* preferences are optional; defaults apply */
      });
  }, []);

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
            onClick={() => void save({ active: selectedId, selected: selectedId, asleep: false })}
          />
          <SettingsButton
            label={label("pets.tuck", "Tuck away")}
            action="tuck-pet"
            onClick={() => void save({ asleep: true })}
          />
        </div>
      </BlockCustom>

      <BlockCustom title={label("pets.mine", "My pets")}>
        <div className="pet-grid">
          {OFFICIAL_PETS.map((pet) => {
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
                onClick={() => void save({ active: pet.id, selected: pet.id, asleep: false })}
              >
                <span
                  className="pet-thumb"
                  style={{
                    backgroundImage: `url("${petSheetUrl(pet)}")`,
                    backgroundSize: `${PET_COLUMNS * 100}% ${rows * 100}%`,
                  }}
                />
                <span className="pet-name">{pet.displayName}</span>
                <span className="pet-desc">{pet.description}</span>
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
