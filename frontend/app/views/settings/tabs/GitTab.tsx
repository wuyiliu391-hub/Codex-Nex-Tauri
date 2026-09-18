/**
 * Git tab — branch prefix, merge method, push/PR defaults and PR monitoring.
 *
 * Ports renderGit() from settings.js to the official v26.911 layout.
 */

import { t } from "../../../../src/js/i18n.js";
import { saveSection, usePrefSection } from "@/state/preferencesStore";
import { Block, PageHead, Row, Segmented, Switch, TextInput } from "../primitives";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface GitPrefs {
  branchPrefix?: string;
  mergeMethod?: string;
  forcePush?: boolean;
  draftPR?: boolean;
  reviewDelivery?: string;
  autoMerge?: boolean;
  commitInstructions?: string;
  monitorInstructions?: string;
  prInstructions?: string;
}

export function GitTab() {
  const prefs = usePrefSection<GitPrefs>("git");

  // The official UI offers exactly two merge methods; a legacy persisted
  // "rebase" value falls back to 合并 until the user picks one.
  const mergeMethod = prefs.mergeMethod === "squash" ? "squash" : "merge";
  // Same for the legacy "comments" review delivery value → 内联.
  const reviewDelivery = prefs.reviewDelivery === "detached" ? "detached" : "inline";

  return (
    <>
      <PageHead title={label("git.title")} />

      <Block>
        <Row
          label={label("git.branchPrefix")}
          desc={label("git.branchPrefixDesc")}
          control={
            <TextInput
              name="branchPrefix"
              value={prefs.branchPrefix ?? "codex/"}
              onChange={(v) => void saveSection("git", { branchPrefix: v })}
            />
          }
        />
        <Row
          label={label("git.mergeMethod")}
          desc={label("git.mergeMethodDesc")}
          control={
            <Segmented
              value={mergeMethod}
              options={[
                { value: "merge", label: label("git.mergeMerge") },
                { value: "squash", label: label("git.mergeSquash") },
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
              checked={prefs.draftPR !== false}
              onChange={(v) => void saveSection("git", { draftPR: v })}
            />
          }
        />
        <Row
          label={label("git.review")}
          desc={label("git.reviewDesc")}
          control={
            <Segmented
              value={reviewDelivery}
              options={[
                { value: "inline", label: label("git.inline") },
                { value: "detached", label: label("git.detached") },
              ]}
              onChange={(v) => void saveSection("git", { reviewDelivery: v })}
            />
          }
        />
      </Block>

      {/* Below the fold in the official page. */}
      <Block title={label("git.monitorPR")}>
        <Row
          label={label("git.autoMerge")}
          desc={label("git.autoMergeDesc")}
          control={
            <Switch
              checked={prefs.autoMerge === true}
              onChange={(v) => void saveSection("git", { autoMerge: v })}
            />
          }
        />
        {/* Official: unlabeled Edit named Pull Request 监控说明 under the toggle. */}
        <Row
          label=""
          control={
            <TextInput
              name="monitorInstructions"
              value={prefs.monitorInstructions ?? ""}
              placeholder={label("git.monitorPlaceholder")}
              onChange={(v) => void saveSection("git", { monitorInstructions: v })}
            />
          }
        />
        <Row
          label={label("git.commit")}
          desc={label("git.commitInstructionsDesc")}
          control={
            <TextInput
              name="commitInstructions"
              value={prefs.commitInstructions ?? ""}
              placeholder={label("git.commitPlaceholder")}
              onChange={(v) => void saveSection("git", { commitInstructions: v })}
            />
          }
        />
        <Row
          label={label("git.prInstructions")}
          desc={label("git.prInstructionsDesc")}
          control={
            <TextInput
              name="prInstructions"
              value={prefs.prInstructions ?? ""}
              placeholder={label("git.prInstructions")}
              onChange={(v) => void saveSection("git", { prInstructions: v })}
            />
          }
        />
      </Block>
    </>
  );
}
