import type { Project, Snapshot } from '../types';
import { uid } from './id';
import { sanitizeProject } from './storage';

const EPS = 1e-6;
const STORAGE_KEY = 'breath-relay:snapshots:v1';

/** 深拷贝（工程数据均为 JSON 安全结构）。 */
const deepCopy = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/**
 * 保存当前工程的命名快照：深拷贝冻结声部、歌手及换气区间，
 * 之后的任何编辑都不会影响快照内容。
 */
export function takeSnapshot(project: Project, name: string, now: Date = new Date()): Snapshot {
  return {
    id: uid(),
    name: name.trim() || '未命名快照',
    createdAt: now.toISOString(),
    project: deepCopy(project),
  };
}

/** 差异类别：新增 / 删除 / 移动（起止变化、时长不变）/ 时长变化。 */
export type DiffKind = 'added' | 'removed' | 'moved' | 'resized';

/** 当前工程与快照之间、按歌手 ID 对齐后的一段换气区间差异。 */
export interface SnapshotDiff {
  kind: DiffKind;
  singerId: string;
  singerName: string;
  partName: string;
  intervalId: string;
  /** 排序时间：当前区间起点（删除时为快照中的旧起点） */
  time: number;
  /** 当前工程中的区间（removed 时等于快照旧区间） */
  start: number;
  end: number;
  /** 快照中的旧区间（added 时为 null） */
  oldStart: number | null;
  oldEnd: number | null;
}

const KIND_ORDER: Record<DiffKind, number> = { added: 0, removed: 1, moved: 2, resized: 3 };

/**
 * 对比当前工程与快照：按歌手 ID 对齐换气区间（半开区间 [start, end) 语义），
 *  - 仅当前存在 → 新增；仅快照存在 → 删除；
 *  - 同一区间起止都变且时长不变 → 移动；时长改变 → 时长变化（起止同时变也归此类）。
 * 快照中已删除歌手的区间全部计为删除，新增歌手的区间全部计为新增。
 * 结果按时间升序（同刻按歌手名、起点、类别）排序。
 */
export function diffProject(current: Project, snap: Snapshot): SnapshotDiff[] {
  const old = snap.project;
  const partNameOf = (p: Project, partId: string) => p.parts.find((x) => x.id === partId)?.name ?? '未知声部';
  const curSingers = new Map(current.singers.map((s) => [s.id, s]));
  const oldSingers = new Map(old.singers.map((s) => [s.id, s]));

  const out: SnapshotDiff[] = [];
  for (const singerId of new Set([...curSingers.keys(), ...oldSingers.keys()])) {
    const cur = curSingers.get(singerId);
    const prev = oldSingers.get(singerId);
    const base = {
      singerId,
      singerName: cur?.name ?? prev?.name ?? '未知歌手',
      partName: partNameOf(cur ? current : old, (cur ?? prev)!.partId),
    };
    const curById = new Map((cur?.breaths ?? []).map((b) => [b.id, b]));
    const oldById = new Map((prev?.breaths ?? []).map((b) => [b.id, b]));

    for (const b of cur?.breaths ?? []) {
      const o = oldById.get(b.id);
      if (!o) {
        out.push({ ...base, kind: 'added', intervalId: b.id, time: b.start, start: b.start, end: b.end, oldStart: null, oldEnd: null });
        continue;
      }
      if (Math.abs(b.start - o.start) < EPS && Math.abs(b.end - o.end) < EPS) continue;
      const durChanged = Math.abs(b.end - b.start - (o.end - o.start)) >= EPS;
      out.push({
        ...base,
        kind: durChanged ? 'resized' : 'moved',
        intervalId: b.id,
        time: b.start,
        start: b.start,
        end: b.end,
        oldStart: o.start,
        oldEnd: o.end,
      });
    }
    for (const o of prev?.breaths ?? []) {
      if (!curById.has(o.id)) {
        out.push({ ...base, kind: 'removed', intervalId: o.id, time: o.start, start: o.start, end: o.end, oldStart: o.start, oldEnd: o.end });
      }
    }
  }

  out.sort(
    (a, b) =>
      a.time - b.time ||
      a.singerName.localeCompare(b.singerName) ||
      a.start - b.start ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  );
  return out;
}

/**
 * 用快照覆盖当前工程的声部、歌手与换气区间（含曲名与时长），
 * 节拍图保持当前工程现状、不被快照覆盖；快照内容深拷贝写入，互不影响。
 */
export function applySnapshot(current: Project, snap: Snapshot): Project {
  const frozen = snap.project;
  return {
    ...current,
    name: frozen.name,
    duration: frozen.duration,
    parts: deepCopy(frozen.parts),
    singers: deepCopy(frozen.singers),
  };
}

/** 校验并清洗快照列表（localStorage），不合法的条目丢弃。 */
export function sanitizeSnapshots(raw: unknown): Snapshot[] {
  if (!Array.isArray(raw)) return [];
  const out: Snapshot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const project = sanitizeProject(o.project);
    if (!project) continue;
    out.push({
      id: typeof o.id === 'string' && o.id ? o.id : uid(),
      name: typeof o.name === 'string' && o.name ? o.name : '未命名快照',
      createdAt: typeof o.createdAt === 'string' && o.createdAt ? o.createdAt : new Date(0).toISOString(),
      project,
    });
  }
  return out;
}

export function loadSnapshots(): Snapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeSnapshots(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveSnapshots(snaps: Snapshot[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps));
  } catch {
    // 存储满或被禁用时静默失败
  }
}
