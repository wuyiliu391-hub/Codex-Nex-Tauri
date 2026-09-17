/**
 * Git tab — branch prefix, merge method, force push and draft PR.
 *
 * Ports renderGit() from settings.js.
 */

import { t } from "../../../../src/js/i18n.js";
import { saveSection, usePrefSection } from "@/state/preferencesStore";
import { Dropdown } from "@/shell/Dropdown";
import { Block, PageHead, Row, Switch, TextInput } from "../primitives";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface GitPrefs {
  branchPrefix?: string;
  mergeMethod?: string;
  forcePush?: boolean;
  draftPR?: boolean;
}

export function GitTab() {
  const prefs = usePrefSection<GitPrefs>("git");

  return (
    <>
      <PageHead title={label("git.title")} />
      <Block title={label("git.prefs")}>
        <Row
          label={label("git.branchPrefix")}
          control={
            <TextInput
              name="branchPrefix"
              value={prefs.branchPrefix ?? ""}
              onChange={(v) => void saveSection("git", { branchPrefix: v })}
            />
          }
        />
        <Row
          label={label("git.mergeMethod")}
          control={
            <Dropdown
              value={prefs.mergeMethod ?? "squash"}
              items={[
                { value: "squash", label: "squash" },
                { value: "merge", label: "merge" },
                { value: "rebase", label: "rebase" },
              ]}
              onChange={(v) => void saveSection("git", { mergeMethod: v })}
            />
          }
        />
        <Row
          label={label("git.forcePush")}
          desc={label("git.forcePushDesc")}
          control={
            <Switch
              checked={prefs.forcePush === true}
              onChange={(v) => void saveSection("git", { forcePush: v })}
            />
          }
        />
        <Row
          label={label("git.draftPR")}
          desc={label("git.draftPRDesc")}
          control={
            <Switch
              checked={prefs.draftPR === true}
              onChange={(v) => void saveSection("git", { draftPR: v })}
            />
          }
        />
      </Block>
    </>
  );
}
