import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import {
  ExpandableRow,
  fmtInt,
  formatDuration,
  SearchField,
  SortableHeader,
  SortIcon,
  TablePager,
  TypeChip,
} from "@r4pm/components";
import { Table, Text } from "@r4pm/components/ui";
import { useMemo, useState } from "react";

const meta = {
  title: "Inputs & Primitives/Table Kit",
  component: TablePager,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof TablePager>;
export default meta;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Order {
  id: string;
  customer: string;
  items: string[];
  value: number;
  events: number;
  throughputMs: number;
  status: "delivered" | "sent" | "unpaid";
}

const CUSTOMERS = [
  "Bergmann AG",
  "Nordlicht GmbH",
  "Rivera & Sons",
  "Kowalski Logistics",
  "Huber Elektro",
  "Sato Trading",
];
const PRODUCTS = ["iPad Air", "Galaxy S21", "MacBook Pro", "PS5", "Echo Dot", "Kindle", "Pixel 6", "AirPods"];

const ORDERS: Order[] = (() => {
  const rand = mulberry32(42);
  return Array.from({ length: 137 }, (_, i) => {
    const n = 1 + Math.floor(rand() * 5);
    const items = Array.from(
      { length: n },
      (_, k) => `i-${880_001 + i * 5 + k} (${PRODUCTS[Math.floor(rand() * PRODUCTS.length)]})`,
    );
    const r = rand();
    return {
      id: `o-${990_001 + i}`,
      customer: CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)],
      items,
      value: Math.round(80 + rand() * 1_900),
      events: 3 + n * 2 + Math.floor(rand() * 4),
      throughputMs: Math.round((0.5 + rand() * rand() * 20) * 86_400_000),
      status: r < 0.7 ? "delivered" : r < 0.9 ? "sent" : "unpaid",
    };
  });
})();

type SortKey = "id" | "customer" | "value" | "events" | "throughputMs";
const STATUS_COLOR = { delivered: "#10b981", sent: "#3b82f6", unpaid: "#ef4444" } as const;

/** A paged order table: debounced search, sortable columns, rows that expand into their items. */
export const Default: StoryObj = {
  name: "Paged table",
  render: function OrderTable() {
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "value", dir: "desc" });
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(10);
    const [open, setOpen] = useState<Set<string>>(new Set());

    const rows = useMemo(() => {
      const q = query.trim().toLowerCase();
      const hit = ORDERS.filter(
        (o) =>
          !q ||
          o.id.includes(q) ||
          o.customer.toLowerCase().includes(q) ||
          o.items.some((i) => i.toLowerCase().includes(q)),
      );
      const sign = sort.dir === "asc" ? 1 : -1;
      return hit.sort((a, b) => {
        const x = a[sort.key];
        const y = b[sort.key];
        return (
          sign * (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y)))
        );
      });
    }, [query, sort]);
    const shown = rows.slice(page * pageSize, (page + 1) * pageSize);

    const header = (key: SortKey, label: string, align?: "right") => (
      <SortableHeader
        align={align}
        sorted={sort.key === key ? sort.dir : null}
        onSort={() => {
          setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));
          setPage(0);
        }}
      >
        {label}
      </SortableHeader>
    );
    const toggle = (id: string) =>
      setOpen((s) => {
        const next = new Set(s);
        if (!next.delete(id)) next.add(id);
        return next;
      });

    return (
      <div style={{ width: 760 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <SearchField
            value={query}
            onChange={(q) => {
              setQuery(q);
              setPage(0);
            }}
            placeholder="Search orders, customers, items"
            debounceMs={250}
          />
          <Text size="1" color="gray">
            {fmtInt(rows.length)} of {fmtInt(ORDERS.length)} orders
          </Text>
        </div>
        <Table.Root size="1" variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell style={{ width: 16 }} />
              {header("id", "Order")}
              {header("customer", "Customer")}
              <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
              {header("value", "Value", "right")}
              {header("events", "Events", "right")}
              {header("throughputMs", "Throughput", "right")}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {shown.map((o) => (
              <ExpandableRow
                key={o.id}
                expanded={open.has(o.id)}
                onToggle={() => toggle(o.id)}
                columns={7}
                detail={
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {o.items.map((item) => (
                      <TypeChip key={item} color="#f59e0b" mono>
                        {item}
                      </TypeChip>
                    ))}
                  </div>
                }
              >
                <Table.Cell style={{ fontFamily: "var(--code-font-family)" }}>{o.id}</Table.Cell>
                <Table.Cell>{o.customer}</Table.Cell>
                <Table.Cell>
                  <TypeChip color={STATUS_COLOR[o.status]}>{o.status}</TypeChip>
                </Table.Cell>
                <Table.Cell style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {o.value.toLocaleString("en", { style: "currency", currency: "EUR" })}
                </Table.Cell>
                <Table.Cell style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {o.events}
                </Table.Cell>
                <Table.Cell style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {formatDuration(o.throughputMs)}
                </Table.Cell>
              </ExpandableRow>
            ))}
          </Table.Body>
        </Table.Root>
        <TablePager
          page={page}
          pageSize={pageSize}
          total={rows.length}
          onPageChange={setPage}
          pageSizes={[10, 25, 50]}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(0);
          }}
        />
      </div>
    );
  },
};

/** The pager alone: without a page size menu, and with no rows at all. */
export const Pager: StoryObj = {
  name: "Pager",
  render: function Pagers() {
    const [page, setPage] = useState(3);
    return (
      <div style={{ width: 560, display: "flex", flexDirection: "column", gap: 8 }}>
        <TablePager page={page} pageSize={20} total={312} onPageChange={setPage} />
        <TablePager page={0} pageSize={20} total={0} onPageChange={() => {}} />
      </div>
    );
  },
};

/** Search fields: immediate, and debounced so a slow filter runs once typing pauses. */
export const Search: StoryObj = {
  name: "Search field",
  render: function Searches() {
    const [now, setNow] = useState("");
    const [later, setLater] = useState("");
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <SearchField value={now} onChange={setNow} placeholder="Immediate" />
          <Text size="1" color="gray">
            Query: {now || "(empty)"}
          </Text>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <SearchField value={later} onChange={setLater} placeholder="Debounced, 600 ms" debounceMs={600} />
          <Text size="1" color="gray">
            Query: {later || "(empty)"}
          </Text>
        </div>
      </div>
    );
  },
};

/** The sort direction icons on their own, for headers drawn by the host. */
export const SortIcons: StoryObj = {
  name: "Sort icons",
  render: () => (
    <div style={{ display: "flex", gap: 16 }}>
      <Text size="2">
        Ascending <SortIcon ascending />
      </Text>
      <Text size="2">
        Descending <SortIcon ascending={false} />
      </Text>
    </div>
  ),
};
