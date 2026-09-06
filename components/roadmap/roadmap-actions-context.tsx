"use client";
import { createContext, useContext } from "react";

const RoadmapActionsContext = createContext<(id: string) => void>(() => {});
export const RoadmapActionsProvider = RoadmapActionsContext.Provider;
export const useEditMilestone = () => useContext(RoadmapActionsContext);
