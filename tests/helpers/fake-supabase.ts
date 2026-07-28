/**
 * A minimal in-memory stand-in for the Supabase JS query builder, covering
 * exactly the operations `lib/services/*` actually issues (verified by
 * grepping the codebase — see the Phase 1.5 test suite). It is not a
 * general PostgREST reimplementation; it exists so the service layer's
 * business logic (filtering rules, dedup decisions, partial-failure
 * handling) can be unit tested without a live database.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
type Table = Row[];

interface FilterOp {
  col: string;
  op: "eq" | "is" | "lt" | "gt" | "gte" | "in" | "ilike";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  val: any;
  negate?: boolean;
}

class FakeQuery implements PromiseLike<{ data: unknown; error: { message: string } | null; count: number | null }> {
  private filters: FilterOp[] = [];
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitVal: number | null = null;
  private rangeVal: [number, number] | null = null;
  private wantCount = false;
  private headOnly = false;
  private singleMode: "single" | "maybeSingle" | null = null;
  private op: "select" | "insert" | "update" | "upsert" = "select";
  private payload: Row | Row[] | null = null;
  private upsertConflictCol = "id";

  constructor(
    private table: Table,
    private tableName: string,
    private db: FakeDb,
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.count) this.wantCount = true;
    if (opts?.head) this.headOnly = true;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, op: "eq", val });
    return this;
  }
  is(col: string, val: unknown) {
    this.filters.push({ col, op: "is", val });
    return this;
  }
  not(col: string, op: "eq" | "is" | "lt" | "gt" | "gte" | "in" | "ilike", val: unknown) {
    this.filters.push({ col, op, val, negate: true });
    return this;
  }
  lt(col: string, val: unknown) {
    this.filters.push({ col, op: "lt", val });
    return this;
  }
  gt(col: string, val: unknown) {
    this.filters.push({ col, op: "gt", val });
    return this;
  }
  gte(col: string, val: unknown) {
    this.filters.push({ col, op: "gte", val });
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push({ col, op: "in", val: vals });
    return this;
  }
  ilike(col: string, pattern: string) {
    this.filters.push({ col, op: "ilike", val: pattern });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }
  limit(n: number) {
    this.limitVal = n;
    return this;
  }
  range(from: number, to: number) {
    this.rangeVal = [from, to];
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybeSingle";
    return this;
  }
  single() {
    this.singleMode = "single";
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = rows;
    return this;
  }
  upsert(rows: Row[], opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = rows;
    this.upsertConflictCol = opts?.onConflict ?? "id";
    return this;
  }

  private matchesOne(row: Row, f: FilterOp): boolean {
    let result: boolean;
    switch (f.op) {
      case "eq":
        if (f.val === "{}" && Array.isArray(row[f.col])) {
          result = row[f.col].length === 0;
        } else {
          result = row[f.col] === f.val;
        }
        break;
      case "is":
        result = f.val === null ? row[f.col] === null || row[f.col] === undefined : row[f.col] === f.val;
        break;
      case "lt":
        result = row[f.col] != null && row[f.col] < f.val;
        break;
      case "gt":
        result = row[f.col] != null && row[f.col] > f.val;
        break;
      case "gte":
        result = row[f.col] != null && row[f.col] >= f.val;
        break;
      case "in":
        result = (f.val as unknown[]).includes(row[f.col]);
        break;
      case "ilike": {
        const pattern = String(f.val).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*");
        result = new RegExp(`^${pattern}$`, "i").test(row[f.col] ?? "");
        break;
      }
      default:
        result = true;
    }
    return f.negate ? !result : result;
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => this.matchesOne(row, f));
  }

  then<TResult1, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ data: unknown; error: { message: string } | null; count: number | null }> {
    if (this.op === "insert") {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const inserted = rows.map((r) => this.db.insertRow(this.tableName, r));
      return { data: this.singleMode ? (inserted[0] ?? null) : inserted, error: null, count: null };
    }

    if (this.op === "upsert") {
      const rows = this.payload as Row[];
      const failure = this.db.checkInjectedFailure(this.tableName, rows);
      if (failure) return { data: null, error: failure, count: null };
      for (const row of rows) this.db.upsertRow(this.tableName, row, this.upsertConflictCol);
      return { data: null, error: null, count: null };
    }

    if (this.op === "update") {
      const matched = this.table.filter((r) => this.matches(r));
      for (const row of matched) Object.assign(row, this.payload as Row);
      return { data: matched, error: null, count: null };
    }

    let rows = this.table.filter((r) => this.matches(r));
    const count = rows.length;

    if (this.orderCol) {
      const col = this.orderCol;
      rows = [...rows].sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        if (av === bv) return 0;
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        return this.orderAsc ? (av < bv ? -1 : 1) : av < bv ? 1 : -1;
      });
    }
    if (this.rangeVal) rows = rows.slice(this.rangeVal[0], this.rangeVal[1] + 1);
    if (this.limitVal != null) rows = rows.slice(0, this.limitVal);

    if (this.headOnly) return { data: null, error: null, count };
    if (this.singleMode === "single") {
      return { data: rows[0] ?? null, error: rows[0] ? null : { message: "no rows found" }, count };
    }
    if (this.singleMode === "maybeSingle") return { data: rows[0] ?? null, error: null, count };
    return { data: rows, error: null, count: this.wantCount ? count : null };
  }
}

export class FakeDb {
  tables: Record<string, Table> = {};
  private idCounters: Record<string, number> = {};
  private upsertFailures: { tableName: string; predicate: (rows: Row[]) => boolean; message: string }[] = [];

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [name, rows] of Object.entries(seed)) {
      this.tables[name] = rows.map((r) => ({ ...r }));
    }
  }

  from(tableName: string) {
    if (!this.tables[tableName]) this.tables[tableName] = [];
    return new FakeQuery(this.tables[tableName], tableName, this);
  }

  /**
   * Test-only failure injection: the next (and every subsequent) upsert on
   * `tableName` whose rows satisfy `predicate` fails with `{message}`
   * instead of writing — used to exercise partial-failure recovery paths
   * without a real database.
   */
  failUpsertWhen(tableName: string, predicate: (rows: Row[]) => boolean, message = "simulated upsert failure"): void {
    this.upsertFailures.push({ tableName, predicate, message });
  }

  checkInjectedFailure(tableName: string, rows: Row[]): { message: string } | null {
    const match = this.upsertFailures.find((f) => f.tableName === tableName && f.predicate(rows));
    return match ? { message: match.message } : null;
  }

  insertRow(tableName: string, row: Row): Row {
    const table = this.tables[tableName] ?? (this.tables[tableName] = []);
    const withId: Row = { ...row };
    if (withId.id === undefined) {
      const counter = (this.idCounters[tableName] ?? 0) + 1;
      this.idCounters[tableName] = counter;
      withId.id = counter;
    }
    table.push(withId);
    return withId;
  }

  upsertRow(tableName: string, row: Row, conflictCol: string): void {
    const table = this.tables[tableName] ?? (this.tables[tableName] = []);
    const existing = table.find((r) => r[conflictCol] === row[conflictCol]);
    if (existing) Object.assign(existing, row);
    else table.push({ ...row });
  }
}

/** Casts the fake to `Db` (SupabaseClient<Database>) for passing into service functions under test. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createFakeDb(seed: Record<string, Row[]> = {}): any {
  return new FakeDb(seed);
}

/**
 * Reads back a table's current rows for assertions, typed as `Row[]`
 * (rather than `any[]`) so callback parameters in `.find()`/`.map()` don't
 * trip `noImplicitAny` at call sites.
 */
export function tableRows(db: unknown, tableName: string): Row[] {
  return (db as FakeDb).tables[tableName] ?? [];
}
