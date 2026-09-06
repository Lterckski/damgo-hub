"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Download, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadCsv } from "@/lib/admin/client";

/**
 * Zone 4's one table, shared by all five tabs.
 *
 * Every tab previously had its own bespoke table component
 * (MemberDirectoryTable, FinanceTransactionsTable, PenaltiesView,
 * AdminProjectsView), each with its own idea of sorting and empty states.
 * This is the single implementation; a tab supplies a `TableConfig` and
 * nothing else.
 *
 * A row click opens a drawer, never a route — so search text, sort, column
 * visibility and multi-select all survive reading a record, which is the
 * whole reason the console can finish work that used to need four pages.
 */

export interface ColumnDef<Row> {
  id: string;
  header: string;
  /** Hidden by default when false; toggled from the Columns menu. */
  defaultVisible?: boolean;
  /** Sortable when provided. */
  sortValue?: (row: Row) => string | number;
  cell: (row: Row) => React.ReactNode;
  /** CSV value; falls back to sortValue, then to nothing. */
  csvValue?: (row: Row) => string | number | null;
  headerClassName?: string;
  cellClassName?: string;
}

export interface TableFilterDef<Row> {
  id: string;
  label: string;
  predicate: (row: Row) => boolean;
}

export interface BulkActionDef {
  id: string;
  label: string;
  destructive?: boolean;
  /** Prompts for a reason before running. */
  requiresReason?: boolean;
  /** A fixed value sent with the bulk request (a role, a status). */
  value?: unknown;
}

export interface TableConfig<Row> {
  columns: ColumnDef<Row>[];
  filters: TableFilterDef<Row>[];
  /** Haystack for the tab's own search box. */
  searchText: (row: Row) => string;
  rowId: (row: Row) => string;
  bulkActions: BulkActionDef[];
  emptyState: { title: string; description: string };
  /** Filename stem for CSV export. */
  exportName: string;
}

interface DataTableProps<Row> {
  rows: Row[];
  config: TableConfig<Row>;
  /** Filter id applied from a stat card. Null means "all". */
  activeFilterId: string | null;
  onFilterChange: (filterId: string | null) => void;
  onRowClick: (row: Row) => void;
  onBulkAction: (action: BulkActionDef, ids: string[]) => void;
  /** Rows currently mid-flight, dimmed until the server confirms. */
  pendingIds: Set<string>;
}

export function DataTable<Row>({
  rows,
  config,
  activeFilterId,
  onFilterChange,
  onRowClick,
  onBulkAction,
  pendingIds,
}: DataTableProps<Row>) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{ columnId: string; direction: "asc" | "desc" } | null>(null);
  const [hiddenColumns, setHiddenColumns] = React.useState<Set<string>>(
    () => new Set(config.columns.filter((c) => c.defaultVisible === false).map((c) => c.id)),
  );
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  // No reset-on-config effect: the console gives each tab's table its own
  // `key`, so switching tabs remounts this component and every piece of
  // state above starts fresh. A column id from the previous tab can never
  // survive into a config that doesn't have it.
  const visibleColumns = config.columns.filter((column) => !hiddenColumns.has(column.id));
  const activeFilter = config.filters.find((filter) => filter.id === activeFilterId) ?? null;

  const visibleRows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    let result = rows;

    if (activeFilter) result = result.filter(activeFilter.predicate);
    if (needle) {
      result = result.filter((row) => config.searchText(row).toLowerCase().includes(needle));
    }

    if (sort) {
      const column = config.columns.find((c) => c.id === sort.columnId);
      if (column?.sortValue) {
        const getValue = column.sortValue;
        result = [...result].sort((a, b) => {
          const left = getValue(a);
          const right = getValue(b);
          const comparison =
            typeof left === "number" && typeof right === "number"
              ? left - right
              : String(left).localeCompare(String(right));
          return sort.direction === "asc" ? comparison : -comparison;
        });
      }
    }

    return result;
  }, [rows, activeFilter, query, sort, config]);

  // Selection is intersected with what's actually visible at read time,
  // not pruned in an effect: narrowing the filter and then hitting a bulk
  // action must never act on rows the filter hid. Widening the filter
  // again brings those rows back still selected, which is what someone
  // toggling a filter mid-selection expects.
  const selectedIds = visibleRows.map(config.rowId).filter((id) => selected.has(id));
  const allVisibleSelected = visibleRows.length > 0 && selectedIds.length === visibleRows.length;

  function toggleSort(columnId: string) {
    setSort((current) => {
      if (current?.columnId !== columnId) return { columnId, direction: "asc" };
      if (current.direction === "asc") return { columnId, direction: "desc" };
      return null;
    });
  }

  function exportCsv() {
    const columns = visibleColumns.filter((column) => column.csvValue ?? column.sortValue);
    const source = selected.size > 0 ? visibleRows.filter((row) => selected.has(config.rowId(row))) : visibleRows;

    downloadCsv(
      `${config.exportName}-${new Date().toISOString().slice(0, 10)}.csv`,
      columns.map((column) => column.header),
      source.map((row) =>
        columns.map((column) => {
          if (column.csvValue) return column.csvValue(row);
          return column.sortValue ? column.sortValue(row) : null;
        }),
      ),
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-surface-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-surface-border px-4 py-3">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-copy-faint" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter these rows…"
            className="h-9 pl-9 text-copy-primary!"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant={activeFilterId === null ? "default" : "outline"}
            onClick={() => onFilterChange(null)}
          >
            All
          </Button>
          {config.filters.map((filter) => (
            <Button
              key={filter.id}
              size="sm"
              variant={activeFilterId === filter.id ? "default" : "outline"}
              onClick={() => onFilterChange(activeFilterId === filter.id ? null : filter.id)}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="sm" variant="outline">
                <Columns3 className="h-4 w-4" />
                Columns
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            {config.columns.map((column) => (
              <DropdownMenuItem
                key={column.id}
                onClick={(event) => {
                  // Keep the menu open — toggling several columns in a row
                  // is the normal case.
                  event.preventDefault();
                  setHiddenColumns((current) => {
                    const next = new Set(current);
                    if (next.has(column.id)) next.delete(column.id);
                    else next.add(column.id);
                    return next;
                  });
                }}
              >
                <Checkbox checked={!hiddenColumns.has(column.id)} className="mr-2" />
                {column.header}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button size="sm" variant="outline" onClick={exportCsv} disabled={visibleRows.length === 0}>
          <Download className="h-4 w-4" />
          Export
        </Button>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-surface-border bg-accent-dim px-4 py-2.5">
          <p className="text-sm font-semibold text-copy-primary">{selectedIds.length} selected</p>
          <div className="ml-auto flex flex-wrap gap-2">
            {config.bulkActions.map((action) => (
              <Button
                key={action.id}
                size="sm"
                variant={action.destructive ? "destructive" : "outline"}
                onClick={() => onBulkAction(action, selectedIds)}
              >
                {action.label}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {visibleRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
          <p className="text-sm font-semibold text-copy-primary">
            {query || activeFilter ? "Nothing matches those filters" : config.emptyState.title}
          </p>
          <p className="max-w-sm text-sm text-copy-secondary">
            {query || activeFilter
              ? "Clear the search or filter to see the full list."
              : config.emptyState.description}
          </p>
          {(query || activeFilter) && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => {
                setQuery("");
                onFilterChange(null);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={() =>
                      setSelected(
                        allVisibleSelected ? new Set() : new Set(visibleRows.map(config.rowId)),
                      )
                    }
                    aria-label="Select all rows"
                  />
                </TableHead>
                {visibleColumns.map((column) => (
                  <TableHead key={column.id} className={column.headerClassName}>
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.id)}
                        className="inline-flex items-center gap-1 transition-colors hover:text-brand"
                      >
                        {column.header}
                        {sort?.columnId === column.id ? (
                          sort.direction === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => {
                const id = config.rowId(row);
                return (
                  <TableRow
                    key={id}
                    onClick={() => onRowClick(row)}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-subtle",
                      pendingIds.has(id) && "opacity-50",
                    )}
                  >
                    <TableCell
                      // Stop the checkbox (and any inline editor below)
                      // from also opening the drawer behind it.
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Checkbox
                        checked={selected.has(id)}
                        onCheckedChange={() =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (next.has(id)) next.delete(id);
                            else next.add(id);
                            return next;
                          })
                        }
                        aria-label="Select row"
                      />
                    </TableCell>
                    {visibleColumns.map((column) => (
                      <TableCell key={column.id} className={column.cellClassName}>
                        {column.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
