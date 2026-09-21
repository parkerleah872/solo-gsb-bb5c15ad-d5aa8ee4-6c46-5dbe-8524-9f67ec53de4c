/** 换气区间：半开区间 [start, end)，单位秒。歌手在该区间内不发声。 */
export interface BreathInterval {
  id: string;
  /** 起始秒（含） */
  start: number;
  /** 结束秒（不含） */
  end: number;
}

export interface Singer {
  id: string;
  name: string;
  partId: string;
  breaths: BreathInterval[];
}

export interface VoicePart {
  id: string;
  name: string;
  color: string;
  /** 该声部任意时刻的最低发声人数 */
  minSingers: number;
}

/**
 * 变速点：从指定小节的首拍起速度变为 bpm（分段恒速）。
 * measure 为 1 起算的小节号，同一拍位上至多一个变速点。
 */
export interface TempoChange {
  id: string;
  measure: number;
  bpm: number;
}

/** 节拍图：拍号 + 起始速度 + 变速点列表。 */
export interface BeatMap {
  /** 每小节拍数（拍号分子） */
  beatsPerBar: number;
  /** 以几分音符为一拍（拍号分母，仅用于显示） */
  beatUnit: number;
  /** 起始 BPM（第 1 小节首拍起） */
  startBpm: number;
  /** 变速点（按小节号升序、不重复；measure=1 的条目等价于起始 BPM） */
  changes: TempoChange[];
}

export interface Project {
  name: string;
  /** 全曲时长（秒） */
  duration: number;
  /** 节拍图（旧工程缺省时为 4/4、120 BPM） */
  beatMap: BeatMap;
  parts: VoicePart[];
  singers: Singer[];
}

/** 当前选中的换气段 */
export interface Selection {
  singerId: string;
  intervalId: string;
}

/**
 * 排练快照：保存时冻结整个工程（声部、歌手及换气区间）。
 * 快照中的节拍图仅作存档记录，恢复时不会覆盖当前工程的节拍图。
 */
export interface Snapshot {
  id: string;
  name: string;
  /** ISO 时间串 */
  createdAt: string;
  project: Project;
}
