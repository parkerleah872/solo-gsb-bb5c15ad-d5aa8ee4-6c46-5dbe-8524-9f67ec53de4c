import { useMemo, useState } from 'react';
import type { Project, Snapshot } from '../types';
import { diffProject, type DiffKind, type SnapshotDiff } from '../lib/snapshots';
import { fmtSec } from '../lib/format';

interface Props {
  project: Project;
  snapshots: Snapshot[];
  onSave: (name: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

const KIND_LABEL: Record<DiffKind, string> = {
  added: '新增',
  removed: '删除',
  moved: '移动',
  resized: '时长变化',
};

const fmtDelta = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return r > 0 ? `+${r}s` : `${r}s`;
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { hour12: false });
};

export default function SnapshotPanel({ project, snapshots, onSave, onRestore, onDelete }: Props) {
  const [name, setName] = useState('');
  const [compareId, setCompareId] = useState<string | null>(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const comparing = compareId ? snapshots.find((s) => s.id === compareId) ?? null : null;
  // 差异随当前工程实时重算：编辑工程时对比视图同步更新
  const diffs = useMemo(() => (comparing ? diffProject(project, comparing) : []), [project, comparing]);

  const save = () => {
    onSave(name.trim() || `快照 ${snapshots.length + 1}`);
    setName('');
  };

  return (
    <section className="side-section snapshot-section">
      <h3>📸 排练快照</h3>
      <div className="snapshot-save">
        <input
          type="text"
          placeholder={`快照 ${snapshots.length + 1}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
        <button className="primary" onClick={save}>
          保存快照
        </button>
      </div>
      {snapshots.length === 0 && (
        <p className="hint">还没有快照。保存后可按歌手对齐对比换气差异，或二次确认后恢复（节拍图保持现状）。</p>
      )}
      <div className="snapshot-list">
        {[...snapshots].reverse().map((s) => {
          const breathCount = s.project.singers.reduce((n, x) => n + x.breaths.length, 0);
          const isComparing = comparing?.id === s.id;
          return (
            <div className={`snapshot-item${isComparing ? ' active' : ''}`} key={s.id}>
              <div className="snapshot-head">
                <span className="snapshot-name" title={s.name}>
                  {s.name}
                </span>
                <span className="snapshot-time muted">{fmtDate(s.createdAt)}</span>
              </div>
              <div className="snapshot-meta muted">
                {s.project.parts.length} 声部 · {s.project.singers.length} 歌手 · {breathCount} 段换气 · 时长{' '}
                {fmtSec(s.project.duration)}
              </div>
              <div className="snapshot-actions">
                <button onClick={() => setCompareId(isComparing ? null : s.id)}>
                  {isComparing ? '收起差异' : '对比差异'}
                </button>
                <button
                  onClick={() => {
                    setConfirmRestoreId(s.id);
                    setConfirmDeleteId(null);
                  }}
                >
                  恢复…
                </button>
                <button
                  onClick={() => {
                    setConfirmDeleteId(s.id);
                    setConfirmRestoreId(null);
                  }}
                >
                  删除
                </button>
              </div>
              {confirmRestoreId === s.id && (
                <div className="confirm-row">
                  <span>确认恢复「{s.name}」？当前声部、歌手与换气区间将被快照覆盖（节拍图保持现状）。</span>
                  <span className="confirm-btns">
                    <button
                      className="danger"
                      onClick={() => {
                        setConfirmRestoreId(null);
                        onRestore(s.id);
                      }}
                    >
                      确认恢复
                    </button>
                    <button onClick={() => setConfirmRestoreId(null)}>取消</button>
                  </span>
                </div>
              )}
              {confirmDeleteId === s.id && (
                <div className="confirm-row">
                  <span>确认删除快照「{s.name}」？此操作不可撤销。</span>
                  <span className="confirm-btns">
                    <button
                      className="danger"
                      onClick={() => {
                        setConfirmDeleteId(null);
                        onDelete(s.id);
                      }}
                    >
                      确认删除
                    </button>
                    <button onClick={() => setConfirmDeleteId(null)}>取消</button>
                  </span>
                </div>
              )}
              {isComparing && (
                <div className="snapshot-diff">
                  {diffs.length === 0 ? (
                    <p className="hint ok">✓ 当前工程与该快照的换气安排一致</p>
                  ) : (
                    <>
                      <div className="stats">{diffs.length} 处差异（按时间排序，快照 → 当前）</div>
                      <ul className="diff-list">
                        {diffs.map((d) => (
                          <DiffRow key={`${d.singerId}:${d.intervalId}`} d={d} />
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DiffRow({ d }: { d: SnapshotDiff }) {
  const cur = `[${fmtSec(d.start)}, ${fmtSec(d.end)})`;
  const old = d.oldStart !== null && d.oldEnd !== null ? `[${fmtSec(d.oldStart)}, ${fmtSec(d.oldEnd)})` : null;
  return (
    <li>
      <span className="diff-head">
        <span className={`diff-badge ${d.kind}`}>{KIND_LABEL[d.kind]}</span>
        <b>{d.singerName}</b>
        <em className="muted">（{d.partName}）</em>
      </span>
      <span className="diff-times muted">
        {d.kind === 'added' && cur}
        {d.kind === 'removed' && old}
        {(d.kind === 'moved' || d.kind === 'resized') && `${old} → ${cur}`}
        {d.kind === 'moved' && ` · 位移 ${fmtDelta(d.start - (d.oldStart ?? 0))}`}
        {d.kind === 'resized' &&
          ` · 时长 ${fmtSec((d.oldEnd ?? 0) - (d.oldStart ?? 0))} → ${fmtSec(d.end - d.start)}`}
      </span>
    </li>
  );
}
