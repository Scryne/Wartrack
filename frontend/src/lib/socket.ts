import { io } from "socket.io-client";
import { API_BASE } from "./api";
import { useAuthStore } from "../stores/useAuthStore";

export const socket = io(API_BASE, {
  autoConnect: false,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: Infinity,
  transports: ["websocket", "polling"],
  auth: (cb) => {
    cb({ apiKey: useAuthStore.getState().apiKey });
  }
});

