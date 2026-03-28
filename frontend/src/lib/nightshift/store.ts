import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  CheckResult,
  CreateMissionInput,
  Mission,
  MissionEvent,
  MissionState,
  MissionStoreSnapshot,
} from "./types";
import { normalizeMissionStoreSnapshot } from "./types";

const STORE_DIRECTORY = path.join(process.cwd(), ".data", "nightshift");
const STORE_FILE = path.join(STORE_DIRECTORY, "missions.json");

function nowIso() {
  return new Date().toISOString();
}

function buildMissionId(issueNumber: number) {
  return `msn_${String(issueNumber).padStart(4, "0")}`;
}

function buildEventId(missionId: string, type: MissionEvent["type"], createdAt: string) {
  return `${missionId}_${type}_${createdAt.replace(/[:.]/g, "-")}`;
}

function inferInitialState(): MissionState {
  return "candidate_selected";
}

function buildApproval(riskLevel: Mission["riskLevel"], createdAt: string): Mission["approval"] {
  if (riskLevel === "high") {
    return {
      status: "pending",
      requestedAt: createdAt,
      resolvedAt: null,
      channel: "voice",
      phoneNumber: null,
    };
  }

  return {
    status: "not_required",
    requestedAt: null,
    resolvedAt: null,
    channel: "auto",
    phoneNumber: null,
  };
}

function demoMission(): Mission {
  const createdAt = "2026-03-29T04:36:39.000Z";

  return {
    id: buildMissionId(12),
    createdAt,
    updatedAt: createdAt,
    state: "queued",
    summary: "Implement deterministic mission persistence and typed mission data for the MVP.",
    acceptanceCriteria: [
      "Mission, MissionEvent, and CheckResult have concrete runtime-safe TypeScript models.",
      "Night Shift can read and write a local mission snapshot without remote services.",
      "The home page can render mission state from the local store.",
    ],
    nonGoals: [
      "GitHub API integration",
      "Remote database provisioning",
      "Voice approval delivery",
    ],
    riskLevel: "low",
    issue: {
      owner: "ayushozha",
      repo: "NightShift",
      number: 12,
      title: "Implement mission model and persistence",
      url: "https://github.com/ayushozha/NightShift/issues/12",
    },
    selection: {
      rationale: "Unblocks later API and UI work with deterministic local data.",
      whyNow: "This is the current MVP checkpoint and has no external dependency.",
      riskNote: "Low-risk because the work is isolated to local types and persistence.",
    },
    approval: {
      status: "not_required",
      requestedAt: null,
      resolvedAt: null,
      channel: "auto",
      phoneNumber: null,
    },
    latestAction: "Local mission snapshot initialized.",
    retryCount: 0,
    maxRetries: 3,
    lastError: null,
    branch: {
      name: null,
      pullRequestUrl: null,
    },
    traceUrl: null,
    logUrl: null,
    checks: [
      {
        id: "check_local_store",
        label: "Local persistence",
        status: "pending",
        summary: "Waiting for initial store verification.",
        startedAt: null,
        completedAt: null,
        detailsUrl: null,
      },
    ],
  };
}

function demoEvent(mission: Mission): MissionEvent {
  return {
    id: buildEventId(mission.id, "mission_created", mission.createdAt),
    missionId: mission.id,
    createdAt: mission.createdAt,
    actor: "system",
    type: "mission_created",
    state: mission.state,
    message: mission.latestAction,
    metadata: {
      issueNumber: mission.issue.number,
      riskLevel: mission.riskLevel,
    },
  };
}

function defaultSnapshot(): MissionStoreSnapshot {
  return {
    missions: [],
    events: [],
  };
}

async function ensureStoreFile() {
  await mkdir(STORE_DIRECTORY, { recursive: true });

  try {
    await readFile(STORE_FILE, "utf8");
  } catch {
    await writeSnapshot(defaultSnapshot());
  }
}

async function readSnapshot(): Promise<MissionStoreSnapshot> {
  await ensureStoreFile();
  try {
    const raw = await readFile(STORE_FILE, "utf8");
    return normalizeMissionStoreSnapshot(JSON.parse(raw));
  } catch {
    const snapshot = defaultSnapshot();
    await writeSnapshot(snapshot);
    return snapshot;
  }
}

async function writeSnapshot(snapshot: MissionStoreSnapshot) {
  await mkdir(STORE_DIRECTORY, { recursive: true });
  const tempFile = `${STORE_FILE}.tmp`;
  await writeFile(tempFile, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(tempFile, STORE_FILE);
}

export async function listMissions() {
  const snapshot = await readSnapshot();
  return snapshot.missions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getMission(missionId: string) {
  const snapshot = await readSnapshot();
  return snapshot.missions.find((mission) => mission.id === missionId) ?? null;
}

export async function listMissionEvents(missionId: string) {
  const snapshot = await readSnapshot();
  return snapshot.events
    .filter((event) => event.missionId === missionId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function createMission(input: CreateMissionInput) {
  const snapshot = await readSnapshot();
  const createdAt = nowIso();
  const missionId = buildMissionId(input.issue.number);
  const state = inferInitialState();

  const mission: Mission = {
    id: missionId,
    createdAt,
    updatedAt: createdAt,
    state,
    summary: input.summary,
    acceptanceCriteria: input.acceptanceCriteria,
    nonGoals: input.nonGoals ?? [],
    riskLevel: input.riskLevel,
    issue: input.issue,
    selection: input.selection,
    approval: buildApproval(input.riskLevel, createdAt),
    latestAction: input.latestAction ?? "Mission created.",
    retryCount: input.retryCount ?? 0,
    maxRetries: 3,
    lastError: null,
    branch: {
      name: input.branchName ?? null,
      pullRequestUrl: null,
    },
    traceUrl: null,
    logUrl: null,
    checks: input.checks ?? [],
  };

  const eventType = mission.state === "awaiting_approval" ? "approval_requested" : "mission_created";
  const event: MissionEvent = {
    id: buildEventId(mission.id, eventType, createdAt),
    missionId: mission.id,
    createdAt,
    actor: "system",
    type: eventType,
    state: mission.state,
    message: mission.latestAction,
    metadata: {
      issueNumber: mission.issue.number,
      riskLevel: mission.riskLevel,
    },
  };

  const nextSnapshot = {
    missions: [mission, ...snapshot.missions.filter((entry) => entry.id !== mission.id)],
    events: [event, ...snapshot.events.filter((entry) => entry.id !== event.id)],
  };

  await writeSnapshot(nextSnapshot);
  return mission;
}

export async function updateMissionState(missionId: string, state: MissionState, message: string) {
  const snapshot = await readSnapshot();
  const createdAt = nowIso();
  const currentMission = snapshot.missions.find((mission) => mission.id === missionId) ?? null;

  if (!currentMission) {
    return null;
  }

  const missions = snapshot.missions.map((mission) => {
    if (mission.id !== missionId) {
      return mission;
    }

    const approval: Mission["approval"] =
      state === "declined"
        ? { ...mission.approval, status: "declined" as const, resolvedAt: createdAt }
        : state === "queued" && mission.approval.status === "pending"
          ? { ...mission.approval, status: "approved" as const, resolvedAt: createdAt }
          : mission.approval;

    return {
      ...mission,
      state,
      latestAction: message,
      updatedAt: createdAt,
      approval,
      lastError: state === "failed" ? message : mission.lastError,
    };
  });

  const eventType =
    currentMission.approval.status === "pending" && (state === "queued" || state === "declined")
      ? "approval_resolved"
      : "state_changed";

  const event: MissionEvent = {
    id: buildEventId(missionId, eventType, createdAt),
    missionId,
    createdAt,
    actor: eventType === "approval_resolved" ? "approval_adapter" : "system",
    type: eventType,
    state,
    message,
    metadata:
      eventType === "approval_resolved"
        ? { approvalStatus: state === "declined" ? "declined" : "approved" }
        : undefined,
  };

  await writeSnapshot({ missions, events: [event, ...snapshot.events] });
  return missions.find((mission) => mission.id === missionId) ?? null;
}

export async function upsertMissionCheck(missionId: string, check: CheckResult, message?: string) {
  const snapshot = await readSnapshot();
  const createdAt = nowIso();

  const missions = snapshot.missions.map((mission) => {
    if (mission.id !== missionId) {
      return mission;
    }

    const remainingChecks = mission.checks.filter((entry) => entry.id !== check.id);
    return {
      ...mission,
      updatedAt: createdAt,
      latestAction: message ?? `Check updated: ${check.label}`,
      checks: [...remainingChecks, check].sort((left, right) => left.label.localeCompare(right.label)),
    };
  });

  const mission = missions.find((entry) => entry.id === missionId);
  if (!mission) {
    return null;
  }

  const event: MissionEvent = {
    id: buildEventId(missionId, "check_updated", createdAt),
    missionId,
    createdAt,
    actor: "runner",
    type: "check_updated",
    state: mission.state,
    message: message ?? `Check updated: ${check.label}`,
    metadata: {
      checkId: check.id,
      checkStatus: check.status,
    },
  };

  await writeSnapshot({ missions, events: [event, ...snapshot.events] });
  return mission;
}

export async function appendMissionEvent(
  missionId: string,
  event: Omit<MissionEvent, "id" | "missionId" | "createdAt">,
) {
  const snapshot = await readSnapshot();
  const createdAt = nowIso();

  if (!snapshot.missions.some((mission) => mission.id === missionId)) {
    return null;
  }

  const nextEvent: MissionEvent = {
    ...event,
    id: buildEventId(missionId, event.type, createdAt),
    missionId,
    createdAt,
  };

  const missions = snapshot.missions.map((mission) =>
    mission.id === missionId
      ? {
          ...mission,
          updatedAt: createdAt,
          latestAction: event.message,
        }
      : mission,
  );

  await writeSnapshot({ missions, events: [nextEvent, ...snapshot.events] });
  return nextEvent;
}

export async function incrementRetryCount(missionId: string) {
  const snapshot = await readSnapshot();
  const createdAt = nowIso();

  const missions = snapshot.missions.map((mission) => {
    if (mission.id !== missionId) return mission;
    return { ...mission, retryCount: mission.retryCount + 1, updatedAt: createdAt };
  });

  await writeSnapshot({ missions, events: snapshot.events });
  return missions.find((m) => m.id === missionId) ?? null;
}

export async function updateMissionBranch(
  missionId: string,
  branch: { name?: string | null; pullRequestUrl?: string | null },
) {
  const snapshot = await readSnapshot();
  const createdAt = nowIso();

  const missions = snapshot.missions.map((mission) => {
    if (mission.id !== missionId) return mission;
    return {
      ...mission,
      updatedAt: createdAt,
      branch: {
        name: branch.name ?? mission.branch.name,
        pullRequestUrl: branch.pullRequestUrl ?? mission.branch.pullRequestUrl,
      },
    };
  });

  await writeSnapshot({ missions, events: snapshot.events });
  return missions.find((m) => m.id === missionId) ?? null;
}

export async function readMissionStore() {
  return readSnapshot();
}
