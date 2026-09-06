import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RoadmapConnections } from "./roadmap-connections";
import { createMilestoneNode } from "@/types/roadmap";
const nodes = [
  createMilestoneNode("a", { x: 0, y: 0 }),
  createMilestoneNode("b", { x: 0, y: 0 }),
];
nodes[0].data.title = "Design";
nodes[1].data.title = "Build";
afterEach(cleanup);
it("connects milestones by selecting endpoints without dragging", async () => {
  const connect = vi.fn();
  render(
    <RoadmapConnections
      nodes={nodes}
      edges={[]}
      onConnect={connect}
      onRemove={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Connections" }));
  fireEvent.change(
    await screen.findByRole("combobox", { name: "From milestone" }),
    { target: { value: "a" } },
  );
  fireEvent.change(screen.getByRole("combobox", { name: "To milestone" }), {
    target: { value: "b" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add connection" }));
  expect(connect).toHaveBeenCalledWith({
    source: "a",
    target: "b",
    sourceHandle: "right-source",
    targetHandle: "left-target",
  });
});
it("prevents duplicate connections and permits explicit removal", async () => {
  const remove = vi.fn();
  render(
    <RoadmapConnections
      nodes={nodes}
      edges={[{ id: "edge", source: "a", target: "b" }]}
      onConnect={vi.fn()}
      onRemove={remove}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Connections" }));
  fireEvent.change(
    await screen.findByRole("combobox", { name: "From milestone" }),
    { target: { value: "a" } },
  );
  fireEvent.change(screen.getByRole("combobox", { name: "To milestone" }), {
    target: { value: "b" },
  });
  expect(
    (
      screen.getByRole("button", {
        name: "Add connection",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Remove connection from Design to Build",
    }),
  );
  expect(remove).toHaveBeenCalledWith("edge");
});
