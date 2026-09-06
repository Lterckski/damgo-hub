import { useState } from "react";
import { DataTable, type TableConfig } from "@/components/admin/data-table";
const rows = Array.from({ length: 1000 }, (_, id) => ({
  id: String(id),
  name: `Record ${String(id).padStart(4, "0")}`,
}));
const config: TableConfig<(typeof rows)[number]> = {
  columns: [
    {
      id: "name",
      header: "Name",
      cell: (row) => row.name,
      sortValue: (row) => row.name,
    },
    { id: "status", header: "Status", cell: () => "Active" },
    { id: "owner", header: "Owner", cell: () => "Fixture member" },
  ],
  filters: [],
  searchText: (row) => row.name,
  rowId: (row) => row.id,
  bulkActions: [],
  emptyState: { title: "Empty", description: "Empty" },
  exportName: "records",
};
export function PerformanceFixture() {
  const [show, setShow] = useState(false);
  return (
    <main className="p-4">
      <button className="min-h-11" onClick={() => setShow(!show)}>
        Toggle records tab
      </button>
      {show && (
        <DataTable
          rows={rows}
          config={config}
          activeFilterId={null}
          onFilterChange={() => {}}
          onRowClick={() => {}}
          onBulkAction={() => {}}
          pendingIds={new Set()}
        />
      )}
    </main>
  );
}
