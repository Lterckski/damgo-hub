import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DataTable, type TableConfig } from "./data-table";
import { downloadCsv } from "@/lib/admin/client";
vi.mock("@/lib/admin/client", () => ({ downloadCsv: vi.fn(async () => {}) }));
afterEach(cleanup);
const rows = Array.from({ length: 120 }, (_, id) => ({
  id: String(id),
  name: `Record ${String(id).padStart(3, "0")}`,
}));
const config: TableConfig<(typeof rows)[number]> = {
  columns: [
    {
      id: "name",
      header: "Name",
      cell: (row) => row.name,
      sortValue: (row) => row.name,
    },
  ],
  filters: [],
  searchText: (row) => row.name,
  rowId: (row) => row.id,
  bulkActions: [{ id: "approve", label: "Approve" }],
  emptyState: { title: "Empty", description: "Empty" },
  exportName: "records",
};
it("bounds rendered rows, resets pagination on search/sort, and selects/exports across pages", async () => {
  const bulk = vi.fn();
  render(
    <DataTable
      rows={rows}
      config={config}
      activeFilterId={null}
      onFilterChange={vi.fn()}
      onRowClick={vi.fn()}
      onBulkAction={bulk}
      pendingIds={new Set()}
    />,
  );
  expect(screen.getAllByRole("row")).toHaveLength(51);
  fireEvent.click(screen.getByRole("button", { name: "Export" }));
  await waitFor(() => expect(vi.mocked(downloadCsv)).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Export" }).hasAttribute("disabled")).toBe(false),
  );
  const allRowsWithoutSelection = vi.mocked(downloadCsv).mock.calls.at(-1)![2];
  expect([...allRowsWithoutSelection]).toHaveLength(120);
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(screen.getByText("Record 050")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select all matching rows" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  expect(bulk.mock.calls[0][1]).toHaveLength(120);
  fireEvent.click(screen.getByRole("button", { name: "Export" }));
  await waitFor(() => expect(vi.mocked(downloadCsv)).toHaveBeenCalledTimes(2));
  const exportedRows = vi.mocked(downloadCsv).mock.calls.at(-1)![2];
  expect([...exportedRows]).toHaveLength(120);
  fireEvent.change(screen.getByRole("textbox", { name: "Filter records" }), {
    target: { value: "Record 00" },
  });
  expect(screen.getAllByRole("row")).toHaveLength(11);
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  expect(bulk.mock.calls.at(-1)![1]).toHaveLength(10);
  fireEvent.change(screen.getByRole("textbox", { name: "Filter records" }), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  fireEvent.click(screen.getByRole("button", { name: "Name" }));
  expect(screen.getByText("Record 000")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Name" }));
  expect(screen.getByText("Record 119")).toBeTruthy();
});
