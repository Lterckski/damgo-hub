// @ts-check
import { module } from "@prisma/composer";
import damgoHubService from "./service.mjs";

export default module("damgo-hub", ({ provision }) => {
  provision(damgoHubService, { id: "damgohub" });
});
